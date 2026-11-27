from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.models.enums import ServingUnit
from app.models.forecast import ForecastItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.waste import WasteLog
from app.schemas.meal_record import MealDishResponse, MealRecordRequest, MealRecordResponse
from app.services.forecast_records import menu_items, owned_forecast


def owned_meal(db, kitchen_id, record_id, *, lock=False):
    statement = select(MealRecord).where(MealRecord.kitchen_id == kitchen_id, MealRecord.id == record_id)
    record = db.scalar(statement.with_for_update() if lock else statement)
    if record is None:
        raise HTTPException(404, "Meal record not found")
    return record


def _items(db, record):
    return list(db.scalars(select(MealRecordItem).where(
        MealRecordItem.meal_record_id == record.id,
    ).order_by(MealRecordItem.id)))


def meal_response(db, record):
    return MealRecordResponse(
        id=record.id, created_at=record.created_at, forecast_id=record.forecast_id,
        meal_date=record.meal_date, meal_type=record.meal_type, actual_people=record.actual_people,
        items=[MealDishResponse.model_validate(item) for item in _items(db, record)],
    )


def _validate(db, kitchen_id, request):
    if request.meal_date > date.today():
        raise HTTPException(422, "Meal records require a completed meal date")
    foods = menu_items(db, [item.food_item_id for item in request.items])
    for item in request.items:
        if foods[item.food_item_id].serving_unit == ServingUnit.PIECE and any(
            value is not None and not value.is_integer()
            for value in (item.prepared_servings, item.leftover_servings, item.plate_waste_servings)
        ):
            raise HTTPException(422, "Piece-based food items require whole-number quantities")
    if request.forecast_id is not None:
        forecast = owned_forecast(db, kitchen_id, request.forecast_id)
        forecast_menu = set(db.scalars(select(ForecastItem.food_item_id).where(
            ForecastItem.forecast_id == forecast.id,
        )))
        if (request.meal_date, request.meal_type, set(foods)) != (
            forecast.meal_date, forecast.meal_type, forecast_menu,
        ):
            raise HTTPException(422, "Meal date, type and menu must match the linked forecast")


def _stored_values(request_item):
    values = request_item.model_dump(exclude={"food_item_id"})
    waste = values["plate_waste_servings"]
    if waste is not None:
        values["plate_waste_servings"] = min(waste, request_item.prepared_servings - request_item.leftover_servings)
    return values


def save_meal(db, kitchen_id, request, record=None):
    _validate(db, kitchen_id, request)
    values = request.model_dump(exclude={"items"})
    old_items = {} if record is None else {item.food_item_id: item for item in _items(db, record)}
    incoming = {item.food_item_id: _stored_values(item) for item in request.items}
    if record is None:
        record = MealRecord(kitchen_id=kitchen_id, **values)
        db.add(record)
        db.flush()
    else:
        meal_changed = any(values[field] != getattr(record, field)
                           for field in ("meal_date", "meal_type"))
        protected = [
            item.id for food_id, item in old_items.items()
            if meal_changed or food_id not in incoming or any(
                getattr(item, field) != value for field, value in incoming[food_id].items()
            )
        ]
        if protected and db.scalar(select(WasteLog.id).where(
            WasteLog.meal_record_item_id.in_(protected),
        ).limit(1)) is not None:
            raise HTTPException(409, "Changes conflict with linked waste or donation records")
        for field, value in values.items():
            setattr(record, field, value)
    for food_id, item in old_items.items():
        if food_id not in incoming:
            db.delete(item)
    for food_id, item_values in incoming.items():
        item = old_items.get(food_id)
        if item is None:
            db.add(MealRecordItem(meal_record_id=record.id, food_item_id=food_id, **item_values))
        else:
            for field, value in item_values.items():
                setattr(item, field, value)
    db.flush()
    response = meal_response(db, record)
    db.commit()
    return response


def patch_meal(db, kitchen_id, record, patch):
    original = meal_response(db, record)
    values = original.model_dump(exclude={"id", "created_at"})
    values["items"] = [item.model_dump(exclude={"id", "served_servings", "consumed_servings"})
                       for item in original.items]
    try:
        request = MealRecordRequest.model_validate(values | patch.model_dump(exclude_unset=True))
    except ValidationError as exc:
        raise HTTPException(422, "Invalid meal record update") from exc
    return save_meal(db, kitchen_id, request, record)
