"""Unit-aware allocation ledger derived from donation states."""
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select

from app.models.donation import Donation, DonationItem
from app.models.enums import DonationStatus
from app.models.food import FoodItem
from app.models.waste import WasteLog

ACTIVE = (DonationStatus.PENDING, DonationStatus.ACCEPTED, DonationStatus.ASSIGNED,
          DonationStatus.IN_TRANSIT, DonationStatus.DELIVERED)
PROTECTED = (*ACTIVE, DonationStatus.COMPLETED)


def amount(value):
    return Decimal(str(value))


def capacity_usage(db, requirement_id):
    rows = db.execute(select(Donation.status, DonationItem.offered_servings,
                             DonationItem.received_servings, FoodItem.serving_unit)
                      .join(DonationItem, DonationItem.donation_id == Donation.id)
                      .join(WasteLog, WasteLog.id == DonationItem.waste_log_id)
                      .join(FoodItem, FoodItem.id == WasteLog.food_item_id)
                      .where(Donation.requirement_id == requirement_id, Donation.status.in_(PROTECTED)))
    totals = defaultdict(Decimal)
    for status, offered, received, unit in rows:
        totals[unit] += amount((offered if received is None else received)
                               if status == DonationStatus.COMPLETED else offered)
    return totals


def capacity_limits(requirement):
    return {"serving": amount(requirement.capacity_servings if requirement.capacity_servings is not None
                              else requirement.remaining_capacity),
            "piece": amount(requirement.capacity_pieces or 0)}


def capacity_left(db, requirement):
    used = capacity_usage(db, requirement.id)
    return {unit: max(Decimal(0), limit - used[unit])
            for unit, limit in capacity_limits(requirement).items()}


def food_reserved(db, waste_id, now=None):
    values = db.scalars(select(DonationItem.offered_servings).join(
        Donation, Donation.id == DonationItem.donation_id,
    ).where(DonationItem.waste_log_id == waste_id, Donation.status.in_(PROTECTED)))
    return sum(map(amount, values), Decimal(0))
