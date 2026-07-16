## Why

Starting a live quiz for a training room currently needs two terminals and manual copy-paste: run `cloudflared`, grab the random trycloudflare URL, then start Deno with `PUBLIC_URL`. Hosts forget the step and the projector QR points at localhost. A single start command should bring up the tunnel, wire the URL into the app, and leave the host with one process tree to stop.

## What Changes

- Add a start script that launches `cloudflared` against the player port, parses the public URL from tunnel output, and starts the quiz app with `PUBLIC_URL` set
- Tear down the tunnel when the app exits (and vice versa) so no orphaned cloudflared processes remain
- Fail fast with a clear message if `cloudflared` is missing or the public URL never appears
- Keep direct `deno task start` / `deno run -A main.ts` for LAN-only use without a tunnel
- Update README so the recommended training-room path is the start script, not multi-step manual setup

## Capabilities

### New Capabilities

- `tunnel-start`: Start-script lifecycle — detect cloudflared, open a quick tunnel to the player port, extract the public URL, start the app with that URL as `PUBLIC_URL`, and clean up child processes on exit

### Modified Capabilities

- (none — app already honors `PUBLIC_URL`; this change only automates how that env is set at process start)

## Impact

- New shell (or Deno) start script in the repo root; optional `deno.json` task entry
- External dependency for the tunnel path: `cloudflared` on PATH
- README run instructions
- No change to quiz session engine, HTTP ports, or projector/player UI behavior beyond receiving a correct `PUBLIC_URL`
