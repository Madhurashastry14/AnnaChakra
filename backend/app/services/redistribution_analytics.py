"""Report recorded outcomes without converting quantity units."""
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone
from math import isfinite
from statistics import mean

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.donation import Delivery, Donation, DonationItem
from app.models.enums import DonationStatus as Status, UserRole
from app.models.food import FoodItem
from app.models.organization import NGO
from app.models.waste import WasteLog
from app.services.donations import effective_status, scope_conditions
from app.services.ngo_requirements import aware, now_utc
from app.services.reservations import amount, expired_offer


def date_scope(column, date_from, date_to):
    conditions = []
    if date_from:
        conditions.append(column >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        conditions.append(column <= datetime.combine(date_to, time.max, timezone.utc))
    return conditions


def report(db, user, date_from, date_to, simulated=None, weekly=False):
    scope = scope_conditions(db, user)
    if simulated is None:
        simulated = settings.APP_ENV.strip().casefold() == "demo"
    elif user.role != UserRole.ADMIN:
        raise HTTPException(403, "Simulation filters require administrator access")
    scope.append(Donation.is_simulated == simulated)
    offers = list(db.scalars(select(Donation).where(*scope, *date_scope(Donation.created_at, date_from, date_to))))
    now = now_utc()
    counts = Counter(effective_status(offer, now) for offer in offers)
    status_counts = {status.value: counts[status] for status in Status}
    completed_offers = counts[Status.COMPLETED]
    accepted_statuses = {Status.ACCEPTED, Status.ASSIGNED, Status.IN_TRANSIT, Status.DELIVERED, Status.COMPLETED}
    accepted_offers = sum(offer.accepted_at is not None or offer.status in accepted_statuses for offer in offers)
    completed_scope = (*scope, Donation.status == Status.COMPLETED, Donation.completed_at.is_not(None),
                       *date_scope(Donation.completed_at, date_from, date_to))
    completed = db.execute(select(Donation, Delivery)
                           .outerjoin(Delivery, Delivery.donation_id == Donation.id).where(*completed_scope)).all()
    durations = [(aware(delivery.delivered_at) - aware(delivery.dispatched_at)).total_seconds() / 60
                 for _, delivery in completed
                 if delivery and delivery.dispatched_at and delivery.delivered_at
                 and delivery.delivered_at >= delivery.dispatched_at]
    facts = db.execute(
        select(Donation, DonationItem, FoodItem, NGO.name)
        .join(DonationItem, DonationItem.donation_id == Donation.id)
        .join(WasteLog, WasteLog.id == DonationItem.waste_log_id)
        .join(FoodItem, FoodItem.id == WasteLog.food_item_id)
        .join(NGO, NGO.id == Donation.ngo_id)
        .where(*completed_scope, DonationItem.received_servings > 0)
    )
    quantities, periods, ngo_rollup = defaultdict(dict), defaultdict(dict), {}
    for donation, item, food, ngo_name in facts:
        if not isfinite(item.received_servings) or item.received_servings > item.offered_servings:
            continue
        if food.serving_unit == "piece" and not float(item.received_servings).is_integer():
            continue
        day = aware(donation.completed_at).astimezone(timezone.utc).date()
        if weekly:
            day -= timedelta(days=day.weekday())
        ngo = ngo_rollup.setdefault(donation.ngo_id, {"ngo_id": donation.ngo_id, "ngo_name": ngo_name,
                                                      "donations": set(), "quantities": {}})
        ngo["donations"].add(donation.id)
        for collection in (quantities, periods[day], ngo["quantities"]):
            key = (food.id, food.serving_unit)
            if key not in collection:
                collection[key] = {"food_item_id": food.id, "food_name": food.name,
                                   "serving_unit": food.serving_unit, "received_quantity": 0}
            entry = collection[key]
            entry["received_quantity"] += amount(item.received_servings)

    def serialize(values):
        return [entry | {"received_quantity": float(entry["received_quantity"])}
                for _, entry in sorted(values.items())]

    summary = {
        "total_donation_offers": len(offers), "accepted_donations": accepted_offers,
        "completed_donations": completed_offers, "rejected_donations": counts[Status.REJECTED],
        "cancelled_donations": counts[Status.CANCELLED],
        "expired_offers": sum(expired_offer(offer, now) for offer in offers),
        "failed_donations": sum(offer.failed_at is not None for offer in offers),
        "completion_rate": round(100 * completed_offers / len(offers), 2) if offers else None,
        "average_delivery_minutes": round(mean(durations), 2) if durations else None,
        "ngos_served": len(ngo_rollup), "quantities": serialize(quantities), "is_simulated": simulated,
    }
    return {
        "summary": summary,
        "statuses": {"statuses": status_counts, "expired_offers": summary["expired_offers"],
                     "failed_donations": summary["failed_donations"], "is_simulated": simulated},
        "trends": {"items": [{"date": day, "quantities": serialize(items)}
                             for day, items in sorted(periods.items())], "is_simulated": simulated},
        "ngos": {"items": [{"ngo_id": ngo["ngo_id"], "ngo_name": ngo["ngo_name"],
                           "completed_donations_with_receipt": len(ngo["donations"]),
                           "quantities": serialize(ngo["quantities"])} for _, ngo in sorted(ngo_rollup.items())],
                 "is_simulated": simulated},
    }
