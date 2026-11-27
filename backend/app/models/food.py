from datetime import datetime

from sqlalchemy import (
    String, Float, Boolean, Enum,
    DateTime, JSON, func, CheckConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import FoodRole, ServingUnit


class FoodItem(Base):
    __tablename__ = "food_items"

    __table_args__ = (
        CheckConstraint("uptake_rate >= 0 AND uptake_rate <= 1", name="ck_food_uptake_rate"),
        CheckConstraint("preference_weight > 0", name="ck_food_preference_weight"),
        CheckConstraint(
            "default_servings_per_person > 0",
            name="ck_food_default_servings"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        index=True
    )

    category: Mapped[str] = mapped_column(String(50))

    serving_unit: Mapped[ServingUnit] = mapped_column(
        Enum(
            ServingUnit,
            name="serving_unit",
            values_callable=lambda enum: [e.value for e in enum]
        ),
        default=ServingUnit.SERVING
    )

    is_vegetarian: Mapped[bool] = mapped_column(Boolean)

    default_servings_per_person: Mapped[float] = mapped_column(
        Float,
        default=1.0
    )

    ingredients_per_serving: Mapped[list] = mapped_column(
        JSONB,
        default=list
    )

    food_role: Mapped[FoodRole | None] = mapped_column(Enum(FoodRole, name="food_role"))
    uptake_rate: Mapped[float] = mapped_column(Float, default=0.75, server_default="0.75")
    preference_weight: Mapped[float] = mapped_column(Float, default=1, server_default="1")
    compatible_main_food_item_ids: Mapped[list[int]] = mapped_column(
        JSON, default=list, server_default="[]",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )