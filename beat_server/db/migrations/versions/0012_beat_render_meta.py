"""beats: the header's words the video and the Reel were painted with (Effects draw them)

Existing files have none recorded; a Still file needs none, and an Effect file rendered
before this is treated as stale, so the next send renders it with the title it has.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("video_meta", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("reel_meta", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("reel_meta")
        batch.drop_column("video_meta")
