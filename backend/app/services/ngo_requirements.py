from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.organization import NGORequirement
from app.schemas.redistribution import RequirementCreate, RequirementResponse
from app.services.reservations import amount, capacity_left, capacity_limits, capacity_usage


def now_utc():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def local_date(value):
    return aware(value).astimezone(ZoneInfo(settings.REDISTRIBUTION_TIMEZONE)).date()


def requirement_open(requirement, now):
    return (requirement.is_active and requirement.required_date == local_date(now)
            and aware(requirement.available_until) > now)


def owned_requirement(db, ngo_id, requirement_id, *, lock=False):
    query = select(NGORequirement).where(NGORequirement.ngo_id == ngo_id,
                                          NGORequirement.id == requirement_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(404, "Requirement not found")
    return row


def describe_requirement(db, row):
    limits = capacity_limits(row)
    remaining = capacity_left(db, row)
    return RequirementResponse(
        id=row.id, ngo_id=row.ngo_id, people_to_feed=row.people_to_feed,
        capacity_servings=limits["serving"], capacity_pieces=int(limits["piece"]),
        remaining_capacity=remaining["serving"], remaining_capacity_by_unit=remaining,
        accepted_categories=row.accepted_categories or [], accepts_vegetarian=row.accepts_vegetarian,
        accepts_non_vegetarian=row.accepts_non_vegetarian, required_date=row.required_date,
        available_until=aware(row.available_until), is_active=row.is_active,
        created_at=aware(row.created_at), updated_at=aware(row.updated_at),
    )


def save_requirement(db, ngo_id, payload, row=None):
    changes = payload.model_dump(exclude_unset=True)
    previous = describe_requirement(db, row).model_dump(include=set(RequirementCreate.model_fields)) if row else {}
    request = RequirementCreate.model_validate(previous | changes)
    now = now_utc()
    if local_date(request.available_until) < request.required_date:
        raise HTTPException(422, "Availability deadline must cover the required date")
    if request.is_active and (request.required_date < local_date(now) or request.available_until <= now):
        raise HTTPException(422, "Active requirements need a current or future date and deadline")
    if request.is_active and not (request.accepts_vegetarian or request.accepts_non_vegetarian):
        raise HTTPException(422, "An active requirement must accept at least one dietary group")
    if row is not None:
        used = capacity_usage(db, row.id)
        if amount(request.capacity_servings) < used["serving"] or amount(request.capacity_pieces) < used["piece"]:
            raise HTTPException(409, "Capacity cannot be reduced below reserved or received quantities")
    else:
        row = NGORequirement(ngo_id=ngo_id, remaining_capacity=0)
        db.add(row)
    for field, value in request.model_dump().items():
        setattr(row, field, value)
    row.accepted_categories = sorted({category.casefold() for category in request.accepted_categories})
    db.flush()
    result = describe_requirement(db, row)
    db.commit()
    return result
