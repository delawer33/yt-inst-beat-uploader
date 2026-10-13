"""beats: the Instagram Post and the "Posted on Instagram" switch

Existing rows have no Instagram Post (it is written when the panel is first opened) and are
not posted.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.add_column(sa.Column("instagram_post", sa.JSON(), nullable=True))
        batch.add_column(
            sa.Column("instagram_posted", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("beats") as batch:
        batch.drop_column("instagram_posted")
        batch.drop_column("instagram_post")
