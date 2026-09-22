"""CSRF guard for ``/api``: reject cross-site state-changing requests.

The server has no login; the browser's ambient access to ``localhost`` is the only thing a
malicious page could ride on. Two signals, either one rejects with 403:

* ``Sec-Fetch-Site: cross-site`` (every modern browser sends it);
* ``Origin`` present and not equal to the request's own ``Host``.

A missing ``Origin`` is allowed so curl, the test client and same-origin navigations keep
working. Safe methods pass; ``GET /api/auth/google/start`` is a navigation and has its own
``Sec-Fetch-Site`` check in the auth router.
"""

from urllib.parse import urlsplit

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
API_PREFIX = "/api/"
CROSS_SITE = "cross-site"


def is_cross_site(request: Request) -> bool:
    """True when the request should be refused: cross-site by Sec-Fetch-Site or by Origin."""
    if request.headers.get("sec-fetch-site", "").lower() == CROSS_SITE:
        return True
    origin = request.headers.get("origin")
    if origin is None:
        return False
    # ``Origin: null`` (sandboxed/opaque) has no netloc and so never matches.
    return urlsplit(origin).netloc.lower() != request.headers.get("host", "").lower()


def reject() -> Response:
    return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)


class CsrfMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] not in SAFE_METHODS
            and scope["path"].startswith(API_PREFIX)
            and is_cross_site(Request(scope))
        ):
            await reject()(scope, receive, send)
            return
        await self.app(scope, receive, send)


def install_csrf(app: FastAPI) -> None:
    app.add_middleware(CsrfMiddleware)
