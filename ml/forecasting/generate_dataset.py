"""Generate reproducible meal-level institutional demo feedback."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.forecasting.inspect_dataset import DATA_DIR
from ml.forecasting.menu import ACCOMPANIMENT, CHOICE, FIXED, MAIN, Dish, recipient_pool
from ml.forecasting.menu_catalogue import ACCOMPANIMENTS, seed_role

SYNTHETIC_DATA = DATA_DIR / "institutional_synthetic.csv"
MENUS = {
    "BREAKFAST": [("Idli", "Dosa", "Sambar"), ("Idli", "Poha", "Sambar"),
                  ("Dosa", "Upma", "Sambar"), ("Poha", "Upma")],
    "LUNCH": [("Chapati", "Steamed Rice", "Biryani", "Dal Tadka"),
              ("Chapati", "Steamed Rice", "Sambar", "Aloo Gobi"),
              ("Chapati", "Vegetable Pulao", "Vegetable Curry")],
    "DINNER": [("Chapati", "Steamed Rice", "Palak Paneer"),
               ("Steamed Rice", "Curd Rice", "Rasam"),
               ("Chapati", "Paratha", "Chana Masala"), ("Curd Rice", "Aloo Gobi")],
}
PIECE_RATES = {"Idli": 3, "Dosa": 2, "Chapati": 3, "Paratha": 2}


def generate_dataset(seed=42, days=180):
    rng = np.random.default_rng(seed)
    rows = []
    for kitchen in range(8):
        kitchen_key = f"demo-{kitchen + 1}"
        names = dict.fromkeys(dish for menus in MENUS.values() for menu in menus for dish in menu)
        preferences = {dish: rng.uniform(0.45, 1.8) for dish in names}
        uptake = {dish: rng.uniform(0.45, 0.95) for dish in names}
        menu_weights = {meal: rng.dirichlet(np.full(len(menus), 3)) for meal, menus in MENUS.items()}
        weekend_scale = rng.uniform(0.54, 0.93)
        capacity = 76 + kitchen * 31
        for day, date in enumerate(pd.date_range("2025-01-01", periods=days)):
            weekend = date.day_of_week >= 5
            for meal, attendance_scale in zip(MENUS, (0.76, 1.0, 0.87)):
                center = capacity * attendance_scale * (weekend_scale if weekend else 1)
                expected = max(1, round(center * (1 + 0.07 * np.sin(day / 19)) + rng.normal(0, 6)))
                actual = 0 if rng.random() < 0.004 else max(0, round(expected * rng.normal(1, 0.07)))
                menu = MENUS[meal][rng.choice(len(MENUS[meal]), p=menu_weights[meal])]
                mode = FIXED if rng.random() < 0.29 else CHOICE
                mains = [name for name in menu if seed_role(name) == MAIN]
                weights = np.array([preferences[name] * (1 + 0.25 * weekend * (index % 2))
                                    for index, name in enumerate(mains)])
                shares = dict(zip(mains, weights / weights.sum()))
                selected = (dict(zip(mains, map(int, rng.multinomial(actual, list(shares.values())))))
                            if mode == CHOICE else dict.fromkeys(mains, actual))
                expected_mains = ({name: expected * share for name, share in shares.items()}
                                  if mode == CHOICE else dict.fromkeys(mains, expected))
                meal_id = f"{kitchen_key}:{date.date()}:{meal}"
                for name in menu:
                    role = seed_role(name)
                    dish = Dish(name, role, PIECE_RATES.get(name, 1),
                                compatible=ACCOMPANIMENTS.get(name, ()))
                    if role == MAIN:
                        recipients, planned = selected[name], expected_mains[name]
                    else:
                        pool = (recipient_pool(dish, actual, selected, mode)
                                if role == ACCOMPANIMENT else actual)
                        planned_pool = (recipient_pool(dish, expected, expected_mains, mode)
                                        if role == ACCOMPANIMENT else expected)
                        recipients = int(rng.binomial(pool, uptake[name]))
                        planned = planned_pool * uptake[name]
                    piece = name in PIECE_RATES
                    demand = recipients * dish.portion
                    multiplier = rng.uniform(0.55, 0.85) if rng.random() < 0.035 else rng.uniform(1.14, 1.52)
                    prepared = planned * dish.portion * multiplier
                    prepared = round(prepared) if piece else round(prepared, 2)
                    served = min(demand, prepared)
                    waste = served * rng.uniform(0.01, 0.10)
                    rows.append({
                        "menu_id": meal_id, "kitchen_key": kitchen_key, "meal_date": date,
                        "meal_type": meal, "menu_mode": mode, "food_item_name": name,
                        "food_role": role, "menu_food_items": json.dumps(menu),
                        "competing_main_dish_count": len(mains) if mode == CHOICE else 0,
                        "compatible_main_dishes": json.dumps(dish.compatible),
                        "selected_diners": recipients, "serving_unit": "piece" if piece else "serving",
                        "default_servings_per_person": dish.portion, "uptake_rate": dish.uptake,
                        "preference_weight": dish.weight, "expected_people": expected,
                        "actual_people": actual, "prepared_servings": prepared,
                        "leftover_servings": round(prepared - served, 2),
                        "plate_waste_servings": round(waste) if piece else round(waste, 2),
                        "shortage_occurred": demand > prepared, "is_synthetic": True,
                    })
    return pd.DataFrame(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=SYNTHETIC_DATA)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    records = generate_dataset()
    records.to_csv(args.output, index=False)
    print(f"Wrote {len(records)} records to {args.output}")


if __name__ == "__main__":
    main()
