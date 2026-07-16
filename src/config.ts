export type Config = {
  publicUrl: string | null;
  projectorPort: number;
  playerPort: number;
  quizPath: string;
};

function parsePort(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`Invalid ${name}: "${raw}" (expected integer 1–65535)`);
    Deno.exit(1);
  }
  return n;
}

export function loadConfig(): Config {
  const publicUrl = Deno.env.get("PUBLIC_URL")?.trim() || null;
  return {
    publicUrl,
    projectorPort: parsePort(Deno.env.get("PROJECTOR_PORT"), 3000, "PROJECTOR_PORT"),
    playerPort: parsePort(Deno.env.get("PLAYER_PORT"), 3001, "PLAYER_PORT"),
    quizPath: Deno.env.get("QUIZ_PATH")?.trim() || "quiz.json",
  };
}

export function playerJoinUrl(config: Config): string {
  if (config.publicUrl) {
    return config.publicUrl.replace(/\/$/, "");
  }
  return `http://localhost:${config.playerPort}`;
}
