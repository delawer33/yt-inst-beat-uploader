from pathlib import Path

from sqlalchemy import inspect

from beat_server.db.engine import make_engine
from beat_server.db.migrate import upgrade_to_head
from beat_server.db.models import Base
from beat_server.settings import ServerSettings
from beat_upload.workspace import Workspace


def test_upgrade_to_head_creates_all_tables(tmp_path: Path) -> None:
    db = tmp_path / "nested" / "beat.sqlite3"
    upgrade_to_head(db)
    upgrade_to_head(db)  # idempotent

    tables = set(inspect(make_engine(db)).get_table_names())
    assert {"beats", "jobs", "video_stats_daily", "settings"} <= tables
    assert set(Base.metadata.tables) <= tables


def test_create_app_migrates_workspace_db(tmp_path: Path) -> None:
    from beat_server.app import create_app

    ws = Workspace(config_dir=tmp_path / "c", data_dir=tmp_path / "d")
    create_app(ws, ServerSettings(), web_dist=None)
    assert ws.db_file.is_file()


def test_file_engine_uses_wal(tmp_path: Path) -> None:
    from sqlalchemy import text

    engine = make_engine(tmp_path / "db.sqlite3")
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
