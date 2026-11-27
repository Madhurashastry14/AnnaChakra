from datetime import datetime

from sqlalchemy import (
    String, Float, Boolean, Enum,
    DateTime, func, CheckConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ServingUnit


class FoodItem(Base):
    __tablename__ = "food_items"

    __table_args__ = (
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )