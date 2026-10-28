/**
 * Tests for scripts/start-with-tunnel.sh and scripts/tunnel-lib.sh.
 * cloudflared, deno and curl are replaced by stubs on PATH — no real tunnel.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SCRIPTS = new URL(".", import.meta.url).pathname;
const LIB = `${SCRIPTS}tunnel-lib.sh`;
const MAIN = `${SCRIPTS}start-with-tunnel.sh`;
const SID = "11111111-1111-4111-8111-111111111111";

async function bash(
  script: string,
  stdin = "",
): Promise<{ code: number; out: string }> {
  const child = new Deno.Command("bash", {
    args: ["-c", script],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(stdin));
  await w.close();
  const res = await child.output();
  const dec = new TextDecoder();
  return { code: res.code, out: dec.decode(res.stdout) + dec.decode(res.stderr) };
}

async function extract(log: string): Promise<string> {
  const r = await bash(
    `set -euo pipefail; . '${LIB}'; extract_quick_tunnel_url`,
    log,
  );
  assertEquals(r.code, 0, r.out);
  return r.out.trim();
}

const API_ERROR =
  `2026-10-27T09:00:00Z ERR Error unmarshaling QuickTunnel response: error="failed to request quick Tunnel: Post \\"https://api.trycloudflare.com/tunnel\\": dial tcp: lookup api.trycloudflare.com: no such host"\n` +
  `failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"\n`;
const BANNER =
  "2026-10-27T09:00:01Z INF +--------------------------------------------------------------------------------------------+\n" +
  "2026-10-27T09:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |\n" +
  "2026-10-27T09:00:01Z INF |  https://foo-bar-baz.trycloudflare.com                                                     |\n" +
  "2026-10-27T09:00:01Z INF +--------------------------------------------------------------------------------------------+\n";

Deno.test("bash -n: tunnel scripts parse", async () => {
  for (const f of [MAIN, LIB]) {
    const r = await bash(`bash -n '${f}'`);
    assertEquals(r.code, 0, `${f}: ${r.out}`);
  }
});

Deno.test("extract_quick_tunnel_url: never returns api.trycloudflare.com", async () => {
  assertEquals(await extract(API_ERROR), "");
  assertEquals(await extract("https://api.trycloudflare.com\n"), "");
  assertEquals(await extract("https://API.trycloudflare.com |\n"), "");
});

Deno.test("extract_quick_tunnel_url: reads the banner hostname", async () => {
  assertEquals(await extract(BANNER), "https://foo-bar-baz.trycloudflare.com");
  assertEquals(
    await extract("|  https://foo-bar-baz.trycloudflare.com  |\n"),
    "https://foo-bar-baz.trycloudflare.com",
  );
  // Error line first, banner later → banner URL
  assertEquals(await extract(API_ERROR + BANNER), "https://foo-bar-baz.trycloudflare.com");
});

Deno.test("extract_quick_tunnel_url: rejects look-alikes", async () => {
  assertEquals(await extract("https://a.b.trycloudflare.com |\n"), "");
  assertEquals(await extract("https://foo.trycloudflare.com/tunnel\n"), "");
  assertEquals(await extract("https://foo.trycloudflare.com.evil.example\n"), "");
  assertEquals(await extract("https://foo.example.com\n"), "");
  assertEquals(await extract("http://foo.trycloudflare.com\n"), "");
  assertEquals(await extract(""), "");
});

/** Write executable stubs for cloudflared / deno / curl into a temp dir. */
function makeStubs(
  opts: { publicCurlFails?: boolean; failHost?: string; quickStaysUp?: boolean } = {},
): string {
  const dir = Deno.makeTempDirSync({ prefix: "qwuo-tunnel-test-" });
  const write = (name: string, body: string) => {
    Deno.writeTextFileSync(`${dir}/${name}`, `#!/usr/bin/env bash\n${body}\n`);
    Deno.chmodSync(`${dir}/${name}`, 0o755);
  };
  // cloudflared: 1st quick run prints the api error + banner, then dies
  // (unless quickStaysUp); later quick runs print a new banner and stay up.
  // Records args + token / tunnel-name env presence.
  write(
    "cloudflared",
    `echo "args=$* token=\${TUNNEL_TOKEN:+set} name=\${TUNNEL_NAME:+set}" | sed 's#--config [^ ]*#--config CFG#' >> "${dir}/cf-calls"
echo $$ > "${dir}/cf-pid"
if [[ "$*" == *"--url"* && "$*" != *" run "* ]]; then
  n=$(cat "${dir}/quick-count" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "${dir}/quick-count"
  echo 'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"'
  if [[ $n -eq 1 ]]; then
    echo "INF |  https://first-run-one.trycloudflare.com   |"
    ${opts.quickStaysUp ? "" : "sleep 1.5; exit 1"}
  else
    echo "INF |  https://second-run-two.trycloudflare.com   |"
  fi
fi
exec sleep 60`,
  );
  // deno: a wrapper with a child "server" (like the npm deno shim), so the
  // script must stop the whole process tree, not just the wrapper.
  write(
    "deno",
    `echo "PUBLIC_URL=$PUBLIC_URL SESSION_FRESH=\${SESSION_FRESH:-} SESSION_ID=\${SESSION_ID:-} args=$*" >> "${dir}/deno-calls"
echo $$ > "${dir}/deno-pid"
echo "Session id: ${SID}"
sleep 60 &
echo $! >> "${dir}/deno-children"
wait`,
  );
  write(
    "curl",
    `url="\${@: -1}"
echo "$url" >> "${dir}/curl-calls"
${opts.publicCurlFails ? `if [[ "$url" != http://127.0.0.1* ]]; then exit 22; fi` : ""}
${opts.failHost ? `if [[ "$url" == *"${opts.failHost}"* ]]; then exit 22; fi` : ""}
echo '{"role":"player","phase":"LOBBY"}'`,
  );
  return dir;
}

function read(path: string): string {
  try {
    return Deno.readTextFileSync(path);
  } catch {
    return "";
  }
}

function alive(pidFile: string): boolean {
  const pid = read(pidFile).trim();
  if (!pid) return false;
  return new Deno.Command("kill", { args: ["-0", pid], stderr: "null" })
    .outputSync().success;
}

/** True if any recorded child "server" process of the deno stub is alive. */
function anyDenoChildAlive(stubs: string): boolean {
  return read(`${stubs}/deno-children`).trim().split("\n").filter(Boolean)
    .some((pid) =>
      new Deno.Command("kill", { args: ["-0", pid], stderr: "null" }).outputSync().success
    );
}

function runScript(
  stubs: string,
  env: Record<string, string>,
  args: string[] = [],
): Deno.ChildProcess {
  return new Deno.Command("bash", {
    args: [MAIN, ...args],
    env: {
      PATH: `${stubs}:${Deno.env.get("PATH")}`,
      HOME: Deno.env.get("HOME") ?? "/tmp",
      TUNNEL_MODE: "native",
      URL_WAIT_SECS: "5",
      HEALTH_WAIT_SECS: "3",
      SUPERVISE_INTERVAL: "0.2",
      TUNNEL_RESTART_DELAY: "0",
      SESSION_FRESH: "1",
      // Never read a real .env.tunnel from the repo
      TUNNEL_ENV_FILE: `${stubs}/no-such-env-tunnel`,
      ...env,
    },
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  }).spawn();
}

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
}

async function stop(child: Deno.ChildProcess): Promise<{ code: number; out: string }> {
  try {
    child.kill("SIGTERM");
  } catch {
    // already exited
  }
  const res = await child.output();
  const dec = new TextDecoder();
  return { code: res.code, out: dec.decode(res.stdout) + dec.decode(res.stderr) };
}

Deno.test("tunnel script: health-checks, supervises and restarts cloudflared", async () => {
  const stubs = makeStubs();
  const child = runScript(stubs, {}, ["--", "--filter", "live=true"]);
  const restarted = await waitFor(
    () => read(`${stubs}/deno-calls`).trim().split("\n").length >= 2,
    15_000,
  );
  // Give the post-restart health check a moment
  await waitFor(() => read(`${stubs}/curl-calls`).includes("second-run-two"), 5_000);
  const { out } = await stop(child);
  assert(restarted, out);

  // Never published the api host
  assert(!out.includes("Tunnel ready: https://api."), out);
  assert(out.includes("Tunnel ready: https://first-run-one.trycloudflare.com"), out);
  // Health check hit local and public state endpoints
  const curls = read(`${stubs}/curl-calls`);
  assert(curls.includes(`http://127.0.0.1:3001/s/${SID}/api/state`), curls);
  assert(curls.includes(`https://first-run-one.trycloudflare.com/s/${SID}/api/state`), curls);
  // Loud warnings on exit + hostname change
  assert(out.includes("cloudflared EXITED"), out);
  assert(out.includes("hostname CHANGED"), out);
  assert(out.includes("RESCAN the QR"), out);
  // Unconfigured → quick tunnel with a loud warning
  assert(out.includes("QUICK TUNNEL (no named tunnel: not configured)"), out);
  assert(out.includes("CHANGE on EVERY restart"), out);
  assert(
    read(`${stubs}/cf-calls`).startsWith(
      "args=tunnel --no-autoupdate --config CFG --url http://127.0.0.1:3001 token= name=",
    ),
    read(`${stubs}/cf-calls`),
  );
  // App restarted with the new PUBLIC_URL, same session, not fresh, same args
  const calls = read(`${stubs}/deno-calls`).trim().split("\n");
  assert(calls[0]!.startsWith("PUBLIC_URL=https://first-run-one.trycloudflare.com SESSION_FRESH=1"), calls[0]);
  assertEquals(
    calls[1],
    `PUBLIC_URL=https://second-run-two.trycloudflare.com SESSION_FRESH=0 SESSION_ID=${SID} args=run -P main.ts -- -- --filter live=true`,
  );
  // Cleanup (and the restart) stopped the app wrapper and its child server
  assert(await waitFor(() => !alive(`${stubs}/deno-pid`), 3_000), "deno stub still running");
  assert(await waitFor(() => !anyDenoChildAlive(stubs), 3_000), "deno child still running");
  assert(await waitFor(() => !alive(`${stubs}/cf-pid`), 3_000), "cloudflared stub still running");
  Deno.removeSync(stubs, { recursive: true });
});

Deno.test("tunnel script: fails loudly when PUBLIC_URL does not answer", async () => {
  const stubs = makeStubs({ publicCurlFails: true });
  const child = runScript(stubs, {});
  const res = await child.output();
  const dec = new TextDecoder();
  const out = dec.decode(res.stdout) + dec.decode(res.stderr);
  assertEquals(res.code, 1, out);
  assert(out.includes("Health check FAILED: PUBLIC_URL does not answer"), out);
  assert(await waitFor(() => !alive(`${stubs}/deno-pid`), 3_000), "deno stub still running");
  assert(await waitFor(() => !anyDenoChildAlive(stubs), 3_000), "deno child still running");
  assert(await waitFor(() => !alive(`${stubs}/cf-pid`), 3_000), "cloudflared stub still running");
  Deno.removeSync(stubs, { recursive: true });
});

Deno.test("tunnel script: TUNNEL_TOKEN runs a named tunnel without exposing the token", async () => {
  const stubs = makeStubs();
  const token = "secret-token-value-123";
  const child = runScript(stubs, {
    TUNNEL_TOKEN: token,
    PUBLIC_URL: "https://quiz.example.com/",
  });
  await waitFor(() => read(`${stubs}/curl-calls`).includes("quiz.example.com"), 10_000);
  const { out } = await stop(child);
  const cf = read(`${stubs}/cf-calls`);
  assertEquals(cf.trim(), "args=tunnel --no-autoupdate --config CFG run token=set name=");
  assert(!cf.includes(token), "token on cloudflared command line");
  assert(!out.includes(token), "token printed");
  assert(read(`${stubs}/deno-calls`).startsWith("PUBLIC_URL=https://quiz.example.com "));
  assert(read(`${stubs}/curl-calls`).includes(`https://quiz.example.com/s/${SID}/api/state`));
  Deno.removeSync(stubs, { recursive: true });
});

Deno.test("tunnel script: TUNNEL_NAME runs a named tunnel to the player port", async () => {
  const stubs = makeStubs();
  const child = runScript(stubs, {
    TUNNEL_NAME: "qwuo",
    PUBLIC_URL: "https://quiz.example.com",
  });
  await waitFor(() => read(`${stubs}/curl-calls`).includes("quiz.example.com"), 10_000);
  await waitFor(() => false, 300);
  const { out } = await stop(child);
  // Own --config (never ~/.cloudflared/config.yml); TUNNEL_NAME not in cloudflared's env
  assertEquals(
    read(`${stubs}/cf-calls`).trim(),
    "args=tunnel --no-autoupdate --config CFG run --url http://127.0.0.1:3001 qwuo token= name=",
  );
  assert(out.includes("Health check OK: phones can reach https://quiz.example.com"), out);
  assert(!out.includes("QUICK TUNNEL"), out);
  Deno.removeSync(stubs, { recursive: true });
});

Deno.test("load_tunnel_env: parses the file; the environment wins", async () => {
  const dir = Deno.makeTempDirSync({ prefix: "qwuo-envt-" });
  const file = `${dir}/.env.tunnel`;
  Deno.writeTextFileSync(
    file,
    `# comment\n\nexport TUNNEL_NAME="from-file"\nPUBLIC_URL = 'https://file.example.com'\r\n` +
      `TUNNEL_TOKEN=file-token\nTUNNEL_CRED_FILE=/x/creds.json\nOTHER=ignored\nnot a line\n`,
  );
  const r = await bash(
    `set -euo pipefail; . '${LIB}'; TUNNEL_NAME=from-env; TUNNEL_TOKEN=; load_tunnel_env '${file}'; ` +
      `echo "name=$TUNNEL_NAME url=$PUBLIC_URL token=[$TUNNEL_TOKEN] cred=$TUNNEL_CRED_FILE other=\${OTHER:-} keys=$LOADED_TUNNEL_KEYS"; ` +
      `load_tunnel_env '${dir}/missing'; echo "missing keys=[$LOADED_TUNNEL_KEYS]"`,
  );
  assertEquals(r.code, 0, r.out);
  assertEquals(
    r.out.trim(),
    "name=from-env url=https://file.example.com token=[] cred=/x/creds.json other= keys=PUBLIC_URL TUNNEL_CRED_FILE\n" +
      "missing keys=[]",
  );
  Deno.removeSync(dir, { recursive: true });
});

Deno.test("tunnel script: loads .env.tunnel (token never printed)", async () => {
  const stubs = makeStubs();
  const token = "file-secret-token-456";
  Deno.writeTextFileSync(
    `${stubs}/env-tunnel`,
    `TUNNEL_TOKEN=${token}\nPUBLIC_URL=https://quiz.example.com\n`,
  );
  const child = runScript(stubs, { TUNNEL_ENV_FILE: `${stubs}/env-tunnel` });
  await waitFor(() => read(`${stubs}/curl-calls`).includes("quiz.example.com"), 10_000);
  const { out } = await stop(child);
  assert(out.includes("TUNNEL_TOKEN PUBLIC_URL"), out);
  assert(!out.includes(token), "token printed");
  const cf = read(`${stubs}/cf-calls`);
  assertEquals(cf.trim(), "args=tunnel --no-autoupdate --config CFG run token=set name=");
  assert(read(`${stubs}/deno-calls`).startsWith("PUBLIC_URL=https://quiz.example.com "));
  Deno.removeSync(stubs, { recursive: true });
});

Deno.test("tunnel script: environment overrides .env.tunnel", async () => {
  const stubs = makeStubs();
  Deno.writeTextFileSync(
    `${stubs}/env-tunnel`,
    `TUNNEL_NAME=file-tunnel\nPUBLIC_URL=https://file.example.com\nTUNNEL_CRED_FILE=/creds/file.json\n`,
  );
  const child = runScript(stubs, {
    TUNNEL_ENV_FILE: `${stubs}/env-tunnel`,
    TUNNEL_NAME: "env-tunnel",
    PUBLIC_URL: "https://env.example.com",
  });
  await waitFor(() => read(`${stubs}/curl-calls`).includes("env.example.com"), 10_000);
  await stop(child);
  assertEquals(
    read(`${stubs}/cf-calls`).trim(),
    "args=tunnel --no-autoupdate --config CFG run --url http://127.0.0.1:3001 " +
      "--credentials-file /creds/file.json env-tunnel token= name=",
  );
  assert(read(`${stubs}/deno-calls`).startsWith("PUBLIC_URL=https://env.example.com "));
  assert(!read(`${stubs}/curl-calls`).includes("file.example.com"));
  Deno.removeSync(stubs, { recursive: true });
});

for (
  const [kind, env] of [
    ["TUNNEL_NAME", { TUNNEL_NAME: "qwuo" }],
    ["TUNNEL_TOKEN", { TUNNEL_TOKEN: "secret-token-789" }],
  ] as const
) {
  Deno.test(`tunnel script: ${kind} health-check failure falls back to a quick tunnel`, async () => {
    const stubs = makeStubs({ failHost: "quiz.example.com", quickStaysUp: true });
    const child = runScript(stubs, { ...env, PUBLIC_URL: "https://quiz.example.com" });
    const ok = await waitFor(
      () => read(`${stubs}/curl-calls`).includes("first-run-one.trycloudflare.com"),
      15_000,
    );
    await waitFor(() => false, 300);
    const { out } = await stop(child);
    assert(ok, out);
    assert(out.includes("NAMED TUNNEL FAILED"), out);
    assert(out.includes("QUICK TUNNEL (no named tunnel: the named tunnel failed)"), out);
    assert(out.includes("CHANGE on EVERY restart"), out);
    assert(out.includes("Health check OK: phones can reach https://first-run-one.trycloudflare.com"), out);
    assert(!out.includes("secret-token-789"), "token printed");
    // Quick cloudflared gets neither the token nor the tunnel name
    const cf = read(`${stubs}/cf-calls`).trim().split("\n");
    assertEquals(cf.length, 2, cf.join("\n"));
    assert(cf[0]!.includes(" run"), cf[0]);
    assertEquals(
      cf[1],
      "args=tunnel --no-autoupdate --config CFG --url http://127.0.0.1:3001 token= name=",
    );
    // App restarted on the quick URL with the same session
    const calls = read(`${stubs}/deno-calls`).trim().split("\n");
    assertEquals(calls.length, 2, calls.join("\n"));
    assert(calls[0]!.startsWith("PUBLIC_URL=https://quiz.example.com SESSION_FRESH=1"), calls[0]);
    assert(
      calls[1]!.startsWith(
        `PUBLIC_URL=https://first-run-one.trycloudflare.com SESSION_FRESH=0 SESSION_ID=${SID}`,
      ),
      calls[1],
    );
    assert(await waitFor(() => !alive(`${stubs}/cf-pid`), 3_000), "cloudflared stub still running");
    Deno.removeSync(stubs, { recursive: true });
  });
}

Deno.test("tunnel script: named tunnel without PUBLIC_URL is rejected", async () => {
  const stubs = makeStubs();
  const envs: Record<string, string>[] = [{ TUNNEL_TOKEN: "x" }, { TUNNEL_NAME: "qwuo" }];
  for (const env of envs) {
    const res = await runScript(stubs, env).output();
    const out = new TextDecoder().decode(res.stderr);
    assertEquals(res.code, 1);
    assert(out.includes("needs PUBLIC_URL"), out);
  }
  assertEquals(read(`${stubs}/cf-calls`), "");
  Deno.removeSync(stubs, { recursive: true });
});
