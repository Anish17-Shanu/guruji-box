#!/usr/bin/env bash
# Smoke test a running installation.
# Usage: scripts/smoke.sh [BASE_URL] [API_URL]
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
API_URL="${2:-$BASE_URL}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

check() {
  curl -fsS --max-time 10 "$1" >/dev/null || fail "GET $1"
}

echo "Checking $BASE_URL"
check "$BASE_URL/"
check "$BASE_URL/learn"
check "$BASE_URL/manifest.webmanifest"
check "$BASE_URL/sw.js"
check "$BASE_URL/icons/icon-192.png"
check "$API_URL/health"
check "$API_URL/ready"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  fail "python is required to inspect the API response"
fi

SUBJECTS="$(curl -fsS --max-time 10 "$API_URL/api/v1/subjects")"
COUNT="$(printf '%s' "$SUBJECTS" | "$PYTHON" -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[ "$COUNT" -gt 0 ] || fail "no subjects returned by the API"

LESSONS="$(curl -fsS --max-time 10 "$API_URL/api/v1/lessons")"
LESSON_COUNT="$(printf '%s' "$LESSONS" | "$PYTHON" -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[ "$LESSON_COUNT" -gt 0 ] || fail "no lessons returned by the API"

if [ -d frontend/dist ]; then
  if grep -R -q -E "GEMINI_API_KEY|DATABASE_URL|SECRET_KEY" frontend/dist; then
    fail "build output appears to contain server configuration"
  fi
fi

echo "Smoke passed: subjects=$COUNT lessons=$LESSON_COUNT"
