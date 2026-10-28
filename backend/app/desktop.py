"""Run GURUJI BOX as a self-contained offline desktop service.

The Electron shell launches this entry point on loopback. It prepares the
local database with Alembic, seeds the bundled curriculum, and serves the
built SPA and API from a single origin so the desktop app needs no network.
"""

from __future__ import annotations

import argparse
import logging
import os
import secrets
import sys
import threading
import time
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8765


def resource_root() -> Path:
    bundled = getattr(sys, "_MEIPASS", None)
    if bundled:
        return Path(bundled)
    return Path(__file__).resolve().parents[1]


def default_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if base:
        return Path(base) / "GurujiBox"
    return Path.home() / ".guruji-box"


def load_secret(data_dir: Path) -> str:
    supplied = os.environ.get("GURUJI_SECRET", "").strip()
    if supplied:
        return supplied
    key_file = data_dir / "secret.key"
    if key_file.is_file():
        value = key_file.read_text(encoding="utf-8").strip()
        if len(value) >= 32:
            return value
    value = secrets.token_hex(32)
    key_file.write_text(value, encoding="utf-8")
    return value


def configure_environment(data_dir: Path, port: int) -> None:
    root = resource_root()
    data_dir.mkdir(parents=True, exist_ok=True)
    database = data_dir / "guruji.db"
    static_dir = root / "frontend_dist"
    if not static_dir.is_dir():
        static_dir = root.parent / "frontend" / "dist"
    content_dir = root / "data"
    if not content_dir.is_dir():
        content_dir = root.parent / "data"

    os.environ.update(
        {
            "APP_ENV": "production",
            "APP_VERSION": os.environ.get("APP_VERSION", "2.0.0"),
            "DATABASE_URL": f"sqlite:///{database.as_posix()}",
            "SECRET_KEY": load_secret(data_dir),
            "SECURE_COOKIES": "false",
            "FRONTEND_ORIGIN": f"http://{HOST}:{port}",
            "EXTRA_ORIGINS": "",
            "ALLOWED_HOSTS": "127.0.0.1,localhost",
            "SEED_DEMO": "false",
            "ALLOW_TEACHER_SIGNUP": "true",
            "GEMINI_API_KEY": "",
            "DOCS_ENABLED": "false",
            "CONTENT_DIR": str(content_dir),
            "STATIC_DIR": str(static_dir),
            "LOG_LEVEL": "INFO",
        }
    )


def prepare_database() -> None:
    from alembic import command
    from alembic.config import Config

    root = resource_root()
    migrations = root / "alembic"
    if not migrations.is_dir():
        raise SystemExit(f"Bundled migrations are missing at {migrations}")

    config = Config()
    config.set_main_option("script_location", str(migrations))
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"].replace("%", "%%"))
    command.upgrade(config, "head")

    from .seed import run as seed_run

    seed_run(with_demo=False)


def watch_parent(parent_pid: int) -> None:
    if os.name == "nt":
        import ctypes

        synchronize = 0x00100000
        handle = ctypes.windll.kernel32.OpenProcess(synchronize, False, parent_pid)
        if not handle:
            os._exit(0)
        while ctypes.windll.kernel32.WaitForSingleObject(handle, 1000) != 0:
            pass
        os._exit(0)

    while os.getppid() == parent_pid:
        time.sleep(0.5)
    os._exit(0)


def run(port: int, parent_pid: int | None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    from .main import app

    if parent_pid:
        threading.Thread(target=watch_parent, args=(parent_pid,), daemon=True).start()

    import uvicorn

    uvicorn.run(
        app,
        host=HOST,
        port=port,
        log_level="info",
        access_log=False,
        timeout_graceful_shutdown=3,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="GURUJI BOX offline desktop service")
    parser.add_argument("--port", type=int, default=int(os.environ.get("GURUJI_PORT", DEFAULT_PORT)))
    parser.add_argument("--data-dir", default=os.environ.get("GURUJI_DATA_DIR", ""))
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Prepare the database and exit without serving",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else default_data_dir()
    configure_environment(data_dir, args.port)
    prepare_database()

    if args.self_test:
        print(f"desktop self-test ok data_dir={data_dir} port={args.port}")
        return

    run(args.port, args.parent_pid or None)


if __name__ == "__main__":
    main()
