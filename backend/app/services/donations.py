"""Transactional redistribution offers and participant-scoped lifecycle operations."""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.donation import Delivery, Donation, DonationItem
from app.models.enums import DeliveryStatus, DonationStatus as Status, SafetyStatus, UserRole
from app.models.food import FoodItem
from app.models.organization import DeliveryPersonnel, Kitchen, NGO, NGORequirement
from app.models.waste import WasteLog
from app.services.matching import compatible, distance_between, participating, read_surplus, travel_minutes
from app.services.ngo_requirements import aware, now_utc, requirement_open
from app.services.organization import find_kitchen_for_manager, find_ngo_for_manager
from app.services.reservations import amount, capacity_left, expired_offer
from app.services.safety import environment_allows
from app.services.waste import redistribution_check


def scope_conditions(db, user):
    if user.role == UserRole.ADMIN:
        return []
    if user.role == UserRole.KITCHEN_STAFF:
        profile = find_kitchen_for_manager(db, user.id)
        owner = Donation.kitchen_id
    elif user.role == UserRole.NGO_MANAGER:
        profile = find_ngo_for_manager(db, user.id)
        owner = Donation.ngo_id
    else:
        raise HTTPException(403, "Redistribution access denied")
    if profile is None:
        raise HTTPException(404, "Organization not found")
    return [owner == profile.id]


def owned_donation(db, user, donation_id, *, lock=False):
    query = select(Donation).where(Donation.id == donation_id, *scope_conditions(db, user))
    row = db.scalar(query.with_for_update().execution_options(populate_existing=True) if lock else query)
    if row is None:
        raise HTTPException(404, "Donation not found")
    return row


def donation_lines(db, donation, *, lock=False):
    query = (select(DonationItem, WasteLog, FoodItem)
             .join(WasteLog, WasteLog.id == DonationItem.waste_log_id)
             .join(FoodItem, FoodItem.id == WasteLog.food_item_id)
             .where(DonationItem.donation_id == donation.id).order_by(WasteLog.id))
    if lock:
        query = query.with_for_update(of=WasteLog).execution_options(populate_existing=True)
    return db.execute(query).all()


def effective_status(row, now):
    return Status.CANCELLED if expired_offer(row, now) else row.status


def describe_delivery(db, row):
    if row is None:
        return None
    person = db.get(DeliveryPersonnel, row.delivery_person_id)
    return {"id": row.id, "donation_id": row.donation_id, "delivery_person_id": row.delivery_person_id,
            "delivery_person_name": person.name if person else None, "status": row.status,
            "assigned_at": aware(row.assigned_at), "dispatched_at": aware(row.dispatched_at),
            "delivered_at": aware(row.delivered_at), "notes": row.delivery_notes}


def describe_donation(db, row, now=None):
    now = now or now_utc()
    expired = expired_offer(row, now)
    kitchen, ngo = db.get(Kitchen, row.kitchen_id), db.get(NGO, row.ngo_id)
    delivery = db.scalar(select(Delivery).where(Delivery.donation_id == row.id))
    return {
        "id": row.id, "kitchen_id": kitchen.id, "kitchen_name": kitchen.name, "kitchen_address": kitchen.address,
        "ngo_id": ngo.id, "ngo_name": ngo.name, "ngo_address": ngo.address, "requirement_id": row.requirement_id,
        "status": effective_status(row, now), "match_score": row.match_score, "notes": row.notes,
        "rejection_reason": row.rejection_reason, "cancellation_reason": "Offer expired" if expired else row.cancellation_reason,
        "failure_reason": row.failure_reason, "is_simulated": row.is_simulated, "expired": expired,
        "created_at": aware(row.created_at), "updated_at": aware(row.updated_at),
        "expires_at": aware(row.expires_at), "accepted_at": aware(row.accepted_at),
        "completed_at": aware(row.completed_at), "failed_at": aware(row.failed_at),
        "receipt_notes": row.receipt_notes, "delivery": describe_delivery(db, delivery),
        "items": [{"id": line.id, "waste_log_id": waste.id, "food_item_id": food.id,
                   "food_name": food.name, "serving_unit": food.serving_unit,
                   "offered_servings": line.offered_servings, "received_servings": line.received_servings,
                   "receipt_evidence": line.receipt_evidence}
                  for line, waste, food in donation_lines(db, row)],
    }


def _participants(db, kitchen_id, ngo_id):
    kitchen = db.get(Kitchen, kitchen_id, with_for_update=True, populate_existing=True)
    ngo = db.get(NGO, ngo_id, with_for_update=True, populate_existing=True)
    participating(kitchen, ngo)
    return kitchen, ngo


def _delivery_time(kitchen, ngo):
    distance = distance_between(kitchen, ngo)
    if distance > settings.MATCH_MAX_DISTANCE_KM:
        raise HTTPException(409, "NGO is beyond the configured redistribution range")
    return timedelta(minutes=travel_minutes(distance))


def create_offer(db, kitchen_id, request):
    requirement = db.get(NGORequirement, request.requirement_id, with_for_update=True, populate_existing=True)
    if requirement is None:
        raise HTTPException(404, "Requirement not found")
    kitchen, ngo = _participants(db, kitchen_id, requirement.ngo_id)
    # Lock in ID order while holding the capacity row. Waste editing locks these same batch rows.
    ids = [item.waste_log_id for item in request.items]
    held = db.scalars(select(WasteLog.id).where(WasteLog.id.in_(ids), WasteLog.kitchen_id == kitchen.id)
                      .order_by(WasteLog.id).with_for_update()).all()
    if len(held) != len(ids):
        raise HTTPException(404, "Leftover log not found")
    now = now_utc()
    if not requirement_open(requirement, now):
        raise HTTPException(409, "Requirement is not accepting offers")
    eta = _delivery_time(kitchen, ngo)
    surplus = {row.waste.id: row for row in read_surplus(db, kitchen, ids, strict=True, now=now)}
    available = capacity_left(db, requirement, now=now)
    deadline = min(now + timedelta(minutes=settings.OFFER_EXPIRY_MINUTES),
                   aware(requirement.available_until) - eta)
    for item in request.items:
        row = surplus[item.waste_log_id]
        unit = row.food.serving_unit
        quantity = amount(item.offered_servings)
        if unit == "piece" and quantity != quantity.to_integral_value():
            raise HTTPException(422, "Piece quantities must be whole numbers")
        if not compatible(row.food, requirement):
            raise HTTPException(409, "Food is incompatible with the requirement")
        if quantity > row.available or quantity > available[unit]:
            raise HTTPException(409, "Insufficient unreserved food or compatible capacity")
        available[unit] -= quantity
        deadline = min(deadline, row.screening.safe_until - eta)
    if deadline <= now:
        raise HTTPException(409, "Insufficient time for delivery before the deadline")
    donation = Donation(kitchen_id=kitchen.id, ngo_id=ngo.id, requirement_id=requirement.id,
                        notes=request.notes, status=Status.PENDING, expires_at=deadline,
                        is_simulated=kitchen.is_simulated)
    db.add(donation)
    db.flush()
    db.add_all([DonationItem(donation_id=donation.id, **line.model_dump()) for line in request.items])
    return finish(db, donation)


def finish(db, donation):
    db.flush()
    result = describe_donation(db, donation)
    db.commit()
    return result


def require_state(donation, *states, now=None):
    if donation.status not in states or expired_offer(donation, now or now_utc()):
        raise HTTPException(409, "Donation is expired or cannot transition from its current status")


def recheck(db, donation, *, accepting=False, travel=True, selected_line_ids=None):
    requirement = db.get(NGORequirement, donation.requirement_id, with_for_update=True, populate_existing=True)
    kitchen, ngo = _participants(db, donation.kitchen_id, donation.ngo_id)
    lines = donation_lines(db, donation, lock=True)
    if not lines or donation.is_simulated != kitchen.is_simulated or requirement.ngo_id != ngo.id:
        raise HTTPException(409, "Donation has inconsistent participant or batch information")
    now = now_utc()
    if accepting and (expired_offer(donation, now) or not requirement_open(requirement, now)):
        raise HTTPException(409, "Offer or NGO requirement is no longer open")
    eta = _delivery_time(kitchen, ngo) if travel else timedelta()
    if (selected_line_ids is None or selected_line_ids) and now + eta >= aware(requirement.available_until):
        raise HTTPException(409, "Insufficient time before the NGO deadline")
    for line, waste, food in lines:
        if waste.kitchen_id != kitchen.id or waste.is_simulated != donation.is_simulated:
            raise HTTPException(409, "Food batch is outside this donation's kitchen or environment")
        if selected_line_ids is not None and line.id not in selected_line_ids:
            continue
        check = redistribution_check(waste, food, kitchen, now)
        if (check.status != SafetyStatus.ELIGIBLE or check.safe_until is None
                or now + eta >= check.safe_until or not compatible(food, requirement)):
            raise HTTPException(409, f"Leftover log {waste.id} failed current safety or dietary checks")
    return kitchen, lines, now


def accept(db, donation):
    require_state(donation, Status.PENDING)
    _, _, now = recheck(db, donation, accepting=True)
    donation.status, donation.accepted_at = Status.ACCEPTED, now
    return finish(db, donation)


def reject(db, donation, reason):
    require_state(donation, Status.PENDING)
    donation.status, donation.rejection_reason = Status.REJECTED, reason
    return finish(db, donation)


def cancel(db, donation, reason):
    require_state(donation, Status.PENDING, Status.ACCEPTED, Status.ASSIGNED)
    donation.status, donation.cancellation_reason = Status.CANCELLED, reason
    delivery = db.scalar(select(Delivery).where(Delivery.donation_id == donation.id))
    if delivery is not None:
        delivery.status = DeliveryStatus.CANCELLED
    return finish(db, donation)


def writable(db, user, donation_id, roles):
    if user.role not in roles:
        raise HTTPException(403, "Role is not authorized for this action")
    row = owned_donation(db, user, donation_id, lock=True)
    if not environment_allows(row.is_simulated):
        raise HTTPException(403, "Donation is outside this redistribution environment")
    return row
