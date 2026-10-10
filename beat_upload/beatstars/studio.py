"""Publishing a Track Package through the BeatStars Studio form, with Playwright.

BeatStars has no public API. The browser runs headed on a persistent profile in the
workspace: the first time the owner signs in by hand, after that the session lives there.
Nothing here types a password.

The form, as of October 2026: "Create Track" opens an Uppy dialog; the first file creates
the track and lands on ``content/tracks/edit/TK<id>``, one page with every section. Fields
carry ``data-qa`` hooks (``input_title``, ``select_key``, ``input_tag``, ``input_genre``,
``input_mood``); each file slot has an "Add" button that opens the same Uppy dialog. Changes
save as they are made; "Publish track" makes it Public. Monetization is inherited from
Track Preferences and is never touched, nor is the paid "Boost Track".
"""

import base64
import re
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from beat_upload.beatstars.naming import beatstars_key
from beat_upload.beatstars.package import TrackPackage
from beat_upload.errors import BeatStarsError

if TYPE_CHECKING:
    from playwright.sync_api import Locator, Page

StatusFn = Callable[[str], None]

STUDIO_URL = "https://studio.beatstars.com"
TRACKS_URL = f"{STUDIO_URL}/content/tracks/uploaded"
LOGIN_TIMEOUT = 600.0  # seconds the owner has to sign in
SIGN_IN_GRACE = 20.0  # seconds before a page without Studio counts as signed out
FILE_TIMEOUT = 300.0  # seconds one file may take to upload and process
ARTWORK_ATTEMPTS = 3
SETTLE = 6  # seconds a freshly loaded track page needs before it takes files
SAVE_QUIET = 5  # seconds with nothing saving before a change counts as saved
# The window's class (Wayland app id), so a window manager rule can keep it off screen.
WINDOW_CLASS = "beat-upload-beatstars"
VIEWPORT = {"width": 1600, "height": 1000}  # narrower and the sidebar covers the form

_TRACK_ID = re.compile(r"/tracks/edit/(TK\d+)")
_MS = 1000


def edit_url(track_id: str) -> str:
    return f"{STUDIO_URL}/content/tracks/edit/{track_id}"


def public_url(track_id: str) -> str:
    """Redirects to ``/beat/<slug>-<id>``."""
    return f"https://www.beatstars.com/{track_id}"


@contextmanager
def studio(profile: Path, on_status: StatusFn) -> Iterator["Page"]:
    """A signed-in Studio page on the persistent ``profile``; waits for the owner to sign in."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise BeatStarsError(
            "Playwright is not installed: pip install -e '.[beatstars]' && "
            "playwright install chromium"
        ) from None
    profile.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(profile), headless=False, viewport=VIEWPORT, args=[f"--class={WINDOW_CLASS}"]
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(TRACKS_URL)
            _wait_for_sign_in(page, on_status)
            yield page
        finally:
            context.close()


def publish_package(
    page: "Page",
    package: TrackPackage,
    on_status: StatusFn,
    draft: str | None = None,
    publish: bool = True,
) -> str:
    """Create (or finish ``draft``), fill and publish one track; returns its ``TK`` id.
    With ``publish`` False the filled track stays a draft for the owner to look over."""
    if draft is None:
        track_id = _create_track(page, package.master)
    else:
        track_id = draft
        page.goto(edit_url(track_id))
        page.wait_for_selector("[data-qa=input_title]")
    on_status(f"{track_id}: master uploaded")
    try:
        _fill_and_publish(page, package, track_id, on_status, publish)
    except BeatStarsError as e:
        raise BeatStarsError(f"{track_id}: {e}; finish it with --draft {track_id}") from e
    return track_id


def _fill_and_publish(
    page: "Page", package: TrackPackage, track_id: str, on_status: StatusFn, publish: bool
) -> None:
    track = package.track
    page.wait_for_timeout(SETTLE * _MS)  # a file added before the form settles never attaches
    _ensure_slot(page, "Master Track (Untagged)", package.master)
    _ensure_slot(page, "Preview Track (Tagged)", package.preview)
    if package.stems is not None:
        _ensure_slot(page, "Stem Files", package.stems)
    on_status(f"{track_id}: preview uploaded")
    _upload_artwork(page, package.cover, track_id)
    # A new file rewrites the title from its name while "Processing metadata"; fill after.
    _wait_saved(page)

    _type(page.locator("[data-qa=input_title] input"), track.title)
    _type(page.locator("[data-qa=input_description] textarea"), track.description)
    page.locator("[data-qa=select_key] select").select_option(beatstars_key(track.key))
    _type(page.locator("[data-qa=input_bpm] input"), str(track.bpm))
    _set_chips(page, "input_tag", track.tags, typed=True)
    _set_chips(page, "input_genre", track.genres)
    _set_chips(page, "input_mood", track.moods)
    samples = page.locator("mat-checkbox", has_text="3rd party loops").locator("input")
    if samples.is_checked() != track.samples:
        samples.click()
    _wait_saved(page)
    _check_fields(page, package)
    if not publish:
        on_status(f"{track_id}: filled, not published: {edit_url(track_id)}")
        return

    page.locator("[data-cy=publish_btn-button]").click()
    page.wait_for_url(TRACKS_URL + "*", timeout=60 * _MS)
    toast = page.get_by_text("successfully published")
    toast.wait_for(timeout=30 * _MS)
    page.keyboard.press("Escape")  # the "share your content" dialog
    on_status(f"{track_id}: published")


def check_public_page(page: "Page", track_id: str, bpm: int) -> str:
    """Open the public page and return its URL; raises when a license or the BPM is missing."""
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    public = page.context.new_page()
    try:
        public.goto(public_url(track_id))
        try:
            public.get_by_text("WAV Lease").first.wait_for(state="attached", timeout=90 * _MS)
        except PlaywrightTimeoutError:
            raise BeatStarsError(f"{public.url} shows no WAV Lease after 90 s") from None
        text = public.inner_text("body")
        problems = [s for s in ("MP3 Lease", "WAV Lease", "$19.99") if s not in text]
        if not re.search(rf"BPM\s*{bpm}\b", text):
            problems.append(f"BPM {bpm}")
        if problems:
            raise BeatStarsError(f"{public.url} is missing: {', '.join(problems)}")
        return public.url
    finally:
        public.close()


def _type(field: "Locator", text: str) -> None:
    """Fill and leave the field: Studio saves a text field when it loses focus."""
    field.fill(text)
    field.press("Tab")


def _wait_saved(page: "Page") -> None:
    """Until Studio has saved: it saves about 3 s after the last change and shows "Saving
    changes..." meanwhile; when idle the header shows nothing at all."""
    # Not "Uploading N files": that tray can stay up after the files are in.
    busy_text = re.compile(r"Saving changes|Processing")
    deadline = time.monotonic() + FILE_TIMEOUT
    quiet = 0
    while quiet < SAVE_QUIET:
        busy = page.get_by_text(busy_text).locator("visible=true")
        if time.monotonic() > deadline:
            shown = ", ".join(t.strip()[:60] for t in busy.all_inner_texts())
            raise BeatStarsError(f"Studio did not finish saving the track: {shown}")
        page.wait_for_timeout(_MS)
        quiet = 0 if busy.count() else quiet + 1


def _wait_for_sign_in(page: "Page", on_status: StatusFn) -> None:
    start = time.monotonic()
    asked = False
    while not _signed_in(page):
        waited = time.monotonic() - start
        if waited > LOGIN_TIMEOUT:
            raise BeatStarsError("Timed out waiting for the BeatStars sign-in")
        if not asked and waited > SIGN_IN_GRACE:  # Studio itself takes a while to load
            on_status("Sign in to BeatStars in the browser window; waiting...")
            asked = True
        page.wait_for_timeout(2 * _MS)
    if asked:
        page.goto(TRACKS_URL)


def _signed_in(page: "Page") -> bool:
    return page.url.startswith(STUDIO_URL) and page.get_by_text("Create Track").count() > 0


def _create_track(page: "Page", master: Path) -> str:
    page.goto(TRACKS_URL)
    page.get_by_role("button", name="Create Track").first.click()
    before = _listed_track_ids(page)
    page.wait_for_timeout(2 * _MS)
    dismiss = page.get_by_role("button", name="Dismiss")
    if dismiss.count():  # the "updates" onboarding shown on the first Create Track
        dismiss.first.click()
    _dialog_file_input(page).set_input_files(master)
    # Studio usually routes to the new track by itself, but not always: a track can be created
    # while the page stays on the list. Then the new id is the one the list did not have.
    deadline = time.monotonic() + FILE_TIMEOUT
    while (match := _TRACK_ID.search(page.url)) is None:
        if time.monotonic() > deadline:
            raise BeatStarsError(
                f"{master.name} did not open a track page; look for a new draft in Studio "
                "and finish it with --draft TK..."
            )
        page.wait_for_timeout(5 * _MS)
        if page.locator("mat-dialog-container").count() == 0:
            new = [t for t in _listed_track_ids(page, reload=True) if t not in before]
            if new:
                page.goto(edit_url(new[0]))
    page.wait_for_selector("[data-qa=input_title]")
    return match[1]


def _listed_track_ids(page: "Page", reload: bool = False) -> list[str]:
    if reload:
        page.goto(TRACKS_URL)
    page.locator("a[href*='/tracks/edit/TK']").first.wait_for(timeout=60 * _MS)
    hrefs = page.eval_on_selector_all("a[href*='/tracks/edit/TK']", "els => els.map(e => e.href)")
    return list(dict.fromkeys(m[1] for h in hrefs if (m := _TRACK_ID.search(h))))


def _dialog_file_input(page: "Page") -> "Locator":
    dialog = page.locator("mat-dialog-container")
    dialog.first.wait_for()
    return dialog.locator("input[type=file]").first


def _slot(page: "Page", label: str) -> "Locator":
    """The row of one file slot: its label, the file name or "Add", and its buttons."""
    return page.locator("div", has_text=label).filter(has=page.locator("button")).last


def _ensure_slot(page: "Page", label: str, file: Path) -> None:
    slot = _slot(page, label)
    add = slot.get_by_role("button", name="Add")
    if add.count() == 0:
        return  # already holds a file
    add.first.click()
    _dialog_file_input(page).set_input_files(file)
    deadline = time.monotonic() + FILE_TIMEOUT
    while True:
        page.wait_for_timeout(2 * _MS)
        text = _slot(page, label).inner_text()
        busy = any(w in text for w in ("Uploading", "Processing"))
        if not busy and page.locator("mat-dialog-container").count() == 0 and "Add" not in text:
            return
        if time.monotonic() > deadline:
            raise BeatStarsError(f"{file.name} did not finish uploading into {label}")


def _upload_artwork(page: "Page", cover: Path, track_id: str) -> None:
    """Upload the cover unless the track has its own already. The dialog sometimes closes
    without the image taking, so the artwork is checked and the upload retried."""
    for _ in range(ARTWORK_ATTEMPTS):
        page.wait_for_timeout(SETTLE * _MS)  # an upload before the form settles never attaches
        if _has_own_artwork(page, track_id):
            return
        page.locator("[data-cy=artwork-drop-down-button-button]").click()
        page.get_by_role("menuitem", name="Upload file").click()
        _dialog_file_input(page).set_input_files(cover)
        dialog = page.locator("mat-dialog-container")
        page.wait_for_timeout(2 * _MS)  # the crop editor loads the image; Save before that
        dialog.get_by_role("button", name="Save", exact=True).click()  # uploads nothing usable
        page.wait_for_timeout(2 * _MS)
        dialog.get_by_role("button", name=re.compile(r"Upload 1 file")).click()
        dialog.first.wait_for(state="detached", timeout=FILE_TIMEOUT * _MS)
        for _ in range(45):  # attaching can take a minute after the dialog closes
            page.wait_for_timeout(2 * _MS)
            if _has_own_artwork(page, track_id):
                return
    raise BeatStarsError(f"The cover {cover.name} did not take after {ARTWORK_ATTEMPTS} uploads")


def _has_own_artwork(page: "Page", track_id: str) -> bool:
    """A track's own artwork is served from ``track/artwork/TK<id>``; until then Studio shows
    the profile picture. The CDN url carries that path base64-encoded."""
    src = page.locator("[data-cy=artwork-drop-down-button-button]").evaluate(
        """e => { for (let p = e; p; p = p.parentElement) {
                    const img = p.querySelector('img'); if (img) return img.src } return '' }"""
    )
    encoded = src.rsplit("/", 1)[-1].split("?")[0]
    try:
        decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
    except (ValueError, UnicodeDecodeError):
        return False
    return f"track/artwork/{track_id}" in decoded


def _chips(box: "Locator") -> list[str]:
    # The chip list is rendered twice (one copy hidden); keep the order, drop the copies.
    return list(dict.fromkeys(c.inner_text().strip() for c in box.locator("mat-chip-row").all()))


def _set_chips(page: "Page", qa: str, wanted: list[str], typed: bool = False) -> None:
    """Make the chip field ``qa`` hold exactly ``wanted``; a typed field takes text + Enter,
    the others pick from their option list."""
    box = page.locator(f"[data-qa={qa}]")
    lowered = {w.lower() for w in wanted}
    for chip in _chips(box):
        if chip.lower() not in lowered:
            row = box.locator("mat-chip-row", has_text=chip).first
            row.locator("[aria-label=Remove]").first.click()
            page.wait_for_timeout(300)
    have = {c.lower() for c in _chips(box)}
    for value in wanted:
        if value.lower() in have:
            continue
        field = box.locator("input").first
        field.click(force=True)
        if typed:
            field.fill(value)
            field.press("Enter")
        else:
            option = page.locator(".cdk-overlay-container mat-option").filter(
                has_text=re.compile(rf"^\s*{re.escape(value)}\s*$")
            )
            if option.count() == 0:
                raise BeatStarsError(f"'{value}' is not in the BeatStars list for {qa}")
            option.first.click()
        page.wait_for_timeout(500)
    page.keyboard.press("Escape")


def _check_fields(page: "Page", package: TrackPackage) -> None:
    track = package.track
    got = {
        "title": page.locator("[data-qa=input_title] input").input_value(),
        "key": page.locator("[data-qa=select_key] select").input_value(),
        "bpm": page.locator("[data-qa=input_bpm] input").input_value(),
        "tags": _chips(page.locator("[data-qa=input_tag]")),
        "genres": _chips(page.locator("[data-qa=input_genre]")),
        "moods": _chips(page.locator("[data-qa=input_mood]")),
    }
    want = {
        "title": track.title,
        "key": beatstars_key(track.key),
        "bpm": str(track.bpm),
        "tags": track.tags,
        "genres": track.genres,
        "moods": track.moods,
    }
    wrong = [
        f"{k}: {got[k]!r} != {want[k]!r}"
        for k in want
        if (sorted(got[k]) if isinstance(want[k], list) else got[k])
        != (sorted(want[k]) if isinstance(want[k], list) else want[k])
    ]
    if wrong:
        raise BeatStarsError("The form did not take: " + "; ".join(wrong))
