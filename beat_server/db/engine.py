"""SQLite engine and session factory."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

MEMORY = ":memory:"


def sqlite_url(path: Path | str) -> str:
    if str(path) == MEMORY:
        return "sqlite://"
    return f"sqlite:///{Path(path)}"


def make_engine(path: Path | str) -> Engine:
    """Engine for one sqlite file (or ``":memory:"``). Safe to share across threads.

    File databases run in WAL mode: readers (API requests) never block the job worker's
    commits and vice versa.
    """
    memory = str(path) == MEMORY
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if memory:
        kwargs["poolclass"] = StaticPool  # one shared connection, or every session sees an empty db
    engine = create_engine(sqlite_url(path), **kwargs)

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection, _record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        if not memory:
            cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
