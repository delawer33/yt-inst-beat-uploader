"""beats: the Effect the owner chose and the one the video and the Reel were rendered with

Existing rows get the Still Effect; their files have no effect recorded, which counts as
Still, so nothing is rendered again.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(
            sa.Column("effect", sa.String(length=32), nullable=False, server_default="still")
        )
        batch.add_column(sa.Column("video_effect", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("reel_effect", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("reel_effect")
        batch.drop_column("video_effect")
        batch.drop_column("effect")
