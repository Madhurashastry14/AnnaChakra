from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.models.enums import UserRole, VerificationStatus
from app.models.organization import Kitchen, NGO
from app.schemas.organization import (
    KitchenListResponse,
    KitchenResponse,
    NGOListResponse,
    NGOResponse,
    VerificationUpdateRequest,
)
from app.services.organization import (
    OrganizationPersistenceError,
    get_kitchen,
    get_ngo,
    list_organizations,
    set_verification_status,
)

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)


@router.get("/kitchens", response_model=KitchenListResponse)
def list_kitchens(
    verification_status: VerificationStatus | None = None,
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> KitchenListResponse:
    kitchens, total = list_organizations(
        db,
        Kitchen,
        verification_status=verification_status,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
    )
    return KitchenListResponse(items=kitchens, total=total)


@router.get("/ngos", response_model=NGOListResponse)
def list_ngos(
    verification_status: VerificationStatus | None = None,
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> NGOListResponse:
    ngos, total = list_organizations(
        db,
        NGO,
        verification_status=verification_status,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
    )
    return NGOListResponse(items=ngos, total=total)


def _not_found(kind: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{kind} not found",
    )


def _verification_error(kind: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unable to update {kind} verification",
    )


@router.patch("/kitchens/{kitchen_id}/verification", include_in_schema=False)
@router.patch("/kitchens/{kitchen_id}/verify", response_model=KitchenResponse)
def verify_kitchen(
    kitchen_id: int,
    update: VerificationUpdateRequest,
    db: Session = Depends(get_db),
) -> KitchenResponse:
    kitchen = get_kitchen(db, kitchen_id)
    if kitchen is None:
        raise _not_found("Kitchen")
    try:
        kitchen = set_verification_status(
            db,
            kitchen,
            update.verification_status,
        )
    except OrganizationPersistenceError:
        raise _verification_error("kitchen") from None
    return KitchenResponse.model_validate(kitchen)


@router.patch("/ngos/{ngo_id}/verification", include_in_schema=False)
@router.patch("/ngos/{ngo_id}/verify", response_model=NGOResponse)
def verify_ngo(
    ngo_id: int,
    update: VerificationUpdateRequest,
    db: Session = Depends(get_db),
) -> NGOResponse:
    ngo = get_ngo(db, ngo_id)
    if ngo is None:
        raise _not_found("NGO")
    try:
        ngo = set_verification_status(
            db,
            ngo,
            update.verification_status,
        )
    except OrganizationPersistenceError:
        raise _verification_error("NGO") from None
    return NGOResponse.model_validate(ngo)
