"""Uploading a rendered video through the YouTube Data API v3."""

import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import googleapiclient.discovery
import googleapiclient.http
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from beat_upload.config import PrivacyStatus, YouTubeMetadata
from beat_upload.errors import TRANSPORT_ERRORS, NetworkError, UploadError
from beat_upload.video import ProgressFn

CHUNK_SIZE = 8 * 1024 * 1024
# A chunk that fails on the transport level (Wi-Fi flap, laptop just woke up) is re-sent on
# the same resumable session, so nothing already uploaded is lost. 5 tries, 5+10+20+40+80 s.
CHUNK_RETRIES = 5
CHUNK_RETRY_DELAY = 5.0


def upload_video(
    video: Path,
    metadata: YouTubeMetadata,
    credentials: Credentials,
    on_progress: ProgressFn | None = None,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Upload ``video`` with ``metadata`` and return the new YouTube video id.

    Resumable in 8 MiB chunks; ``on_progress`` gets the uploaded fraction after each one.
    Raises ``NetworkError`` once a chunk has failed ``CHUNK_RETRIES`` times in a row.
    """
    youtube = _client(credentials)

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
    if metadata.publish_at is not None:
        # Scheduled: YouTube makes the (private) video public at this time by itself.
        body["status"]["publishAt"] = rfc3339_utc(metadata.publish_at)
    media = googleapiclient.http.MediaFileUpload(str(video), chunksize=CHUNK_SIZE, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    failures = 0
    while response is None:
        try:
            status, response = request.next_chunk()
        except HttpError as e:
            raise UploadError(f"YouTube API error: {e}") from e
        except TRANSPORT_ERRORS as e:
            failures += 1
            if failures > CHUNK_RETRIES:
                raise NetworkError(f"Could not reach YouTube: {e}") from e
            sleep(CHUNK_RETRY_DELAY * 2 ** (failures - 1))
            continue
        failures = 0
        if status is not None and on_progress is not None:
            on_progress(status.progress())

    return response["id"]


def set_privacy(video_id: str, status: PrivacyStatus, credentials: Credentials) -> None:
    """Change the privacy status of an existing video. Needs the ``youtube`` scope."""
    youtube = _client(credentials)
    body = {"id": video_id, "status": {"privacyStatus": status.value}}
    try:
        youtube.videos().update(part="status", body=body).execute()
    except HttpError as e:
        raise UploadError(f"YouTube API error for {video_id}: {e}") from e
    except TRANSPORT_ERRORS as e:
        raise NetworkError(f"Could not reach YouTube: {e}") from e


def rfc3339_utc(when: datetime) -> str:
    """``2026-10-01T18:00:00Z``, the form ``status.publishAt`` expects."""
    return when.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _client(credentials: Credentials) -> googleapiclient.discovery.Resource:
    try:
        return googleapiclient.discovery.build("youtube", "v3", credentials=credentials)
    except TRANSPORT_ERRORS as e:
        raise NetworkError(f"Could not reach YouTube: {e}") from e


def video_url(video_id: str) -> str:
    return f"https://youtu.be/{video_id}"
