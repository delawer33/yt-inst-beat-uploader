# YouTube/Instagram Beat Uploader

A Python CLI tool that can save lots of time on distributing your beats on Youtube (later Instagram). It produces a YouTube-ready video from a beat (audio + cover image), then uploads it via the YouTube Data API v3.

> **Status: WIP** — Instagram support is planned but not yet implemented. Later you will be able to install tool system-wide.

## Features

- Combine audio (MP3/WAV) with a cover image into a 1080p video using ffmpeg
- Upload directly to YouTube with metadata (title, description, tags, category, privacy)
- OAuth2 authentication with Google
- Configurable per-beat via YAML

## Prerequisites

- Python 3.13+
- [ffmpeg](https://ffmpeg.org/) installed system-wide

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

### 1. Login

[Get Client ID and Client Secret for your Google account](https://developers.google.com/youtube/registering_an_application)

Authenticate with obtained credentials:

```bash
python main.py login --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

You can also run without flags to be prompted interactively:
```bash
python main.py login
```

This opens a browser for OAuth authorization. Credentials are stored in your platform config directory.

### 2. Upload a Beat

Prepare a folder with:
- One audio file (`.mp3` or `.wav`)
- One image file (`.jpg`, `.jpeg`, `.png`, `.gif`, or `.bmp`)
- A `config.yaml` file

```bash
python main.py upload /path/to/beat/folder
```

### config.yaml

```yaml
youtube:
  title: "My Beat Title"
  description: "Produced by ..."
  tags:
    - beats
    - instrumental
  category_id: 10         # Music
  privacy_status: private  # private | public | unlisted
```

## Configuration

Credentials are stored in the platform-specific config directory:

| OS      | Path                          |
|---------|-------------------------------|
| Linux   | `~/.config/beat-upload/`     |
| macOS   | `~/Library/Application Support/beat-upload/` |
| Windows | `%APPDATA%\beat-upload\`     |

