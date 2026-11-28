"""Unit-aware allocation ledger derived from donation states."""
from collections import defaultdict
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import or_, select

from app.models.donation import Donation, DonationItem
from app.models.enums import DonationStatus
from app.models.food import FoodItem
from app.models.waste import WasteLog

ACTIVE = (DonationStatus.PENDING, DonationStatus.ACCEPTED, DonationStatus.ASSIGNED,
          DonationStatus.IN_TRANSIT, DonationStatus.DELIVERED)
PROTECTED = (*ACTIVE, DonationStatus.COMPLETED)


def amount(value):
    return Decimal(str(value))


def expired_offer(donation, now):
    deadline = donation.expires_at
    if deadline is not None and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return donation.status == DonationStatus.PENDING and (deadline is None or deadline <= now)


def live_reservations(now):
    return Donation.status.in_(PROTECTED) & or_(
        Donation.status != DonationStatus.PENDING, Donation.expires_at > now,
    )


def food_holds(now):
    return or_(live_reservations(now), Donation.failed_at.is_not(None))


def capacity_usage(db, requirement_id, now=None):
    now = now or datetime.now(timezone.utc)
    rows = db.execute(select(Donation.status, DonationItem.offered_servings,
                             DonationItem.received_servings, FoodItem.serving_unit)
                      .join(DonationItem, DonationItem.donation_id == Donation.id)
                      .join(WasteLog, WasteLog.id == DonationItem.waste_log_id)
                      .join(FoodItem, FoodItem.id == WasteLog.food_item_id)
                      .where(Donation.requirement_id == requirement_id, live_reservations(now)))
    totals = defaultdict(Decimal)
    for status, offered, received, unit in rows:
        totals[unit] += amount((offered if received is None else received)
                               if status == DonationStatus.COMPLETED else offered)
    return totals


def capacity_limits(requirement):
    return {"serving": amount(requirement.capacity_servings if requirement.capacity_servings is not None
                              else requirement.remaining_capacity),
            "piece": amount(requirement.capacity_pieces or 0)}


def capacity_left(db, requirement, now=None):
    used = capacity_usage(db, requirement.id, now)
    return {unit: max(Decimal(0), limit - used[unit])
            for unit, limit in capacity_limits(requirement).items()}


def food_allocations(db, waste_id, now=None):
    now = now or datetime.now(timezone.utc)
    return db.execute(select(Donation.status, DonationItem.offered_servings,
                             DonationItem.received_servings).join(
        Donation, Donation.id == DonationItem.donation_id,
    ).where(DonationItem.waste_log_id == waste_id, food_holds(now))).all()


def food_balance(confirmed, allocations):
    reserved = sum((amount(offered) for _, offered, _ in allocations), Decimal(0))
    if any(status == DonationStatus.COMPLETED and (received is None or received > 0)
           for status, _, received in allocations):
        return reserved, Decimal(0)
    return reserved, max(Decimal(0), amount(confirmed) - reserved)
