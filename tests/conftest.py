import pytest

from beat_upload import video


@pytest.fixture(autouse=True)
def _no_systemd_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    """Renders in tests never ask the real systemd for a scope."""
    monkeypatch.setattr(video, "_can_scope", lambda: False)
