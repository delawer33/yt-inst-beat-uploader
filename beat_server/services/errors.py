"""Server-side errors. All subclass ``BeatUploadError`` so ``api/errors.py`` maps them."""

from beat_upload.errors import BeatUploadError


class NotFoundError(BeatUploadError):
    """A resource the URL names does not exist. Mapped to 404."""


class BeatNotFound(NotFoundError):
    pass


class ConflictError(BeatUploadError):
    """The resource is in a state that does not allow the operation. Mapped to 409."""


class BeatStateError(ConflictError):
    """E.g. changing privacy of a beat that is not on YouTube, editing a published beat."""
