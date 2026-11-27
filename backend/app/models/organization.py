from datetime import datetime

from sqlalchemy import (
    String, Text, Float, ForeignKey,
    DateTime, Boolean, Enum, func,
    CheckConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import VerificationStatus


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