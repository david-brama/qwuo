#!/usr/bin/env bash
# Start Live Training Quiz with a Cloudflare tunnel on the player port.
# Usage:
#   ./scripts/start-with-tunnel.sh
#   deno task start:tunnel
#   PUBLIC_URL=https://… ./scripts/start-with-tunnel.sh   # skip tunnel
#
# Settings come from the environment, then from .env.tunnel in the repo root
# (gitignored; see .env.tunnel.example). The environment wins over the file.
#
# Tunnel kinds (first match wins):
#   TUNNEL_TOKEN + PUBLIC_URL   named tunnel, fixed hostname (cloudflared tunnel run;
#                               token from the Cloudflare dashboard; never printed)
#   TUNNEL_NAME  + PUBLIC_URL   named tunnel from ~/.cloudflared credentials (native only;
#                               optional TUNNEL_CRED_FILE)
#   PUBLIC_URL only             no cloudflared (you run the tunnel yourself)
#   nothing                     quick tunnel (random *.trycloudflare.com, changes on restart)
# If a named tunnel fails its health check, the script falls back to a quick tunnel.
#
# Env: PLAYER_PORT (3001), PROJECTOR_PORT (3000), PUBLIC_URL, QUIZ_PATH, QUIZ_FILTER, QUIZ_IDS,
#      URL_WAIT_SECS (30), TUNNEL_MODE (docker|native|auto; default auto: docker compose, else native)
#      TUNNEL_ENV_FILE (.env.tunnel), HEALTH_CHECK (1; 0 = skip), HEALTH_WAIT_SECS (60), SUPERVISE_INTERVAL (2), TUNNEL_RESTART_DELAY (3)
# Extra args are forwarded to the app (quote spaced filters), e.g.:
#   ./scripts/start-with-tunnel.sh -- --filter live=true --filter "domain=Tool Design & MCP Integration"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/tunnel-lib.sh
. "${ROOT}/scripts/tunnel-lib.sh"

PLAYER_PORT="${PLAYER_PORT:-3001}"
PROJECTOR_PORT="${PROJECTOR_PORT:-3000}"
URL_WAIT_SECS="${URL_WAIT_SECS:-30}"
TUNNEL_MODE="${TUNNEL_MODE:-auto}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
HEALTH_CHECK="${HEALTH_CHECK:-1}"
HEALTH_WAIT_SECS="${HEALTH_WAIT_SECS:-60}"
SUPERVISE_INTERVAL="${SUPERVISE_INTERVAL:-2}"
TUNNEL_RESTART_DELAY="${TUNNEL_RESTART_DELAY:-3}"
TUNNEL_ENV_FILE="${TUNNEL_ENV_FILE:-${ROOT}/.env.tunnel}"

CLOUDFLARED_PID=""
DENO_PID=""
TUNNEL_LOG=""
APP_LOG=""
CF_CONFIG=""
OWNED_TUNNEL=0
TUNNEL_BACKEND=""
TUNNEL_KIND=""
COMPOSE_CMD=()
COMPOSE_SERVICE="cloudflared"
APP_ARGS=("$@")
SESSION_UUID=""

# Kill a process and its descendants (children first). `deno` may be a
# wrapper (e.g. the npm shim) whose child is the real server.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "${pid}" 2>/dev/null || true); do
    kill_tree "${child}"
  done
  kill "${pid}" 2>/dev/null || true
}

cleanup() {
  local code=$?
  trap - INT TERM EXIT

  if [[ -n "${DENO_PID}" ]] && kill -0 "${DENO_PID}" 2>/dev/null; then
    kill_tree "${DENO_PID}"
    wait "${DENO_PID}" 2>/dev/null || true
  fi

  stop_tunnel

  for f in "${TUNNEL_LOG}" "${APP_LOG}" "${CF_CONFIG}"; do
    if [[ -n "${f}" && -f "${f}" ]]; then
      rm -f "${f}"
    fi
  done

  exit "${code}"
}

trap cleanup INT TERM EXIT

die() {
  echo "error: $*" >&2
  exit 1
}

# Loud multi-line warning on stderr (with terminal bell).
loud() {
  {
    printf '\a\n'
    printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
    local line
    for line in "$@"; do
      printf '!!! %s\n' "${line}"
    done
    printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n'
  } >&2
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

docker_available() {
  command -v docker >/dev/null 2>&1 || return 1
  resolve_compose || return 1
  docker info >/dev/null 2>&1 || return 1
  [[ -f "${COMPOSE_FILE}" ]] || die "compose file not found: ${COMPOSE_FILE}"
  return 0
}

# Start cloudflared for TUNNEL_KIND on TUNNEL_BACKEND; output → TUNNEL_LOG.
launch_tunnel() {
  : >"${TUNNEL_LOG}"
  local origin
  if [[ "${TUNNEL_BACKEND}" == "docker" ]]; then
    export PLAYER_PORT
    # Remove a stale container from a previous run of this service
    "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" rm -sf "${COMPOSE_SERVICE}" >/dev/null 2>&1 || true
    echo "Starting cloudflared (docker, ${TUNNEL_KIND}) → http://host.docker.internal:${PLAYER_PORT}"
    "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" up --abort-on-container-exit "${COMPOSE_SERVICE}" \
      >"${TUNNEL_LOG}" 2>&1 &
  else
    origin="http://127.0.0.1:${PLAYER_PORT}"
    echo "Starting cloudflared (native, ${TUNNEL_KIND}) → ${origin}"
    # Own config file: never pick up ~/.cloudflared/config.yml (its tunnel id
    # or ingress belongs to other projects).
    if [[ -z "${CF_CONFIG}" ]]; then
      CF_CONFIG="$(mktemp -t ltq-cloudflared.XXXXXX)"
      printf 'no-autoupdate: true\n' >"${CF_CONFIG}"
    fi
    # cloudflared also reads TUNNEL_NAME (--name: create + route a tunnel!),
    # TUNNEL_TOKEN and TUNNEL_CRED_FILE from its environment: pass only what
    # this kind needs.
    case "${TUNNEL_KIND}" in
      quick)
        env -u TUNNEL_TOKEN -u TUNNEL_NAME -u TUNNEL_CRED_FILE \
          cloudflared tunnel --no-autoupdate --config "${CF_CONFIG}" --url "${origin}" \
          >"${TUNNEL_LOG}" 2>&1 &
        ;;
      token)
        # Token is read from the TUNNEL_TOKEN env var (kept off the command line)
        env -u TUNNEL_NAME -u TUNNEL_CRED_FILE \
          cloudflared tunnel --no-autoupdate --config "${CF_CONFIG}" run \
          >"${TUNNEL_LOG}" 2>&1 &
        ;;
      named)
        local cred=()
        if [[ -n "${TUNNEL_CRED_FILE:-}" ]]; then
          cred=(--credentials-file "${TUNNEL_CRED_FILE}")
        fi
        env -u TUNNEL_TOKEN -u TUNNEL_NAME -u TUNNEL_CRED_FILE \
          cloudflared tunnel --no-autoupdate --config "${CF_CONFIG}" run --url "${origin}" \
          ${cred[@]+"${cred[@]}"} "${TUNNEL_NAME}" >"${TUNNEL_LOG}" 2>&1 &
        ;;
    esac
  fi
  CLOUDFLARED_PID=$!
  OWNED_TUNNEL=1
}

stop_tunnel() {
  [[ "${OWNED_TUNNEL}" -eq 1 ]] || return 0
  if [[ "${TUNNEL_BACKEND}" == "docker" ]]; then
    if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
      "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
    fi
  fi
  if [[ -n "${CLOUDFLARED_PID}" ]] && kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
    kill_tree "${CLOUDFLARED_PID}"
    wait "${CLOUDFLARED_PID}" 2>/dev/null || true
  fi
}

# Quick tunnel: parse the public URL from the log into PARSED_URL.
# $1 = fatal|soft. soft returns 1 on failure instead of exiting.
wait_for_public_url() {
  local mode="$1" deadline
  echo "Waiting up to ${URL_WAIT_SECS}s for public URL…"
  PARSED_URL=""
  deadline=$((SECONDS + URL_WAIT_SECS))
  while (( SECONDS < deadline )); do
    PARSED_URL="$(extract_quick_tunnel_url "${TUNNEL_LOG}")"
    [[ -n "${PARSED_URL}" ]] && break
    if ! kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done

  if [[ -z "${PARSED_URL}" ]]; then
    echo "error: no public https://<name>.trycloudflare.com URL from cloudflared" >&2
    echo "--- cloudflared log ---" >&2
    cat "${TUNNEL_LOG}" >&2 || true
    [[ "${mode}" == "fatal" ]] && exit 1
    return 1
  fi
  echo "Tunnel ready: ${PARSED_URL}"
  return 0
}

start_app() {
  : >"${APP_LOG}"
  # stdout is copied to APP_LOG so the session id can be read for health checks
  deno run -P main.ts -- ${APP_ARGS[@]+"${APP_ARGS[@]}"} > >(tee -a "${APP_LOG}") &
  DENO_PID=$!
}

app_alive() {
  [[ -n "${DENO_PID}" ]] && kill -0 "${DENO_PID}" 2>/dev/null
}

# Read the session id the app printed ("Session id: <uuid>").
wait_for_session_id() {
  local deadline=$((SECONDS + HEALTH_WAIT_SECS))
  SESSION_UUID=""
  while (( SECONDS < deadline )); do
    SESSION_UUID="$(sed -n 's/^Session id: \([0-9a-fA-F-]*\).*/\1/p' "${APP_LOG}" | head -n1)"
    [[ -n "${SESSION_UUID}" ]] && return 0
    app_alive || return 1
    sleep 0.25
  done
  return 1
}

# Poll a player state URL until it returns the player JSON.
wait_http_ok() {
  local url="$1" deadline=$((SECONDS + HEALTH_WAIT_SECS))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 "${url}" 2>/dev/null | grep -q '"role":"player"'; then
      return 0
    fi
    app_alive || return 1
    sleep 1
  done
  return 1
}

# Check the app answers locally and through PUBLIC_URL.
# Returns 1 if the app fails, 2 if only PUBLIC_URL fails.
health_check() {
  if [[ "${HEALTH_CHECK}" == "0" ]]; then
    echo "Health check skipped (HEALTH_CHECK=0)"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    loud "curl not found: cannot verify that PUBLIC_URL answers." \
      "Open ${PUBLIC_URL} on a phone (mobile data) before the course starts."
    return 0
  fi
  if ! wait_for_session_id; then
    loud "Health check: the quiz app did not print its session id." \
      "Check the app output above."
    return 1
  fi
  local path="/s/${SESSION_UUID}/api/state"
  echo "Health check: ${PUBLIC_URL}${path}"
  if ! wait_http_ok "http://127.0.0.1:${PLAYER_PORT}${path}"; then
    loud "Health check FAILED: the app does not answer on 127.0.0.1:${PLAYER_PORT}." \
      "Check the app output above."
    return 1
  fi
  if ! wait_http_ok "${PUBLIC_URL}${path}"; then
    loud "Health check FAILED: PUBLIC_URL does not answer within ${HEALTH_WAIT_SECS}s:" \
      "  ${PUBLIC_URL}${path}" \
      "Phones will NOT be able to join. Check the tunnel / PUBLIC_URL." \
      "(Set HEALTH_CHECK=0 to start anyway.)"
    return 2
  fi
  echo "Health check OK: phones can reach ${PUBLIC_URL}"
  return 0
}

# Restart the app with the current PUBLIC_URL. The session is restored from
# its snapshot (same id, never SESSION_FRESH) so the room continues.
restart_app() {
  if app_alive; then
    kill_tree "${DENO_PID}"
    wait "${DENO_PID}" 2>/dev/null || true
  fi
  export SESSION_FRESH=0
  if [[ -n "${SESSION_UUID}" ]]; then
    export SESSION_ID="${SESSION_UUID}"
  fi
  start_app
}

# cloudflared exited: warn loudly, restart it, and follow a hostname change.
handle_tunnel_exit() {
  local tail_log
  tail_log="$(tail -n 15 "${TUNNEL_LOG}" 2>/dev/null || true)"
  loud "cloudflared EXITED: phones cannot reach the quiz right now." \
    "Restarting cloudflared in ${TUNNEL_RESTART_DELAY}s…"
  if [[ -n "${tail_log}" ]]; then
    echo "--- last cloudflared output ---" >&2
    echo "${tail_log}" >&2
  fi
  sleep "${TUNNEL_RESTART_DELAY}"
  launch_tunnel

  if [[ "${TUNNEL_KIND}" == "quick" ]]; then
    wait_for_public_url soft || return 0 # still down; retried next loop
    if [[ "${PARSED_URL}" != "${PUBLIC_URL}" ]]; then
      loud "Quick tunnel hostname CHANGED:" \
        "  old: ${PUBLIC_URL}" \
        "  new: ${PARSED_URL}" \
        "The lobby QR is being refreshed (app restarts with the new PUBLIC_URL;" \
        "session, roster and scores are restored from the snapshot)." \
        "Phones on the old URL must RESCAN the QR and JOIN AGAIN (new origin =" \
        "new browser storage, so their old player and score are not linked)." \
        "Use a named tunnel (.env.tunnel, see README) to avoid this."
      PUBLIC_URL="${PARSED_URL}"
      export PUBLIC_URL
      restart_app
    fi
  fi
  health_check || loud "Tunnel restarted but the health check failed; will keep watching."
}

warn_quick_tunnel() {
  loud "QUICK TUNNEL (no named tunnel${1:+: $1})." \
    "The join URL and the lobby QR CHANGE on EVERY restart of this script" \
    "or of cloudflared. Phones must then rescan the QR and join again." \
    "Do not print or share this URL ahead of time." \
    "For a fixed URL set up a named tunnel: README → Before the course."
}

# Start a quick tunnel and set PUBLIC_URL from it ($1 = fatal|soft).
start_quick_tunnel() {
  wait_for_public_url "$1" || return 1
  PUBLIC_URL="${PARSED_URL}"
  export PUBLIC_URL
}

# The named tunnel failed its health check: replace it with a quick tunnel
# and restart the app with the new PUBLIC_URL (same session).
fall_back_to_quick() {
  loud "NAMED TUNNEL FAILED: ${PUBLIC_URL} does not answer." \
    "Falling back to a QUICK tunnel so the course can start."
  stop_tunnel
  TUNNEL_KIND="quick"
  unset TUNNEL_TOKEN COMPOSE_PROFILES
  COMPOSE_SERVICE="cloudflared"
  launch_tunnel
  start_quick_tunnel fatal
  warn_quick_tunnel "the named tunnel failed"
  restart_app
}

if ! command -v deno >/dev/null 2>&1; then
  die "deno not found on PATH. Install: https://deno.land"
fi

load_tunnel_env "${TUNNEL_ENV_FILE}"
if [[ -n "${LOADED_TUNNEL_KEYS}" ]]; then
  echo "Tunnel settings from ${TUNNEL_ENV_FILE}: ${LOADED_TUNNEL_KEYS}"
fi

# Pick the tunnel kind
if [[ -n "${TUNNEL_TOKEN:-}" ]]; then
  TUNNEL_KIND="token"
  [[ -n "${PUBLIC_URL:-}" ]] || die "TUNNEL_TOKEN needs PUBLIC_URL=https://<your tunnel hostname>"
  export TUNNEL_TOKEN
elif [[ -n "${TUNNEL_NAME:-}" ]]; then
  TUNNEL_KIND="named"
  [[ -n "${PUBLIC_URL:-}" ]] || die "TUNNEL_NAME needs PUBLIC_URL=https://<your tunnel hostname>"
  [[ "${TUNNEL_MODE}" != "docker" ]] || die "TUNNEL_NAME needs TUNNEL_MODE=native (or use TUNNEL_TOKEN with docker)"
  TUNNEL_MODE="native"
elif [[ -n "${PUBLIC_URL:-}" ]]; then
  TUNNEL_KIND="external"
else
  TUNNEL_KIND="quick"
fi
if [[ "${TUNNEL_KIND}" == "token" ]]; then
  COMPOSE_SERVICE="cloudflared-named"
  export COMPOSE_PROFILES="named"
fi

APP_LOG="$(mktemp -t ltq-app.XXXXXX)"

if [[ "${TUNNEL_KIND}" == "external" ]]; then
  PUBLIC_URL="${PUBLIC_URL%/}"
  export PUBLIC_URL
  echo "Using existing PUBLIC_URL=${PUBLIC_URL} (skipping cloudflared)"
else
  TUNNEL_LOG="$(mktemp -t ltq-tunnel.XXXXXX)"
  case "${TUNNEL_MODE}" in
    docker)
      docker_available || {
        cat >&2 <<EOF
error: docker compose tunnel failed (need Docker + docker compose).

Install Docker: https://docs.docker.com/get-docker/

Or use native cloudflared:
  TUNNEL_MODE=native ./scripts/start-with-tunnel.sh

Or start localhost-only (no phones):
  deno task start
EOF
        exit 1
      }
      TUNNEL_BACKEND="docker"
      ;;
    native)
      command -v cloudflared >/dev/null 2>&1 || {
        cat >&2 <<EOF
error: cloudflared not found on PATH.

Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Or use Docker (default):
  TUNNEL_MODE=docker ./scripts/start-with-tunnel.sh

Or start localhost-only (no phones):
  deno task start
EOF
        exit 1
      }
      TUNNEL_BACKEND="native"
      ;;
    auto)
      if docker_available; then
        TUNNEL_BACKEND="docker"
      elif command -v cloudflared >/dev/null 2>&1; then
        TUNNEL_BACKEND="native"
      else
        cat >&2 <<EOF
error: no tunnel backend available.

Preferred: Docker + docker compose (cloudflare/cloudflared image)
  Install: https://docs.docker.com/get-docker/

Fallback: cloudflared on PATH
  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Or start localhost-only (no phones):
  deno task start
EOF
        exit 1
      fi
      ;;
    *)
      die "TUNNEL_MODE must be docker, native, or auto (got: ${TUNNEL_MODE})"
      ;;
  esac

  launch_tunnel
  if [[ "${TUNNEL_KIND}" == "quick" ]]; then
    start_quick_tunnel fatal
    warn_quick_tunnel "not configured"
  else
    PUBLIC_URL="${PUBLIC_URL%/}"
    export PUBLIC_URL
    echo "Named tunnel (${TUNNEL_KIND}); fixed hostname ${PUBLIC_URL}"
  fi
fi

export PLAYER_PORT PROJECTOR_PORT

echo "Starting quiz app…"
echo "  Projector (localhost only): http://127.0.0.1:${PROJECTOR_PORT}"
echo "  Player join URL (QR):       ${PUBLIC_URL}"
echo "  Ctrl+C stops app and tunnel"
echo

start_app
health_rc=0
health_check || health_rc=$?
if [[ "${health_rc}" -eq 2 && ( "${TUNNEL_KIND}" == "token" || "${TUNNEL_KIND}" == "named" ) ]]; then
  fall_back_to_quick
  health_check || exit 1
elif [[ "${health_rc}" -ne 0 ]]; then
  exit 1
fi

# Supervise: exit with the app's code if it stops; restart cloudflared if it dies.
while true; do
  if ! app_alive; then
    set +e
    wait "${DENO_PID}"
    code=$?
    set -e
    DENO_PID=""
    exit "${code}"
  fi
  if [[ "${OWNED_TUNNEL}" -eq 1 ]] && ! kill -0 "${CLOUDFLARED_PID}" 2>/dev/null; then
    wait "${CLOUDFLARED_PID}" 2>/dev/null || true
    handle_tunnel_exit
  fi
  sleep "${SUPERVISE_INTERVAL}"
done
