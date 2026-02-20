from enum import Enum
from pathlib import Path
from typing import Annotated, Optional

import typer
import yaml

import auth
import yt_upload
from auth import CONFIG_DIR, SECRETS_FILE, TOKEN_FILE


app = typer.Typer(
    name="beat-upload",
    help="Produce a YouTube video from a beat (audio + image) and upload it.",
    no_args_is_help=True,
)


class PrivacyStatus(str, Enum):
    PRIVATE = "private"
    PUBLIC = "public"
    UNLISTED = "unlisted"


# Helpers


def _validate_folder(path: Path) -> None:
    """Raise if the folder is missing or lacks exactly one audio and one image."""
    if not path.exists():
        raise ValueError(f"Folder does not exist: {path}")
    if not path.is_dir():
        raise ValueError(f"Provided path is not a directory: {path}")

    images = [
        f for f in path.iterdir() if f.suffix.lower() in yt_upload.IMAGE_EXTENSIONS
    ]
    audios = [
        f for f in path.iterdir() if f.suffix.lower() in yt_upload.AUDIO_EXTENSIONS
    ]

    if len(images) == 0:
        raise ValueError("No image file found in the folder")
    if len(images) > 1:
        raise ValueError("More than one image file found in the folder")
    if len(audios) == 0:
        raise ValueError("No audio file found in the folder")
    if len(audios) > 1:
        raise ValueError("More than one audio file found in the folder")


def _validate_youtube_data(
    title: str,
    description: str,
    tags: list[str],
    category_id: int | str,
    privacy_status: str,
) -> None:
    """Raise if any YouTube metadata field fails validation."""
    if not title:
        raise ValueError("Title cannot be empty")
    if len(title) > 100:
        raise ValueError("Title must be <= 100 characters")
    if description and len(description) > 5000:
        raise ValueError("Description must be <= 5000 characters")
    if not isinstance(tags, list):
        raise ValueError("Tags must be a list")
    if not all(isinstance(t, str) for t in tags):
        raise ValueError("Each tag must be a string")
    if not str(category_id).isdigit():
        raise ValueError("Category ID must be a number")
    if privacy_status not in PrivacyStatus._value2member_map_:
        raise ValueError(
            f"Privacy status must be one of {[s.value for s in PrivacyStatus]}"
        )


def _load_config(folder: Path) -> dict:
    config_path = folder / "config.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"config.yaml not found in {folder}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# Commands


@app.command()
def login(
    client_id: Annotated[
        Optional[str],
        typer.Option("--client-id", help="Google OAuth2 client ID", prompt="Client ID"),
    ] = None,
    client_secret: Annotated[
        Optional[str],
        typer.Option(
            "--client-secret",
            help="Google OAuth2 client secret",
            prompt="Client secret",
            hide_input=True,
        ),
    ] = None,
) -> None:
    assert client_id and client_secret

    auth.save_client_secrets(client_id, client_secret)
    typer.echo(f"Client secrets saved to {SECRETS_FILE}")

    typer.echo("Opening browser for Google authentication...")
    auth.run_login_flow()
    typer.echo(f"Authentication successful. Token saved to {TOKEN_FILE}")


@app.command()
def upload(
    folder: Annotated[
        Path,
        typer.Argument(
            help="Path to the folder containing the beat files and config.yaml"
        ),
    ],
) -> None:
    folder = folder.resolve()

    try:
        _validate_folder(folder)
    except ValueError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    try:
        config = _load_config(folder)
    except FileNotFoundError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    yt = config.get("youtube", {})
    title: str = yt.get("title", "")
    description: str = yt.get("description", "")
    tags: list[str] = yt.get("tags", [])
    category_id = yt.get("category_id", "")
    privacy_status: str = yt.get("privacy_status", "")

    try:
        _validate_youtube_data(title, description, tags, category_id, privacy_status)
    except ValueError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    try:
        creds = auth.get_valid_credentials()
    except RuntimeError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    try:
        yt_upload.upload(
            folder,
            title,
            description,
            tags,
            int(category_id),
            PrivacyStatus(privacy_status).value,  # type: ignore[arg-type]
            creds,
        )
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)
