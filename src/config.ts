export type Config = {
  publicUrl: string | null;
  projectorPort: number;
  playerPort: number;
  quizPath: string;
  /** Directory for session snapshots and active pointer. */
  sessionsDir: string;
  /** Optional fixed session UUID; if unset, resolved via pointer or mint. */
  sessionId: string | null;
  /** When true, ignore/delete snapshot on boot and start empty LOBBY. */
  sessionFresh: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function envTruthy(name: string): boolean {
  const v = Deno.env.get(name)?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envPort(name: string, fallback: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export function isValidSessionId(id: string): boolean {
  return UUID_RE.test(id);
}

export function snapshotPath(sessionsDir: string, sessionId: string): string {
  return `${sessionsDir.replace(/\/$/, "")}/${sessionId}.json`;
}

export function pointerPath(sessionsDir: string): string {
  return `${sessionsDir.replace(/\/$/, "")}/current`;
}

export async function readActiveSessionId(
  sessionsDir: string,
): Promise<string | null> {
  try {
    const text = (await Deno.readTextFile(pointerPath(sessionsDir))).trim();
    if (isValidSessionId(text)) return text;
    return null;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    console.error(`Active session pointer unreadable:`, err);
    return null;
  }
}

export async function writeActiveSessionId(
  sessionsDir: string,
  sessionId: string,
): Promise<void> {
  const dir = sessionsDir.replace(/\/$/, "");
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(pointerPath(sessionsDir), sessionId + "\n");
}

export function loadConfig(): Config {
  const publicUrl = Deno.env.get("PUBLIC_URL")?.trim() || null;
  const rawId = Deno.env.get("SESSION_ID")?.trim() || null;
  const sessionId = rawId && isValidSessionId(rawId) ? rawId : null;
  if (rawId && !sessionId) {
    console.error(
      `SESSION_ID is not a valid UUID (${rawId}); ignoring and resolving via pointer/mint`,
    );
  }
  return {
    publicUrl,
    projectorPort: envPort("PROJECTOR_PORT", 3000),
    playerPort: envPort("PLAYER_PORT", 3001),
    quizPath: Deno.env.get("QUIZ_PATH")?.trim() || "quiz.json",
    sessionsDir: Deno.env.get("SESSIONS_DIR")?.trim() || ".qwuo",
    sessionId,
    sessionFresh: envTruthy("SESSION_FRESH"),
  };
}

/** Origin for player (no session path). */
export function playerOrigin(config: Config): string {
  if (config.publicUrl) {
    return config.publicUrl.replace(/\/$/, "");
  }
  return `http://localhost:${config.playerPort}`;
}

/** Session-scoped player join URL: `{origin}/s/{sessionId}`. */
export function playerJoinUrl(config: Config, sessionId: string): string {
  const origin = playerOrigin(config);
  return `${origin}/s/${sessionId}`;
}
