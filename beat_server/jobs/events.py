"""In-process event bus behind ``GET /api/events``.

Publishers run anywhere (worker threads, sync endpoints); subscribers are coroutines on the
server's event loop. Each subscriber owns an ``asyncio.Queue`` and ``publish`` hands events
over with ``loop.call_soon_threadsafe``.
"""

import asyncio
import threading
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal

from beat_server.api.schemas import JobOut
from beat_server.db.models import BeatStatus, Job

EventType = Literal["job", "beat"]


@dataclass(frozen=True)
class Event:
    type: EventType
    payload: dict[str, Any]


def job_payload(job: Job) -> dict[str, Any]:
    """The ``JobOut`` dict, exactly what ``GET /api/jobs/{id}`` would return."""
    return JobOut.model_validate(job).model_dump(mode="json")


class EventBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[asyncio.Queue[Event], asyncio.AbstractEventLoop] = {}

    def publish(self, event: Event) -> None:
        """Deliver ``event`` to every subscriber. Safe from any thread."""
        with self._lock:
            targets = list(self._subscribers.items())
        for queue, loop in targets:
            if not loop.is_closed():
                loop.call_soon_threadsafe(queue.put_nowait, event)

    def publish_job(self, job: Job) -> None:
        self.publish(Event("job", job_payload(job)))

    def publish_beat(self, beat_id: str, status: BeatStatus | str) -> None:
        self.publish(Event("beat", {"id": beat_id, "status": str(status)}))

    @contextmanager
    def subscription(self) -> Iterator[asyncio.Queue[Event]]:
        """Register a queue on the running loop; ``subscribe`` and the SSE endpoint use it."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Event] = asyncio.Queue()
        with self._lock:
            self._subscribers[queue] = loop
        try:
            yield queue
        finally:
            with self._lock:
                self._subscribers.pop(queue, None)

    async def subscribe(self) -> AsyncIterator[Event]:
        with self.subscription() as queue:
            while True:
                yield await queue.get()
