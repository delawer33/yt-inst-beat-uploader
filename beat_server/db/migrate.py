"""Run Alembic migrations programmatically. The migration scripts ship inside the package."""

from pathlib import Path

from alembic import command
from alembic.config import Config

from beat_server.db.engine import sqlite_url

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def alembic_config(db_path: Path | str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", sqlite_url(db_path))
    return cfg


def upgrade_to_head(db_path: Path | str) -> None:
    """Create the database file if needed and apply every pending migration."""
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    command.upgrade(alembic_config(db_path), "head")
