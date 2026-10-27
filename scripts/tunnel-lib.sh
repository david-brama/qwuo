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
