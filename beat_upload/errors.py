"""Exception hierarchy for expected, user-facing failures.

The CLI catches ``BeatUploadError`` and prints its message without a traceback.
Anything else is a bug and is allowed to propagate.
"""

import socket
import ssl

import httplib2

# Transport failures below the API: DNS, refused/reset connection, timeout, TLS. Deliberately
# not the whole of ``OSError``: a local disk error must not look like "YouTube unreachable".
TRANSPORT_ERRORS: tuple[type[BaseException], ...] = (
    httplib2.HttpLib2Error,
    ConnectionError,
    TimeoutError,
    socket.gaierror,
    ssl.SSLError,
)


class BeatUploadError(Exception):
    """Base class for every error the CLI reports to the user."""


class BeatFolderError(BeatUploadError):
    """The beat folder is missing, or does not contain exactly one audio and one image."""


class ConfigError(BeatUploadError):
    """``config.yaml`` is missing or contains invalid metadata."""


class AuthError(BeatUploadError):
    """No usable Google credentials are available."""


class NetworkError(BeatUploadError):
    """Google could not be reached (DNS, connection, timeout). Retry later; not an auth issue."""


class VideoError(BeatUploadError):
    """ffmpeg is unavailable or failed to render the video."""


class UploadError(BeatUploadError):
    """The YouTube Data API rejected the upload."""


class AnalyticsError(BeatUploadError):
    """The YouTube Analytics API rejected the request."""
