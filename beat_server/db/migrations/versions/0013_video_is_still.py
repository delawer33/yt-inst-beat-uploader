"""beats: the YouTube video is always Still, the Effect moves the Reel only (ADR 0012)

``video_effect`` and ``video_meta`` go: a video on disk needs no Effect or header recorded.
A Draft or Queued beat whose video was painted with an Effect loses that video first (its
columns are cleared, so a Render brings the Still one), or it would upload a moving video.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE beats SET video_path = NULL, video_style = NULL"
        " WHERE status IN ('draft', 'queued')"
        " AND video_effect IS NOT NULL AND video_effect != 'still'"
    )
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("video_effect")
        batch.drop_column("video_meta")


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("video_effect", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("video_meta", sa.JSON(), nullable=True))
