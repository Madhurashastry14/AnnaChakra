"""Read-only, unit-aware matching of presently eligible surplus."""
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from math import asin, ceil, cos, isfinite, radians, sin, sqrt

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import SafetyStatus, VerificationStatus, WasteType
from app.models.food import FoodItem
from app.models.organization import NGO, NGORequirement
from app.models.waste import WasteLog
from app.services.ngo_requirements import aware, local_date, now_utc, requirement_open
from app.services.reservations import amount, capacity_left, food_reserved
from app.services.safety import environment_allows
from app.services.waste import screening_for_use


def haversine(lat1, lon1, lat2, lon2):
    if not all(value is not None and isfinite(value) and abs(value) <= limit for value, limit in
               ((lat1, 90), (lat2, 90), (lon1, 180), (lon2, 180))):
        raise ValueError("Invalid organization coordinates")
    start, end = radians(lat1), radians(lat2)
    h = sin((end - start) / 2)**2 + cos(start) * cos(end) * sin(radians(lon2 - lon1) / 2)**2
    return 6371.0088 * 2 * asin(sqrt(min(1, max(0, h))))


def travel_minutes(distance):
    return (ceil(60 * distance * settings.MATCH_ROAD_FACTOR / settings.MATCH_SPEED_KMH)
            + settings.MATCH_HANDLING_MINUTES)


def distance_between(kitchen, ngo):
    try:
        return haversine(kitchen.latitude, kitchen.longitude, ngo.latitude, ngo.longitude)
    except ValueError as exc:
        raise HTTPException(409, "Invalid kitchen or NGO coordinates") from exc


def participating(kitchen, ngo=None):
    if kitchen.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(403, "Kitchen must be verified")
    if not environment_allows(kitchen.is_simulated):
        raise HTTPException(403, "Kitchen is outside this redistribution environment")
    if ngo is not None and (ngo.verification_status != VerificationStatus.VERIFIED
                            or ngo.is_simulated != kitchen.is_simulated):
        raise HTTPException(409, "NGO is unverified or outside this redistribution environment")


def compatible(food, requirement):
    dietary = requirement.accepts_vegetarian if food.is_vegetarian else requirement.accepts_non_vegetarian
    categories = requirement.accepted_categories or []
    return dietary and (not categories or food.category.strip().casefold() in categories)


@dataclass(frozen=True)
class Surplus:
    waste: WasteLog
    food: FoodItem
    reserved: Decimal
    available: Decimal
    screening: object


def read_surplus(db, kitchen, ids=None, *, now=None, lock=False, strict=False):
    now = now or now_utc()
    participating(kitchen)
    query = (select(WasteLog, FoodItem).join(FoodItem, FoodItem.id == WasteLog.food_item_id)
             .where(WasteLog.kitchen_id == kitchen.id).order_by(WasteLog.id))
    if ids is not None:
        query = query.where(WasteLog.id.in_(ids))
    else:
        query = query.where(WasteLog.waste_type == WasteType.UNSERVED_SURPLUS,
                            WasteLog.safe_until > now, WasteLog.confirmed_servings > 0)
    rows = db.execute(query.with_for_update(of=WasteLog) if lock else query).all()
    if ids is not None and len(rows) != len(ids):
        raise HTTPException(404, "Waste log not found")
    surplus = []
    for waste, food in rows:
        screened = screening_for_use(waste, food, kitchen, now)
        if (waste.waste_type != WasteType.UNSERVED_SURPLUS or screened.status != SafetyStatus.ELIGIBLE
                or screened.safe_until is None or screened.safe_until <= now
                or not isfinite(waste.confirmed_servings) or waste.confirmed_servings <= 0
                or (food.serving_unit == "piece" and not float(waste.confirmed_servings).is_integer())):
            if strict:
                raise HTTPException(409, f"Waste log {waste.id} is not currently eligible")
            continue
        reserved = food_reserved(db, waste.id, now)
        available = amount(waste.confirmed_servings) - reserved
        if available > 0:
            surplus.append(Surplus(waste, food, reserved, available, screened))
        elif strict:
            raise HTTPException(409, f"Waste log {waste.id} has no available quantity")
    return surplus


def describe_surplus(row, now):
    return {"waste_log_id": row.waste.id, "food_item_id": row.food.id, "food_name": row.food.name,
            "serving_unit": row.food.serving_unit, "is_vegetarian": row.food.is_vegetarian,
            "confirmed_quantity": row.waste.confirmed_servings, "reserved_quantity": float(row.reserved),
            "available_quantity": float(row.available), "safety_status": row.screening.status,
            "safe_until": row.screening.safe_until, "remaining_eligible_seconds":
            int((row.screening.safe_until - now).total_seconds()),
            "safety_policy_version": row.screening.policy_version, "is_simulated": row.waste.is_simulated}


def score_match(distance, limit, share, minutes, utilization):
    components = {
        "proximity": 100 * max(0, 1 - distance / limit),
        "compatibility": 100 * share,
        "urgency": 100 * max(0, 1 - minutes / 180),
        "capacity_utilization": 100 * utilization,
    }
    weights = settings.MATCH_WEIGHTS
    score = sum(value * weight for value, weight in zip(components.values(), weights)) / sum(weights)
    return round(score, 4), {key: round(value, 4) for key, value in components.items()}


def match_ngos(db, kitchen, request):
    now = now_utc()
    ids = request.waste_log_ids or [item.waste_log_id for item in request.items]
    requested = {item.waste_log_id: amount(item.offered_servings) for item in request.items}
    max_distance = min(request.max_distance_km or settings.MATCH_MAX_DISTANCE_KM, settings.MATCH_MAX_DISTANCE_KM)
    rows = read_surplus(db, kitchen, ids, now=now)
    if not rows:
        return {"items": [], "total": 0}
    candidates = db.execute(
        select(NGORequirement, NGO).join(NGO, NGO.id == NGORequirement.ngo_id)
        .where(NGORequirement.is_active.is_(True), NGORequirement.required_date == local_date(now),
               NGORequirement.available_until > now, NGO.verification_status == VerificationStatus.VERIFIED,
               NGO.is_simulated == kitchen.is_simulated)
    )
    matches = []
    for requirement, ngo in candidates:
        if not requirement_open(requirement, now):
            continue
        try:
            distance = distance_between(kitchen, ngo)
        except HTTPException:
            continue
        if distance > max_distance:
            continue
        eta = travel_minutes(distance)
        remaining = capacity_left(db, requirement)
        left = dict(remaining)
        deadline = aware(requirement.available_until)
        allocations = []
        for row in rows:
            if not compatible(row.food, requirement) or now + timedelta(minutes=eta) >= min(deadline, row.screening.safe_until):
                continue
            unit = row.food.serving_unit
            quantity = min(row.available, requested.get(row.waste.id, row.available), left[unit])
            if unit == "piece":
                quantity = Decimal(int(quantity))
            if quantity <= 0:
                continue
            left[unit] -= quantity
            allocations.append({"waste_log_id": row.waste.id, "food_item_id": row.food.id,
                                "food_name": row.food.name, "serving_unit": unit,
                                "offered_servings": float(quantity), "safe_until": row.screening.safe_until})
        if not allocations:
            continue
        used = [float(1 - left[unit] / remaining[unit]) for unit in remaining if left[unit] < remaining[unit]]
        safety_deadline = min(line["safe_until"] for line in allocations)
        minutes = (min(deadline, safety_deadline) - now).total_seconds() / 60
        score, components = score_match(distance, max_distance, len(allocations) / len(ids), minutes, sum(used) / len(used))
        matches.append({
            "ngo_id": ngo.id, "ngo_name": ngo.name, "requirement_id": requirement.id, "address": ngo.address,
            "latitude": ngo.latitude, "longitude": ngo.longitude, "distance_km": round(distance, 3),
            "estimated_travel_minutes": eta, "people_to_feed": requirement.people_to_feed,
            "remaining_capacity": float(remaining["serving"]),
            "remaining_capacity_by_unit": {unit: float(value) for unit, value in remaining.items()},
            "suggested_allocation": allocations, "match_score": score, "score_components": components,
            "reasons": ["Straight-line proximity", "Diet and category compatibility",
                        "Time remaining before holding and availability deadlines", "Use of matching unit capacity"],
            "safe_until": safety_deadline, "available_until": deadline, "is_simulated": ngo.is_simulated,
        })
    matches.sort(key=lambda row: (-row["match_score"], row["ngo_id"], row["requirement_id"]))
    return {"items": matches, "total": len(matches)}
