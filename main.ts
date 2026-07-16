import { loadConfig, playerJoinUrl } from "./src/config.ts";
import { loadQuiz } from "./src/quiz.ts";
import { Session } from "./src/session.ts";
import {
  createPlayerHandler,
  createProjectorHandler,
  type SessionPersistHooks,
} from "./src/http.ts";
import {
  clearSnapshot,
  loadSnapshot,
  quizFingerprint,
  saveSnapshot,
  sessionFromSnapshot,
  sessionToSnapshot,
} from "./src/persist.ts";

const config = loadConfig();

let quiz;
try {
  quiz = await loadQuiz(config.quizPath);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Quiz load failed: ${msg}`);
  Deno.exit(1);
}

const fingerprint = await quizFingerprint(quiz);

if (config.sessionFresh) {
  try {
    await clearSnapshot(config.sessionPath);
    console.log(`SESSION_FRESH: cleared snapshot at ${config.sessionPath}`);
  } catch (err) {
    console.error(`SESSION_FRESH: failed to clear snapshot:`, err);
  }
}

let session: Session;
if (config.sessionFresh) {
  session = new Session(quiz);
} else {
  const snapshot = await loadSnapshot(config.sessionPath, fingerprint);
  if (snapshot) {
    session = sessionFromSnapshot(quiz, snapshot);
    console.log(
      `Restored session from ${config.sessionPath} (phase=${session.phase}, participants=${session.participantCount()})`,
    );
  } else {
    session = new Session(quiz);
  }
}

const hooks: SessionPersistHooks = {
  save: async () => {
    await saveSnapshot(
      config.sessionPath,
      sessionToSnapshot(session, fingerprint),
    );
  },
  clear: async () => {
    await clearSnapshot(config.sessionPath);
  },
};

const joinUrl = playerJoinUrl(config);

const projectorHandler = createProjectorHandler(session, config, hooks);
const playerHandler = createPlayerHandler(session, hooks);

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
console.log(`Session snapshot: ${config.sessionPath}`);
console.log(`Projector (localhost only): http://127.0.0.1:${config.projectorPort}`);
console.log(`Player (tunnel this):       http://0.0.0.0:${config.playerPort}`);
console.log(`Player join URL (QR):       ${joinUrl}`);
if (!config.publicUrl) {
  console.log(
    `Tip: set PUBLIC_URL to your cloudflared URL so phones can scan the QR.`,
  );
}
