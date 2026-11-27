import argparse
import getpass
import os
import sys
from pathlib import Path
from typing import Sequence

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.user import User
from app.services.auth import normalize_email


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an AnnaChakra admin.")
    parser.add_argument("--name", default=os.getenv("ADMIN_NAME"))
    parser.add_argument("--email", default=os.getenv("ADMIN_EMAIL"))
    args = parser.parse_args(argv)

    if not args.name or not args.name.strip():
        parser.error("Provide --name or set ADMIN_NAME.")
    if len(args.name.strip()) > 150:
        parser.error("Admin name must be at most 150 characters.")
    if not args.email:
        parser.error("Provide --email or set ADMIN_EMAIL.")

    try:
        args.email = normalize_email(
            str(TypeAdapter(EmailStr).validate_python(args.email))
        )
    except ValidationError:
        parser.error("Admin email must be a valid email address.")

    args.name = args.name.strip()
    return args


def _read_password() -> str:
    password = os.getenv("ADMIN_PASSWORD")
    if password is None:
        password = getpass.getpass("Admin password: ")
        confirmation = getpass.getpass("Confirm admin password: ")
        if password != confirmation:
            raise ValueError("Passwords do not match.")

    if len(password) < 8 or len(password) > 128:
        raise ValueError("Admin password must be between 8 and 128 characters.")
    return password


def _existing_admin_status(db: Session, email: str) -> int | None:
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user is None:
        return None
    if existing_user.role == UserRole.ADMIN:
        print("Admin account already exists; no changes made.")
        return 0
    print(
        "An account with this email already exists and is not an admin.",
        file=sys.stderr,
    )
    return 1


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)

    try:
        with SessionLocal() as db:
            existing_status = _existing_admin_status(db, args.email)
        if existing_status is not None:
            return existing_status

        password = _read_password()
        with SessionLocal() as db:
            existing_status = _existing_admin_status(db, args.email)
            if existing_status is not None:
                return existing_status

            db.add(
                User(
                    name=args.name,
                    email=args.email,
                    password_hash=hash_password(password),
                    role=UserRole.ADMIN,
                )
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                existing_status = _existing_admin_status(db, args.email)
                if existing_status is not None:
                    return existing_status
                raise
            except SQLAlchemyError:
                db.rollback()
                raise

        print(f"Admin account created for {args.email}.")
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except SQLAlchemyError as exc:
        print(
            f"Failed to create admin account ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
