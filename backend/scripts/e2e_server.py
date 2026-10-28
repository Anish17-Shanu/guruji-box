"""Start a disposable backend for Playwright end-to-end tests.

Creates a fresh SQLite database, seeds curriculum and demo accounts, then
serves the API on a dedicated port so a local development server can keep
running.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))
Path("e2e.db").unlink(missing_ok=True)

backend_port = os.environ.get("E2E_BACKEND_PORT", "8010")
frontend_port = os.environ.get("E2E_FRONTEND_PORT", "4180")

os.environ.update(
    {
        "APP_ENV": "development",
        "DATABASE_URL": "sqlite:///./e2e.db",
        "SECRET_KEY": "e2e-secret-key-0123456789-abcdefghijklmnop",
        "FRONTEND_ORIGIN": f"http://127.0.0.1:{frontend_port}",
        "GEMINI_API_KEY": "",
        "SEED_DEMO": "true",
        "LOG_LEVEL": "WARNING",
        "RATE_LIMIT_AUTH_PER_MINUTE": "10000",
        "RATE_LIMIT_TUTOR_PER_MINUTE": "10000",
        "RATE_LIMIT_DEFAULT_PER_MINUTE": "10000",
    }
)

subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
subprocess.run([sys.executable, "-m", "app.seed"], check=True)


def watch_parent(parent_pid: int) -> None:
    """Exit when Playwright stops the shell that launched us.

    Playwright spawns commands through a shell. On Windows it terminates the
    shell, which would otherwise leave this process holding the test pipes
    open and stall the whole run.
    """
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


threading.Thread(target=watch_parent, args=(os.getppid(),), daemon=True).start()

import uvicorn  # noqa: E402

uvicorn.run(
    "app.main:app",
    host="127.0.0.1",
    port=int(backend_port),
    log_level="warning",
    timeout_graceful_shutdown=3,
)
