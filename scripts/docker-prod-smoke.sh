#!/usr/bin/env sh
set -eu

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-opspilot-prod-smoke}"
API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-3101}"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-35432}"
REDIS_HOST_PORT="${REDIS_HOST_PORT:-36379}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:${API_PORT}}"

export API_PORT
export WEB_PORT
export POSTGRES_HOST_PORT
export REDIS_HOST_PORT
export NEXT_PUBLIC_API_BASE_URL

compose() {
  docker compose -p "$PROJECT_NAME" -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}

wait_for_url() {
  url="$1"
  label="$2"
  attempts="${3:-60}"

  i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done

  echo "Timed out waiting for ${label}: ${url}" >&2
  compose ps >&2 || true
  compose logs --no-color api web worker >&2 || true
  return 1
}

trap cleanup EXIT INT TERM

cleanup
compose up -d --build postgres redis api web worker

wait_for_url "http://localhost:${API_PORT}/health/ready" "API readiness" 90
wait_for_url "http://localhost:${WEB_PORT}" "web console" 60

response_file="$(mktemp)"
curl -fsS \
  -X POST "http://localhost:${API_PORT}/ask" \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -H "x-user-roles: ops_admin" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?"}' \
  > "$response_file"

grep -q '"sources"' "$response_file"
grep -q 'Payment API Error Codes' "$response_file"

curl -fsS "http://localhost:${WEB_PORT}" | grep -q "OpsPilot Console"

echo "Production compose smoke passed on API ${API_PORT} and web ${WEB_PORT}."
