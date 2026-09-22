"""initial tables: beats, jobs, video_stats_daily, settings

Revision ID: 0001
Revises:
Create Date: 2026-09-22
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "beats",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("privacy", sa.String(16), nullable=False),
        sa.Column("youtube_id", sa.String(32), nullable=True),
        sa.Column("audio_path", sa.String(255), nullable=True),
        sa.Column("image_path", sa.String(255), nullable=True),
        sa.Column("video_path", sa.String(255), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("views", sa.Integer(), nullable=False),
        sa.Column("likes", sa.Integer(), nullable=False),
        sa.Column("comments", sa.Integer(), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("youtube_id", name="uq_beats_youtube_id"),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("beat_id", sa.String(36), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_jobs_beat_id", "jobs", ["beat_id"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_table(
        "video_stats_daily",
        sa.Column("youtube_id", sa.String(32), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("views", sa.Integer(), nullable=False),
        sa.Column("watch_minutes", sa.Integer(), nullable=False),
        sa.Column("avg_view_seconds", sa.Integer(), nullable=False),
        sa.Column("avg_view_percent", sa.Float(), nullable=False),
    )
    op.create_table(
        "settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_table("video_stats_daily")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_beat_id", table_name="jobs")
    op.drop_table("jobs")
    op.drop_table("beats")
