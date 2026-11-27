"""Rank and assemble catalogue menus without creating forecasts or feedback."""
from collections import defaultdict
from itertools import combinations
from math import fsum
from statistics import mean

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import FoodRole, MenuMode
from app.models.food import FoodItem
from app.schemas.forecast import ForecastRequest
from app.schemas.menu import MenuResponse, RecommendedDish
from app.services.menu_history import menu_history
from app.services.waste_analytics import history_rows, metrics

SHORTLIST_SIZE = 12
SHRINKAGE = 10


def _preference_samples(db, kitchen_id, request):
    if request.menu_mode != MenuMode.CHOICE_BASED:
        return {}
    samples = defaultdict(list)
    for meal in menu_history(db, kitchen_id, request.meal_date):
        if meal.mode != MenuMode.CHOICE_BASED or meal.meal_type != request.meal_type or not meal.complete:
            continue
        if any(dish.role is None for dish in meal.dishes):
            continue
        equivalents = meal.equivalents()
        total = fsum(equivalents.values())
        if len(equivalents) < 2 or total <= 0:
            continue
        for dish_id, count in equivalents.items():
            relative = count / total * len(equivalents)
            samples[int(dish_id)].append(relative / (1 + relative))
    return samples


def _rank(food, records, selection, recent_ids, request):
    prior = food.preference_weight / (1 + food.preference_weight)
    measured = metrics(records) if records else None
    eligible = [row for row in records if row[0].actual_people > 0 and not row[1].shortage_occurred]
    weights = [0.5 ** ((request.meal_date - meal.meal_date).days / 45) for meal, _, _ in eligible]
    dated = metrics(eligible, weights) if eligible else None
    reasons = []

    def shrunk(rate, count):
        return prior if rate is None else (SHRINKAGE * prior + count * rate / 100) / (SHRINKAGE + count)

    acceptance = shrunk(dated.food_acceptance_rate if dated else None, dated.measured_plate_waste_records if dated else 0)
    if selection:
        weight = len(selection) / (SHRINKAGE + len(selection))
        acceptance = acceptance * (1 - 0.25 * weight) + mean(selection) * 0.25 * weight
        reasons.append("Comparable choice meals provide aggregate diner-equivalent evidence.")
    surplus = shrunk(100 - dated.overproduction_rate if dated and dated.overproduction_rate is not None else None,
                     len(eligible))
    plate = shrunk(100 - dated.plate_waste_rate if dated and dated.plate_waste_rate is not None else None,
                   dated.measured_plate_waste_records if dated else 0)
    variety = 1 / (1 + recent_ids.get(food.id, 0))
    shortage = shrunk(100 - measured.shortage_frequency if measured and measured.shortage_frequency is not None else None,
                      measured.shortage_eligible_records if measured else 0)
    if dated and dated.food_acceptance_rate is not None:
        reasons.append(f"Measured consumption proxy {dated.food_acceptance_rate:.1f}% on comparable uncensored meals.")
    if dated and dated.overproduction_rate is not None:
        reasons.append(f"Recency-weighted unserved surplus {dated.overproduction_rate:.1f}%.")
    if measured and measured.shortage_records:
        reasons.append("Shortage observations affect planning risk, with censored demand excluded.")
    if measured and measured.measured_plate_waste_records < measured.records_analyzed:
        reasons.append("Missing plate-waste measurements retain a catalogue prior.")
    if not recent_ids.get(food.id):
        reasons.append("No comparable meal included this dish in the recent variety window.")
    has_history = bool(records or selection)
    if not has_history:
        reasons.append("Catalogue preference weight and meal-type compatibility guide this suggestion.")
    evidence = len(eligible) if eligible else len(records)
    coefficients = settings.MENU_SCORE_WEIGHTS
    score = fsum(w * value for w, value in zip(coefficients, (acceptance, surplus, plate, variety, shortage))) / sum(coefficients)
    return RecommendedDish(
        food_item_id=food.id, food_item_name=food.name, food_role=food.food_role, serving_unit=food.serving_unit,
        recommendation_score=round(score * 100, 4),
        recommendation_method="HYBRID" if has_history else "CATALOGUE_BASED",
        data_availability=("SUFFICIENT_HISTORY" if evidence >= settings.WASTE_MIN_RECORDS else
                           "LIMITED_HISTORY" if has_history else "NO_HISTORY"),
        records_analyzed=len(records), waste_metrics=measured, reasons=reasons,
    )


def _choose(request, eligible, scores, history):
    required = {eligible[key].id for key in request.required_food_item_ids}
    required_main = {key for key in required if eligible[key].food_role == FoodRole.MAIN_DISH}
    required_pairs = {key for key in required if eligible[key].food_role == FoodRole.ACCOMPANIMENT}
    extras = required - required_main - required_pairs
    if len(required_main) > request.max_main_dishes or len(required_pairs) > request.max_accompaniments:
        raise HTTPException(422, "Required foods exceed the main or accompaniment limits")

    def rank(key):
        return (-scores[key].recommendation_score, key)

    mains = sorted((key for key, food in eligible.items() if food.food_role == FoodRole.MAIN_DISH), key=rank)
    pairs = sorted((key for key, food in eligible.items() if food.food_role == FoodRole.ACCOMPANIMENT), key=rank)
    shortlist = set(mains[:SHORTLIST_SIZE]) | required_main
    for key in required_pairs:
        options = set(eligible[key].compatible_main_food_item_ids)
        shortlist.update([main for main in mains if main in options][:request.max_main_dishes])
    candidate_mains = sorted(shortlist - required_main, key=rank)
    menus = defaultdict(set)
    for meal, item, food in history:
        if food.food_role == FoodRole.MAIN_DISH and not item.shortage_occurred:
            menus[meal.id].add(food.id)
    known_pairs = {pair for menu in menus.values() for pair in combinations(sorted(menu), 2)}

    maximum = min(len(shortlist), request.max_main_dishes, request.max_dishes - len(required_pairs) - len(extras))
    best = None
    for size in range(maximum, max(1, len(required_main)) - 1, -1):
        for added in combinations(candidate_mains, size - len(required_main)):
            selected_mains = required_main | set(added)
            compatible = [key for key in pairs if selected_mains.intersection(eligible[key].compatible_main_food_item_ids)]
            if not required_pairs.issubset(compatible):
                continue
            free = min(request.max_accompaniments, request.max_dishes - size - len(extras)) - len(required_pairs)
            selected_pairs = required_pairs | set([key for key in compatible if key not in required_pairs][:free])
            ordered = sorted(selected_mains, key=rank) + sorted(selected_pairs, key=rank) + sorted(extras, key=rank)
            match = set().union(*(set(eligible[key].compatible_main_food_item_ids) for key in selected_pairs))
            coverage = len(selected_mains & match) / size
            main_score = mean(scores[key].recommendation_score for key in selected_mains)
            pair_score = mean(scores[key].recommendation_score for key in selected_pairs) if selected_pairs else 0
            combination = main_score + 0.12 * pair_score + 4 * coverage
            if request.menu_mode == MenuMode.FIXED_MEAL:
                combination += 3 * sum(pair in known_pairs for pair in combinations(sorted(selected_mains), 2)) / max(1, size * (size - 1) / 2)
            key = (combination, tuple(-item for item in ordered))
            if best is None or key > best[0]:
                best = (key, ordered)
        if best is not None:
            return best[1]
    raise HTTPException(422, "No complete menu satisfies meal type, dietary and compatibility constraints")


def recommend_menu(db, kitchen_id, request):
    foods = {food.id: food for food in db.scalars(select(FoodItem).order_by(FoodItem.id))}
    requested = set(request.required_food_item_ids) | set(request.excluded_food_item_ids)
    if not requested.issubset(foods):
        raise HTTPException(404, "A required or excluded food item does not exist")
    eligible = {key: food for key, food in foods.items()
                if key not in request.excluded_food_item_ids and food.food_role is not None
                and request.meal_type in (food.supported_meal_types or [])
                and (not request.vegetarian_only or food.is_vegetarian)}
    if not set(request.required_food_item_ids).issubset(eligible):
        raise HTTPException(422, "A required food item fails the dietary, role or meal-type constraints")
    history = history_rows(db, kitchen_id, meal_type=request.meal_type, menu_mode=request.menu_mode,
                           before=request.meal_date)
    by_food, recent = defaultdict(list), defaultdict(int)
    for meal, item, food in history:
        by_food[food.id].append((meal, item, food))
        if (request.meal_date - meal.meal_date).days <= 14:
            recent[food.id] += 1
    selection = _preference_samples(db, kitchen_id, request)
    scores = {key: _rank(food, by_food[key], selection.get(key), recent, request) for key, food in eligible.items()}
    ids = _choose(request, eligible, scores, history)
    items = [scores[key] for key in ids]
    method = "HYBRID" if any(item.recommendation_method == "HYBRID" for item in items) else "CATALOGUE_BASED"
    warnings = ["Scores summarize rule-based evidence and catalogue priors."]
    if all(item.data_availability != "SUFFICIENT_HISTORY" for item in items):
        warnings.append("Comparable kitchen history is limited. Review the proposed menu before forecasting.")
    if not any(item.food_role == FoodRole.ACCOMPANIMENT for item in items) and request.max_accompaniments:
        warnings.append("No compatible accompaniment was selected under the requested constraints.")
    context = request.model_dump(include={"meal_date", "meal_type", "expected_people", "menu_mode"})
    return MenuResponse(
        **context, recommendation_method=method, recommended_food_item_ids=ids, recommended_items=items,
        warnings=warnings, forecast_request=ForecastRequest(**context, food_item_ids=ids),
    )
