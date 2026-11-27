import math
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation

from app.schemas.food import (
    CalculatedIngredient,
    IngredientUnit,
    RecipeIngredient,
)

_MASS_CONVERSION_THRESHOLD = Decimal("1000")


def _to_decimal_quantity(value: int | float | Decimal) -> Decimal:
    try:
        quantity = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Quantity must be a finite nonnegative number") from exc

    if not quantity.is_finite() or quantity < 0:
        raise ValueError("Quantity must be a finite nonnegative number")
    return quantity


def calculate_ingredients(
    ingredients: Sequence[RecipeIngredient | Mapping[str, object]],
    quantity: int | float | Decimal,
) -> list[CalculatedIngredient]:
    required_quantity = _to_decimal_quantity(quantity)
    results: list[CalculatedIngredient] = []

    for raw_ingredient in ingredients:
        ingredient = (
            raw_ingredient
            if isinstance(raw_ingredient, RecipeIngredient)
            else RecipeIngredient.model_validate(raw_ingredient)
        )
        total = Decimal(str(ingredient.quantity)) * required_quantity
        unit = ingredient.unit

        if unit == IngredientUnit.GRAM and total >= _MASS_CONVERSION_THRESHOLD:
            total /= _MASS_CONVERSION_THRESHOLD
            unit = IngredientUnit.KILOGRAM
        elif (
            unit == IngredientUnit.MILLILITRE
            and total >= _MASS_CONVERSION_THRESHOLD
        ):
            total /= _MASS_CONVERSION_THRESHOLD
            unit = IngredientUnit.LITRE

        result_quantity = float(total)
        if not math.isfinite(result_quantity):
            raise ValueError("Calculated ingredient quantity is too large")
        results.append(
            CalculatedIngredient(
                name=ingredient.name,
                quantity=result_quantity,
                unit=unit,
            )
        )

    return results
