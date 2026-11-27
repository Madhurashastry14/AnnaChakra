"""Create the same menu features for training and live prediction."""
import json
from collections import defaultdict
from statistics import mean

import pandas as pd
from sklearn.feature_extraction import FeatureHasher

from ml.forecasting.features import CALENDAR
from ml.forecasting.history import HISTORY_WINDOW_DAYS, Observation
from ml.forecasting.menu import ACCOMPANIMENT, CHOICE, FIXED, Dish, forecast_menu, recipient_pool
from ml.forecasting.menu_history import MealSample, past_meals, personalized_menu, preference_evidence
from ml.forecasting.preprocessing import build_preprocessor, model_inputs
from ml.forecasting.train import institutional_records

CATEGORIES = ["kitchen_key", "food_item_name", "food_role", "meal_type", "menu_mode", "serving_unit"]
NUMBERS = CALENDAR + [
    "expected_people", "default_servings_per_person", "competing_main_dish_count",
    "accompaniment_count", "compatible_main_count", "historical_preference",
    "exact_menu_preference", "history_count", "historical_recipients", "rolling_7",
    "uptake_rate", "preference_weight", "historical_rate", "main_recipient_pool",
]
FEATURE_SCHEMA = {"categorical": CATEGORIES, "numerical": NUMBERS, "hashed": "menu_tokens"}


def menu_model_inputs(frame):
    frame = pd.DataFrame(frame)
    result = model_inputs(frame, CATEGORIES, NUMBERS)
    result["menu_tokens"] = frame["menu_tokens"]
    return result


def menu_preprocessor():
    preprocessor = build_preprocessor(CATEGORIES, NUMBERS)
    preprocessor.transformers.append(
        ("menu", FeatureHasher(n_features=64, input_type="string", alternate_sign=False), "menu_tokens")
    )
    return preprocessor


def build_menu_features(dishes, units, expected, mode, kitchen, meal_type, date, history):
    expected = int(expected)
    past = past_meals(history, kitchen, date)
    simple = forecast_menu(dishes, expected, mode)
    equal = forecast_menu([Dish(d.key, d.role, d.portion, d.uptake, compatible=d.compatible)
                           for d in dishes], expected, mode)
    local = personalized_menu(dishes, expected, mode, kitchen, meal_type, date, past)
    shares, _, tier = preference_evidence(dishes, meal_type, past) if mode == CHOICE else ({}, 0, None)
    mains = {dish.key: local[dish.key].diners for dish in dishes if dish.is_main}
    seen = defaultdict(list)
    for meal in past:
        if meal.meal_type == meal_type and meal.mode == mode:
            for observation in meal.observations:
                seen[observation.food_key].append(observation.served)
    rows = []
    for dish in dishes:
        recent = seen[dish.key][-7:]
        pool = recipient_pool(dish, expected, mains, mode) if dish.role == ACCOMPANIMENT else expected
        rows.append({
            "kitchen_key": kitchen, "food_item_name": dish.key, "food_role": dish.role,
            "meal_type": meal_type, "menu_mode": mode, "serving_unit": units[dish.key],
            "day_of_week": date.weekday(), "month": date.month, "weekend": int(date.weekday() >= 5),
            "expected_people": expected, "default_servings_per_person": dish.portion,
            "competing_main_dish_count": len(mains) if mode == CHOICE else 0,
            "accompaniment_count": sum(d.role == ACCOMPANIMENT for d in dishes),
            "compatible_main_count": len(set(dish.compatible) & mains.keys()),
            "historical_preference": shares.get(dish.key, float("nan")),
            "exact_menu_preference": shares.get(dish.key, float("nan")) if tier == "EXACT_MENU" else float("nan"),
            "history_count": local[dish.key].history_count,
            "historical_recipients": local[dish.key].diners,
            "rolling_7": mean(recent) if recent else float("nan"),
            "uptake_rate": dish.uptake, "preference_weight": dish.weight,
            "historical_rate": local[dish.key].quantity / expected,
            "menu_tokens": tuple([f"{d.role}:{d.key}" for d in dishes]
                                 + [f"pairs-with:{key}" for key in dish.compatible if key in mains]),
            "main_recipient_pool": pool,
            "compatible_keys": dish.compatible,
            "INDEPENDENT": expected * dish.portion,
            "EQUAL_ALLOCATION": equal[dish.key].quantity,
            "BASELINE": simple[dish.key].quantity,
            "LOCAL_HISTORY": local[dish.key].quantity,
            "local_share": local[dish.key].share,
            "equal_share": equal[dish.key].share,
            "baseline_share": simple[dish.key].share,
            "independent_share": 1 if mode == CHOICE and dish.is_main else None,
        })
    return rows


def complete_examples(raw):
    """Reject entire incomplete or censored meals before constructing any targets."""
    if raw.empty:
        return
    valid = institutional_records(raw, keep_history_only=True)
    for menu_id, group in valid.groupby("menu_id", sort=False):
        first = group.iloc[0]
        common = ["kitchen_key", "meal_date", "meal_type", "menu_mode", "actual_people",
                  "expected_people", "menu_food_items"]
        if (first.menu_mode not in (CHOICE, FIXED) or group.food_role.isna().any()
                or group[common].nunique(dropna=False).ne(1).any()):
            continue
        if (len(group) != group.food_item_name.nunique()
                or set(group.food_item_name) != set(json.loads(first.menu_food_items))):
            continue
        if first.actual_people % 1 or (pd.notna(first.expected_people) and first.expected_people % 1):
            continue
        date = first.meal_date.date()
        dishes, observations, units = [], [], {}
        for row in group.itertuples():
            dish = Dish(row.food_item_name, row.food_role, row.default_servings_per_person,
                        row.uptake_rate, row.preference_weight, tuple(json.loads(row.compatible_main_dishes)))
            dishes.append(dish)
            units[dish.key] = row.serving_unit
            observations.append(Observation(
                row.kitchen_key, dish.key, row.meal_type, date, int(row.actual_people),
                row.prepared_servings, row.leftover_servings, row.shortage_occurred,
                None if pd.isna(row.plate_waste_servings) else row.plate_waste_servings,
            ))
        meal = MealSample(first.kitchen_key, date, first.meal_type, first.menu_mode,
                          int(first.actual_people), tuple(dishes), tuple(observations))
        if meal.complete:
            yield menu_id, meal, units, first.expected_people


def training_menu_features(raw):
    examples = sorted(complete_examples(raw), key=lambda example: example[1].date)
    by_kitchen = defaultdict(list)
    rows = []
    for menu_id, meal, units, expected in examples:
        history = by_kitchen[meal.kitchen]
        while history and (meal.date - history[0].date).days > HISTORY_WINDOW_DAYS:
            del history[0]
        if pd.notna(expected):
            features = build_menu_features(
                meal.dishes, units, expected, meal.mode, meal.kitchen, meal.meal_type, meal.date, history,
            )
            equivalents = meal.equivalents()
            total = sum(equivalents.values())
            if meal.mode == CHOICE and equivalents and not total:
                history.append(meal)
                continue
            for feature, observation in zip(features, meal.observations):
                share = None
                if meal.mode == CHOICE and total > 0 and observation.food_key in equivalents:
                    share = equivalents[observation.food_key] / total
                rows.append(feature | {"menu_id": menu_id, "meal_date": pd.Timestamp(meal.date),
                                       "observed_demand": observation.served, "observed_share": share,
                                       "model_target": share if share is not None else (
                                           observation.served / meal.attendance / feature["default_servings_per_person"]
                                       )})
        history.append(meal)
    return pd.DataFrame(rows)
