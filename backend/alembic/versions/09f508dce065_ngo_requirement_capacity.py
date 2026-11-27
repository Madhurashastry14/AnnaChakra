"""Add explicit NGO capacity pools and requirement metadata."""
from alembic import op
import sqlalchemy as sa

revision = "09f508dce065"
down_revision = "cd214fd53297"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ngo_requirements", sa.Column("capacity_servings", sa.Float()))
    op.add_column("ngo_requirements", sa.Column("capacity_pieces", sa.Integer()))
    op.add_column("ngo_requirements", sa.Column("accepted_categories", sa.JSON()))
    op.add_column("ngo_requirements", sa.Column("updated_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_ngo_capacity_by_unit", "ngo_requirements",
                               "capacity_servings >= 0 AND capacity_pieces >= 0")


def downgrade():
    op.drop_constraint("ck_ngo_capacity_by_unit", "ngo_requirements", type_="check")
    for name in ("updated_at", "accepted_categories", "capacity_pieces", "capacity_servings"):
        op.drop_column("ngo_requirements", name)
