from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_active_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthenticatedUserResponse,
    TokenResponse,
    UserLoginRequest,
    UserRegistrationRequest,
)
from app.services.auth import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    UserPersistenceError,
    authenticate_user,
    get_user_organization_id,
    register_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _public_user_response(db: Session, user: User) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse.model_validate(user).model_copy(
        update={"organization_id": get_user_organization_id(db, user)}
    )


@router.post(
    "/register",
    response_model=AuthenticatedUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    registration: UserRegistrationRequest,
    db: Session = Depends(get_db),
) -> AuthenticatedUserResponse:
    try:
        user = register_user(
            db,
            name=registration.name,
            email=str(registration.email),
            password=registration.password,
            role=registration.role,
        )
    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None
    except UserPersistenceError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to register user",
        ) from None

    return _public_user_response(db, user)


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: UserLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    try:
        user, access_token = authenticate_user(
            db,
            email=str(credentials.email),
            password=credentials.password,
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    return TokenResponse(
        access_token=access_token,
        user=_public_user_response(db, user),
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
def read_current_user(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> AuthenticatedUserResponse:
    return _public_user_response(db, current_user)
