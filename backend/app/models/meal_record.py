from datetime import date, datetime

from sqlalchemy import (
    Date, DateTime, Integer, Float, Boolean, JSON,
    ForeignKey, Enum, func, CheckConstraint,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import MealType, MenuMode


class MealRecord(Base):
    __tablename__ = "meal_records"

    __table_args__ = (
        CheckConstraint(
            "actual_people >= 0",
            name="ck_meal_actual_people"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    kitchen_id: Mapped[int] = mapped_column(
        ForeignKey("kitchens.id"),
        index=True
    )

    forecast_id: Mapped[int | None] = mapped_column(
        ForeignKey("forecasts.id"),
        unique=True,
        nullable=True
    )

    meal_date: Mapped[date] = mapped_column(Date)

    meal_type: Mapped[MealType] = mapped_column(
        Enum(MealType, name="meal_type")
    )

    menu_mode: Mapped[MenuMode | None] = mapped_column(Enum(MenuMode, name="menu_mode"))
    menu_context: Mapped[list[dict] | None] = mapped_column(JSON)

    actual_people: Mapped[int] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class MealRecordItem(Base):
    __tablename__ = "meal_record_items"

    __table_args__ = (
        UniqueConstraint(
            "meal_record_id", "food_item_id",
            name="uq_meal_record_food_item"
        ),
        CheckConstraint(
            "prepared_servings >= 0",
            name="ck_prepared_servings"
        ),
        CheckConstraint(
            "leftover_servings >= 0 "
            "AND leftover_servings <= prepared_servings",
            name="ck_leftover_servings"
        ),
        CheckConstraint(
            "plate_waste_servings IS NULL OR "
            "(plate_waste_servings >= 0 AND "
            "plate_waste_servings <= "
            "prepared_servings - leftover_servings)",
            name="ck_plate_waste_servings"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    meal_record_id: Mapped[int] = mapped_column(
        ForeignKey("meal_records.id", ondelete="CASCADE"),
        index=True
    )

    food_item_id: Mapped[int] = mapped_column(
        ForeignKey("food_items.id")
    )

    prepared_servings: Mapped[float] = mapped_column(Float)

    leftover_servings: Mapped[float] = mapped_column(Float)

    plate_waste_servings: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    shortage_occurred: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    @property
    def served_servings(self) -> float:
        return self.prepared_servings - self.leftover_servings

    @property
    def consumed_servings(self) -> float | None:
        if self.plate_waste_servings is None:
            return None

        return self.served_servings - self.plate_waste_servings