"""Index kitchen history ranges and linked waste accounting."""
from alembic import op

revision = "cd214fd53297"
down_revision = "7d1311cfff42"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_meal_records_kitchen_meal_date", "meal_records", ["kitchen_id", "meal_date"])
    op.create_index("ix_waste_logs_meal_record_item_id", "waste_logs", ["meal_record_item_id"])


def downgrade():
    op.drop_index("ix_waste_logs_meal_record_item_id", table_name="waste_logs")
    op.drop_index("ix_meal_records_kitchen_meal_date", table_name="meal_records")
