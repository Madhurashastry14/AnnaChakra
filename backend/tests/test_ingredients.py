from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.food import IngredientUnit, RecipeIngredient
from app.services.food import FOOD_CLASS_LABEL_MAPPING, map_food_class_label
from app.services.ingredients import calculate_ingredients


def test_ingredient_calculation_converts_mass_and_volume() -> None:
    result = calculate_ingredients(
        [
            RecipeIngredient(name="Raw rice", quantity=75, unit="g"),
            RecipeIngredient(name="Water", quantity=150, unit="ml"),
        ],
        190,
    )

    assert [ingredient.model_dump(mode="json") for ingredient in result] == [
        {"name": "Raw rice", "quantity": 14.25, "unit": "kg"},
        {"name": "Water", "quantity": 28.5, "unit": "l"},
    ]


def test_small_and_piece_ingredients_keep_their_units() -> None:
    result = calculate_ingredients(
        [
            RecipeIngredient(name="Salt", quantity=0.5, unit=IngredientUnit.GRAM),
            RecipeIngredient(
                name="Oil",
                quantity=2,
                unit=IngredientUnit.MILLILITRE,
            ),
            RecipeIngredient(
                name="Chilli",
                quantity=0.25,
                unit=IngredientUnit.PIECE,
            ),
        ],
        2,
    )

    assert [(item.quantity, item.unit.value) for item in result] == [
        (1, "g"),
        (4, "ml"),
        (0.5, "piece"),
    ]


def test_calculation_supports_zero_and_rejects_invalid_quantities() -> None:
    ingredient = [
        RecipeIngredient(name="Rice", quantity=75, unit="g")
    ]

    assert calculate_ingredients(ingredient, 0)[0].quantity == 0
    for quantity in (-1, float("nan"), float("inf"), Decimal("-0.1")):
        with pytest.raises(ValueError):
            calculate_ingredients(ingredient, quantity)


@pytest.mark.parametrize(
    "ingredient",
    [
        {"name": "  ", "quantity": 1, "unit": "g"},
        {"name": "Rice", "quantity": -1, "unit": "g"},
        {"name": "Rice", "quantity": float("inf"), "unit": "g"},
        {"name": "Rice", "quantity": 1, "unit": "cup"},
        {"name": "Rice", "quantity": 1, "unit": "g", "extra": 1},
    ],
)
def test_recipe_ingredient_schema_rejects_invalid_values(
    ingredient: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        RecipeIngredient.model_validate(ingredient)


def test_classifier_mapping_is_catalogue_based_and_flags_biryani() -> None:
    assert len(FOOD_CLASS_LABEL_MAPPING) == 8
    dal_tadka = map_food_class_label("DAL_TADKA")
    assert dal_tadka is not None
    assert dal_tadka.food_name == "Dal Tadka"
    biryani = map_food_class_label("biryani")
    assert biryani is not None
    assert biryani.food_name == "Biryani"
    assert biryani.requires_manual_confirmation is True
    assert map_food_class_label("unknown") is None
