"""Uploading a rendered video through the YouTube Data API v3."""

from pathlib import Path

import googleapiclient.discovery
import googleapiclient.http
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from beat_upload.config import PrivacyStatus, YouTubeMetadata
from beat_upload.errors import UploadError
from beat_upload.video import ProgressFn

CHUNK_SIZE = 8 * 1024 * 1024


def upload_video(
    video: Path,
    metadata: YouTubeMetadata,
    credentials: Credentials,
    on_progress: ProgressFn | None = None,
) -> str:
    """Upload ``video`` with ``metadata`` and return the new YouTube video id.

    Resumable in 8 MiB chunks; ``on_progress`` gets the uploaded fraction after each one.
    """
    youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)

    body = {
        "snippet": {
            "title": metadata.title,
            "description": metadata.description,
            "tags": metadata.tags,
            "categoryId": str(metadata.category_id),
        },
        "status": {
            "privacyStatus": metadata.privacy_status.value,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = googleapiclient.http.MediaFileUpload(str(video), chunksize=CHUNK_SIZE, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    try:
        while response is None:
            status, response = request.next_chunk()
            if status is not None and on_progress is not None:
                on_progress(status.progress())
    except HttpError as e:
        raise UploadError(f"YouTube API error: {e}") from e

    return response["id"]


def set_privacy(video_id: str, status: PrivacyStatus, credentials: Credentials) -> None:
    """Change the privacy status of an existing video. Needs the ``youtube`` scope."""
    youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)
    body = {"id": video_id, "status": {"privacyStatus": status.value}}
    try:
        youtube.videos().update(part="status", body=body).execute()
    except HttpError as e:
        raise UploadError(f"YouTube API error for {video_id}: {e}") from e


def video_url(video_id: str) -> str:
    return f"https://youtu.be/{video_id}"
