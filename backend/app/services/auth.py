from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.models.enums import UserRole
from app.models.organization import Kitchen, NGO
from app.models.user import User


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class UserPersistenceError(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def register_user(
    db: Session,
    *,
    name: str,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    normalized_email = normalize_email(email)
    try:
        existing_user = db.scalar(
            select(User).where(User.email == normalized_email)
        )
    except SQLAlchemyError:
        db.rollback()
        raise UserPersistenceError from None
    if existing_user is not None:
        raise EmailAlreadyRegisteredError

    user = User(
        name=name.strip(),
        email=normalized_email,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        try:
            concurrent_user = db.scalar(
                select(User).where(User.email == normalized_email)
            )
        except SQLAlchemyError:
            raise UserPersistenceError from None
        if concurrent_user is not None:
            raise EmailAlreadyRegisteredError from None
        raise UserPersistenceError from None
    except SQLAlchemyError:
        db.rollback()
        raise UserPersistenceError from None

    db.refresh(user)
    return user


def authenticate_user(
    db: Session,
    *,
    email: str,
    password: str,
) -> tuple[User, str]:
    normalized_email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == normalized_email))
    if (
        user is None
        or not verify_password(password, user.password_hash)
        or not user.is_active
    ):
        raise InvalidCredentialsError

    return user, create_access_token(user.id, user.role)


def get_user_organization_id(db: Session, user: User) -> int | None:
    if user.role == UserRole.KITCHEN_STAFF:
        return db.scalar(
            select(Kitchen.id).where(Kitchen.manager_id == user.id)
        )
    if user.role == UserRole.NGO_MANAGER:
        return db.scalar(select(NGO.id).where(NGO.manager_id == user.id))
    return None
