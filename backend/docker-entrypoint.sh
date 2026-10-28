#!/bin/sh
set -eu

: "${PORT:=8000}"
: "${WEB_CONCURRENCY:=2}"
: "${SEED_ON_START:=true}"

echo "Applying database migrations..."
attempt=1
while ! alembic upgrade head; do
    if [ "$attempt" -ge 15 ]; then
        echo "Database migrations failed after $attempt attempts." >&2
        exit 1
    fi
    echo "Database not ready (attempt $attempt). Retrying in 2s..." >&2
    attempt=$((attempt + 1))
    sleep 2
done

if [ "$SEED_ON_START" = "true" ]; then
    echo "Seeding curriculum content..."
    python -m app.seed
fi

echo "Starting GURUJI BOX on port $PORT with $WEB_CONCURRENCY worker(s)."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers "$WEB_CONCURRENCY" \
    --proxy-headers \
    --timeout-graceful-shutdown "${SHUTDOWN_TIMEOUT:-10}"
