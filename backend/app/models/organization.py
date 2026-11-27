from datetime import datetime

from sqlalchemy import (
    String, Text, Float, ForeignKey,
    DateTime, Boolean, Enum, JSON, func,
    CheckConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import VerificationStatus
from datetime import date
from sqlalchemy import Date, Integer, false

class Kitchen(Base):
    __tablename__ = "kitchens"

    __table_args__ = (
        CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name="ck_kitchen_latitude"
        ),
        CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name="ck_kitchen_longitude"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    manager_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True
    )

    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    phone: Mapped[str] = mapped_column(String(20))

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.PENDING
    )
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class NGO(Base):
    __tablename__ = "ngos"

    __table_args__ = (
        CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name="ck_ngo_latitude"
        ),
        CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name="ck_ngo_longitude"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    manager_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True
    )

    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    phone: Mapped[str] = mapped_column(String(20))

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.PENDING
    )
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class DeliveryPersonnel(Base):
    __tablename__ = "delivery_personnel"

    id: Mapped[int] = mapped_column(primary_key=True)

    kitchen_id: Mapped[int] = mapped_column(
        ForeignKey("kitchens.id"),
        index=True
    )

    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(20))

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
class NGORequirement(Base):
    __tablename__ = "ngo_requirements"

    __table_args__ = (
        CheckConstraint(
            "people_to_feed > 0",
            name="ck_ngo_people_to_feed"
        ),
        CheckConstraint(
            "remaining_capacity >= 0",
            name="ck_ngo_remaining_capacity"
        ),
        CheckConstraint("capacity_servings >= 0 AND capacity_pieces >= 0", name="ck_ngo_capacity_by_unit"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    ngo_id: Mapped[int] = mapped_column(
        ForeignKey("ngos.id"),
        index=True
    )

    capacity_servings: Mapped[float | None] = mapped_column(Float)
    capacity_pieces: Mapped[int | None] = mapped_column(Integer)
    accepted_categories: Mapped[list[str] | None] = mapped_column(JSON)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    people_to_feed: Mapped[int] = mapped_column(Integer)

    remaining_capacity: Mapped[int] = mapped_column(Integer)

    accepts_vegetarian: Mapped[bool] = mapped_column(
        Boolean,
        default=True
    )

    accepts_non_vegetarian: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    required_date: Mapped[date] = mapped_column(Date)

    available_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True)
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )