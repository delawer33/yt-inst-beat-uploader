from pathlib import Path
from sys import is_finalizing
from typing import List, Literal
import subprocess

import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.http

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials


image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.bmp')
audio_extensions = ('.mp3', '.wav')

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _check_ffmpeg() -> bool:
    try:
        subprocess.run(
            ['ffmpeg', '-version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def create_video_from_audio_and_image(
    audio_path: Path,
    image_path: Path,
    output_path: Path
) -> Path:
    if not _check_ffmpeg():
        raise RuntimeError("ffmpeg не установлен")

    cmd = [
        'ffmpeg', '-y',
        '-loop', '1',
        '-i', str(image_path),
        '-i', str(audio_path),
        '-filter_complex',
        'scale=1920:1080:force_original_aspect_ratio=decrease,'
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg ошибка: {result.stderr}")

    return output_path


def upload_video_via_api(
    video: Path,
    title: str,
    description: str,
    tags: List[str],
    category_id: int,
    privacy_status: Literal["private", "public", "unlisted"]
) -> dict:

    token_file = Path("token.json")
    secrets_file = Path("yt-secrets.json")

    creds = None

    if token_file.exists():
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
                secrets_file, SCOPES
            )
            creds = flow.run_local_server(port=0)

        token_file.write_text(creds.to_json())

    youtube = googleapiclient.discovery.build(
        "youtube", "v3", credentials=creds
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": title,
                "description": description,
                "tags": tags,
                "categoryId": category_id,
            },
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False
            },
        },
        media_body=googleapiclient.http.MediaFileUpload(
            str(video), chunksize=-1, resumable=True
        ),
    )

    return request.execute()


def upload(
    folder: Path,
    title: str,
    description: str,
    tags: List[str],
    category_id: int,
    privacy_status: Literal["private", "public", "unlisted"]
) -> None:

    if not folder.exists():
        raise FileNotFoundError(folder)

    image = None
    audio = None

    for f in folder.iterdir():
        if f.suffix.lower() in image_extensions:
            if image is None:
                image = f
            else:
                raise ValueError("There is more than one image in folder")

        if f.suffix.lower() in audio_extensions:
            if audio is None:
                audio = f
            else:
                raise ValueError("There is more than one audio in folder")

    if image is None:
        raise FileNotFoundError("Image not found")
    if audio is None:
        raise FileNotFoundError("Audio not found")

    video_file = folder / "video.mp4"
    if video_file.is_file():
        print("Video already exists, not creating")
    else:
        create_video_from_audio_and_image(audio, image, video_file)
        print(f"Video created {video_file}")

    upload_video_via_api(
        video_file,
        title,
        description,
        tags,
        category_id,
        privacy_status
    )
    print("Video uploaded succesfully")

# upload(
#     Path("test_data/"),
#     "test",
#     "test",
#     ["test", "test2"],
#     10,
#     "private"
#     )
#
