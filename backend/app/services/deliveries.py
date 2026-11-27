from fastapi import HTTPException
from sqlalchemy import select

from app.models.donation import Delivery, Donation
from app.models.enums import DeliveryStatus, DonationStatus as Status, UserRole
from app.models.organization import DeliveryPersonnel
from app.services.donations import finish, recheck, require_state, scope_conditions, writable
from app.services.ngo_requirements import now_utc
from app.services.reservations import amount

KITCHEN = {UserRole.KITCHEN_STAFF}
NGO = {UserRole.NGO_MANAGER}
PARTICIPANTS = KITCHEN | NGO


def for_donation(db, donation_id):
    delivery = db.scalar(select(Delivery).where(Delivery.donation_id == donation_id))
    if delivery is None:
        raise HTTPException(409, "Donation has no assigned delivery")
    return delivery


def scoped_deliveries(db, user):
    return select(Delivery).join(Donation, Donation.id == Delivery.donation_id).where(
        *scope_conditions(db, user),
    )


def owned_delivery(db, user, delivery_id):
    row = db.scalar(scoped_deliveries(db, user).where(Delivery.id == delivery_id))
    if row is None:
        raise HTTPException(404, "Delivery not found")
    return row


def assign(db, donation, request):
    require_state(donation, Status.ACCEPTED)
    recheck(db, donation)
    person = db.get(DeliveryPersonnel, request.delivery_person_id, with_for_update=True, populate_existing=True)
    if person is None or person.kitchen_id != donation.kitchen_id:
        raise HTTPException(404, "Delivery person not found")
    if not person.is_active:
        raise HTTPException(409, "Delivery person is inactive")
    if db.scalar(select(Delivery.id).where(Delivery.donation_id == donation.id)) is not None:
        raise HTTPException(409, "Donation already has an assigned delivery")
    db.add(Delivery(donation_id=donation.id, delivery_person_id=person.id, status=DeliveryStatus.ASSIGNED,
                    delivery_notes=request.notes, assigned_at=now_utc()))
    donation.status = Status.ASSIGNED
    return finish(db, donation)


def dispatch(db, donation):
    require_state(donation, Status.ASSIGNED)
    delivery = for_donation(db, donation.id)
    if delivery.status != DeliveryStatus.ASSIGNED:
        raise HTTPException(409, "Delivery is not assigned")
    _, _, now = recheck(db, donation)
    person = db.get(DeliveryPersonnel, delivery.delivery_person_id, with_for_update=True, populate_existing=True)
    if person is None or person.kitchen_id != donation.kitchen_id or not person.is_active:
        raise HTTPException(409, "Assigned delivery person is unavailable")
    delivery.dispatched_at = now
    delivery.status = DeliveryStatus.IN_TRANSIT
    donation.status = Status.IN_TRANSIT
    return finish(db, donation)


def mark_delivered(db, donation):
    require_state(donation, Status.IN_TRANSIT)
    delivery = for_donation(db, donation.id)
    if delivery.status != DeliveryStatus.IN_TRANSIT or delivery.dispatched_at is None:
        raise HTTPException(409, "Delivery has not been dispatched")
    _, _, now = recheck(db, donation, travel=False)
    delivery.delivered_at = now
    delivery.status = DeliveryStatus.DELIVERED
    donation.status = Status.DELIVERED
    return finish(db, donation)


def fail(db, donation, reason):
    require_state(donation, Status.IN_TRANSIT, Status.DELIVERED)
    delivery = for_donation(db, donation.id)
    donation.status = Status.CANCELLED
    donation.failed_at, donation.failure_reason = now_utc(), reason
    delivery.status = DeliveryStatus.CANCELLED
    return finish(db, donation)


def confirm_receipt(db, donation, request):
    if donation.status == Status.COMPLETED:
        raise HTTPException(409, "Receipt has already been confirmed for this donation")
    require_state(donation, Status.DELIVERED)
    delivery = for_donation(db, donation.id)
    if delivery.status != DeliveryStatus.DELIVERED or delivery.delivered_at is None:
        raise HTTPException(409, "Delivery must be recorded before receipt")
    submitted = {item.donation_item_id: item for item in request.items}
    positive = {item.donation_item_id for item in request.items if item.received_servings > 0}
    _, lines, now = recheck(db, donation, travel=False, selected_line_ids=positive)
    if set(submitted) != {line.id for line, _, _ in lines}:
        raise HTTPException(422, "Confirm every donation item exactly once")
    for line, _waste, food in lines:
        received = submitted[line.id]
        quantity = amount(received.received_servings)
        if quantity > amount(line.offered_servings) or (food.serving_unit == "piece" and quantity % 1):
            raise HTTPException(422, "Received quantity exceeds the offer or uses fractional pieces")
        if quantity < amount(line.offered_servings) and received.rejection_reason is None:
            raise HTTPException(422, "Give a reason for any quantity not received")
        line.received_servings = received.received_servings
        line.receipt_evidence = {"inspected": True, "is_simulated": donation.is_simulated,
                                 "rejection_reason": received.rejection_reason}
    donation.status = Status.COMPLETED
    donation.completed_at, donation.receipt_notes = now, request.notes
    return finish(db, donation)


def delivery_action(db, user, delivery_id, operation):
    delivery = owned_delivery(db, user, delivery_id)
    donation = writable(db, user, delivery.donation_id, KITCHEN)
    return operation(db, donation)["delivery"]
