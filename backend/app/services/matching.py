"""Read-only, unit-aware matching of presently eligible surplus."""
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from math import asin, ceil, cos, isfinite, radians, sin, sqrt

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import VerificationStatus, WasteType
from app.models.food import FoodItem
from app.models.organization import NGO, NGORequirement
from app.models.waste import WasteLog
from app.services.ngo_requirements import aware, now_utc, requirement_closures
from app.services.reservations import amount, capacity_left, food_allocations, food_balance
from app.services.safety import environment_allows
from app.services.waste import redistribution_check


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


def food_incompatibilities(food, requirement):
    reasons = []
    dietary = requirement.accepts_vegetarian if food.is_vegetarian else requirement.accepts_non_vegetarian
    if not dietary:
        group = "vegetarian" if food.is_vegetarian else "non-vegetarian"
        reasons.append(f"The requirement does not accept {group} food.")
    accepted = {entry.strip().casefold() for entry in (requirement.accepted_categories or [])}
    food_labels = {food.name.strip().casefold(), food.category.strip().casefold()}
    if accepted and accepted.isdisjoint(food_labels):
        reasons.append(f"{food.name} (category {food.category}) is outside the accepted foods "
                       f"and categories ({', '.join(sorted(accepted))}).")
    return reasons


def compatible(food, requirement):
    return not food_incompatibilities(food, requirement)


@dataclass(frozen=True)
class Surplus:
    waste: WasteLog
    food: FoodItem
    reserved: Decimal
    available: Decimal
    screening: object


def read_surplus(db, kitchen, ids=None, *, now=None, lock=False, strict=False, exclusions=None):
    now = now or now_utc()
    participating(kitchen)
    query = (select(WasteLog, FoodItem).join(FoodItem, FoodItem.id == WasteLog.food_item_id)
             .where(WasteLog.kitchen_id == kitchen.id).order_by(WasteLog.id))
    if ids is not None:
        query = query.where(WasteLog.id.in_(ids))
    else:
        query = query.where(WasteLog.waste_type != WasteType.PLATE_WASTE,
                            WasteLog.confirmed_servings > 0)
    rows = db.execute(query.with_for_update(of=WasteLog) if lock else query).all()
    if ids is not None and len(rows) != len(ids):
        raise HTTPException(404, "Leftover log not found")
    surplus = []
    for waste, food in rows:
        if waste.is_simulated != kitchen.is_simulated:
            reason = "Batch belongs to a different redistribution environment."
        elif waste.waste_type == WasteType.PLATE_WASTE:
            reason = "Plate waste cannot be redistributed."
        elif not isfinite(waste.confirmed_servings) or waste.confirmed_servings <= 0:
            reason = "Batch has no positive confirmed quantity."
        elif food.serving_unit == "piece" and not float(waste.confirmed_servings).is_integer():
            reason = "Piece-based batches require whole quantities."
        else:
            reserved, available = food_balance(
                waste.confirmed_servings, food_allocations(db, waste.id, now),
            )
            if available > 0:
                screened = redistribution_check(waste, food, kitchen, now)
                surplus.append(Surplus(waste, food, reserved, available, screened))
                continue
            reason = "No quantity is available for redistribution."
        if strict:
            raise HTTPException(409, f"Leftover log {waste.id}: {reason}")
        if exclusions is not None:
            exclusions.append({"waste_log_id": waste.id, "food_name": food.name, "reasons": [reason]})
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
    unavailable_batches = []
    rows = read_surplus(db, kitchen, ids, now=now, exclusions=unavailable_batches)
    candidates = db.execute(
        select(NGO, NGORequirement).outerjoin(NGORequirement, NGORequirement.ngo_id == NGO.id)
        .order_by(NGO.id, NGORequirement.id)
    )
    matches = []
    exclusions = []
    for ngo, requirement in candidates:
        reasons = []
        if ngo.verification_status != VerificationStatus.VERIFIED:
            reasons.append(f"NGO verification is {ngo.verification_status.value.lower()}.")
        if ngo.is_simulated != kitchen.is_simulated:
            reasons.append("NGO belongs to a different redistribution environment.")
        try:
            distance = distance_between(kitchen, ngo)
        except HTTPException:
            distance = None
            reasons.append("Kitchen or NGO coordinates are invalid or missing.")
        if distance is not None and distance > max_distance:
            reasons.append(f"Distance is {distance:.2f} km. The limit is {max_distance:g} km.")
        if not rows:
            reasons.append("None of the selected batches has available surplus.")

        exclusion = {"ngo_id": ngo.id, "ngo_name": ngo.name,
                     "requirement_id": requirement.id if requirement else None,
                     "reasons": reasons, "batches": []}
        if requirement is None:
            reasons.append("The NGO has no food requirement.")
            exclusions.append(exclusion)
            continue

        reasons.extend(requirement_closures(requirement, now))
        eta = travel_minutes(distance) if distance is not None else None
        arrival = now + timedelta(minutes=eta) if eta is not None else None
        remaining = capacity_left(db, requirement, now=now)
        left = dict(remaining)
        deadline = aware(requirement.available_until)
        if arrival is not None and now < deadline <= arrival:
            reasons.append(f"Estimated delivery takes {eta} minutes and would arrive at or after "
                           f"the NGO availability deadline ({deadline.isoformat()}).")
        allocations = []
        for row in rows:
            batch_reasons = food_incompatibilities(row.food, requirement)
            if arrival is not None and arrival >= row.screening.safe_until:
                batch_reasons.append(f"Estimated delivery would arrive at or after the batch deadline "
                                     f"({row.screening.safe_until.isoformat()}).")
            unit = row.food.serving_unit
            quantity = min(row.available, requested.get(row.waste.id, row.available), left[unit])
            if unit == "piece":
                quantity = Decimal(int(quantity))
            if left[unit] <= 0:
                batch_reasons.append(f"No remaining {unit.value} capacity.")
            elif quantity <= 0:
                batch_reasons.append("Less than one whole piece can be allocated.")
            if batch_reasons:
                exclusion["batches"].append({"waste_log_id": row.waste.id, "food_name": row.food.name,
                                             "reasons": batch_reasons})
            if reasons or batch_reasons:
                continue
            left[unit] -= quantity
            allocations.append({"waste_log_id": row.waste.id, "food_item_id": row.food.id,
                                "food_name": row.food.name, "serving_unit": unit,
                                "offered_servings": float(quantity), "safe_until": row.screening.safe_until})
        if not allocations:
            exclusions.append(exclusion)
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
    return {"items": matches, "total": len(matches), "exclusions": exclusions,
            "unavailable_batches": unavailable_batches}
