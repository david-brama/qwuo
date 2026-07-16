#!/usr/bin/env bash
# Start Live Training Quiz with a Cloudflare quick tunnel on the player port.
# Usage:
#   ./scripts/start-with-tunnel.sh
#   deno task start:tunnel
#   PUBLIC_URL=https://… ./scripts/start-with-tunnel.sh   # skip tunnel
# Env: PLAYER_PORT (3001), PROJECTOR_PORT (3000), PUBLIC_URL, QUIZ_PATH, URL_WAIT_SECS (30)
#      TUNNEL_MODE (docker|native|auto) — default auto: docker compose, else native cloudflared
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLAYER_PORT="${PLAYER_PORT:-3001}"
PROJECTOR_PORT="${PROJECTOR_PORT:-3000}"
URL_WAIT_SECS="${URL_WAIT_SECS:-30}"
TUNNEL_MODE="${TUNNEL_MODE:-auto}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

CLOUDFLARED_PID=""
DENO_PID=""
TUNNEL_LOG=""
OWNED_TUNNEL=0
TUNNEL_BACKEND=""
COMPOSE_CMD=()

cleanup() {
  local code=$?
  trap - INT TERM EXIT

  if [[ -n "${DENO_PID}" ]] && kill -0 "${DENO_PID}" 2>/dev/null; then
    kill "${DENO_PID}" 2>/dev/null || true
    wait "${DENO_PID}" 2>/dev/null || true
  fi

  if [[ "${OWNED_TUNNEL}" -eq 1 ]]; then
    if [[ "${TUNNEL_BACKEND}" == "docker" ]]; then
      if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
      fi
    elif [[ -n "${CLOUDFLARED_PID}" ]] && kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
      kill "${CLOUDFLARED_PID}" 2>/dev/null || true
      wait "${CLOUDFLARED_PID}" 2>/dev/null || true
    fi
  fi

  if [[ -n "${TUNNEL_LOG}" && -f "${TUNNEL_LOG}" ]]; then
    rm -f "${TUNNEL_LOG}"
  fi

  exit "${code}"
}

trap cleanup INT TERM EXIT

die() {
  echo "error: $*" >&2
  exit 1
}

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi
  return 1
}

start_tunnel_docker() {
  resolve_compose || return 1
  if ! docker info >/dev/null 2>&1; then
    return 1
  fi
  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    die "compose file not found: ${COMPOSE_FILE}"
  fi

  TUNNEL_LOG="$(mktemp -t ltq-tunnel.XXXXXX)"
  export PLAYER_PORT

  echo "Starting cloudflared (docker) → http://host.docker.internal:${PLAYER_PORT}"
  "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" up --abort-on-container-exit cloudflared \
    >"${TUNNEL_LOG}" 2>&1 &
  CLOUDFLARED_PID=$!
  TUNNEL_BACKEND="docker"
  OWNED_TUNNEL=1
  return 0
}

start_tunnel_native() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    return 1
  fi

  TUNNEL_LOG="$(mktemp -t ltq-tunnel.XXXXXX)"
  ORIGIN="http://127.0.0.1:${PLAYER_PORT}"

  echo "Starting cloudflared (native) → ${ORIGIN}"
  cloudflared tunnel --url "${ORIGIN}" >"${TUNNEL_LOG}" 2>&1 &
  CLOUDFLARED_PID=$!
  TUNNEL_BACKEND="native"
  OWNED_TUNNEL=1
  return 0
}

wait_for_public_url() {
  echo "Waiting up to ${URL_WAIT_SECS}s for public URL…"
  PARSED=""
  deadline=$((SECONDS + URL_WAIT_SECS))
  while (( SECONDS < deadline )); do
    if ! kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
      echo "error: cloudflared exited before publishing a URL" >&2
      echo "--- cloudflared log ---" >&2
      cat "${TUNNEL_LOG}" >&2 || true
      exit 1
    fi
    if PARSED="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${TUNNEL_LOG}" 2>/dev/null | head -n1)"; then
      if [[ -n "${PARSED}" ]]; then
        break
      fi
    fi
    sleep 0.25
  done

  if [[ -z "${PARSED}" ]]; then
    echo "error: no public HTTPS URL from cloudflared within ${URL_WAIT_SECS}s" >&2
    echo "--- cloudflared log ---" >&2
    cat "${TUNNEL_LOG}" >&2 || true
    exit 1
  fi

  PUBLIC_URL="${PARSED%/}"
  export PUBLIC_URL
  echo "Tunnel ready: ${PUBLIC_URL}"
}

if ! command -v deno >/dev/null 2>&1; then
  die "deno not found on PATH. Install: https://deno.land"
fi

# If PUBLIC_URL already set, skip cloudflared
if [[ -n "${PUBLIC_URL:-}" ]]; then
  PUBLIC_URL="${PUBLIC_URL%/}"
  export PUBLIC_URL
  echo "Using existing PUBLIC_URL=${PUBLIC_URL} (skipping cloudflared)"
else
  case "${TUNNEL_MODE}" in
    docker)
      start_tunnel_docker || {
        cat >&2 <<EOF
error: docker compose tunnel failed (need Docker + docker compose).

Install Docker: https://docs.docker.com/get-docker/

Or use native cloudflared:
  TUNNEL_MODE=native ./scripts/start-with-tunnel.sh

Or start without a tunnel (LAN only):
  deno task start
EOF
        exit 1
      }
      ;;
    native)
      start_tunnel_native || {
        cat >&2 <<EOF
error: cloudflared not found on PATH.

Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Or use Docker (default):
  TUNNEL_MODE=docker ./scripts/start-with-tunnel.sh

Or start without a tunnel (LAN only):
  deno task start
EOF
        exit 1
      }
      ;;
    auto)
      if ! start_tunnel_docker; then
        if ! start_tunnel_native; then
          cat >&2 <<EOF
error: no tunnel backend available.

Preferred: Docker + docker compose (cloudflare/cloudflared:latest)
  Install: https://docs.docker.com/get-docker/

Fallback: cloudflared on PATH
  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Or start without a tunnel (LAN only):
  deno task start
EOF
          exit 1
        fi
      fi
      ;;
    *)
      die "TUNNEL_MODE must be docker, native, or auto (got: ${TUNNEL_MODE})"
      ;;
  esac

  wait_for_public_url
fi

export PLAYER_PORT PROJECTOR_PORT

echo "Starting quiz app…"
echo "  Projector (localhost only): http://127.0.0.1:${PROJECTOR_PORT}"
echo "  Player join URL (QR):       ${PUBLIC_URL}"
echo "  Ctrl+C stops app and tunnel"
echo

deno run -P main.ts &
DENO_PID=$!

# Wait for Deno; propagate its exit code (cleanup trap stops tunnel)
set +e
wait "${DENO_PID}"
code=$?
set -e
DENO_PID=""
exit "${code}"
