from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.enums import MealType, MenuMode
from app.models.organization import Kitchen
from app.schemas.analytics import WasteMetrics, WasteTrend
from app.services.waste_analytics import group_history, history_rows, metrics

router = APIRouter(prefix="/api/v1/analytics", tags=["Kitchen Analytics"])


def filters(start_date: date | None = None, end_date: date | None = None,
            meal_type: MealType | None = None, menu_mode: MenuMode | None = None,
            food_item_id: int | None = Query(default=None, gt=0)):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must precede end_date")
    return dict(start_date=start_date, end_date=end_date, meal_type=meal_type,
                menu_mode=menu_mode, food_item_id=food_item_id)


@router.get("/waste-summary", response_model=list[WasteMetrics])
@router.get("/food-acceptance", response_model=list[WasteMetrics])
def summary(query: dict = Depends(filters), kitchen: Kitchen = Depends(get_current_kitchen),
            db: Session = Depends(get_db)):
    return [metrics(group) for group in group_history(history_rows(db, kitchen.id, **query)).values()]


@router.get("/waste-trends", response_model=list[WasteTrend])
def trends(query: dict = Depends(filters), kitchen: Kitchen = Depends(get_current_kitchen),
           db: Session = Depends(get_db)):
    groups = group_history(history_rows(db, kitchen.id, **query), daily=True)
    return [WasteTrend(date=key[0], **metrics(group).model_dump()) for key, group in groups.items()]
