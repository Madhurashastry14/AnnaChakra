from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import FoodRole, MealType, ServingUnit


class IngredientUnit(str, Enum):
    GRAM = "g"
    KILOGRAM = "kg"
    MILLILITRE = "ml"
    LITRE = "l"
    PIECE = "piece"


class RecipeIngredient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    unit: IngredientUnit

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("quantity", mode="before")
    @classmethod
    def reject_boolean_quantity(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Ingredient quantity must be numeric")
        return value


class MenuFoodFields(BaseModel):
    food_role: FoodRole | None = None
    supported_meal_types: list[MealType] | None = None

    @field_validator("supported_meal_types")
    @classmethod
    def unique_meal_types(cls, values):
        if values is not None and len(values) != len(set(values)):
            raise ValueError("Meal types must be unique")
        return values

    uptake_rate: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)] = 0.75
    preference_weight: Annotated[float, Field(gt=0, allow_inf_nan=False)] = 1
    compatible_main_food_item_ids: list[Annotated[int, Field(strict=True, gt=0, le=2147483647)]] = Field(
        default_factory=list,
    )

    @field_validator("compatible_main_food_item_ids")
    @classmethod
    def unique_compatible_ids(cls, ids):
        if len(ids) != len(set(ids)):
            raise ValueError("Compatible dish IDs must be unique")
        return ids


class FoodItemCreateRequest(MenuFoodFields):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=50)
    serving_unit: ServingUnit
    is_vegetarian: bool
    default_servings_per_person: float = Field(gt=0, allow_inf_nan=False)
    ingredients_per_serving: list[RecipeIngredient] = Field(
        default_factory=list
    )

    @field_validator("name", "category", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("default_servings_per_person", mode="before")
    @classmethod
    def reject_boolean_default_quantity(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Default servings must be numeric")
        return value

    @field_validator("ingredients_per_serving")
    @classmethod
    def reject_duplicate_ingredients(
        cls,
        ingredients: list[RecipeIngredient],
    ) -> list[RecipeIngredient]:
        names = [ingredient.name.casefold() for ingredient in ingredients]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ingredient names are not allowed")
        return ingredients


class FoodItemUpdateRequest(MenuFoodFields):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    serving_unit: ServingUnit | None = None
    is_vegetarian: bool | None = None
    default_servings_per_person: float | None = Field(
        default=None,
        gt=0,
        allow_inf_nan=False,
    )
    ingredients_per_serving: list[RecipeIngredient] | None = None

    @field_validator("name", "category", mode="before")
    @classmethod
    def strip_and_require_text(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null")
        return value.strip() if isinstance(value, str) else value

    @field_validator("serving_unit", "is_vegetarian", mode="before")
    @classmethod
    def reject_null_values(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null")
        return value

    @field_validator("default_servings_per_person", mode="before")
    @classmethod
    def reject_null_or_boolean_default(cls, value: object) -> object:
        if value is None:
            raise ValueError("Default servings cannot be null")
        if isinstance(value, bool):
            raise ValueError("Default servings must be numeric")
        return value

    @field_validator("ingredients_per_serving")
    @classmethod
    def validate_ingredients(
        cls,
        ingredients: list[RecipeIngredient] | None,
    ) -> list[RecipeIngredient]:
        if ingredients is None:
            raise ValueError("Ingredients cannot be null")
        names = [ingredient.name.casefold() for ingredient in ingredients]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ingredient names are not allowed")
        return ingredients

    @model_validator(mode="after")
    def require_update_fields(self) -> "FoodItemUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class FoodItemResponse(MenuFoodFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    serving_unit: ServingUnit
    is_vegetarian: bool
    default_servings_per_person: float
    ingredients_per_serving: list[RecipeIngredient]
    created_at: datetime


class FoodItemListResponse(BaseModel):
    items: list[FoodItemResponse]
    total: int


class IngredientCalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("quantity", mode="before")
    @classmethod
    def reject_boolean_quantity(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Quantity must be numeric")
        return value


class CalculatedIngredient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    quantity: float = Field(ge=0, allow_inf_nan=False)
    unit: IngredientUnit


class IngredientCalculationResponse(BaseModel):
    food_item_id: int
    food_name: str
    quantity: float
    serving_unit: ServingUnit
    ingredients: list[CalculatedIngredient]
