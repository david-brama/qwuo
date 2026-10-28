# shellcheck shell=bash
# Helpers sourced by start-with-tunnel.sh (and by scripts/tunnel_test.ts).
# Keep bash 3.2 compatible (macOS /bin/bash).

# Print the first Cloudflare quick-tunnel URL in cloudflared output read from
# the given files (or stdin). Accepts only https://<label>.trycloudflare.com
# where <label> is one DNS label that is not "api" and the hostname is not
# followed by a path. cloudflared's error lines mention its API host, e.g.
#   failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"
# which must never become PUBLIC_URL. Prints nothing if no URL is found.
extract_quick_tunnel_url() {
  grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com([^A-Za-z0-9./-]|$)' "$@" 2>/dev/null \
    | sed -E 's#^(https://[A-Za-z0-9-]+\.trycloudflare\.com).*#\1#' \
    | grep -Eiv '^https://api\.' \
    | head -n1 || true
  return 0
}

# Settings that may come from .env.tunnel. TUNNEL_CRED_FILE is optional for
# TUNNEL_NAME (cloudflared credentials JSON; default: found by tunnel id).
TUNNEL_ENV_KEYS="TUNNEL_TOKEN TUNNEL_NAME TUNNEL_CRED_FILE PUBLIC_URL"

# Load TUNNEL_ENV_KEYS from a KEY=VALUE file (# comments, optional "export ",
# optional quotes). The file is parsed, never sourced. A variable that is
# already set in the environment (even empty) wins over the file. Values are
# never printed; LOADED_TUNNEL_KEYS lists the keys taken from the file.
load_tunnel_env() {
  local file="$1" line key value k
  LOADED_TUNNEL_KEYS=""
  [[ -f "${file}" ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    line="${line#export }"
    [[ "${line}" == *=* ]] || continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "${value}" == \"*\" && ${#value} -ge 2 ]] || [[ "${value}" == \'*\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi
    for k in ${TUNNEL_ENV_KEYS}; do
      [[ "${key}" == "${k}" ]] || continue
      # Fixed key list, so eval is safe here (bash 3.2 has no ${!k+x} test)
      if eval "[[ -z \${${k}+x} ]]"; then
        printf -v "${k}" '%s' "${value}"
        LOADED_TUNNEL_KEYS="${LOADED_TUNNEL_KEYS:+${LOADED_TUNNEL_KEYS} }${k}"
      fi
    done
  done <"${file}"
  return 0
}

# Print the hostname of a URL (no scheme, port or path).
url_host() {
  local h="${1#*://}"
  h="${h%%/*}"
  h="${h%%\?*}"
  printf '%s\n' "${h%%:*}"
}

# Does the hostname resolve? Uses the first of dig, host, nslookup, getent on
# PATH. Returns 0 if it resolves, 1 if it does not, 2 if no tool can tell.
host_resolves() {
  local host="$1" out
  if command -v dig >/dev/null 2>&1; then
    out="$(dig +short +time=3 +tries=1 "${host}" A 2>/dev/null; dig +short +time=3 +tries=1 "${host}" AAAA 2>/dev/null)" || true
    # ";;" lines are dig errors (timeouts), not answers
    out="$(printf '%s\n' "${out}" | grep -v '^;' | grep -v '^[[:space:]]*$' || true)"
    [[ -n "${out}" ]] && return 0
    return 1
  fi
  if command -v host >/dev/null 2>&1; then
    host -W 3 "${host}" >/dev/null 2>&1 && return 0
    return 1
  fi
  if command -v nslookup >/dev/null 2>&1; then
    out="$(nslookup "${host}" 2>&1)" || return 1
    printf '%s\n' "${out}" | grep -Eqi "NXDOMAIN|can't find|server can't|No answer" && return 1
    return 0
  fi
  if command -v getent >/dev/null 2>&1; then
    getent hosts "${host}" >/dev/null 2>&1 && return 0
    return 1
  fi
  return 2
}

# Print the first "id": "<uuid>" in cloudflared JSON read from stdin (the
# tunnel id: it comes before the connection ids). Prints nothing if none.
first_json_uuid() {
  grep -Eo '"id"[[:space:]]*:[[:space:]]*"[0-9a-fA-F-]{36}"' \
    | head -n1 \
    | grep -Eo '[0-9a-fA-F-]{36}' || true
  return 0
}

# Run a command; kill it after $1 seconds. Returns the command's exit code.
run_limited() {
  local secs="$1" pid watcher rc=0
  shift
  "$@" &
  pid=$!
  ( sleep "${secs}"; kill "${pid}" 2>/dev/null ) >/dev/null 2>&1 &
  watcher=$!
  wait "${pid}" || rc=$?
  kill "${watcher}" 2>/dev/null || true
  wait "${watcher}" 2>/dev/null || true
  return "${rc}"
}

# Print the id of the locally managed tunnel $1 (read-only: cloudflared
# tunnel info, else tunnel list). $2 = cloudflared config file (optional).
# Prints nothing if cloudflared cannot tell.
lookup_tunnel_id() {
  local name="$1" config="${2:-}" id cfg=()
  command -v cloudflared >/dev/null 2>&1 || return 0
  [[ -n "${config}" ]] && cfg=(--config "${config}")
  # cloudflared reads TUNNEL_NAME / TUNNEL_TOKEN / TUNNEL_CRED_FILE from env
  id="$(run_limited 15 env -u TUNNEL_TOKEN -u TUNNEL_NAME -u TUNNEL_CRED_FILE \
    cloudflared tunnel ${cfg[@]+"${cfg[@]}"} info -o json "${name}" 2>/dev/null | first_json_uuid)"
  if [[ -z "${id}" ]]; then
    id="$(run_limited 15 env -u TUNNEL_TOKEN -u TUNNEL_NAME -u TUNNEL_CRED_FILE \
      cloudflared tunnel ${cfg[@]+"${cfg[@]}"} list -o json --name "${name}" 2>/dev/null | first_json_uuid)"
  fi
  printf '%s' "${id}"
  return 0
}
