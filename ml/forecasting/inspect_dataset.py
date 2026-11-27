"""Inspect the workbook directly without assigning institutional units."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "datasets" / "forecasting"
WORKBOOK = DATA_DIR / "restaurant_food_waste.xlsx"
QUANTITIES = ["Prepared_Quantity", "Sold_Quantity", "Remaining_Quantity", "Waste_Amount_kg"]


def inspect_dataset(path=WORKBOOK):
    frame = pd.read_excel(path)
    report = {
        "dimensions": list(frame.shape),
        "columns": frame.dtypes.astype(str).to_dict(),
        "sample": json.loads(frame.head().to_json(orient="records", date_format="iso")),
        "missing": frame.isna().sum().to_dict(),
        "duplicates": int(frame.duplicated().sum()),
        "unique": {c: frame[c].nunique() for c in
                   ["Restaurant_ID", "Restaurant_Name", "Food_Item"] if c in frame},
        "numerical": json.loads(frame.select_dtypes("number").describe().to_json()),
        "units": {"Waste_Amount_kg": "kg (column label)", "other quantities": "undocumented"},
        "provenance": "Local workbook supplied as a Kaggle download. Source URL and collection methods unverified.",
    }
    if "Date" in frame:
        dates = pd.to_datetime(frame["Date"], errors="coerce")
        report["dates"] = {"minimum": str(dates.min()), "maximum": str(dates.max()),
                           "invalid": int((dates.isna() & frame["Date"].notna()).sum())}
    quantities = frame.reindex(columns=QUANTITIES).apply(pd.to_numeric, errors="coerce")
    report["invalid_quantities"] = {
        column: {
            "missing_or_nonfinite": int((~np.isfinite(quantities[column])).sum()),
            "negative": int((quantities[column] < 0).sum()),
        }
        for column in QUANTITIES if column in frame
    }
    prepared, sold, remaining, _ = (quantities[column] for column in QUANTITIES)
    valid = np.isfinite(prepared) & np.isfinite(sold) & np.isfinite(remaining)
    balanced = np.isclose(prepared, sold + remaining, rtol=0, atol=1e-8)
    report["quantity_balance"] = {
        "comparable": int(valid.sum()),
        "mismatches": int((valid & ~balanced).sum()),
        "sold_above_prepared": int((sold > prepared).sum()),
        "potential_sold_out": int((valid & balanced & (prepared > 0) & (remaining == 0)).sum()),
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, nargs="?", default=WORKBOOK)
    args = parser.parse_args()
    print(json.dumps(inspect_dataset(args.workbook), indent=2))


if __name__ == "__main__":
    main()
