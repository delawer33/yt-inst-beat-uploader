"""Map the core ``BeatUploadError`` hierarchy to HTTP responses.

One handler for every router: raise the domain error, get ``{"detail": message}`` back with
the status below. Registered in ``create_app``; later slices reuse it as is.

    NotFoundError    -> 404  (server-side: the URL names a beat/job that does not exist)
    ConflictError    -> 409  (server-side: the beat's state does not allow the operation)
    AuthError        -> 409  (no usable Google credentials; the user must (re)connect)
    ConfigError      -> 422  (metadata failed validation)
    BeatUploadError  -> 400  (everything else the user can act on)
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from beat_server.services.errors import ConflictError, NotFoundError
from beat_upload.errors import AuthError, BeatUploadError, ConfigError

STATUS_BY_ERROR: list[tuple[type[BeatUploadError], int]] = [
    (NotFoundError, 404),
    (ConflictError, 409),
    (AuthError, 409),
    (ConfigError, 422),
    (BeatUploadError, 400),
]


def status_for(error: BeatUploadError) -> int:
    for cls, status in STATUS_BY_ERROR:
        if isinstance(error, cls):
            return status
    return 400


async def beat_upload_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, BeatUploadError)
    return JSONResponse(status_code=status_for(exc), content={"detail": str(exc)})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BeatUploadError, beat_upload_error_handler)
