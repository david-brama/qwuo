#!/usr/bin/env bash
# Start Live Training Quiz with a Cloudflare quick tunnel on the player port.
# Usage:
#   ./scripts/start-with-tunnel.sh
#   deno task start:tunnel
#   PUBLIC_URL=https://… ./scripts/start-with-tunnel.sh   # skip tunnel
# Env: PLAYER_PORT (3001), PROJECTOR_PORT (3000), PUBLIC_URL, QUIZ_PATH, URL_WAIT_SECS (30)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLAYER_PORT="${PLAYER_PORT:-3001}"
PROJECTOR_PORT="${PROJECTOR_PORT:-3000}"
URL_WAIT_SECS="${URL_WAIT_SECS:-30}"

CLOUDFLARED_PID=""
DENO_PID=""
TUNNEL_LOG=""
OWNED_TUNNEL=0

cleanup() {
  local code=$?
  # Avoid re-entry
  trap - INT TERM EXIT

  if [[ -n "${DENO_PID}" ]] && kill -0 "${DENO_PID}" 2>/dev/null; then
    kill "${DENO_PID}" 2>/dev/null || true
    wait "${DENO_PID}" 2>/dev/null || true
  fi

  if [[ "${OWNED_TUNNEL}" -eq 1 && -n "${CLOUDFLARED_PID}" ]] &&
    kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
    kill "${CLOUDFLARED_PID}" 2>/dev/null || true
    wait "${CLOUDFLARED_PID}" 2>/dev/null || true
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

if ! command -v deno >/dev/null 2>&1; then
  die "deno not found on PATH. Install: https://deno.land"
fi

# If PUBLIC_URL already set, skip cloudflared
if [[ -n "${PUBLIC_URL:-}" ]]; then
  PUBLIC_URL="${PUBLIC_URL%/}"
  export PUBLIC_URL
  echo "Using existing PUBLIC_URL=${PUBLIC_URL} (skipping cloudflared)"
else
  if ! command -v cloudflared >/dev/null 2>&1; then
    cat >&2 <<EOF
error: cloudflared not found on PATH.

Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Or start without a tunnel (LAN only):
  deno task start
EOF
    exit 1
  fi

  TUNNEL_LOG="$(mktemp -t ltq-tunnel.XXXXXX)"
  ORIGIN="http://127.0.0.1:${PLAYER_PORT}"

  echo "Starting cloudflared tunnel → ${ORIGIN}"
  # cloudflared prints the public URL on stderr; merge into log file
  cloudflared tunnel --url "${ORIGIN}" >"${TUNNEL_LOG}" 2>&1 &
  CLOUDFLARED_PID=$!
  OWNED_TUNNEL=1

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
    # Match trycloudflare quick-tunnel URLs (and similar https hosts)
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
fi

export PLAYER_PORT PROJECTOR_PORT

echo "Starting quiz app…"
echo "  Projector (localhost only): http://127.0.0.1:${PROJECTOR_PORT}"
echo "  Player join URL (QR):       ${PUBLIC_URL}"
echo "  Ctrl+C stops app and tunnel"
echo

deno run --allow-net --allow-read=quiz.json --allow-env=PUBLIC_URL main.ts &
DENO_PID=$!

# Wait for Deno; propagate its exit code (cleanup trap stops tunnel)
set +e
wait "${DENO_PID}"
code=$?
set -e
DENO_PID=""
exit "${code}"
