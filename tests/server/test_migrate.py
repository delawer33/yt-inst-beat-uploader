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


def test_0004_turns_rendering_beats_into_queued(tmp_path: Path) -> None:
    """ADR 0004: ``rendering`` was only reachable after the owner pressed Upload, so those
    rows are Queued. The downgrade keeps them that way; older code reads ``queued`` fine."""
    from alembic import command
    from sqlalchemy import text

    from beat_server.db.migrate import alembic_config

    db = tmp_path / "beat.sqlite3"
    command.upgrade(alembic_config(db), "0003")
    engine = make_engine(db)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO beats (id, status, title, description, tags, category_id, privacy,"
                " views, likes, comments, created_at, updated_at)"
                " VALUES (:id, :status, '', '', '[]', 10, 'private', 0, 0, 0,"
                " '2026-09-24 00:00:00', '2026-09-24 00:00:00')"
            ),
            [{"id": "a", "status": "rendering"}, {"id": "b", "status": "draft"}],
        )

    upgrade_to_head(db)
    with engine.connect() as conn:
        assert dict(conn.execute(text("SELECT id, status FROM beats")).all()) == {
            "a": "queued",
            "b": "draft",
        }

    command.downgrade(alembic_config(db), "0003")
    with engine.connect() as conn:
        assert dict(conn.execute(text("SELECT id, status FROM beats")).all()) == {
            "a": "queued",
            "b": "draft",
        }
