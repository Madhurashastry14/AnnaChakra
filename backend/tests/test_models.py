import app.models

from app.core.database import Base


def test_required_models_registered():
    expected_tables = {
        "users",
        "kitchens",
        "ngos",
        "delivery_personnel",
        "food_items",
        "forecasts",
        "forecast_items",
        "meal_records",
        "meal_record_items",
        "waste_logs",
        "ngo_requirements",
        "donations",
        "donation_items",
        "deliveries",
        "model_versions",
    }

    assert expected_tables.issubset(
        Base.metadata.tables.keys()
    )