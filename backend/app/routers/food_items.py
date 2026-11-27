from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.enums import ServingUnit, UserRole
from app.schemas.food import (
    FoodItemCreateRequest,
    FoodItemListResponse,
    FoodItemResponse,
    FoodItemUpdateRequest,
    IngredientCalculationRequest,
    IngredientCalculationResponse,
)
from app.services.food import (
    FoodItemAlreadyExistsError,
    FoodItemPersistenceError,
    HistoricalServingUnitChangeError,
    create_food_item,
    get_food_item,
    list_food_items,
    update_food_item,
)
from app.services.ingredients import calculate_ingredients

router = APIRouter(
    prefix="/api/v1/food-items",
    tags=["Food Catalogue"],
    dependencies=[Depends(get_current_active_user)],
)


@router.get("", response_model=FoodItemListResponse)
def read_food_items(
    search: str | None = Query(default=None, max_length=150),
    category: str | None = Query(default=None, max_length=50),
    is_vegetarian: bool | None = None,
    serving_unit: ServingUnit | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> FoodItemListResponse:
    items, total = list_food_items(
        db,
        search=search.strip() if search else None,
        category=category.strip() if category else None,
        is_vegetarian=is_vegetarian,
        serving_unit=serving_unit,
        limit=limit,
        offset=offset,
    )
    return FoodItemListResponse(items=items, total=total)


@router.get("/{food_item_id}", response_model=FoodItemResponse)
def read_food_item(
    food_item_id: int,
    db: Session = Depends(get_db),
) -> FoodItemResponse:
    item = get_food_item(db, food_item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food item not found",
        )
    return FoodItemResponse.model_validate(item)


@router.post(
    "",
    response_model=FoodItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_catalogue_item(
    request: FoodItemCreateRequest,
    db: Session = Depends(get_db),
) -> FoodItemResponse:
    try:
        item = create_food_item(db, request.model_dump(mode="json"))
    except FoodItemAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Food item name already exists",
        ) from None
    except FoodItemPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create food item",
        ) from None
    return FoodItemResponse.model_validate(item)


@router.patch(
    "/{food_item_id}",
    response_model=FoodItemResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def update_catalogue_item(
    food_item_id: int,
    request: FoodItemUpdateRequest,
    db: Session = Depends(get_db),
) -> FoodItemResponse:
    try:
        item = update_food_item(
            db,
            food_item_id,
            request.model_dump(mode="json", exclude_unset=True),
        )
    except FoodItemAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Food item name already exists",
        ) from None
    except HistoricalServingUnitChangeError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Serving unit cannot change after historical use",
        ) from None
    except FoodItemPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update food item",
        ) from None

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food item not found",
        )
    return FoodItemResponse.model_validate(item)


@router.post(
    "/{food_item_id}/ingredients/calculate",
    response_model=IngredientCalculationResponse,
)
def calculate_food_item_ingredients(
    food_item_id: int,
    request: IngredientCalculationRequest,
    db: Session = Depends(get_db),
) -> IngredientCalculationResponse:
    item = get_food_item(db, food_item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food item not found",
        )
    if (
        item.serving_unit == ServingUnit.PIECE
        and not request.quantity.is_integer()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Piece-based food items require a whole-number quantity",
        )

    try:
        ingredients = calculate_ingredients(
            item.ingredients_per_serving,
            request.quantity,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to calculate ingredient quantities",
        ) from None

    return IngredientCalculationResponse(
        food_item_id=item.id,
        food_name=item.name,
        quantity=request.quantity,
        serving_unit=item.serving_unit,
        ingredients=ingredients,
    )
