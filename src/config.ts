export type Config = {
  publicUrl: string | null;
  projectorPort: number;
  playerPort: number;
  quizPath: string;
};



export function loadConfig(): Config {
  const publicUrl = Deno.env.get("PUBLIC_URL")?.trim() || null;
  return {
    publicUrl,
    projectorPort: 3000,
    playerPort: 3001,
    quizPath: "quiz.json",
  };
}

export function playerJoinUrl(config: Config): string {
  if (config.publicUrl) {
    return config.publicUrl.replace(/\/$/, "");
  }
  return `http://localhost:${config.playerPort}`;
}
