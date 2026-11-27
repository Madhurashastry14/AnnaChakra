import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.enums import SafetyStatus, WasteType
from app.models.food import FoodItem
from app.models.organization import Kitchen
from app.models.waste import WasteLog
from app.schemas.waste import SafetyCheck, SafetyResponse, WastePatch, WasteRequest, WasteResponse
from app.services.waste import owned_waste, patch_waste, save_waste, waste_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/waste-logs", tags=["Waste Logs"])


def write(db, action, *args):
    try:
        return action(db, *args)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Waste log transaction failed (%s)", type(exc).__name__)
        raise HTTPException(500, "Unable to save waste log") from exc


@router.post("", status_code=201, response_model=WasteResponse)
def create(request: WasteRequest, kitchen: Kitchen = Depends(get_current_kitchen), db: Session = Depends(get_db)):
    return write(db, save_waste, kitchen, request)


@router.get("", response_model=list[WasteResponse])
def listing(waste_type: WasteType | None = None, safety_status: SafetyStatus | None = None,
            food_item_id: int | None = Query(default=None, gt=0),
            created_from: AwareDatetime | None = None, created_to: AwareDatetime | None = None,
            limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
            kitchen: Kitchen = Depends(get_current_kitchen), db: Session = Depends(get_db)):
    if created_from is not None and created_to is not None and created_from > created_to:
        raise HTTPException(400, "created_from must precede created_to")
    query = (select(WasteLog, FoodItem).join(FoodItem, FoodItem.id == WasteLog.food_item_id)
             .where(WasteLog.kitchen_id == kitchen.id).order_by(WasteLog.created_at.desc(), WasteLog.id.desc()))
    for column, value in ((WasteLog.waste_type, waste_type), (WasteLog.food_item_id, food_item_id)):
        if value is not None:
            query = query.where(column == value)
    if created_from is not None:
        query = query.where(WasteLog.created_at >= created_from)
    if created_to is not None:
        query = query.where(WasteLog.created_at <= created_to)
    if safety_status is None:
        return [waste_response(db, row, kitchen, food) for row, food in db.execute(query.offset(offset).limit(limit))]
    matches = []
    skipped = 0
    for row, food in db.execute(query.execution_options(yield_per=100)):
        result = waste_response(db, row, kitchen, food)
        if result.safety_status == safety_status:
            if skipped < offset:
                skipped += 1
                continue
            matches.append(result)
            if len(matches) == limit:
                break
    return matches


@router.get("/{waste_id}", response_model=WasteResponse)
def detail(waste_id: int, kitchen: Kitchen = Depends(get_current_kitchen), db: Session = Depends(get_db)):
    return waste_response(db, owned_waste(db, kitchen.id, waste_id), kitchen)


def _update_owned(db, kitchen, waste_id, request):
    current = owned_waste(db, kitchen.id, waste_id, lock=True)
    return patch_waste(db, kitchen, current, request)


@router.patch("/{waste_id}", response_model=WasteResponse)
def update(waste_id: int, request: WastePatch, kitchen: Kitchen = Depends(get_current_kitchen),
           db: Session = Depends(get_db)):
    return write(db, _update_owned, kitchen, waste_id, request)


@router.post("/{waste_id}/safety-check", response_model=SafetyResponse)
def safety_check(waste_id: int, request: SafetyCheck, kitchen: Kitchen = Depends(get_current_kitchen),
                 db: Session = Depends(get_db)):
    result = write(db, _update_owned, kitchen, waste_id, request)
    return SafetyResponse(waste_log_id=result.id, safety_status=result.safety_status,
                          reasons=result.safety_notes, safe_until=result.safe_until,
                          screened_at=result.screened_at, safety_policy_version=result.safety_policy_version)
