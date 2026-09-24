"""beats: ``rendering`` is no longer a Beat status (issue #13, ADR 0004)

A Beat's status says what the owner did; rendering is what a Job does. Under the old flow a
row could only be ``rendering`` after the owner had pressed Upload, so those rows are Queued:
their Render is running or waiting and the Upload follows it.

``beats.status`` is a plain string column, so this is data only, no schema change.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

RENDERING = "rendering"
QUEUED = "queued"


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE beats SET status = :queued WHERE status = :rendering").bindparams(
            queued=QUEUED, rendering=RENDERING
        )
    )


def downgrade() -> None:
    """Nothing to undo.

    Which of the Queued rows were mid-render is not recorded anywhere, and the older code
    reads ``queued`` perfectly well (it is a state it sets itself between render and upload),
    so the downgrade leaves the data as it is rather than guessing.
    """
