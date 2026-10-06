"""beats: source_name, the original audio file name (Fill from title)

The audio is stored as ``audio.<ext>``, so the name the owner dropped, which may carry BPM
and key (``Dmin110.mp3``), is kept here. Existing rows keep ``NULL``.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("source_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("source_name")
