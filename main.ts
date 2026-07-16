import {
  loadConfig,
  playerJoinUrl,
  readActiveSessionId,
  snapshotPath,
  writeActiveSessionId,
} from "./src/config.ts";
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

/** Resolve active session id: env → pointer → mint UUID. */
async function resolveSessionId(): Promise<string> {
  if (config.sessionId) return config.sessionId;
  const fromPointer = await readActiveSessionId(config.sessionsDir);
  if (fromPointer) return fromPointer;
  return crypto.randomUUID();
}

let sessionId = await resolveSessionId();
let path = snapshotPath(config.sessionsDir, sessionId);

if (config.sessionFresh) {
  try {
    await clearSnapshot(path);
    // No SESSION_ID: mint a new room id after wipe
    if (!config.sessionId) {
      sessionId = crypto.randomUUID();
      path = snapshotPath(config.sessionsDir, sessionId);
    }
    console.log(`SESSION_FRESH: cleared snapshot; session id ${sessionId}`);
  } catch (err) {
    console.error(`SESSION_FRESH: failed to clear snapshot:`, err);
  }
}

let session: Session;
if (config.sessionFresh) {
  session = new Session(quiz);
} else {
  const snapshot = await loadSnapshot(path, fingerprint);
  if (snapshot) {
    session = sessionFromSnapshot(quiz, snapshot);
    console.log(
      `Restored session ${sessionId} from ${path} (phase=${session.phase}, participants=${session.participantCount()})`,
    );
  } else {
    session = new Session(quiz);
  }
}

await writeActiveSessionId(config.sessionsDir, sessionId);

const hooks: SessionPersistHooks = {
  save: async () => {
    await saveSnapshot(path, sessionToSnapshot(session, fingerprint));
  },
  clear: async () => {
    await clearSnapshot(path);
  },
};

const joinUrl = playerJoinUrl(config, sessionId);

const projectorHandler = createProjectorHandler(
  session,
  config,
  sessionId,
  hooks,
);
const playerHandler = createPlayerHandler(session, sessionId, hooks);

function onListenError(
  role: string,
  hostname: string,
  port: number,
  err: unknown,
): never {
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
    { hostname: "127.0.0.1", port: config.playerPort, onListen: () => {} },
    playerHandler,
  );
} catch (err) {
  onListenError("player", "127.0.0.1", config.playerPort, err);
}

console.log(`Quiz: ${quiz.title} (${quiz.questions.length} questions)`);
console.log(`Session id: ${sessionId}`);
console.log(`Session snapshot: ${path}`);
console.log(
  `Projector (localhost only): http://127.0.0.1:${config.projectorPort}/s/${sessionId}/`,
);
console.log(
  `Player (localhost; tunnel this): http://127.0.0.1:${config.playerPort}/s/${sessionId}/`,
);
console.log(`Player join URL (QR):       ${joinUrl}`);
if (!config.publicUrl) {
  console.log(
    `Tip: set PUBLIC_URL via deno task start:tunnel so phones can scan the QR.`,
  );
}
