import yaml
from pathlib import Path
from yt_upload import upload
from enum import Enum

class PrivacyStatus(str, Enum):
    PRIVATE = "private"
    PUBLIC = "public"
    UNLISTED = "unlisted"

def validate_folder(folder: str) -> Path:
    path = Path(folder)

    if not path.exists():
        raise ValueError("Folder does not exist")

    if not path.is_dir():
        raise ValueError("Provided path is not a directory")

    videos = list(path.glob("*.mp4")) + list(path.glob("*.mov"))
    if not videos:
        raise ValueError("No video files found in the folder")

    return path


def validate_youtube_data(title, description, tags, category_id, privacy_status):
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

    if privacy_status not in PrivacyStatus:
        raise ValueError(f"Privacy status must be one of {list(PrivacyStatus)}")


def main():
    config_path = Path(__file__).parent / "config.yaml"

    if not config_path.exists():
        raise FileNotFoundError("config.yaml not found")

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    yt_config = config.get("youtube", {})
    ig_config = config.get("instagram", {})

    folder_input = input("Path to folder with video: ").strip()
    title = input("Title: ").strip() or yt_config.get("title")
    description = input("Description: ").strip() or yt_config.get("description")
    tags_input = input("Tags (comma-separated): ").strip()
    category_id_str = input("Category ID: ").strip() or yt_config.get("category_id")
    privacy_status = input("Privacy status: ").strip() or yt_config.get("privacy_status")

    if tags_input:
        tags = [t.strip() for t in tags_input.split(",") if t.strip()]
    else:
        tags = yt_config.get("tags", [])

    folder = validate_folder(folder_input)
    validate_youtube_data(title, description, tags, category_id_str, privacy_status)
    privacy_status = PrivacyStatus(privacy_status)
    category_id = int(category_id_str)

    try:
        upload(folder, title, description, tags, category_id, privacy_status.value)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
