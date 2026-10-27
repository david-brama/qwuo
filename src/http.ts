import type { Session } from "./session.ts";
import { SessionError } from "./session.ts";
import type { Config } from "./config.ts";
import { isValidSessionId, playerJoinUrl } from "./config.ts";
import { qrSvg } from "./qr.ts";
import { projectorHtml } from "./projector_ui.ts";
import { playerHtml } from "./player_ui.ts";

const MAX_BODY_BYTES = 4096;

/** Optional branding: gitignored `logo.png` in the working directory. */
const LOGO_PATH = "logo.png";

let logoDataUrlCache: string | null | undefined;

/**
 * Load logo.png once if present. Returns a data URL for inline `<img src>`,
 * or null when the file is missing / unreadable (UI simply omits the logo).
 */
export async function loadLogoDataUrl(
  path: string = LOGO_PATH,
): Promise<string | null> {
  if (logoDataUrlCache !== undefined && path === LOGO_PATH) {
    return logoDataUrlCache;
  }
  try {
    const bytes = await Deno.readFile(path);
    if (bytes.byteLength === 0) {
      if (path === LOGO_PATH) logoDataUrlCache = null;
      return null;
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const dataUrl = `data:image/png;base64,${btoa(binary)}`;
    if (path === LOGO_PATH) logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch {
    if (path === LOGO_PATH) logoDataUrlCache = null;
    return null;
  }
}

/** Test helper: clear memoized logo load. */
export function resetLogoCache(): void {
  logoDataUrlCache = undefined;
}

function logoMarkup(logoDataUrl: string | null): string {
  if (!logoDataUrl) return "";
  const src = logoDataUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<img class="brand-logo" src="${src}" alt="" />`;
}

/**
 * Rate limits. A whole classroom usually shares one NAT IP, so joins get a
 * high per-IP ceiling and answers are limited per participant id (a player
 * answers once per question; the cap only stops a single client spamming).
 * The per-IP answer cap is a backstop for unknown/rotating ids.
 */
export type RateLimits = {
  joinPerIp: { max: number; windowMs: number };
  answerPerParticipant: { max: number; windowMs: number };
  answerPerIp: { max: number; windowMs: number };
};

export const DEFAULT_RATE_LIMITS: RateLimits = {
  joinPerIp: { max: 1200, windowMs: 60_000 },
  answerPerParticipant: { max: 30, windowMs: 60_000 },
  answerPerIp: { max: 6000, windowMs: 60_000 },
};

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
};

/** Sliding-window limiter; stale keys are swept when the map grows large. */
class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const start = now - this.windowMs;
    if (this.hits.size > 10_000) this.sweep(start);
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

  private sweep(start: number): void {
    for (const [k, times] of this.hits) {
      if (times.every((t) => t <= start)) this.hits.delete(k);
    }
  }
}

/**
 * Client IP for rate limiting. Uses the socket address unless
 * `trustProxyHeader` (TRUST_PROXY_HEADER) names a header set by a trusted
 * proxy. For `x-forwarded-for` the right-most entry is used (the one the
 * nearest proxy appended); other headers are taken as a single value.
 */
export function clientKey(
  req: Request,
  info?: Deno.ServeHandlerInfo,
  trustProxyHeader?: string | null,
): string {
  if (trustProxyHeader) {
    const raw = req.headers.get(trustProxyHeader);
    if (raw) {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
      const ip = trustProxyHeader.toLowerCase() === "x-forwarded-for"
        ? parts[parts.length - 1]
        : parts[0];
      if (ip) return `hdr:${ip}`;
    }
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

function forbiddenOrigin(): Response {
  return json({ error: "Forbidden origin" }, 403);
}

/** Loopback only: 127.0.0.1, localhost, ::1 (with or without brackets). */
export function isLocalOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/**
 * Projector CSRF guard: if browser sends Origin and it is not loopback → 403.
 * Missing Origin allowed (curl, unit tests). Non-local Origin is the CSRF case.
 */
function rejectNonLocalOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin === null || origin === "") return null;
  if (isLocalOrigin(origin)) return null;
  return forbiddenOrigin();
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

/**
 * Parse `/s/{uuid}` or `/s/{uuid}/…`.
 * Returns null if path is not a session-scoped path (including malformed UUID).
 */
export function parseSessionPath(
  pathname: string,
): { sessionId: string; rest: string } | null {
  const m = pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const sessionId = m[1];
  if (!isValidSessionId(sessionId)) return null;
  const rest = m[2] ?? "/";
  return { sessionId, rest };
}

/** Optional hooks so join/answer/advance/reset can durable-save without FS in unit tests. */
export type SessionPersistHooks = {
  /** After successful join / answer / advance / back. Errors are logged; response still succeeds. */
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
  sessionId: string,
  hooks?: SessionPersistHooks,
  logoDataUrl: string | null = null,
) {
  const joinUrl = playerJoinUrl(config, sessionId);
  const qr = qrSvg(joinUrl);
  const page = projectorHtml(joinUrl, qr, logoMarkup(logoDataUrl));

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const parsed = parseSessionPath(url.pathname);

    try {
      const badOrigin = rejectNonLocalOrigin(req);
      if (badOrigin) return badOrigin;

      if (!parsed || parsed.sessionId !== sessionId) {
        return notFound();
      }

      const path = parsed.rest === "" ? "/" : parsed.rest;

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

      if (path === "/api/back") {
        if (req.method !== "POST") return methodNotAllowed();
        session.back();
        await runHook("save", hooks?.save);
        return json(session.projectorState());
      }

      if (path === "/api/reset") {
        if (req.method !== "POST") return methodNotAllowed();
        session.reset();
        // Soft reset keeps roster/scores — durable-save, do not wipe snapshot.
        await runHook("save", hooks?.save);
        return json(session.projectorState());
      }

      if (path === "/api/filter") {
        if (req.method !== "POST") return methodNotAllowed();
        const body = await readJson(req) as {
          filters?: unknown;
          preview?: unknown;
        };
        if (!Array.isArray(body.filters)) {
          throw new SessionError("filters must be an array", 400);
        }
        const filters: { key: string; value: string }[] = [];
        for (const entry of body.filters) {
          if (
            entry === null ||
            typeof entry !== "object" ||
            Array.isArray(entry)
          ) {
            throw new SessionError("Invalid filter entry", 400);
          }
          const e = entry as Record<string, unknown>;
          if (typeof e.key !== "string" || typeof e.value !== "string") {
            throw new SessionError("Invalid filter entry", 400);
          }
          filters.push({ key: e.key, value: e.value });
        }
        const preview = body.preview === true;
        if (preview) {
          const result = session.previewRuntimeFilters(filters);
          return json({
            preview: true,
            matchCount: result.matchCount,
            bankQuestionCount: result.bankQuestionCount,
            filters: result.filters,
          });
        }
        session.applyRuntimeFilters(filters);
        await runHook("save", hooks?.save);
        return json(session.projectorState());
      }

      return notFound();
    } catch (err) {
      return handleError(err);
    }
  };
}

export type PlayerHandlerOptions = {
  /** Header holding the real client IP (only set behind a trusted proxy). */
  trustProxyHeader?: string | null;
  rateLimits?: RateLimits;
};

export function createPlayerHandler(
  session: Session,
  sessionId: string,
  hooks?: SessionPersistHooks,
  logoDataUrl: string | null = null,
  options: PlayerHandlerOptions = {},
) {
  const page = playerHtml(logoMarkup(logoDataUrl));
  const limits = options.rateLimits ?? DEFAULT_RATE_LIMITS;
  const joinLimiter = new RateLimiter(
    limits.joinPerIp.max,
    limits.joinPerIp.windowMs,
  );
  const answerIdLimiter = new RateLimiter(
    limits.answerPerParticipant.max,
    limits.answerPerParticipant.windowMs,
  );
  const answerIpLimiter = new RateLimiter(
    limits.answerPerIp.max,
    limits.answerPerIp.windowMs,
  );

  return async (
    req: Request,
    info?: Deno.ServeHandlerInfo,
  ): Promise<Response> => {
    const url = new URL(req.url);
    const parsed = parseSessionPath(url.pathname);
    const key = clientKey(req, info, options.trustProxyHeader);

    try {
      if (!parsed || parsed.sessionId !== sessionId) {
        return notFound();
      }

      const path = parsed.rest === "" ? "/" : parsed.rest;

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
        if (!answerIpLimiter.allow(key)) return tooManyRequests();
        const body = await readJson(req) as {
          id?: unknown;
          choiceIndex?: unknown;
        };
        const id = typeof body.id === "string" ? body.id : "";
        // Only known ids get a bucket, so random ids cannot grow the map
        if (session.getParticipant(id) && !answerIdLimiter.allow(`pid:${id}`)) {
          return tooManyRequests();
        }
        const choiceIndex = typeof body.choiceIndex === "number"
          ? body.choiceIndex
          : NaN;
        const result = session.answer(id, choiceIndex);
        await runHook("save", hooks?.save);
        return json(result);
      }

      // Host-only routes rejected on player port
      if (path === "/api/advance") {
        return json(
          { error: "Advance is only available on the projector port" },
          403,
        );
      }
      if (path === "/api/back") {
        return json(
          { error: "Back is only available on the projector port" },
          403,
        );
      }
      if (path === "/api/reset") {
        return json(
          { error: "Reset is only available on the projector port" },
          403,
        );
      }
      if (path === "/api/filter") {
        return json(
          { error: "Filter is only available on the projector port" },
          403,
        );
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
