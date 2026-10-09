import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Job } from "@/api/events";
import { useJobs, useRetryJob } from "@/features/jobs/queries";
import { useBeats, type Beat, type Privacy } from "@/features/library/queries";
import { useAuthStatus } from "@/features/settings/authQueries";
import { serverDate, toDateTimeLocal } from "@/lib/format";
import { clsx } from "clsx";
import {
  MAX_DESCRIPTION,
  MAX_TAGS,
  MAX_TITLE,
  defaultPublishAt,
  tagsLength,
} from "./metadata";
import { fillHint, sendHint } from "./placeholders";
import type { BeatPatch, FillIn, FillOut } from "./queries";
import { useDeleteBeat, useFillBeat, usePatchBeat, useUploadBeat } from "./queries";
import { CoverStylePicker } from "./CoverStylePicker";
import { coverStyleName, type CoverStyle } from "./coverStyles";
import { TagInput } from "./TagInput";
import { YouTubePreview } from "./YouTubePreview";

/** How long the form waits after the last keystroke before it saves. */
export const AUTOSAVE_MS = 800;

const JOB_LABEL: Record<Job["kind"], string> = {
  render: "Render",
  upload: "Upload",
  sync: "Sync",
  stats: "Stats",
};

/** The editable Metadata of a Draft, as the form holds it. */
export type DraftForm = {
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  /** Local `datetime-local` value, or null for "publish now". */
  publishAt: string | null;
  coverStyle: CoverStyle;
};

export function formOf(beat: Beat): DraftForm {
  return {
    title: beat.title,
    description: beat.description,
    tags: beat.tags,
    privacy: beat.privacy,
    publishAt: beat.publish_at ? toDateTimeLocal(serverDate(beat.publish_at)) : null,
    coverStyle: beat.cover_style,
  };
}

function same<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The form after the live Beat moved from `from` to `to`. Pure. A field the owner has not
 * touched (it still equals `from`) takes the server's new value; a field the owner changed
 * keeps the owner's text. A new value that is only this form's own save coming back (it
 * equals `sent`, what the form last saved) is never adopted: the form already holds that
 * edit or a newer one, such as the owner undoing it while the save was in flight.
 */
export function rebase(
  form: DraftForm,
  from: Beat,
  to: Beat,
  sent: DraftForm | null = null,
): DraftForm {
  const old = formOf(from);
  const next = formOf(to);
  const adopt = <K extends keyof DraftForm>(key: K): DraftForm[K] => {
    const echo = sent !== null && same(next[key], sent[key]);
    return !echo && same(form[key], old[key]) ? next[key] : form[key];
  };
  return {
    title: adopt("title"),
    description: adopt("description"),
    tags: adopt("tags"),
    privacy: adopt("privacy"),
    publishAt: adopt("publishAt"),
    // Only a Draft may change its Cover Style: once the Beat has left Draft, a pick the
    // server never took is dropped instead of being sent (and refused) with every save.
    coverStyle: to.status === "draft" ? adopt("coverStyle") : next.coverStyle,
  };
}

/**
 * `<input type="datetime-local">` carries no seconds, so a stored `publish_at` only ever
 * round-trips through the picker to the minute. Both sides of the comparison are cut to the
 * minute, or a schedule set anywhere else (the CLI, the server, SQLite's microseconds) would
 * read as an edit the moment the page opened.
 */
function minuteIso(date: Date): string {
  const cut = new Date(date);
  cut.setSeconds(0, 0);
  return cut.toISOString();
}

function isoOf(local: string | null): string | null {
  if (local === null) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : minuteIso(date);
}

/** Only what the owner actually changed goes into the patch. Pure. */
export function patchOf(form: DraftForm, beat: Beat): BeatPatch {
  const patch: BeatPatch = {};
  if (form.title !== beat.title) patch.title = form.title;
  if (form.description !== beat.description) patch.description = form.description;
  if (!same(form.tags, beat.tags)) patch.tags = form.tags;

  const publishAt = isoOf(form.publishAt);
  const current = beat.publish_at ? minuteIso(serverDate(beat.publish_at)) : null;
  if (publishAt !== current) patch.publish_at = publishAt;
  // YouTube only schedules private videos, so a schedule decides the privacy.
  const privacy: Privacy = form.publishAt === null ? form.privacy : "private";
  if (privacy !== beat.privacy) patch.privacy = privacy;
  if (beat.status === "draft" && form.coverStyle !== beat.cover_style) {
    patch.cover_style = form.coverStyle;
  }
  return patch;
}

/** A schedule the owner has started typing but not finished is not worth saving. */
function savable(form: DraftForm): boolean {
  return form.publishAt === null || isoOf(form.publishAt) !== null;
}

/** "Draft saved 14:03". */
function savedLabel(at: Date | null): string {
  if (at === null) return "";
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `Draft saved ${time}`;
}

/** The Beat page of a Draft or a Queued Beat: hooks in, view below (Mockup 3b). */
export function DraftBeatPage({ beat }: { beat: Beat }) {
  // Two observers, never one: react-query keeps the per-call options of the LAST `mutate()`
  // on an observer, so an autosave landing on the send's observer would throw away the
  // send's `onSuccess` and the upload would never be asked for.
  const autosave = usePatchBeat();
  const send = usePatchBeat();
  const upload = useUploadBeat();
  const remove = useDeleteBeat();
  const fill = useFillBeat();
  const beats = useBeats();
  const auth = useAuthStatus();
  const jobs = useJobs(beat.id);
  const retry = useRetryJob();
  const navigate = useNavigate();

  const failed = beat.active_job === null && !beat.rendered
    ? (jobs.data ?? []).find((job) => job.kind === "render" && job.status === "failed") ?? null
    : null;

  const saved = [autosave, send]
    .map((m) => (m.isSuccess ? m.submittedAt : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <DraftBeatView
      // A beat→beat navigation that never goes pending would otherwise keep the previous
      // Beat's form values and autosave them onto this one.
      key={beat.id}
      beat={beat}
      channel={auth.data?.channel?.title ?? null}
      library={beats.data ?? []}
      failedRender={failed}
      onSave={(body) => autosave.mutate({ id: beat.id, patch: body })}
      onSend={(body) => {
        const go = () => upload.mutate(beat.id);
        if (Object.keys(body).length === 0) go();
        else send.mutate({ id: beat.id, patch: body }, { onSuccess: go });
      }}
      onDelete={() => remove.mutate(beat.id, { onSuccess: () => void navigate("/") })}
      onRetry={(id) => retry.mutate(id)}
      onFill={(form, apply) => fill.mutate({ id: beat.id, form }, { onSuccess: apply })}
      filling={fill.isPending}
      fillError={fill.error?.message ?? null}
      saving={autosave.isPending || send.isPending || upload.isPending}
      deleting={remove.isPending}
      error={
        autosave.error?.message ??
        send.error?.message ??
        upload.error?.message ??
        remove.error?.message ??
        null
      }
      savedAt={saved > 0 ? new Date(saved) : null}
    />
  );
}

type ViewProps = {
  beat: Beat;
  channel: string | null;
  library: { id: string; title: string; tags: string[] }[];
  failedRender: Job | null;
  onSave: (patch: BeatPatch) => void;
  onSend: (patch: BeatPatch) => void;
  onDelete: () => void;
  onRetry: (jobId: string) => void;
  /** Fill from title with the form as it is; `apply` puts the answer into the form. */
  onFill: (form: FillIn, apply: (filled: FillOut) => void) => void;
  filling?: boolean;
  fillError?: string | null;
  saving?: boolean;
  deleting?: boolean;
  error?: string | null;
  savedAt?: Date | null;
};

/**
 * Mockup 3b: the form on the left with the file facts and the Render above it, the YouTube
 * preview on the right. The form autosaves — a debounced PATCH of whatever changed — and
 * the head says when it last did. "Save & upload when rendered" saves and sends the Beat;
 * "Save draft" only saves.
 */
export function DraftBeatView({
  beat,
  channel,
  library,
  failedRender,
  onSave,
  onSend,
  onDelete,
  onRetry,
  onFill,
  filling = false,
  fillError = null,
  saving = false,
  deleting = false,
  error = null,
  savedAt = null,
}: ViewProps) {
  const [form, setForm] = useState<DraftForm>(() => formOf(beat));
  // The Beat the form was filled from. The form diffs against it, never against the live
  // Beat: a change that arrives from the server is not the owner's edit and must not be
  // saved back as the old text.
  const [baseline, setBaseline] = useState<Beat>(beat);
  // The form as it was when it last saved: lets `rebase` tell that save's echo apart from
  // a change made somewhere else.
  const [sent, setSent] = useState<DraftForm | null>(null);
  if (beat !== baseline) {
    setBaseline(beat);
    setForm((f) => rebase(f, baseline, beat, sent));
  }
  const save = (patch: BeatPatch) => {
    setSent(form);
    onSave(patch);
  };
  const [coverSize, setCoverSize] = useState<{ width: number; height: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const pending = useRef<BeatPatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = patchOf(form, baseline);
  const dirtyKey = JSON.stringify(dirty);
  pending.current = dirty;

  /**
   * An armed autosave is dropped the moment the owner presses a button: the explicit action
   * carries the very same patch, and letting the timer fire afterwards would save the Beat a
   * second time behind the action's back.
   */
  const cancelAutosave = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Autosave: one PATCH of everything that changed, once the typing stops.
  useEffect(() => {
    const body = pending.current;
    if (body === null || Object.keys(body).length === 0 || !savable(form)) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      save(body);
    }, AUTOSAVE_MS);
    return cancelAutosave;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyKey]);

  useEffect(() => {
    if (savedAt !== null) setLastSaved(savedAt);
  }, [savedAt]);

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const tagsLen = tagsLength(form.tags);
  const scheduled = form.publishAt !== null;
  const tooLong =
    form.title.length > MAX_TITLE || form.description.length > MAX_DESCRIPTION || tagsLen > MAX_TAGS;
  const blocked = saving || tooLong || !savable(form);
  const titleHint = fillHint(form.title);
  const placeholdersLeft = sendHint(form);
  const job = beat.active_job;

  return (
    <div className="flex flex-col">
      <div className="crumb">
        <Link to="/" className="text-muted">
          ← Library
        </Link>
        <span className="text-muted">/</span>
        <span>{beat.title || "New beat"}</span>
        <span className={clsx("tag", beat.status === "queued" ? "tag-accent" : "tag-outline")}>
          {beat.status === "queued" ? "Queued" : "Draft"}
        </span>
        <span className="end text-muted num" role="status">
          {savedLabel(lastSaved)}
        </span>
      </div>

      <div className="split-form">
        <div className="col-form">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3.5">
            <div className="thumb lg">
              {beat.cover_url && (
                <img
                  src={beat.cover_url}
                  alt={`Cover of ${beat.title}`}
                  onLoad={(e) =>
                    setCoverSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                />
              )}
            </div>
            <div className="file-meta">
              {beat.source_name && (
                <div className="fact-row">
                  <span className="text-soft">Audio</span>
                  <span>{beat.source_name}</span>
                </div>
              )}
              {coverSize && (
                <div className="fact-row">
                  <span className="text-soft">Cover</span>
                  <span>
                    {coverSize.width}×{coverSize.height}
                  </span>
                </div>
              )}
              <div className="fact-row">
                <span className="text-soft">Video</span>
                <span>
                  {beat.rendered
                    ? "video ready"
                    : job
                      ? `${JOB_LABEL[job.kind]} ${Math.round(job.progress * 100)}%`
                      : failedRender
                        ? "render failed"
                        : "not rendered yet"}
                </span>
              </div>
            </div>
          </div>

          {job && (
            <div className="job">
              <div className="job-line">
                <span className="job-title">
                  <span className="dot-live pulse">● </span>
                  {JOB_LABEL[job.kind]}
                </span>
                <span className="time num">
                  {job.status === "queued" ? "queued" : `${Math.round(job.progress * 100)}%`}
                </span>
              </div>
              <div className="progress thin striped">
                <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
              {job.message && <pre className="log clip">{job.message}</pre>}
            </div>
          )}

          {failedRender && (
            <div className="note" role="alert">
              <div className="note-title">Render failed</div>
              {failedRender.error && <pre className="log">{failedRender.error}</pre>}
              <div className="job-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRetry(failedRender.id)}
                >
                  Retry render
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="title">
              Title
              <span className={clsx("counter", form.title.length > MAX_TITLE && "text-accent")}>
                {form.title.length} / {MAX_TITLE}
              </span>
            </label>
            <input
              id="title"
              className="input title"
              value={form.title}
              aria-invalid={form.title.length > MAX_TITLE || undefined}
              onChange={(e) => set("title", e.target.value)}
            />
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={filling || titleHint !== null || beat.status !== "draft"}
                aria-busy={filling || undefined}
                // The armed autosave keeps running: if the fill fails, the edit still saves.
                onClick={() => {
                  onFill(
                    { title: form.title, description: form.description, tags: form.tags },
                    (filled) => setForm((f) => ({ ...f, ...filled })),
                  );
                }}
              >
                {filling ? "Filling…" : "Fill from title"}
              </button>
              {titleHint && <span className="drop-hint">{titleHint}</span>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="description">
              Description
              <span
                className={clsx("counter", form.description.length > MAX_DESCRIPTION && "text-accent")}
              >
                {form.description.length} / {MAX_DESCRIPTION}
              </span>
            </label>
            <textarea
              id="description"
              className="input"
              rows={6}
              value={form.description}
              // The fill is about to replace it; typing now would be lost.
              readOnly={filling}
              aria-invalid={form.description.length > MAX_DESCRIPTION || undefined}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="tags">
              Tags
              <span className={clsx("counter", tagsLen > MAX_TAGS && "text-accent")}>
                {tagsLen} / {MAX_TAGS}
              </span>
            </label>
            <TagInput
              id="tags"
              tags={form.tags}
              disabled={filling}
              onChange={(tags) => set("tags", tags)}
            />
          </div>

          <div className="form-grid-2">
            <div className="field">
              <span className="group-label" id="privacy-label">
                Privacy
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="privacy-label">
                {(["public", "unlisted", "private"] as const).map((value) => (
                  <label key={value} className="seg-opt">
                    <input
                      type="radio"
                      name="privacy"
                      value={value}
                      disabled={scheduled}
                      checked={!scheduled && form.privacy === value}
                      onChange={() => set("privacy", value)}
                    />
                    {value[0].toUpperCase() + value.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="group-label" id="publish-label">
                Publish
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="publish-label">
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="publish"
                    checked={!scheduled}
                    onChange={() => set("publishAt", null)}
                  />
                  Now
                </label>
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="publish"
                    checked={scheduled}
                    onChange={() => set("publishAt", toDateTimeLocal(defaultPublishAt()))}
                  />
                  Schedule
                </label>
              </div>
            </div>
          </div>

          {scheduled && (
            <div className="field">
              <label htmlFor="publish_at">Publish at</label>
              <input
                id="publish_at"
                type="datetime-local"
                className="input"
                value={form.publishAt ?? ""}
                aria-invalid={!savable(form) || undefined}
                onChange={(e) => set("publishAt", e.target.value)}
              />
              <span className="drop-hint">
                Your local time. Uploaded as private; YouTube makes it public then.
              </span>
            </div>
          )}

          {fillError && (
            <div className="note" role="alert">
              <div className="note-title">Fill from title did not run</div>
              <span className="text-soft">{fillError}</span>
            </div>
          )}

          {error && (
            <div className="note" role="alert">
              <div className="note-title">YouTube will not take that</div>
              <span className="text-soft">{error}</span>
            </div>
          )}

          {beat.status === "draft" && placeholdersLeft && (
            <span className="drop-hint">{placeholdersLeft}</span>
          )}

          {beat.status === "draft" && !beat.has_files && (
            <span className="drop-hint">
              Audio and cover are missing, so this Draft cannot be rendered or sent. Delete it
              and drop the two files again.
            </span>
          )}

          <div className="action-bar">
            {beat.status === "draft" && (
              <button
                type="button"
                className="btn btn-primary btn-flush btn-grow"
                disabled={blocked || filling || !beat.has_files || placeholdersLeft !== null}
                onClick={() => {
                  cancelAutosave();
                  setSent(form);
                  onSend(patchOf(form, baseline));
                }}
              >
                Save &amp; upload when rendered <span className="trail">→</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={blocked || Object.keys(dirty).length === 0}
              onClick={() => {
                cancelAutosave();
                save(patchOf(form, baseline));
              }}
            >
              Save draft
            </button>
            {beat.status === "draft" && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deleting}
                onClick={() => {
                  if (!window.confirm(`Delete the draft “${beat.title || "Untitled"}” and its files?`))
                    return;
                  cancelAutosave();
                  onDelete();
                }}
              >
                Delete draft
              </button>
            )}
          </div>

        </div>

        <div className="col-preview">
          <YouTubePreview
            beatId={beat.id}
            title={form.title}
            tags={form.tags}
            coverStyle={beat.has_files ? form.coverStyle : null}
            coverUrl={beat.cover_url}
            channel={channel}
            publishAt={isoOf(form.publishAt)}
            library={library}
          />
          {beat.status === "draft" && beat.rendered && beat.video_style === null && (
            <div className="note" role="status">
              <div className="note-title">Rendered before Cover Styles</div>
              <span className="text-soft">
                The video on disk is the old sepia one, without the Label. Render it again to get
                the look above.
              </span>
              <div className="job-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={saving}
                  onClick={() => save({ cover_style: form.coverStyle })}
                >
                  Render in {coverStyleName(form.coverStyle)}
                </button>
              </div>
            </div>
          )}
          {beat.has_files && (
            <CoverStylePicker
              beatId={beat.id}
              value={form.coverStyle}
              disabled={beat.status !== "draft" || saving}
              onChange={(style) => set("coverStyle", style)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
