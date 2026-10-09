"""beats: cover_style, the Cover Style the owner chose, and video_style, the one the video has

Existing rows get the default Cover Style and no ``video_style``: a video rendered before
Cover Styles existed (sepia) is kept and counts as current until the owner picks a style.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(
            sa.Column(
                "cover_style",
                sa.String(length=32),
                nullable=False,
                server_default="purple_yellow_5tone",
            )
        )
        batch.add_column(sa.Column("video_style", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("video_style")
        batch.drop_column("cover_style")
