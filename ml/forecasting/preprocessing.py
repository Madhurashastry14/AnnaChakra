"""Validate source observations and build reusable model transformations."""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder


def restaurant_records(raw):
    frame = raw.drop_duplicates().copy()
    frame.columns = frame.columns.str.strip().str.lower().str.replace(r"\W+", "_", regex=True)
    frame["meal_date"] = pd.to_datetime(frame["date"], errors="coerce").dt.normalize()
    for name in ("restaurant_id", "food_item", "cuisine", "holiday", "weather"):
        if name in frame:
            frame[name] = frame[name].astype("string").str.strip().str.casefold().replace("", pd.NA)
    columns = ["prepared_quantity", "sold_quantity", "remaining_quantity"]
    quantities = frame[columns].apply(pd.to_numeric, errors="coerce")
    prepared, sold, remaining = (quantities[name] for name in columns)
    valid = (
        np.isfinite(quantities).all(axis=1) & quantities.ge(0).all(axis=1)
        & np.isclose(prepared, sold + remaining, rtol=0, atol=1e-8)
    )
    if "waste_amount_kg" in frame:
        waste = pd.to_numeric(frame["waste_amount_kg"], errors="coerce")
        valid &= frame["waste_amount_kg"].isna() | (np.isfinite(waste) & waste.ge(0))
    frame["observed_demand"] = sold
    frame["censored"] = (prepared > 0) & (remaining == 0)
    return frame.loc[valid].dropna(subset=["meal_date", "restaurant_id", "food_item"])


def build_preprocessor(categorical, numerical):
    return ColumnTransformer([
        ("categories", make_pipeline(
            SimpleImputer(strategy="constant", fill_value="unknown", keep_empty_features=True),
            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
        ), categorical),
        ("numbers", SimpleImputer(strategy="median", keep_empty_features=True), numerical),
    ])


def model_inputs(frame, categorical, numerical):
    values = frame[categorical + numerical].copy()
    for name in categorical:
        values[name] = values[name].astype(object).where(values[name].notna(), np.nan)
    return values
