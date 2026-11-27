"""Generate independent institutional demo records without database access."""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from ml.forecasting.inspect_dataset import DATA_DIR

SYNTHETIC_DATA = DATA_DIR / "institutional_synthetic.csv"
MENUS = {
    "BREAKFAST": [("Idli", "Sambar"), ("Dosa", "Sambar"), ("Poha",), ("Upma",)],
    "LUNCH": [("Steamed Rice", "Dal Tadka", "Aloo Gobi"),
              ("Chapati", "Chana Masala"), ("Vegetable Pulao", "Vegetable Curry")],
    "DINNER": [("Chapati", "Palak Paneer"), ("Steamed Rice", "Rasam", "Vegetable Curry"),
               ("Paratha", "Chana Masala"), ("Curd Rice", "Aloo Gobi")],
}
# Piece rates from the seed catalogue. Other dishes on these menus use one serving.
PIECE_RATES = {"Idli": 3, "Dosa": 2, "Chapati": 3, "Paratha": 2}


def generate_dataset(seed=42, days=180):
    rng = np.random.default_rng(seed)
    rows = []
    for kitchen in range(8):
        dishes = dict.fromkeys(dish for menus in MENUS.values() for menu in menus for dish in menu)
        preferences = {dish: rng.uniform(0.68, 1.2) for dish in dishes}
        menu_weights = {meal: rng.dirichlet(np.full(len(menus), 2))
                        for meal, menus in MENUS.items()}
        weekend_scale = rng.uniform(0.54, 0.93)
        capacity = 76 + kitchen * 31
        for day, date in enumerate(pd.date_range("2025-01-01", periods=days)):
            weekend = date.day_of_week >= 5
            for meal, attendance_scale in zip(MENUS, (0.76, 1.0, 0.87)):
                center = capacity * attendance_scale * (weekend_scale if weekend else 1)
                expected = max(1, round(center * (1 + 0.07 * np.sin(day / 19)) + rng.normal(0, 6)))
                actual = max(0, round(expected * rng.normal(1, 0.09)))
                if rng.random() < 0.004:
                    actual = 0
                menus = MENUS[meal]
                for dish in menus[rng.choice(len(menus), p=menu_weights[meal])]:
                    piece = dish in PIECE_RATES
                    rate = PIECE_RATES.get(dish, 1)
                    demand = actual * rate * preferences[dish] * rng.uniform(0.88, 1.12)
                    prepared = expected * rate * preferences[dish] * rng.uniform(0.95, 1.28)
                    demand, prepared = (round(demand), round(prepared)) if piece else (
                        round(demand, 2), round(prepared, 2))
                    served = min(demand, prepared)
                    waste = served * rng.uniform(0.01, 0.10)
                    rows.append({
                        "kitchen_key": f"demo-{kitchen + 1}", "meal_date": date,
                        "meal_type": meal, "food_item_name": dish,
                        "serving_unit": "piece" if piece else "serving",
                        "default_servings_per_person": rate, "expected_people": expected,
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
