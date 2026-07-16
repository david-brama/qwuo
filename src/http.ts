import type { Session } from "./session.ts";
import { SessionError } from "./session.ts";
import type { Config } from "./config.ts";
import { playerJoinUrl } from "./config.ts";
import { qrSvg } from "./qr.ts";
import { projectorHtml } from "./projector_ui.ts";
import { playerHtml } from "./player_ui.ts";

const MAX_BODY_BYTES = 4096;

/** Join: 10/min per client IP. Answer: 60/min (poll-safe headroom). */
const JOIN_LIMIT = { max: 10, windowMs: 60_000 };
const ANSWER_LIMIT = { max: 60, windowMs: 60_000 };

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
};

class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const start = now - this.windowMs;
    let times = this.hits.get(key) ?? [];
    times = times.filter((t) => t > start);
    if (times.length >= this.max) {
      this.hits.set(key, times);
      return false;
    }
    times.push(now);
    this.hits.set(key, times);
    return true;
  }
}

const joinLimiter = new RateLimiter(JOIN_LIMIT.max, JOIN_LIMIT.windowMs);
const answerLimiter = new RateLimiter(ANSWER_LIMIT.max, ANSWER_LIMIT.windowMs);

function clientKey(req: Request, info?: Deno.ServeHandlerInfo): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return `cf:${cf}`;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return `xff:${first}`;
  }
  const addr = info?.remoteAddr;
  if (addr && "hostname" in addr) return `ip:${addr.hostname}`;
  return "unknown";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}

function tooManyRequests(): Response {
  return json({ error: "Too many requests" }, 429);
}

async function readJson(req: Request): Promise<unknown> {
  const cl = req.headers.get("content-length");
  if (cl !== null) {
    const n = Number(cl);
    if (!Number.isInteger(n) || n < 0 || n > MAX_BODY_BYTES) {
      throw new SessionError("Request body too large", 413);
    }
  }

  let text: string;
  try {
    text = await readBodyLimited(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof SessionError) throw err;
    throw new SessionError("Invalid JSON body", 400);
  }

  if (!text) {
    throw new SessionError("Invalid JSON body", 400);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SessionError("Invalid JSON body", 400);
  }
}

async function readBodyLimited(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore cancel errors
      }
      throw new SessionError("Request body too large", 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Optional hooks so join/answer/advance/reset can durable-save without FS in unit tests. */
export type SessionPersistHooks = {
  /** After successful join / answer / advance. Errors are logged; response still succeeds. */
  save: () => Promise<void>;
  /** After host reset: clear snapshot file. */
  clear: () => Promise<void>;
};

async function runHook(
  label: string,
  fn: (() => Promise<void>) | undefined,
): Promise<void> {
  if (!fn) return;
  try {
    await fn();
  } catch (err) {
    console.error(`Session ${label} failed:`, err);
  }
}

export function createProjectorHandler(
  session: Session,
  config: Config,
  hooks?: SessionPersistHooks,
) {
  const joinUrl = playerJoinUrl(config);
  const qr = qrSvg(joinUrl);
  const page = projectorHtml(joinUrl, qr);

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/" || path === "/index.html") {
        if (req.method !== "GET") return methodNotAllowed();
        return html(page);
      }

      if (path === "/api/state") {
        if (req.method !== "GET") return methodNotAllowed();
        return json(session.projectorState());
      }

      if (path === "/api/advance") {
        if (req.method !== "POST") return methodNotAllowed();
        session.advance();
        await runHook("save", hooks?.save);
        return json(session.projectorState());
      }

      if (path === "/api/reset") {
        if (req.method !== "POST") return methodNotAllowed();
        session.reset();
        await runHook("clear", hooks?.clear);
        return json(session.projectorState());
      }

      return notFound();
    } catch (err) {
      return handleError(err);
    }
  };
}

export function createPlayerHandler(
  session: Session,
  hooks?: SessionPersistHooks,
) {
  const page = playerHtml();

  return async (
    req: Request,
    info?: Deno.ServeHandlerInfo,
  ): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const key = clientKey(req, info);

    try {
      if (path === "/" || path === "/index.html") {
        if (req.method !== "GET") return methodNotAllowed();
        return html(page);
      }

      if (path === "/api/state") {
        if (req.method !== "GET") return methodNotAllowed();
        const id = url.searchParams.get("id");
        return json(session.playerState(id));
      }

      if (path === "/api/join") {
        if (req.method !== "POST") return methodNotAllowed();
        if (!joinLimiter.allow(key)) return tooManyRequests();
        const body = await readJson(req) as { name?: unknown };
        const name = typeof body.name === "string" ? body.name : "";
        const result = session.join(name);
        await runHook("save", hooks?.save);
        return json(result);
      }

      if (path === "/api/answer") {
        if (req.method !== "POST") return methodNotAllowed();
        if (!answerLimiter.allow(key)) return tooManyRequests();
        const body = await readJson(req) as {
          id?: unknown;
          choiceIndex?: unknown;
        };
        const id = typeof body.id === "string" ? body.id : "";
        const choiceIndex = typeof body.choiceIndex === "number"
          ? body.choiceIndex
          : NaN;
        const result = session.answer(id, choiceIndex);
        await runHook("save", hooks?.save);
        return json(result);
      }

      // Host-only routes rejected on player port
      if (path === "/api/advance") {
        return json({ error: "Advance is only available on the projector port" }, 403);
      }
      if (path === "/api/reset") {
        return json({ error: "Reset is only available on the projector port" }, 403);
      }

      return notFound();
    } catch (err) {
      return handleError(err);
    }
  };
}

function handleError(err: unknown): Response {
  if (err instanceof SessionError) {
    return json({ error: err.message }, err.status);
  }
  console.error(err);
  return json({ error: "Internal server error" }, 500);
}
