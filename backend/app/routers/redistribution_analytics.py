from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.services.redistribution_analytics import report

router = APIRouter(prefix="/api/v1/analytics", tags=["Redistribution Analytics"])
SECTIONS = {
    "redistribution-summary": "summary", "redistribution-trends": "trends",
    "donation-status-summary": "statuses", "ngo-impact": "ngos",
}


def analytics(dataview: str, date_from: date | None = None, date_to: date | None = None,
              granularity: Literal["daily", "weekly"] = "daily", simulated: bool | None = None,
              user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "date_from must precede date_to")
    return report(db, user, date_from, date_to, simulated, granularity == "weekly")[SECTIONS[dataview]]


def register_view(path):
    def view(date_from: date | None = None, date_to: date | None = None,
             granularity: Literal["daily", "weekly"] = "daily", simulated: bool | None = None,
             user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
        return analytics(path, date_from, date_to, granularity, simulated, user, db)
    router.add_api_route(f"/{path}", view, methods=["GET"], name=path)


for path in SECTIONS:
    register_view(path)
