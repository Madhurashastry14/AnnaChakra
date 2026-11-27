"""Add offer expiry, lifecycle evidence, and reservation lookup indexes."""
from alembic import op
import sqlalchemy as sa

revision = "65ae92f48f34"
down_revision = "2e51de177d45"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("expires_at", "accepted_at", "failed_at"):
        op.add_column("donations", sa.Column(name, sa.DateTime(timezone=True)))
    for name in ("cancellation_reason", "failure_reason", "receipt_notes"):
        op.add_column("donations", sa.Column(name, sa.Text()))
    op.add_column("donations", sa.Column("is_simulated", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("donation_items", sa.Column("receipt_evidence", sa.JSON()))
    op.create_index("ix_donations_requirement_id", "donations", ["requirement_id"])


def downgrade():
    op.drop_index("ix_donations_requirement_id", table_name="donations")
    op.drop_column("donation_items", "receipt_evidence")
    for name in ("is_simulated", "receipt_notes", "failure_reason", "cancellation_reason",
                 "failed_at", "accepted_at", "expires_at"):
        op.drop_column("donations", name)
