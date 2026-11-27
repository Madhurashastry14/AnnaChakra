from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.forecast import Forecast
from app.models.organization import Kitchen
from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.services.forecast_records import create_forecast, get_forecast_response, owned_forecast

router = APIRouter(prefix="/api/v1/forecasts", tags=["Forecasts"])


@router.post("", status_code=201, response_model=ForecastResponse)
def create(request: ForecastRequest, kitchen: Kitchen = Depends(get_current_kitchen),
           db: Session = Depends(get_db)):
    try:
        return create_forecast(db, kitchen.id, request)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, "Unable to save forecast") from exc


@router.get("", response_model=list[ForecastResponse])
def list_forecasts(meal_date: date | None = None, kitchen: Kitchen = Depends(get_current_kitchen),
                   db: Session = Depends(get_db)):
    statement = select(Forecast).where(Forecast.kitchen_id == kitchen.id)
    if meal_date is not None:
        statement = statement.where(Forecast.meal_date == meal_date)
    return [get_forecast_response(db, forecast)
            for forecast in db.scalars(statement.order_by(Forecast.meal_date.desc(), Forecast.id.desc()))]


@router.get("/{forecast_id}", response_model=ForecastResponse)
def forecast_detail(forecast_id: int, kitchen: Kitchen = Depends(get_current_kitchen),
                    db: Session = Depends(get_db)):
    return get_forecast_response(db, owned_forecast(db, kitchen.id, forecast_id))
