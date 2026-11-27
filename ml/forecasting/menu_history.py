"""Learn from complete prior meals using aggregate diner equivalents."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from math import isfinite

from ml.forecasting.history import HISTORY_WINDOW_DAYS, SMOOTHING, Observation, blended_rate
from ml.forecasting.menu import (
    ACCOMPANIMENT, CHOICE, FIXED, Dish, choice_priors, forecast_menu, normalize, recipient_pool,
)


@dataclass(frozen=True)
class MealSample:
    kitchen: str
    date: date
    meal_type: str
    mode: str | None
    attendance: int
    dishes: tuple[Dish, ...]
    observations: tuple[Observation, ...]

    @property
    def complete(self):
        ids = {dish.key for dish in self.dishes}
        return (self.attendance > 0 and bool(ids) and len(ids) == len(self.dishes) == len(self.observations)
                and ids == {row.food_key for row in self.observations}
                and all(row.valid and row.actual_people == self.attendance for row in self.observations)
                and all(isfinite(dish.portion) and dish.portion > 0 for dish in self.dishes))

    def equivalents(self):
        served = {row.food_key: row.served for row in self.observations}
        return {dish.key: served[dish.key] / dish.portion for dish in self.dishes if dish.is_main}


def past_meals(history, kitchen, meal_date, window_days=HISTORY_WINDOW_DAYS):
    return [meal for meal in history if meal.kitchen == kitchen
            and 0 < (meal_date - meal.date).days <= window_days and meal.complete]


def preference_evidence(dishes, meal_type, history):
    """Return shares, sample count and fallback tier for the highest available match."""
    ids = {dish.key for dish in dishes}
    prior, _ = choice_priors(dishes)
    if len(prior) < 2:
        return {}, 0, None
    tiers = [[], [], []]
    for meal in history:
        if meal.mode != CHOICE or any(dish.role is None for dish in meal.dishes):
            continue
        equiv = meal.equivalents()
        overlap = prior.keys() & equiv.keys()
        if len(equiv) < 2 or not overlap or not any(equiv.values()):
            continue
        same_type = meal.meal_type == meal_type
        exact_menu = ids == {dish.key for dish in meal.dishes} and prior.keys() == equiv.keys()
        if same_type and exact_menu:
            tiers[0].append(normalize(equiv))
        elif same_type and len(overlap) >= 2 and any(equiv[key] for key in overlap):
            projected = normalize({key: equiv[key] for key in overlap})
            mass = sum(prior[key] for key in overlap)
            tiers[1].append({key: projected[key] * mass if key in overlap else prior[key] for key in prior})
        else:
            shares = normalize(equiv)
            tiers[2].append(normalize({
                key: shares[key] * len(shares) if key in overlap else 1 for key in prior
            }))
    for tier, rows in zip(("EXACT_MENU", "SIMILAR_MAINS", "BROADER_CHOICE"), tiers):
        if rows:
            return normalize({key: sum(row[key] for row in rows) for key in prior}), len(rows), tier
    return {}, 0, None


def historical_rates(dishes, meal_type, mode, history, smoothing):
    current = {dish.key: dish for dish in dishes}
    main_count = sum(dish.is_main for dish in dishes)
    observations = defaultdict(list)
    for meal in history:
        if meal.meal_type != meal_type:
            continue
        legacy_single = meal.mode is None and main_count == 1 and len(meal.dishes) == 1
        if meal.mode != mode and not legacy_single:
            continue
        equiv = meal.equivalents()
        if mode == CHOICE and len(equiv) > 1 and not any(equiv.values()):
            continue
        mains = ({key: value * meal.attendance for key, value in normalize(equiv).items()}
                 if mode == CHOICE else dict.fromkeys(equiv, meal.attendance))
        served = {row.food_key: row.served for row in meal.observations}
        for past in meal.dishes:
            dish = current.get(past.key)
            if dish is None or (past.role != dish.role and not (past.is_main and dish.is_main)):
                continue
            if dish.is_main:
                if mode == CHOICE and (main_count != 1 or len(equiv) != 1):
                    continue
                observations[dish.key].append((served[dish.key], meal.attendance))
            else:
                pool = (recipient_pool(past, meal.attendance, mains, mode)
                        if dish.role == ACCOMPANIMENT else meal.attendance)
                if pool > 0:
                    observations[dish.key].append((served[dish.key] / past.portion, pool))
    rates = {}
    for key, rows in observations.items():
        dish = current[key]
        default = dish.portion if dish.is_main else dish.uptake
        effective = sum(served for served, _ in rows) / sum(people for _, people in rows)
        if not dish.is_main:
            default = default if isfinite(default) and 0 <= default <= 1 else 0.75
            effective = min(1, effective)
        rates[key] = (blended_rate(default, effective, len(rows), smoothing), len(rows))
    return rates


def personalized_menu(dishes, attendance, mode, kitchen, meal_type, meal_date, history,
                      *, smoothing=SMOOTHING, window_days=HISTORY_WINDOW_DAYS):
    past = past_meals(history, kitchen, meal_date, window_days)
    evidence, count, _ = preference_evidence(dishes, meal_type, past) if mode == CHOICE else ({}, 0, None)
    priors, _ = choice_priors(dishes)
    shares = normalize({key: blended_rate(prior, evidence[key], count, smoothing)
                        for key, prior in priors.items()}) if count else None
    rates = historical_rates(dishes, meal_type, mode, past, smoothing)
    return forecast_menu(dishes, attendance, mode, shares=shares, preference_count=count, rates=rates)
