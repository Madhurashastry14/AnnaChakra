from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.organization import Kitchen
from app.schemas.delivery_personnel import (
    DeliveryPersonnelCreateRequest,
    DeliveryPersonnelListResponse,
    DeliveryPersonnelResponse,
    DeliveryPersonnelUpdateRequest,
)
from app.services.delivery_personnel import (
    DeliveryPersonnelPersistenceError,
    create_delivery_personnel,
    deactivate_delivery_personnel,
    get_delivery_personnel,
    list_delivery_personnel,
    update_delivery_personnel,
)

router = APIRouter(
    prefix="/api/v1/delivery-personnel",
    tags=["Delivery Personnel"],
)


@router.post(
    "",
    response_model=DeliveryPersonnelResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_personnel(
    registration: DeliveryPersonnelCreateRequest,
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> DeliveryPersonnelResponse:
    try:
        person = create_delivery_personnel(
            db,
            kitchen_id=kitchen.id,
            name=registration.name,
            phone=registration.phone,
        )
    except DeliveryPersonnelPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create delivery personnel",
        ) from None
    return DeliveryPersonnelResponse.model_validate(person)


@router.get("", response_model=DeliveryPersonnelListResponse)
def list_personnel(
    is_active: bool | None = Query(default=True),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> DeliveryPersonnelListResponse:
    items, total = list_delivery_personnel(
        db,
        kitchen_id=kitchen.id,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )
    return DeliveryPersonnelListResponse(items=items, total=total)


@router.get("/{person_id}", response_model=DeliveryPersonnelResponse)
def read_personnel(
    person_id: int,
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> DeliveryPersonnelResponse:
    person = get_delivery_personnel(
        db,
        kitchen_id=kitchen.id,
        person_id=person_id,
    )
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery personnel not found",
        )
    return DeliveryPersonnelResponse.model_validate(person)


@router.patch("/{person_id}", response_model=DeliveryPersonnelResponse)
def update_personnel(
    person_id: int,
    changes: DeliveryPersonnelUpdateRequest,
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> DeliveryPersonnelResponse:
    try:
        person = update_delivery_personnel(
            db,
            kitchen_id=kitchen.id,
            person_id=person_id,
            fields=changes.model_dump(exclude_unset=True),
        )
    except DeliveryPersonnelPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update delivery personnel",
        ) from None
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery personnel not found",
        )
    return DeliveryPersonnelResponse.model_validate(person)


@router.delete(
    "/{person_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_personnel(
    person_id: int,
    kitchen: Kitchen = Depends(get_current_kitchen),
    db: Session = Depends(get_db),
) -> Response:
    try:
        deleted = deactivate_delivery_personnel(
            db,
            kitchen_id=kitchen.id,
            person_id=person_id,
        )
    except DeliveryPersonnelPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to deactivate delivery personnel",
        ) from None
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery personnel not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
