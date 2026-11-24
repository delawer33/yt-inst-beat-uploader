"""beats: the Reel file and the Cover Style it was rendered in

Existing rows have no Reel; the panel renders one when it is first opened.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("reel_path", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("reel_style", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("reel_style")
        batch.drop_column("reel_path")
