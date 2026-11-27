from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.organization import DeliveryPersonnel


class DeliveryPersonnelPersistenceError(Exception):
    pass


def create_delivery_personnel(
    db: Session,
    *,
    kitchen_id: int,
    name: str,
    phone: str,
) -> DeliveryPersonnel:
    person = DeliveryPersonnel(
        kitchen_id=kitchen_id,
        name=name,
        phone=phone,
        is_active=True,
    )
    db.add(person)
    try:
        db.commit()
        db.refresh(person)
    except SQLAlchemyError:
        db.rollback()
        raise DeliveryPersonnelPersistenceError from None
    return person


def list_delivery_personnel(
    db: Session,
    *,
    kitchen_id: int,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> tuple[list[DeliveryPersonnel], int]:
    filters = [DeliveryPersonnel.kitchen_id == kitchen_id]
    if is_active is not None:
        filters.append(DeliveryPersonnel.is_active == is_active)

    total = db.scalar(
        select(func.count())
        .select_from(DeliveryPersonnel)
        .where(*filters)
    ) or 0
    statement = (
        select(DeliveryPersonnel)
        .where(*filters)
        .order_by(DeliveryPersonnel.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(statement).all()), total


def get_delivery_personnel(
    db: Session,
    *,
    kitchen_id: int,
    person_id: int,
) -> DeliveryPersonnel | None:
    return db.scalar(
        select(DeliveryPersonnel).where(
            DeliveryPersonnel.id == person_id,
            DeliveryPersonnel.kitchen_id == kitchen_id,
        )
    )


def update_delivery_personnel(
    db: Session,
    *,
    kitchen_id: int,
    person_id: int,
    fields: dict[str, str | bool],
) -> DeliveryPersonnel | None:
    person = get_delivery_personnel(
        db,
        kitchen_id=kitchen_id,
        person_id=person_id,
    )
    if person is None:
        return None

    for field, value in fields.items():
        setattr(person, field, value)

    try:
        db.commit()
        db.refresh(person)
    except SQLAlchemyError:
        db.rollback()
        raise DeliveryPersonnelPersistenceError from None
    return person


def deactivate_delivery_personnel(
    db: Session,
    *,
    kitchen_id: int,
    person_id: int,
) -> bool:
    person = get_delivery_personnel(
        db,
        kitchen_id=kitchen_id,
        person_id=person_id,
    )
    if person is None:
        return False
    if person.is_active:
        person.is_active = False
        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            raise DeliveryPersonnelPersistenceError from None
    return True
