from typing import TypeVar

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.enums import VerificationStatus
from app.models.organization import Kitchen, NGO

OrganizationModel = TypeVar("OrganizationModel", Kitchen, NGO)
MATERIAL_FIELDS = ("name", "address", "latitude", "longitude")


class OrganizationAlreadyRegisteredError(Exception):
    pass


class OrganizationPersistenceError(Exception):
    pass


def find_kitchen_for_manager(db: Session, manager_id: int) -> Kitchen | None:
    return db.scalar(
        select(Kitchen).where(Kitchen.manager_id == manager_id)
    )


def find_ngo_for_manager(db: Session, manager_id: int) -> NGO | None:
    return db.scalar(select(NGO).where(NGO.manager_id == manager_id))


def _find_for_manager(
    db: Session,
    model: type[OrganizationModel],
    manager_id: int,
) -> OrganizationModel | None:
    return db.scalar(select(model).where(model.manager_id == manager_id))


def _create_organization(
    db: Session,
    model: type[OrganizationModel],
    manager_id: int,
    fields: dict[str, str | float],
) -> OrganizationModel:
    try:
        existing = _find_for_manager(db, model, manager_id)
    except SQLAlchemyError:
        db.rollback()
        raise OrganizationPersistenceError from None

    if existing is not None:
        raise OrganizationAlreadyRegisteredError

    organization = model(
        manager_id=manager_id,
        verification_status=VerificationStatus.PENDING,
        **fields,
    )
    db.add(organization)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        try:
            existing = _find_for_manager(db, model, manager_id)
        except SQLAlchemyError:
            db.rollback()
            raise OrganizationPersistenceError from None
        if existing is not None:
            raise OrganizationAlreadyRegisteredError from None
        raise OrganizationPersistenceError from None
    except SQLAlchemyError:
        db.rollback()
        raise OrganizationPersistenceError from None

    db.refresh(organization)
    return organization


def create_kitchen(
    db: Session,
    manager_id: int,
    fields: dict[str, str | float],
) -> Kitchen:
    return _create_organization(db, Kitchen, manager_id, fields)


def create_ngo(
    db: Session,
    manager_id: int,
    fields: dict[str, str | float],
) -> NGO:
    return _create_organization(db, NGO, manager_id, fields)


def get_kitchen(
    db: Session,
    kitchen_id: int,
) -> Kitchen | None:
    return db.get(Kitchen, kitchen_id)


def get_ngo(
    db: Session,
    ngo_id: int,
) -> NGO | None:
    return db.get(NGO, ngo_id)


def _save_organization(
    db: Session,
    organization: OrganizationModel,
) -> OrganizationModel:
    try:
        db.commit()
        db.refresh(organization)
    except SQLAlchemyError:
        db.rollback()
        raise OrganizationPersistenceError from None
    return organization


def update_organization(
    db: Session,
    organization: OrganizationModel,
    fields: dict[str, str | float],
) -> OrganizationModel:
    material_change = any(
        field in fields and getattr(organization, field) != fields[field]
        for field in MATERIAL_FIELDS
    )
    for field, value in fields.items():
        setattr(organization, field, value)

    if (
        material_change
        and organization.verification_status != VerificationStatus.PENDING
    ):
        organization.verification_status = VerificationStatus.PENDING

    return _save_organization(db, organization)


def set_verification_status(
    db: Session,
    organization: OrganizationModel,
    verification_status: VerificationStatus,
) -> OrganizationModel:
    organization.verification_status = verification_status
    return _save_organization(db, organization)


def list_organizations(
    db: Session,
    model: type[OrganizationModel],
    *,
    verification_status: VerificationStatus | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[OrganizationModel], int]:
    filters = []
    if verification_status is not None:
        filters.append(model.verification_status == verification_status)
    if search:
        filters.append(model.name.ilike(f"%{search}%"))

    total = db.scalar(
        select(func.count()).select_from(model).where(*filters)
    ) or 0
    statement = (
        select(model)
        .where(*filters)
        .order_by(model.name.asc(), model.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(statement).all()), total
