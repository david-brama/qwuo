import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";
import type { Config } from "./config.ts";
import { playerJoinUrl } from "./config.ts";
import {
  createPlayerHandler,
  createProjectorHandler,
  parseSessionPath,
  type SessionPersistHooks,
} from "./http.ts";

const quiz: Quiz = {
  title: "HTTP Persist",
  questions: [
    {
      text: "Q?",
      choices: ["A", "B"],
      correct: 0,
      explain: "",
    },
  ],
};

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const BASE = `/s/${SESSION_ID}`;

const config: Config = {
  publicUrl: null,
  projectorPort: 3000,
  playerPort: 3001,
  quizPath: "quiz.json",
  sessionsDir: ".qwuo",
  sessionId: SESSION_ID,
  sessionFresh: false,
};

function api(path: string): string {
  return `http://127.0.0.1${BASE}${path}`;
}

Deno.test("projector rejects non-local Origin on mutate", async () => {
  const session = new Session(quiz);
  session.join("Before");
  const handler = createProjectorHandler(session, config, SESSION_ID);
  const res = await handler(
    new Request(api("/api/reset"), {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
  );
  assertEquals(res.status, 403);
  assertEquals(session.participantCount(), 1);
});

Deno.test("projector allows local Origin on mutate", async () => {
  const session = new Session(quiz);
  session.join("Local");
  const handler = createProjectorHandler(session, config, SESSION_ID);
  const res = await handler(
    new Request(api("/api/reset"), {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000" },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(session.participantCount(), 0);
});

Deno.test("projector POST /s/{id}/api/reset clears session and calls clear hook", async () => {
  const session = new Session(quiz);
  session.join("Host-run");
  session.advance();
  let cleared = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {},
    clear: async () => {
      cleared += 1;
    },
  };
  const handler = createProjectorHandler(session, config, SESSION_ID, hooks);
  const res = await handler(
    new Request(api("/api/reset"), { method: "POST" }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.phase, "LOBBY");
  assertEquals(body.participantCount, 0);
  assertEquals(cleared, 1);
});

Deno.test("player POST /s/{id}/api/reset rejected; session unchanged", async () => {
  const session = new Session(quiz);
  session.join("KeepMe");
  let cleared = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {},
    clear: async () => {
      cleared += 1;
    },
  };
  const handler = createPlayerHandler(session, SESSION_ID, hooks);
  const res = await handler(
    new Request(`http://0.0.0.0${BASE}/api/reset`, { method: "POST" }),
  );
  assertEquals(res.status, 403);
  assertEquals(session.participantCount(), 1);
  assertEquals(cleared, 0);
});

Deno.test("join/answer/advance invoke save hook", async () => {
  const session = new Session(quiz);
  let saves = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {
      saves += 1;
    },
    clear: async () => {},
  };
  const player = createPlayerHandler(session, SESSION_ID, hooks);
  const projector = createProjectorHandler(session, config, SESSION_ID, hooks);

  const joinRes = await player(
    new Request(`http://0.0.0.0${BASE}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Zed" }),
    }),
  );
  assertEquals(joinRes.status, 200);
  const { id } = await joinRes.json();

  await projector(
    new Request(api("/api/advance"), { method: "POST" }),
  );

  const ansRes = await player(
    new Request(`http://0.0.0.0${BASE}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, choiceIndex: 0 }),
    }),
  );
  assertEquals(ansRes.status, 200);

  // join + advance + answer
  assertEquals(saves, 3);
});

Deno.test("wrong UUID path returns 404", async () => {
  const session = new Session(quiz);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const player = createPlayerHandler(session, SESSION_ID);

  const pRes = await projector(
    new Request(`http://127.0.0.1/s/${OTHER_ID}/api/state`),
  );
  assertEquals(pRes.status, 404);

  const plRes = await player(
    new Request(`http://0.0.0.0/s/${OTHER_ID}/`),
  );
  assertEquals(plRes.status, 404);
});

Deno.test("unscoped / and /api/* return 404", async () => {
  const session = new Session(quiz);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const player = createPlayerHandler(session, SESSION_ID);

  assertEquals(
    (await projector(new Request("http://127.0.0.1/"))).status,
    404,
  );
  assertEquals(
    (await projector(new Request("http://127.0.0.1/api/state"))).status,
    404,
  );
  assertEquals(
    (await player(new Request("http://0.0.0.0/"))).status,
    404,
  );
  assertEquals(
    (await player(new Request("http://0.0.0.0/api/join", { method: "POST" })))
      .status,
    404,
  );
});

Deno.test("malformed session segment returns 404", async () => {
  const session = new Session(quiz);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  assertEquals(
    (await projector(new Request("http://127.0.0.1/s/not-a-uuid/api/state")))
      .status,
    404,
  );
});

Deno.test("session-scoped UI and state serve for active id", async () => {
  const session = new Session(quiz);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const player = createPlayerHandler(session, SESSION_ID);

  const ui = await projector(new Request(api("/")));
  assertEquals(ui.status, 200);
  assertEquals(ui.headers.get("content-type")?.includes("text/html"), true);

  const st = await player(new Request(`http://0.0.0.0${BASE}/api/state`));
  assertEquals(st.status, 200);
  const body = await st.json();
  assertEquals(body.title, "HTTP Persist");
});

Deno.test("playerJoinUrl includes /s/{sessionId}", () => {
  const url = playerJoinUrl(config, SESSION_ID);
  assertEquals(url, `http://localhost:3001/s/${SESSION_ID}`);

  const withPublic: Config = {
    ...config,
    publicUrl: "https://example.trycloudflare.com/",
  };
  assertEquals(
    playerJoinUrl(withPublic, SESSION_ID),
    `https://example.trycloudflare.com/s/${SESSION_ID}`,
  );
});

Deno.test("parseSessionPath extracts id and rest", () => {
  assertEquals(parseSessionPath(`/s/${SESSION_ID}`), {
    sessionId: SESSION_ID,
    rest: "/",
  });
  assertEquals(parseSessionPath(`/s/${SESSION_ID}/`), {
    sessionId: SESSION_ID,
    rest: "/",
  });
  assertEquals(parseSessionPath(`/s/${SESSION_ID}/api/state`), {
    sessionId: SESSION_ID,
    rest: "/api/state",
  });
  assertEquals(parseSessionPath("/"), null);
  assertEquals(parseSessionPath("/api/state"), null);
  assertEquals(parseSessionPath("/s/not-uuid/api"), null);
});

Deno.test("snapshot path uses uuid filename stem", async () => {
  const { snapshotPath } = await import("./config.ts");
  assertEquals(
    snapshotPath(".qwuo", SESSION_ID),
    `.qwuo/${SESSION_ID}.json`,
  );
});
