"""Persist recorded menu mode and dish context on meal feedback."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

revision = "f6fd216bdbc0"
down_revision = "c3905e700545"
branch_labels = None
depends_on = None

mode = ENUM("CHOICE_BASED", "FIXED_MEAL", name="menu_mode", create_type=False)


def upgrade():
    op.add_column("meal_records", sa.Column("menu_mode", mode, nullable=True))
    op.add_column("meal_records", sa.Column("menu_context", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("meal_records", "menu_context")
    op.drop_column("meal_records", "menu_mode")
