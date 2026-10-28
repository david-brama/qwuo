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
