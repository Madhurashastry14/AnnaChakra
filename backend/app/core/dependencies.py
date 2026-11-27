from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.enums import UserRole, VerificationStatus
from app.models.organization import Kitchen, NGO
from app.models.user import User
from app.services.organization import (
    find_kitchen_for_manager,
    find_ngo_for_manager,
)

_bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        claims = decode_access_token(credentials.credentials)
        user_id = int(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise _unauthorized() from None

    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    if not roles:
        raise ValueError("At least one role must be specified")

    def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


def get_current_kitchen(
    current_user: User = Depends(require_roles(UserRole.KITCHEN_STAFF)),
    db: Session = Depends(get_db),
) -> Kitchen:
    kitchen = find_kitchen_for_manager(db, current_user.id)
    if kitchen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen not found",
        )
    return kitchen


def get_current_ngo(
    current_user: User = Depends(require_roles(UserRole.NGO_MANAGER)),
    db: Session = Depends(get_db),
) -> NGO:
    ngo = find_ngo_for_manager(db, current_user.id)
    if ngo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="NGO not found",
        )
    return ngo


def require_verified_kitchen(
    kitchen: Kitchen = Depends(get_current_kitchen),
) -> Kitchen:
    if kitchen.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kitchen must be verified",
        )
    return kitchen


def require_verified_ngo(
    ngo: NGO = Depends(get_current_ngo),
) -> NGO:
    if ngo.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="NGO must be verified",
        )
    return ngo
