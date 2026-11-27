from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.organization import Kitchen
from app.schemas.menu import MenuRequest, MenuResponse
from app.services.menu_optimizer import recommend_menu

router = APIRouter(prefix="/api/v1/menu", tags=["Menu Planning"])


@router.post("/recommend", response_model=MenuResponse)
def recommend(request: MenuRequest, kitchen: Kitchen = Depends(get_current_kitchen),
              db: Session = Depends(get_db)):
    return recommend_menu(db, kitchen.id, request)
