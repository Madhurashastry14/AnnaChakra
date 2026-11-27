from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen, require_roles
from app.models.enums import UserRole
from app.models.organization import Kitchen
from app.models.user import User
from app.schemas.organization import KitchenCreateRequest, KitchenResponse, KitchenUpdateRequest
from app.services.organization import (
    OrganizationAlreadyRegisteredError,
    OrganizationPersistenceError,
    create_kitchen,
    update_organization,
)

router = APIRouter(prefix="/api/v1/kitchens", tags=["Kitchens"])


@router.post(
    "",
    response_model=KitchenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_kitchen(
    registration: KitchenCreateRequest,
    current_user: User = Depends(require_roles(UserRole.KITCHEN_STAFF)),
    db: Session = Depends(get_db),
) -> KitchenResponse:
    try:
        kitchen = create_kitchen(
            db,
            current_user.id,
            registration.model_dump(),
        )
    except OrganizationAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Kitchen already registered",
        ) from None
    except OrganizationPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to register kitchen",
        ) from None
    return KitchenResponse.model_validate(kitchen)


@router.get("/me", response_model=KitchenResponse)
def read_my_kitchen(
    kitchen: Kitchen = Depends(get_current_kitchen),
) -> KitchenResponse:
    return KitchenResponse.model_validate(kitchen)


@router.patch("/me", response_model=KitchenResponse)
def update_my_kitchen(
    changes: KitchenUpdateRequest,
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> KitchenResponse:
    try:
        updated_kitchen = update_organization(
            db,
            kitchen,
            changes.model_dump(exclude_unset=True),
        )
    except OrganizationPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update kitchen",
        ) from None
    return KitchenResponse.model_validate(updated_kitchen)
