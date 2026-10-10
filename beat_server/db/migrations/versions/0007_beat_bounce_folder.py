"""beats: the Bounce Folder a Draft is read from, its facts, and the BeatStars Track

Existing rows get no Bounce Folder, empty lists and ``samples`` / ``beatstars_skipped`` false.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_LISTS = ("name_moods", "name_instruments", "beatstars_moods", "beatstars_instruments")
_FLAGS = ("samples", "beatstars_skipped")


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("bounce_folder", sa.String(length=1024), nullable=True))
        batch.add_column(sa.Column("bpm", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("music_key", sa.String(length=8), nullable=True))
        for name in _LISTS:
            batch.add_column(
                sa.Column(name, sa.JSON(), nullable=False, server_default=sa.text("'[]'"))
            )
        for name in _FLAGS:
            batch.add_column(
                sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false())
            )
        batch.add_column(sa.Column("beatstars_id", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("beatstars_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        for name in (
            "beatstars_url",
            "beatstars_id",
            *_FLAGS,
            *_LISTS,
            "music_key",
            "bpm",
            "bounce_folder",
        ):
            batch.drop_column(name)
