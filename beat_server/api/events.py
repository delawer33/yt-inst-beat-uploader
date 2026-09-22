"""``GET /api/events``: server-sent events.

Each message is ``event: <job|beat>`` with ``data: <payload JSON>``; a ``: keepalive``
comment goes out when nothing happened for ``KEEPALIVE_SECONDS``.
"""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from beat_server.jobs.events import EventBus

router = APIRouter(prefix="/api", tags=["events"])

KEEPALIVE_SECONDS = 15.0


async def event_stream(
    bus: EventBus, *, keepalive: float = KEEPALIVE_SECONDS
) -> AsyncIterator[str]:
    with bus.subscription() as queue:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=keepalive)
            except TimeoutError:
                yield ": keepalive\n\n"
                continue
            yield f"event: {event.type}\ndata: {json.dumps(event.payload)}\n\n"


@router.get("/events", include_in_schema=False)
async def events(request: Request) -> StreamingResponse:
    bus: EventBus = request.app.state.bus
    return StreamingResponse(
        event_stream(bus),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
