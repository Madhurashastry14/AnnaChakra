"""Add configurable food roles and compatibility."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

revision = "b462f1f844c9"
down_revision = "78c6b9c784ba"
branch_labels = None
depends_on = None

role = ENUM("MAIN_DISH", "ACCOMPANIMENT", "SIDE_DISH", "DESSERT", "BEVERAGE",
            name="food_role", create_type=False)


def upgrade():
    role.create(op.get_bind(), checkfirst=False)
    op.add_column("food_items", sa.Column("food_role", role, nullable=True))
    op.add_column("food_items", sa.Column("uptake_rate", sa.Float(), nullable=False, server_default="0.75"))
    op.add_column("food_items", sa.Column("preference_weight", sa.Float(), nullable=False, server_default="1"))
    op.add_column("food_items", sa.Column("compatible_main_food_item_ids", sa.JSON(),
                                         nullable=False, server_default="[]"))
    op.create_check_constraint("ck_food_uptake_rate", "food_items", "uptake_rate >= 0 AND uptake_rate <= 1")
    op.create_check_constraint("ck_food_preference_weight", "food_items", "preference_weight > 0")


def downgrade():
    op.drop_constraint("ck_food_preference_weight", "food_items", type_="check")
    op.drop_constraint("ck_food_uptake_rate", "food_items", type_="check")
    for name in ("compatible_main_food_item_ids", "preference_weight", "uptake_rate", "food_role"):
        op.drop_column("food_items", name)
    role.drop(op.get_bind(), checkfirst=False)
