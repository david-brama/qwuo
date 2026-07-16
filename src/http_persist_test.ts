import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";
import type { Config } from "./config.ts";
import {
  createPlayerHandler,
  createProjectorHandler,
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

const config: Config = {
  publicUrl: null,
  projectorPort: 3000,
  playerPort: 3001,
  quizPath: "quiz.json",
  sessionPath: ".qwuo/session.json",
  sessionFresh: false,
};

Deno.test("projector POST /api/reset clears session and calls clear hook", async () => {
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
  const handler = createProjectorHandler(session, config, hooks);
  const res = await handler(
    new Request("http://127.0.0.1/api/reset", { method: "POST" }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.phase, "LOBBY");
  assertEquals(body.participantCount, 0);
  assertEquals(cleared, 1);
});

Deno.test("player POST /api/reset rejected; session unchanged", async () => {
  const session = new Session(quiz);
  session.join("KeepMe");
  let cleared = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {},
    clear: async () => {
      cleared += 1;
    },
  };
  const handler = createPlayerHandler(session, hooks);
  const res = await handler(
    new Request("http://0.0.0.0/api/reset", { method: "POST" }),
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
  const player = createPlayerHandler(session, hooks);
  const projector = createProjectorHandler(session, config, hooks);

  const joinRes = await player(
    new Request("http://0.0.0.0/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Zed" }),
    }),
  );
  assertEquals(joinRes.status, 200);
  const { id } = await joinRes.json();

  await projector(
    new Request("http://127.0.0.1/api/advance", { method: "POST" }),
  );

  const ansRes = await player(
    new Request("http://0.0.0.0/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, choiceIndex: 0 }),
    }),
  );
  assertEquals(ansRes.status, 200);

  // join + advance + answer
  assertEquals(saves, 3);
});
