from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.meal_record import MealRecord
from app.models.organization import Kitchen
from app.schemas.meal_record import MealRecordPatch, MealRecordRequest, MealRecordResponse
from app.services.meal_records import meal_response, owned_meal, patch_meal, save_meal

router = APIRouter(prefix="/api/v1/meal-records", tags=["Meal Records"])


def _write(db, operation, *args):
    try:
        return operation(db, *args)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Meal record conflicts with existing records") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, "Unable to save meal record") from exc


@router.post("", status_code=201, response_model=MealRecordResponse)
def create(request: MealRecordRequest, kitchen: Kitchen = Depends(get_current_kitchen),
           db: Session = Depends(get_db)):
    return _write(db, save_meal, kitchen.id, request)


@router.get("", response_model=list[MealRecordResponse])
def list_meals(kitchen: Kitchen = Depends(get_current_kitchen), db: Session = Depends(get_db)):
    statement = select(MealRecord).where(MealRecord.kitchen_id == kitchen.id).order_by(
        MealRecord.meal_date.desc(), MealRecord.id.desc(),
    )
    return [meal_response(db, record) for record in db.scalars(statement)]


@router.get("/{record_id}", response_model=MealRecordResponse)
def meal_detail(record_id: int, kitchen: Kitchen = Depends(get_current_kitchen),
                db: Session = Depends(get_db)):
    return meal_response(db, owned_meal(db, kitchen.id, record_id))


@router.patch("/{record_id}", response_model=MealRecordResponse)
def update(record_id: int, request: MealRecordPatch, kitchen: Kitchen = Depends(get_current_kitchen),
           db: Session = Depends(get_db)):
    record = owned_meal(db, kitchen.id, record_id, lock=True)
    return _write(db, patch_meal, kitchen.id, record, request)
