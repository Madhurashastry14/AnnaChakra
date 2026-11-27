"""Persist forecast serving mode and catalogue inputs."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

revision = "c3905e700545"
down_revision = "b462f1f844c9"
branch_labels = None
depends_on = None

mode = ENUM("CHOICE_BASED", "FIXED_MEAL", name="menu_mode", create_type=False)


def upgrade():
    mode.create(op.get_bind(), checkfirst=False)
    op.add_column("forecasts", sa.Column("menu_mode", mode, nullable=True))
    op.add_column("forecasts", sa.Column("menu_context", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("forecasts", "menu_context")
    op.drop_column("forecasts", "menu_mode")
    mode.drop(op.get_bind(), checkfirst=False)
