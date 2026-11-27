"""Identify simulated organizations and surplus independently of labels."""
import sqlalchemy as sa
from alembic import op

revision = "2e51de177d45"
down_revision = "09f508dce065"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("kitchens", "ngos", "waste_logs"):
        op.add_column(table, sa.Column("is_simulated", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade():
    for table in ("waste_logs", "ngos", "kitchens"):
        op.drop_column(table, "is_simulated")
