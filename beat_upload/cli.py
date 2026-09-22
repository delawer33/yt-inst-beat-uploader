"""Command-line interface. Keeps only argument parsing and user-facing output."""

import json
from collections.abc import Iterable
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Any, NoReturn

import typer

from beat_upload import auth
from beat_upload.analytics import YouTubeAnalytics
from beat_upload.beat_folder import BeatFolder, find_beat_folder
from beat_upload.config import PrivacyStatus, load_youtube_metadata
from beat_upload.errors import BeatUploadError
from beat_upload.stats import VideoStats, YouTubeStats
from beat_upload.video import render_video
from beat_upload.workspace import Workspace
from beat_upload.youtube import set_privacy, upload_video, video_url

app = typer.Typer(
    name="beat-upload",
    help="Produce a YouTube video from a beat (audio + image) and upload it.",
    no_args_is_help=True,
)


@app.command()
def login(
    client_id: Annotated[
        str,
        typer.Option("--client-id", help="Google OAuth2 client ID", prompt="Client ID"),
    ],
    client_secret: Annotated[
        str,
        typer.Option(
            "--client-secret",
            help="Google OAuth2 client secret",
            prompt="Client secret",
            hide_input=True,
        ),
    ],
) -> None:
    """Store Google API client credentials and authorize via the browser."""
    ws = Workspace.default()
    auth.save_client_secrets(ws, client_id, client_secret)
    typer.echo(f"Client secrets saved to {ws.secrets_file}")

    typer.echo("Opening browser for Google authentication...")
    try:
        auth.run_login_flow(ws)
    except BeatUploadError as e:
        _fail(str(e))
    typer.echo(f"Authentication successful. Token saved to {ws.token_file}")


@app.command()
def upload(
    folder: Annotated[
        Path,
        typer.Argument(help="Folder with one audio file, one cover image and config.yaml"),
    ],
) -> None:
    """Render the beat video (if needed) and upload it to YouTube."""
    try:
        _upload(folder.resolve())
    except BeatUploadError as e:
        _fail(str(e))


JsonFlag = Annotated[bool, typer.Option("--json", help="Print machine-readable JSON")]


@app.command()
def channel(as_json: JsonFlag = False) -> None:
    """Show subscriber, view and video counts of your channel."""
    try:
        stats = YouTubeStats(auth.get_valid_credentials(Workspace.default())).channel()
    except BeatUploadError as e:
        _fail(str(e))
    if as_json:
        _print_json(stats.to_dict())
        return
    typer.echo(f"{stats.title} ({stats.id})")
    typer.echo(f"subscribers: {stats.subscribers}")
    typer.echo(f"views:       {stats.views}")
    typer.echo(f"videos:      {stats.videos}")


@app.command()
def videos(
    limit: Annotated[
        int | None, typer.Option("--limit", "-n", help="Newest N videos (default: all)")
    ] = None,
    as_json: JsonFlag = False,
) -> None:
    """List your uploads with views, likes and comments, newest first."""
    try:
        items = YouTubeStats(auth.get_valid_credentials(Workspace.default())).videos(limit)
    except BeatUploadError as e:
        _fail(str(e))
    if as_json:
        _print_json([v.to_dict() for v in items])
        return
    _print_video_table(items)


@app.command()
def video(
    video_id: Annotated[str, typer.Argument(help="YouTube video id (the part after youtu.be/)")],
    as_json: JsonFlag = False,
) -> None:
    """Show statistics, tags and description of one video."""
    try:
        item = YouTubeStats(auth.get_valid_credentials(Workspace.default())).video(video_id)
    except BeatUploadError as e:
        _fail(str(e))
    if as_json:
        _print_json(item.to_dict())
        return
    _print_video_table([item])
    typer.echo(f"tags: {', '.join(item.tags) or '-'}")
    typer.echo("description:")
    typer.echo(item.description)


@app.command()
def analytics(
    days: Annotated[int, typer.Option("--days", "-d", help="Look back this many days")] = 28,
    as_json: JsonFlag = False,
) -> None:
    """Per-video views, watch time and average view duration for the last N days."""
    end = date.today()
    start = end - timedelta(days=days - 1)
    try:
        credentials = auth.get_valid_credentials(Workspace.default())
        rows = YouTubeAnalytics(credentials).videos(start, end)
        titles = {v.id: v.title for v in YouTubeStats(credentials).videos()}
    except BeatUploadError as e:
        _fail(str(e))
    if as_json:
        _print_json([{**r.to_dict(), "title": titles.get(r.id, "")} for r in rows])
        return
    typer.echo(f"{start} .. {end}")
    typer.echo(f"{'views':>6} {'watch':>6} {'avd':>5} {'avd%':>5} id           title")
    for r in rows:
        avd = f"{r.avg_view_seconds // 60}:{r.avg_view_seconds % 60:02d}"
        typer.echo(
            f"{r.views:>6} {r.watch_minutes:>5}m {avd:>5} {r.avg_view_percent:>4.0f}% "
            f"{r.id:<12} {titles.get(r.id, '')}"
        )
    typer.echo(f"total: {sum(r.views for r in rows)} views, {sum(r.watch_minutes for r in rows)}m")


@app.command()
def privacy(
    status: Annotated[PrivacyStatus, typer.Argument(help="private | unlisted | public")],
    video_ids: Annotated[list[str], typer.Argument(help="One or more YouTube video ids")],
) -> None:
    """Change the privacy status of existing videos."""
    try:
        credentials = auth.get_valid_credentials(Workspace.default())
        for video_id in video_ids:
            set_privacy(video_id, status, credentials)
            typer.echo(f"{video_id}: {status.value}")
    except BeatUploadError as e:
        _fail(str(e))


@app.command()
def serve(
    port: Annotated[int, typer.Option("--port", help="Port to listen on")] = 8765,
    open_browser: Annotated[
        bool, typer.Option("--open-browser", help="Open the UI in the default browser")
    ] = False,
) -> None:
    """Run the local web server (UI + API) on http://127.0.0.1:PORT."""
    import uvicorn

    from beat_server.app import create_app
    from beat_server.settings import ServerSettings

    settings = ServerSettings.from_env(port=port)
    ws = settings.workspace()
    url = f"http://{settings.host}:{settings.port}"
    typer.echo(f"Serving on {url} (data in {ws.data_dir})")
    if open_browser:
        import webbrowser

        webbrowser.open(url)
    uvicorn.run(create_app(ws, settings), host=settings.host, port=settings.port)


def _print_video_table(items: Iterable[VideoStats]) -> None:
    typer.echo(
        f"{'date':<10} {'views':>8} {'likes':>6} {'comm':>5} {'privacy':<8} id           title"
    )
    for v in items:
        typer.echo(
            f"{v.published_at[:10]:<10} {v.views:>8} {v.likes:>6} {v.comments:>5} "
            f"{v.privacy:<8} {v.id:<12} {v.title}"
        )


def _print_json(data: Any) -> None:
    typer.echo(json.dumps(data, ensure_ascii=False, indent=2))


def _upload(folder: Path) -> None:
    beat = find_beat_folder(folder)
    metadata = load_youtube_metadata(beat.config_path)
    credentials = auth.get_valid_credentials(Workspace.default())

    _ensure_video(beat)

    typer.echo(f"Uploading {beat.video_path.name} as '{metadata.title}'...")
    video_id = upload_video(beat.video_path, metadata, credentials)
    typer.echo(f"Uploaded ({metadata.privacy_status.value}): {video_url(video_id)}")


def _ensure_video(beat: BeatFolder) -> None:
    if beat.video_path.is_file():
        typer.echo(f"Video already exists, skipping render: {beat.video_path}")
        return
    typer.echo(f"Rendering video from {beat.audio.name} + {beat.image.name}...")
    render_video(beat.audio, beat.image, beat.video_path)
    typer.echo(f"Video created: {beat.video_path}")


def _fail(message: str) -> NoReturn:
    typer.echo(f"Error: {message}", err=True)
    raise typer.Exit(1)
