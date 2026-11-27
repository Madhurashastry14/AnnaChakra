from collections import defaultdict
from math import fsum

from app.core.config import settings
from app.models.enums import FoodRole, MenuMode
from app.services.waste_analytics import group_history, metrics, percentage


def waste_insights(rows):
    messages = []
    for comparable in group_history(rows).values():
        measurement = metrics(comparable)
        minimum = settings.WASTE_MIN_RECORDS

        def emit(kind, rate, threshold, description, action, *, severity="REVIEW", count=None, evidence=None):
            messages.append({
                "food_item_id": measurement.food_item_id, "food_item_name": measurement.food_item_name,
                "meal_type": measurement.meal_type, "menu_mode": measurement.menu_mode,
                "insight_type": kind, "severity": severity,
                "records_analyzed": count if count is not None else len(comparable),
                "observed_rate": rate, "threshold": threshold,
                "title": kind.replace("_", " ").capitalize(), "description": description,
                "recommendation": action,
                "evidence_quality": ("SUFFICIENT_HISTORY" if len(comparable) >= minimum else "LIMITED_HISTORY"),
                "evidence": measurement.model_dump() | (evidence or {}),
            })

        if len(comparable) < minimum:
            emit("INSUFFICIENT_HISTORY", None, minimum, "Comparable meal observations are limited.",
                 "Collect more meal feedback before adjusting quantities.", severity="INFO")
            continue
        measured = measurement.measured_plate_waste_records >= minimum
        covered = measured and measurement.plate_waste_measurement_coverage >= settings.WASTE_MIN_COVERAGE
        if not covered:
            emit("INCOMPLETE_WASTE_MEASUREMENTS", measurement.plate_waste_measurement_coverage,
                 settings.WASTE_MIN_COVERAGE, "Too few comparable meals have measured plate waste.",
                 "Measure plate waste separately from unserved leftovers.", severity="INFO")
        shortage_known = measurement.shortage_eligible_records >= minimum
        shortage = measurement.shortage_frequency or 0
        if shortage_known and shortage >= settings.WASTE_SHORTAGE_THRESHOLD:
            emit("FREQUENT_SHORTAGE", shortage, settings.WASTE_SHORTAGE_THRESHOLD,
                 "Shortages recur. Served quantities on those days censor demand.",
                 "Review the next menu-aware forecast and kitchen preparation capacity.", severity="HIGH")

        uncensored = [row for row in comparable if not row[1].shortage_occurred and row[0].actual_people > 0]
        surplus_scope = [row for row in uncensored if row[1].prepared_servings > 0]
        if len(surplus_scope) >= minimum:
            uncensored_metrics = metrics(surplus_scope)
            surplus = uncensored_metrics.overproduction_rate
            high = sum(percentage(item.leftover_servings, item.prepared_servings) >= settings.WASTE_SURPLUS_THRESHOLD
                       for _, item, _ in surplus_scope)
            if surplus >= settings.WASTE_SURPLUS_THRESHOLD and high >= max(2, (len(surplus_scope) + 1) // 2):
                emit("RECURRING_OVERPRODUCTION", surplus, settings.WASTE_SURPLUS_THRESHOLD,
                     "Repeated uncensored meals show substantial unserved leftovers.",
                     ("Reconcile leftovers and shortages before considering changes." if measurement.shortage_records
                      else "Compare the next forecast with observed served quantities and review preparation."),
                     count=len(surplus_scope), evidence={"high_surplus_records": high})

        plate = measurement.plate_waste_rate
        plate_scope = [row for row in comparable if row[1].plate_waste_servings is not None
                       and row[1].served_servings > 0]
        high_plate = sum(percentage(item.plate_waste_servings, item.served_servings) >= settings.WASTE_PLATE_THRESHOLD
                         for _, item, _ in plate_scope)
        if covered and plate is not None and plate >= settings.WASTE_PLATE_THRESHOLD and high_plate >= 2:
            emit("HIGH_PLATE_WASTE", plate, settings.WASTE_PLATE_THRESHOLD,
                 "Measured plate waste is high across repeated meals.",
                 "Review portion size and serving quality with staff before changing preparation.",
                 count=len(plate_scope), evidence={"high_plate_waste_records": high_plate})
        efficiency = measurement.consumption_efficiency
        if covered and efficiency is not None and efficiency < settings.WASTE_EFFICIENCY_FLOOR:
            emit("LOW_CONSUMPTION_EFFICIENCY", efficiency, settings.WASTE_EFFICIENCY_FLOOR,
                 "A low share of measured preparation was consumed.",
                 "Review unserved surplus and plate waste separately.")
        if (covered and shortage_known and shortage == 0 and plate is not None
                and plate <= settings.WASTE_EFFICIENT_THRESHOLD and measurement.overproduction_rate is not None
                and measurement.overproduction_rate <= settings.WASTE_EFFICIENT_THRESHOLD):
            emit("EFFICIENT_PREPARATION", plate, settings.WASTE_EFFICIENT_THRESHOLD,
                 "Measured plate waste and surplus are low, with no recorded shortages.",
                 "Maintain the current approach while continuing to measure waste.", severity="INFO")
        _preference_change(uncensored, minimum, emit)
    return messages


def _preference_change(rows, minimum, emit):
    menus = defaultdict(list)
    for record, item, food in rows:
        if record.menu_mode == MenuMode.CHOICE_BASED and food.food_role == FoodRole.MAIN_DISH and record.menu_context:
            key = tuple(sorted(dish["key"] for dish in record.menu_context))
            if sum(dish["role"] == "MAIN_DISH" for dish in record.menu_context) > 1:
                menus[key].append((record, item))
    for samples in menus.values():
        if len(samples) < minimum * 2:
            continue
        earlier, recent = samples[-minimum * 2:-minimum], samples[-minimum:]
        if earlier[-1][0].meal_date >= recent[0][0].meal_date:
            continue

        def rate(batch):
            return fsum(item.served_servings for _, item in batch) / sum(meal.actual_people for meal, _ in batch)

        prior, latest = rate(earlier), rate(recent)
        if prior > 0:
            change = percentage(latest - prior, prior)
            if abs(change) >= settings.WASTE_PREFERENCE_CHANGE:
                emit("CHANGING_FOOD_PREFERENCE", change, settings.WASTE_PREFERENCE_CHANGE,
                     "Served quantity per attendee changed for the same choice menu.",
                     "Review aggregate demand with staff. Portion and uptake changes can affect this proxy.",
                     count=len(earlier) + len(recent), evidence={"earlier_served_per_attendee": prior,
                                                               "recent_served_per_attendee": latest})
                return
