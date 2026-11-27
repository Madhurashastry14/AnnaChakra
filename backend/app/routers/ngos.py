from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_ngo, require_roles
from app.models.enums import UserRole
from app.models.organization import NGO
from app.models.user import User
from app.schemas.organization import NGOCreateRequest, NGOResponse, NGOUpdateRequest
from app.services.organization import (
    OrganizationAlreadyRegisteredError,
    OrganizationPersistenceError,
    create_ngo,
    update_organization,
)

router = APIRouter(prefix="/api/v1/ngos", tags=["NGOs"])


@router.post(
    "",
    response_model=NGOResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_ngo(
    registration: NGOCreateRequest,
    current_user: User = Depends(require_roles(UserRole.NGO_MANAGER)),
    db: Session = Depends(get_db),
) -> NGOResponse:
    try:
        ngo = create_ngo(
            db,
            current_user.id,
            registration.model_dump(),
        )
    except OrganizationAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="NGO already registered",
        ) from None
    except OrganizationPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to register NGO",
        ) from None
    return NGOResponse.model_validate(ngo)


@router.get("/me", response_model=NGOResponse)
def read_my_ngo(
    ngo: NGO = Depends(get_current_ngo),
) -> NGOResponse:
    return NGOResponse.model_validate(ngo)


@router.patch("/me", response_model=NGOResponse)
def update_my_ngo(
    changes: NGOUpdateRequest,
    ngo: NGO = Depends(get_current_ngo),
    db: Session = Depends(get_db),
) -> NGOResponse:
    try:
        updated_ngo = update_organization(
            db,
            ngo,
            changes.model_dump(exclude_unset=True),
        )
    except OrganizationPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update NGO",
        ) from None
    return NGOResponse.model_validate(updated_ngo)
