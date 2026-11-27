"""Record catalogue meal-type compatibility and backfill standard dishes."""
import json

import sqlalchemy as sa
from alembic import op

revision = "7d1311cfff42"
down_revision = "2a4d02ca8a60"
branch_labels = None
depends_on = None

BREAKFAST = ("idli", "dosa", "poha", "upma", "kuzhi paniyaram")
LUNCH_DINNER = ("steamed rice", "biryani", "lemon rice", "curd rice", "vegetable pulao", "chapati",
                "rasam", "dal tadka", "aloo gobi", "chana masala", "palak paneer", "vegetable curry")
ALL_MEALS = ("poori", "paratha", "sambar")


def upgrade():
    op.add_column("food_items", sa.Column("supported_meal_types", sa.JSON(none_as_null=True), nullable=True))
    foods = sa.table("food_items", sa.column("name", sa.String()), sa.column("supported_meal_types", sa.JSON()))
    for names, values in ((BREAKFAST, ["BREAKFAST"]), (LUNCH_DINNER, ["LUNCH", "DINNER"]),
                          (ALL_MEALS, ["BREAKFAST", "LUNCH", "DINNER"])):
        op.execute(foods.update().where(sa.func.lower(foods.c.name).in_(names),
                                       foods.c.supported_meal_types.is_(None)).values(
            supported_meal_types=op.inline_literal(json.dumps(values), type_=sa.String()),
        ))


def downgrade():
    op.drop_column("food_items", "supported_meal_types")
