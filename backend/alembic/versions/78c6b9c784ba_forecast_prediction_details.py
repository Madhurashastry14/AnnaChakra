"""Persist dish prediction details with the forecast."""
import sqlalchemy as sa
from alembic import op

revision = "78c6b9c784ba"
down_revision = "04da22abaafd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("forecast_items", sa.Column("prediction_details", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("forecast_items", "prediction_details")
