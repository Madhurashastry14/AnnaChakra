from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_verified_kitchen
from app.models.organization import Kitchen
from app.schemas.redistribution import MatchRequest
from app.services.matching import match_ngos

router = APIRouter(prefix="/api/v1/matches", tags=["NGO Matching"])


@router.post("")
def create(request: MatchRequest, kitchen: Kitchen = Depends(require_verified_kitchen),
           db: Session = Depends(get_db)):
    return match_ngos(db, kitchen, request)
