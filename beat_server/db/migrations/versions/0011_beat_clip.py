"""beats: the Clip of a Draft made from a Bounce Folder that holds a video for a cover

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("clip_path", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("clip_path")
