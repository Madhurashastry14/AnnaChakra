"""Seed configurable recipe estimates; they are not professionally validated.

Biryani is seeded as a vegetarian vegetable biryani. Classifier matches for it
still require staff to confirm the specific variant and dietary status.
"""

import sys
from pathlib import Path
from typing import Sequence

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.food import FoodItem
from ml.forecasting.menu_catalogue import ACCOMPANIMENTS, seed_role
from app.schemas.food import FoodItemCreateRequest
from app.services.food import (
    FoodItemAlreadyExistsError,
    FoodItemPersistenceError,
    create_food_item,
)

DEFAULT_FOOD_ITEMS: tuple[dict[str, object], ...] = (
    {
        "name": "Idli",
        "category": "breakfast",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 3,
        "ingredients_per_serving": [
            {"name": "Idli rice", "quantity": 20, "unit": "g"},
            {"name": "Urad dal", "quantity": 6, "unit": "g"},
            {"name": "Water", "quantity": 25, "unit": "ml"},
            {"name": "Salt", "quantity": 0.3, "unit": "g"},
        ],
    },
    {
        "name": "Dosa",
        "category": "breakfast",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 2,
        "ingredients_per_serving": [
            {"name": "Rice", "quantity": 25, "unit": "g"},
            {"name": "Urad dal", "quantity": 5, "unit": "g"},
            {"name": "Water", "quantity": 25, "unit": "ml"},
            {"name": "Cooking oil", "quantity": 3, "unit": "ml"},
        ],
    },
    {
        "name": "Poha",
        "category": "breakfast",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Flattened rice", "quantity": 80, "unit": "g"},
            {"name": "Onion", "quantity": 20, "unit": "g"},
            {"name": "Peas", "quantity": 15, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Upma",
        "category": "breakfast",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Semolina", "quantity": 75, "unit": "g"},
            {"name": "Water", "quantity": 180, "unit": "ml"},
            {"name": "Mixed vegetables", "quantity": 25, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Kuzhi Paniyaram",
        "category": "breakfast",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 3,
        "ingredients_per_serving": [
            {"name": "Rice and lentil batter", "quantity": 35, "unit": "g"},
            {"name": "Onion", "quantity": 3, "unit": "g"},
            {"name": "Cooking oil", "quantity": 2, "unit": "ml"},
        ],
    },
    {
        "name": "Steamed Rice",
        "category": "rice",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 75, "unit": "g"},
            {"name": "Water", "quantity": 150, "unit": "ml"},
        ],
    },
    {
        "name": "Biryani",
        "category": "rice",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 80, "unit": "g"},
            {"name": "Mixed vegetables", "quantity": 50, "unit": "g"},
            {"name": "Yogurt", "quantity": 20, "unit": "g"},
            {"name": "Cooking oil", "quantity": 8, "unit": "ml"},
        ],
    },
    {
        "name": "Lemon Rice",
        "category": "rice",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 75, "unit": "g"},
            {"name": "Water", "quantity": 150, "unit": "ml"},
            {"name": "Lemon juice", "quantity": 8, "unit": "ml"},
            {"name": "Peanuts", "quantity": 5, "unit": "g"},
        ],
    },
    {
        "name": "Curd Rice",
        "category": "rice",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 65, "unit": "g"},
            {"name": "Water", "quantity": 130, "unit": "ml"},
            {"name": "Curd", "quantity": 50, "unit": "g"},
            {"name": "Ginger", "quantity": 2, "unit": "g"},
        ],
    },
    {
        "name": "Vegetable Pulao",
        "category": "rice",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 75, "unit": "g"},
            {"name": "Mixed vegetables", "quantity": 35, "unit": "g"},
            {"name": "Water", "quantity": 140, "unit": "ml"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Chapati",
        "category": "bread",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 3,
        "ingredients_per_serving": [
            {"name": "Whole wheat flour", "quantity": 35, "unit": "g"},
            {"name": "Water", "quantity": 20, "unit": "ml"},
            {"name": "Cooking oil", "quantity": 1, "unit": "ml"},
        ],
    },
    {
        "name": "Poori",
        "category": "bread",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 3,
        "ingredients_per_serving": [
            {"name": "Whole wheat flour", "quantity": 30, "unit": "g"},
            {"name": "Water", "quantity": 15, "unit": "ml"},
            {"name": "Frying oil", "quantity": 8, "unit": "ml"},
        ],
    },
    {
        "name": "Paratha",
        "category": "bread",
        "serving_unit": "piece",
        "is_vegetarian": True,
        "default_servings_per_person": 2,
        "ingredients_per_serving": [
            {"name": "Whole wheat flour", "quantity": 40, "unit": "g"},
            {"name": "Water", "quantity": 22, "unit": "ml"},
            {"name": "Cooking oil", "quantity": 4, "unit": "ml"},
        ],
    },
    {
        "name": "Sambar",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Toor dal", "quantity": 20, "unit": "g"},
            {"name": "Mixed vegetables", "quantity": 50, "unit": "g"},
            {"name": "Water", "quantity": 150, "unit": "ml"},
            {"name": "Tamarind", "quantity": 5, "unit": "g"},
        ],
    },
    {
        "name": "Rasam",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Tomato", "quantity": 30, "unit": "g"},
            {"name": "Water", "quantity": 180, "unit": "ml"},
            {"name": "Tamarind", "quantity": 3, "unit": "g"},
            {"name": "Rasam spice", "quantity": 2, "unit": "g"},
        ],
    },
    {
        "name": "Dal Tadka",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Toor dal", "quantity": 35, "unit": "g"},
            {"name": "Water", "quantity": 130, "unit": "ml"},
            {"name": "Tomato", "quantity": 20, "unit": "g"},
            {"name": "Ghee", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Aloo Gobi",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Potato", "quantity": 60, "unit": "g"},
            {"name": "Cauliflower", "quantity": 60, "unit": "g"},
            {"name": "Tomato", "quantity": 20, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Chana Masala",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Dry chickpeas", "quantity": 30, "unit": "g"},
            {"name": "Onion", "quantity": 20, "unit": "g"},
            {"name": "Tomato", "quantity": 30, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Palak Paneer",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Spinach", "quantity": 60, "unit": "g"},
            {"name": "Paneer", "quantity": 35, "unit": "g"},
            {"name": "Onion", "quantity": 15, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
    {
        "name": "Vegetable Curry",
        "category": "curry",
        "serving_unit": "serving",
        "is_vegetarian": True,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Mixed vegetables", "quantity": 80, "unit": "g"},
            {"name": "Coconut milk", "quantity": 40, "unit": "ml"},
            {"name": "Onion", "quantity": 20, "unit": "g"},
            {"name": "Cooking oil", "quantity": 5, "unit": "ml"},
        ],
    },
)


def seed_food_catalogue(
    db: Session,
    catalogue: Sequence[dict[str, object]] = DEFAULT_FOOD_ITEMS,
) -> tuple[int, int]:
    inserted = 0
    skipped = 0

    for raw_item in catalogue:
        item = FoodItemCreateRequest.model_validate(raw_item)
        try:
            create_food_item(db, item.model_dump(mode="json"))
        except FoodItemAlreadyExistsError:
            skipped += 1
        except FoodItemPersistenceError:
            raise
        else:
            inserted += 1

    foods = {food.name: food for food in db.scalars(select(FoodItem))}
    for definition in catalogue:
        name = definition["name"]
        food = foods.get(name)
        role = seed_role(name)
        if food is None or role is None or food.food_role is not None:
            continue
        food.food_role = role
        if name in ACCOMPANIMENTS and not food.compatible_main_food_item_ids:
            food.compatible_main_food_item_ids = [
                foods[main].id for main in ACCOMPANIMENTS[name]
                if main in foods and (foods[main].food_role or seed_role(main)) == "MAIN_DISH"
            ]
    db.commit()
    return inserted, skipped


def main() -> int:
    try:
        with SessionLocal() as db:
            inserted, skipped = seed_food_catalogue(db)
    except (FoodItemPersistenceError, SQLAlchemyError):
        print("Food catalogue seeding failed.", file=sys.stderr)
        return 1
    except ValidationError:
        print("Seed data failed validation.", file=sys.stderr)
        return 1

    print(
        f"Food catalogue seed complete: {inserted} inserted, "
        f"{skipped} skipped."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
