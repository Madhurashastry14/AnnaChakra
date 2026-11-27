from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.donation import Delivery
from app.models.user import User
from app.services import deliveries
from app.services.donations import describe_delivery

router = APIRouter(prefix="/api/v1/deliveries", tags=["Deliveries"])


@router.get("")
def listing(user: User = Depends(get_current_active_user), db: Session = Depends(get_db),
            limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    query = deliveries.scoped_deliveries(db, user).order_by(Delivery.id.desc()).offset(offset).limit(limit)
    return [describe_delivery(db, row) for row in db.scalars(query)]


@router.get("/{delivery_id}")
def detail(delivery_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return describe_delivery(db, deliveries.owned_delivery(db, user, delivery_id))


@router.post("/{delivery_id}/dispatch")
def dispatch(delivery_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return deliveries.delivery_action(db, user, delivery_id, deliveries.dispatch)


@router.post("/{delivery_id}/mark-delivered")
def delivered(delivery_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return deliveries.delivery_action(db, user, delivery_id, deliveries.mark_delivered)
