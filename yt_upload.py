import subprocess
from pathlib import Path
from typing import List, Literal

import googleapiclient.discovery
import googleapiclient.http
from google.oauth2.credentials import Credentials


IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".bmp")
AUDIO_EXTENSIONS = (".mp3", ".wav")


def _check_ffmpeg() -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def create_video_from_audio_and_image(
    audio_path: Path,
    image_path: Path,
    output_path: Path,
) -> Path:
    if not _check_ffmpeg():
        raise RuntimeError("ffmpeg is not installed or not on PATH")

    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-filter_complex",
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr}")

    return output_path


def upload_video_via_api(
    video: Path,
    title: str,
    description: str,
    tags: List[str],
    category_id: int,
    privacy_status: Literal["private", "public", "unlisted"],
    credentials: Credentials,
) -> dict:
    youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)

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
                "selfDeclaredMadeForKids": False,
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
    privacy_status: Literal["private", "public", "unlisted"],
    credentials: Credentials,
) -> None:
    if not folder.exists():
        raise FileNotFoundError(f"Folder not found: {folder}")

    image = None
    audio = None

    for f in folder.iterdir():
        if f.suffix.lower() in IMAGE_EXTENSIONS:
            if image is None:
                image = f
            else:
                raise ValueError("There is more than one image in folder")

        if f.suffix.lower() in AUDIO_EXTENSIONS:
            if audio is None:
                audio = f
            else:
                raise ValueError("There is more than one audio file in folder")

    if image is None:
        raise FileNotFoundError("Image not found in folder")
    if audio is None:
        raise FileNotFoundError("Audio file not found in folder")

    video_file = folder / "video.mp4"
    if video_file.is_file():
        print("Video already exists, skipping creation")
    else:
        create_video_from_audio_and_image(audio, image, video_file)
        print(f"Video created: {video_file}")

    upload_video_via_api(
        video_file,
        title,
        description,
        tags,
        category_id,
        privacy_status,
        credentials,
    )
    print("Video uploaded successfully")
