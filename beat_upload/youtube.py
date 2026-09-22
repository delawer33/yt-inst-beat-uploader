"""Uploading a rendered video through the YouTube Data API v3."""

from pathlib import Path

import googleapiclient.discovery
import googleapiclient.http
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from beat_upload.config import PrivacyStatus, YouTubeMetadata
from beat_upload.errors import UploadError


def upload_video(video: Path, metadata: YouTubeMetadata, credentials: Credentials) -> str:
    """Upload ``video`` with ``metadata`` and return the new YouTube video id."""
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
    media = googleapiclient.http.MediaFileUpload(str(video), chunksize=-1, resumable=True)

    try:
        response = (
            youtube.videos().insert(part="snippet,status", body=body, media_body=media).execute()
        )
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
