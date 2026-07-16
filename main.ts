import { loadConfig, playerJoinUrl } from "./src/config.ts";
import { loadQuiz } from "./src/quiz.ts";
import { Session } from "./src/session.ts";
import { createPlayerHandler, createProjectorHandler } from "./src/http.ts";

const config = loadConfig();

let quiz;
try {
  quiz = await loadQuiz(config.quizPath);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Quiz load failed: ${msg}`);
  Deno.exit(1);
}

const session = new Session(quiz);
const joinUrl = playerJoinUrl(config);

const projectorHandler = createProjectorHandler(session, config);
const playerHandler = createPlayerHandler(session);

function onListenError(role: string, hostname: string, port: number, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    `Failed to start ${role} server on ${hostname}:${port}: ${msg}`,
  );
  Deno.exit(1);
}

try {
  Deno.serve(
    { hostname: "127.0.0.1", port: config.projectorPort, onListen: () => {} },
    projectorHandler,
  );
} catch (err) {
  onListenError("projector", "127.0.0.1", config.projectorPort, err);
}

try {
  Deno.serve(
    { hostname: "0.0.0.0", port: config.playerPort, onListen: () => {} },
    playerHandler,
  );
} catch (err) {
  onListenError("player", "0.0.0.0", config.playerPort, err);
}

console.log(`Quiz: ${quiz.title} (${quiz.questions.length} questions)`);
console.log(`Projector (localhost only): http://127.0.0.1:${config.projectorPort}`);
console.log(`Player (tunnel this):       http://0.0.0.0:${config.playerPort}`);
console.log(`Player join URL (QR):       ${joinUrl}`);
if (!config.publicUrl) {
  console.log(
    `Tip: set PUBLIC_URL to your cloudflared URL so phones can scan the QR.`,
  );
}
