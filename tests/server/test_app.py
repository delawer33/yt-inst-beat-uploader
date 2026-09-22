from pathlib import Path

from fastapi.testclient import TestClient

from beat_server.app import create_app
from beat_server.db.engine import MEMORY
from beat_server.db.models import Base
from beat_server.settings import ServerSettings
from beat_upload.workspace import Workspace


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_without_dist_is_alive_page(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "beat-upload server is alive" in response.text


def test_root_with_dist_serves_spa(workspace: Workspace, tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<h1>spa</h1>")
    (dist / "assets" / "a.js").write_text("1")
    app = create_app(workspace, ServerSettings(), web_dist=dist, db_path=MEMORY, migrate=False)
    Base.metadata.create_all(app.state.engine)  # the lifespan recovers jobs on startup

    with TestClient(app) as client:
        assert client.get("/").text == "<h1>spa</h1>"
        assert client.get("/beats/abc").text == "<h1>spa</h1>"
        assert client.get("/assets/a.js").text == "1"
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/nope").status_code == 404
