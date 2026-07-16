export type Config = {
  publicUrl: string | null;
  projectorPort: number;
  playerPort: number;
  quizPath: string;
  /** Local JSON snapshot path for live session durability. */
  sessionPath: string;
  /** When true, ignore/delete snapshot on boot and start empty LOBBY. */
  sessionFresh: boolean;
};

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

export function loadConfig(): Config {
  const publicUrl = Deno.env.get("PUBLIC_URL")?.trim() || null;
  return {
    publicUrl,
    projectorPort: envPort("PROJECTOR_PORT", 3000),
    playerPort: envPort("PLAYER_PORT", 3001),
    quizPath: Deno.env.get("QUIZ_PATH")?.trim() || "quiz.json",
    sessionPath: Deno.env.get("SESSION_PATH")?.trim() || ".qwuo/session.json",
    sessionFresh: envTruthy("SESSION_FRESH"),
  };
}

export function playerJoinUrl(config: Config): string {
  if (config.publicUrl) {
    return config.publicUrl.replace(/\/$/, "");
  }
  return `http://localhost:${config.playerPort}`;
}
