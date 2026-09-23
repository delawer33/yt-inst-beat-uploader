"""beats: publish_at for Scheduled publishing (issue #9)

The new ``scheduled`` status needs no schema change: ``beats.status`` is a plain string.
Existing rows keep ``publish_at = NULL``.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("publish_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("publish_at")
