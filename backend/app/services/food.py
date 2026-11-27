from dataclasses import dataclass
from typing import TypeAlias

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.enums import FoodRole, ServingUnit
from app.models.food import FoodItem
from app.models.forecast import ForecastItem
from app.models.meal_record import MealRecordItem
from app.models.waste import WasteLog

FoodItemFields: TypeAlias = dict[str, object]


@dataclass(frozen=True)
class FoodClassMapping:
    food_name: str
    requires_manual_confirmation: bool = False


FOOD_CLASS_LABEL_MAPPING = {
    "chapati": FoodClassMapping("Chapati"),
    "dal_tadka": FoodClassMapping("Dal Tadka"),
    "biryani": FoodClassMapping("Biryani", requires_manual_confirmation=True),
    "poha": FoodClassMapping("Poha"),
    "aloo_gobi": FoodClassMapping("Aloo Gobi"),
    "chana_masala": FoodClassMapping("Chana Masala"),
    "palak_paneer": FoodClassMapping("Palak Paneer"),
    "kuzhi_paniyaram": FoodClassMapping("Kuzhi Paniyaram"),
}


class FoodItemAlreadyExistsError(Exception):
    pass


class HistoricalServingUnitChangeError(Exception):
    pass


class MenuConfigurationError(ValueError):
    pass


class FoodItemPersistenceError(Exception):
    pass


def map_food_class_label(label: str) -> FoodClassMapping | None:
    return FOOD_CLASS_LABEL_MAPPING.get(label.strip().casefold())


def _find_food_item_by_name(
    db: Session,
    name: str,
    *,
    exclude_id: int | None = None,
) -> FoodItem | None:
    statement = select(FoodItem).where(
        func.lower(FoodItem.name) == name.casefold()
    )
    if exclude_id is not None:
        statement = statement.where(FoodItem.id != exclude_id)
    return db.scalar(statement)


def _validate_menu_configuration(db, fields, item=None):
    role = fields.get("food_role", item.food_role if item else None)
    ids = fields.get("compatible_main_food_item_ids", item.compatible_main_food_item_ids if item else [])
    if item and item.food_role == FoodRole.MAIN_DISH and role != FoodRole.MAIN_DISH:
        references = db.scalars(select(FoodItem.compatible_main_food_item_ids).where(
            FoodItem.food_role == FoodRole.ACCOMPANIMENT,
        ))
        if any(item.id in targets for targets in references):
            raise MenuConfigurationError("Remove accompaniment references before changing this main dish's role")
    if ids:
        if role != FoodRole.ACCOMPANIMENT or (item and item.id in ids):
            raise MenuConfigurationError("Only accompaniments can reference other compatible main dishes")
        matches = list(db.scalars(select(FoodItem.id).where(
            FoodItem.id.in_(ids), FoodItem.food_role == FoodRole.MAIN_DISH,
        )))
        if len(matches) != len(ids):
            raise MenuConfigurationError("Compatible food IDs must refer to existing main dishes")


def create_food_item(db: Session, fields: FoodItemFields) -> FoodItem:
    name = str(fields["name"]).strip()
    try:
        if _find_food_item_by_name(db, name) is not None:
            raise FoodItemAlreadyExistsError
        _validate_menu_configuration(db, fields)
    except SQLAlchemyError:
        db.rollback()
        raise FoodItemPersistenceError from None

    normalized_fields = {**fields, "name": name}
    item = FoodItem(**normalized_fields)
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        try:
            if _find_food_item_by_name(db, name) is not None:
                raise FoodItemAlreadyExistsError from None
        except SQLAlchemyError:
            db.rollback()
            raise FoodItemPersistenceError from None
        raise FoodItemPersistenceError from None
    except SQLAlchemyError:
        db.rollback()
        raise FoodItemPersistenceError from None
    return item


def get_food_item(db: Session, food_item_id: int) -> FoodItem | None:
    return db.get(FoodItem, food_item_id)


def list_food_items(
    db: Session,
    *,
    search: str | None,
    category: str | None,
    is_vegetarian: bool | None,
    serving_unit: ServingUnit | None,
    limit: int,
    offset: int,
) -> tuple[list[FoodItem], int]:
    filters = []
    if search:
        filters.append(FoodItem.name.ilike(f"%{search}%"))
    if category:
        filters.append(
            func.lower(FoodItem.category) == category.strip().casefold()
        )
    if is_vegetarian is not None:
        filters.append(FoodItem.is_vegetarian == is_vegetarian)
    if serving_unit is not None:
        filters.append(FoodItem.serving_unit == serving_unit)

    total = db.scalar(
        select(func.count()).select_from(FoodItem).where(*filters)
    ) or 0
    statement = (
        select(FoodItem)
        .where(*filters)
        .order_by(FoodItem.name.asc(), FoodItem.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(statement).all()), total


def _has_historical_references(db: Session, food_item_id: int) -> bool:
    reference_models = (ForecastItem, MealRecordItem, WasteLog)
    return any(
        db.scalar(
            select(func.count())
            .select_from(model)
            .where(model.food_item_id == food_item_id)
        )
        > 0
        for model in reference_models
    )


def update_food_item(
    db: Session,
    food_item_id: int,
    fields: FoodItemFields,
) -> FoodItem | None:
    item = db.get(FoodItem, food_item_id)
    if item is None:
        return None

    if "name" in fields:
        normalized_name = str(fields["name"]).strip()
        try:
            existing = _find_food_item_by_name(
                db,
                normalized_name,
                exclude_id=food_item_id,
            )
        except SQLAlchemyError:
            db.rollback()
            raise FoodItemPersistenceError from None
        if existing is not None:
            raise FoodItemAlreadyExistsError
        fields = {**fields, "name": normalized_name}

    requested_unit = fields.get("serving_unit")
    if (
        requested_unit is not None
        and requested_unit != item.serving_unit
    ):
        try:
            has_history = _has_historical_references(db, food_item_id)
        except SQLAlchemyError:
            db.rollback()
            raise FoodItemPersistenceError from None
        if has_history:
            raise HistoricalServingUnitChangeError

    try:
        _validate_menu_configuration(db, fields, item)
    except SQLAlchemyError:
        db.rollback()
        raise FoodItemPersistenceError from None

    for field, value in fields.items():
        setattr(item, field, value)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        try:
            if "name" in fields and _find_food_item_by_name(
                db,
                str(fields["name"]),
                exclude_id=food_item_id,
            ) is not None:
                raise FoodItemAlreadyExistsError from None
        except SQLAlchemyError:
            db.rollback()
            raise FoodItemPersistenceError from None
        raise FoodItemPersistenceError from None
    except SQLAlchemyError:
        db.rollback()
        raise FoodItemPersistenceError from None
    return item
