#!/usr/bin/env bash
set -euo pipefail
FRONTEND_URL="$1"; API_URL="$2"
curl -fsS "$API_URL/health" >/dev/null
curl -fsS "$API_URL/ready" >/dev/null
curl -fsS "$FRONTEND_URL/" >/dev/null
curl -fsS "$FRONTEND_URL/learn" >/dev/null
test -d frontend/dist && ! grep -R "GEMINI_API_KEY" frontend/dist
echo "smoke passed"
