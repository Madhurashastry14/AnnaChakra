"""Run the menu model for an explicitly synthetic kitchen."""
import argparse
import json
from datetime import date
from math import ceil

import pandas as pd

from ml.forecasting.generate_dataset import SYNTHETIC_DATA
from ml.forecasting.menu import CHOICE, FIXED
from ml.forecasting.menu_features import build_menu_features, complete_examples
from ml.forecasting.menu_predict import DEMO_ARTIFACT, predict_menu_artifact


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kitchen", choices=[f"demo-{index}" for index in range(1, 9)])
    parser.add_argument("meal_date", type=date.fromisoformat)
    parser.add_argument("meal_type", choices=["BREAKFAST", "LUNCH", "DINNER"])
    parser.add_argument("dish")
    parser.add_argument("expected_people", type=int)
    parser.add_argument("--with", dest="other_dishes", action="append", default=[])
    parser.add_argument("--mode", choices=[CHOICE, FIXED], default=CHOICE)
    args = parser.parse_args()
    names = [args.dish, *args.other_dishes]
    if args.expected_people <= 0 or len(names) != len(set(names)):
        parser.error("Provide positive attendance and distinct dishes")
    raw = pd.read_csv(SYNTHETIC_DATA)
    if not raw.is_synthetic.eq(True).all():
        parser.error("The demo requires a synthetic dataset")
    history, catalogue, units = [], {}, {}
    meals = raw[raw.kitchen_key.eq(args.kitchen) & raw.meal_date.lt(args.meal_date.isoformat())]
    for _, meal, meal_units, _ in complete_examples(meals):
        history.append(meal)
        catalogue.update({dish.key: dish for dish in meal.dishes})
        units.update(meal_units)
    if not all(name in catalogue for name in names):
        parser.error("The menu includes a dish without compatible prior demo records")
    rows = build_menu_features(
        [catalogue[name] for name in names], units, args.expected_people, args.mode,
        args.kitchen, args.meal_type, args.meal_date, history,
    )
    result = predict_menu_artifact(DEMO_ARTIFACT, rows, args.meal_date, demo=True)
    if result is None:
        parser.error("The synthetic model is unavailable or the menu is unsupported")
    predictions, version = result
    print(json.dumps({
        "mode": "SYNTHETIC_DEMO", "menu_mode": args.mode, "model_version": version,
        "dishes": [{"name": name, "estimated_diners": value.diners, "preference_share": value.share,
                    "predicted_quantity": round(value.quantity, 2),
                    "recommended_quantity": ceil(value.quantity), "serving_unit": units[name]}
                   for name, value in predictions.items()],
    }, indent=2))


if __name__ == "__main__":
    main()
