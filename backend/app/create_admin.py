"""Create or promote an administrator.

Usage:
    cd backend && python -m app.create_admin --email admin@example.org --name "School Admin"
    ADMIN_PASSWORD='...' python -m app.create_admin --email admin@example.org --name "Admin"
"""

from __future__ import annotations

import argparse
import getpass
import os

from sqlalchemy import select

from .core.security import hash_password, validate_password_strength
from .database import SessionLocal
from .models import Role, User


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or promote a GURUJI BOX administrator")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD"))
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass("Password (at least 10 characters): ")
        confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            raise SystemExit("Passwords do not match.")
    try:
        validate_password_strength(password)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    db = SessionLocal()
    try:
        email = args.email.strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role = Role.ADMIN
            user.is_active = True
            if password:
                user.password_hash = hash_password(password)
                user.token_version += 1
            print(f"Promoted existing account {email} to administrator.")
        else:
            user = User(
                display_name=args.name.strip() or "Administrator",
                email=email,
                password_hash=hash_password(password),
                role=Role.ADMIN,
            )
            db.add(user)
            print(f"Created administrator {email}.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
