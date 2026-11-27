from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_verified_kitchen
from app.models.donation import Donation
from app.models.enums import DonationStatus, UserRole
from app.models.organization import Kitchen
from app.models.user import User
from app.schemas.redistribution import AssignmentRequest, OfferRequest, ReasonRequest, ReceiptRequest
from app.services import deliveries, donations
from app.services.ngo_requirements import now_utc

router = APIRouter(prefix="/api/v1/donations", tags=["Donations"])
NGO_ROLES = {UserRole.NGO_MANAGER}
PARTICIPANTS = {UserRole.KITCHEN_STAFF, UserRole.NGO_MANAGER}


@router.post("", status_code=201)
def create(request: OfferRequest, kitchen: Kitchen = Depends(require_verified_kitchen),
           db: Session = Depends(get_db)):
    return donations.create_offer(db, kitchen.id, request)


@router.get("")
def listing(status: DonationStatus | None = None, date_from: date | None = None,
            date_to: date | None = None, kitchen_id: int | None = None, ngo_id: int | None = None,
            limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
            user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must precede date_to")
    if (kitchen_id is not None or ngo_id is not None) and user.role != UserRole.ADMIN:
        raise HTTPException(403, "Organization filters require an administrator")
    query = select(Donation).where(*donations.scope_conditions(db, user))
    now = now_utc()
    expired = (Donation.status == DonationStatus.PENDING) & or_(Donation.expires_at.is_(None), Donation.expires_at <= now)
    if status == DonationStatus.CANCELLED:
        query = query.where(or_(Donation.status == status, expired))
    elif status == DonationStatus.PENDING:
        query = query.where(Donation.status == status, Donation.expires_at > now)
    elif status is not None:
        query = query.where(Donation.status == status)
    for column, value in ((Donation.kitchen_id, kitchen_id), (Donation.ngo_id, ngo_id)):
        if value is not None:
            query = query.where(column == value)
    if date_from:
        query = query.where(Donation.created_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        query = query.where(Donation.created_at <= datetime.combine(date_to, time.max, timezone.utc))
    return [donations.describe_donation(db, row, now)
            for row in db.scalars(query.order_by(Donation.id.desc()).offset(offset).limit(limit))]


@router.get("/{donation_id}")
def detail(donation_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return donations.describe_donation(db, donations.owned_donation(db, user, donation_id))


@router.post("/{donation_id}/accept")
def accept(donation_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return donations.accept(db, donations.writable(db, user, donation_id, NGO_ROLES))


@router.post("/{donation_id}/reject")
def reject(donation_id: int, request: ReasonRequest, user: User = Depends(get_current_active_user),
           db: Session = Depends(get_db)):
    return donations.reject(db, donations.writable(db, user, donation_id, NGO_ROLES), request.reason)


@router.post("/{donation_id}/cancel")
def cancel(donation_id: int, request: ReasonRequest, user: User = Depends(get_current_active_user),
           db: Session = Depends(get_db)):
    return donations.cancel(db, donations.writable(db, user, donation_id, PARTICIPANTS), request.reason)


@router.post("/{donation_id}/assign-delivery")
@router.post("/{donation_id}/assign")
def assign(donation_id: int, request: AssignmentRequest, user: User = Depends(get_current_active_user),
           db: Session = Depends(get_db)):
    return deliveries.assign(db, donations.writable(db, user, donation_id, deliveries.KITCHEN), request)


@router.post("/{donation_id}/dispatch")
def dispatch(donation_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return deliveries.dispatch(db, donations.writable(db, user, donation_id, deliveries.KITCHEN))


@router.post("/{donation_id}/delivered")
def delivered(donation_id: int, user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    return deliveries.mark_delivered(db, donations.writable(db, user, donation_id, deliveries.KITCHEN))


@router.post("/{donation_id}/confirm-receipt")
@router.post("/{donation_id}/confirm")
def receipt(donation_id: int, request: ReceiptRequest, user: User = Depends(get_current_active_user),
            db: Session = Depends(get_db)):
    return deliveries.confirm_receipt(db, donations.writable(db, user, donation_id, NGO_ROLES), request)


@router.post("/{donation_id}/report-failure")
def failure(donation_id: int, request: ReasonRequest, user: User = Depends(get_current_active_user),
            db: Session = Depends(get_db)):
    return deliveries.fail(db, donations.writable(db, user, donation_id, PARTICIPANTS), request.reason)
