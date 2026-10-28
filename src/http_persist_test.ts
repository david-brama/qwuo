import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";
import type { Config } from "./config.ts";
import { playerJoinUrl } from "./config.ts";
import {
  createPlayerHandler,
  createProjectorHandler,
  loadLogoDataUrl,
  parseSessionPath,
  resetLogoCache,
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
  filters: [],
  ids: [],
  trustProxyHeader: null,
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
  assertEquals(session.participantCount(), 1);
});

Deno.test("projector POST /s/{id}/api/reset keeps roster and calls save hook", async () => {
  const session = new Session(quiz);
  session.join("Host-run");
  session.advance();
  let saves = 0;
  let cleared = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {
      saves += 1;
    },
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
  assertEquals(body.participantCount, 1);
  assertEquals(saves, 1);
  assertEquals(cleared, 0);
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
  const html = await ui.text();
  assertEquals(html.includes("answeredCount"), true);
  assertEquals(html.includes("activeUserCount"), true);

  const st = await player(new Request(`http://0.0.0.0${BASE}/api/state`));
  assertEquals(st.status, 200);
  const body = await st.json();
  assertEquals(body.title, "HTTP Persist");

  const projState = await projector(new Request(api("/api/state")));
  assertEquals(projState.status, 200);
  const pbody = await projState.json();
  assertEquals(pbody.activeUserCount, 0);
  assertEquals(pbody.activeAnsweredCount, 0);
  assertEquals("activeUserCount" in body, false);
});

Deno.test("player poll with id marks the participant online", async () => {
  let t = 1_000_000;
  const session = new Session(quiz, { now: () => t });
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const player = createPlayerHandler(session, SESSION_ID);
  const { id } = session.join("Pat");
  const online = async () =>
    (await (await projector(new Request(api("/api/state")))).json()).onlineCount;
  assertEquals(await online(), 1);
  t += 60_000;
  assertEquals(await online(), 0);
  const res = await player(
    new Request(`http://0.0.0.0${BASE}/api/state?id=${id}`),
  );
  await res.body?.cancel();
  assertEquals(await online(), 1);
});

Deno.test("UI omits logo when none provided", async () => {
  const session = new Session(quiz);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const player = createPlayerHandler(session, SESSION_ID);

  const projHtml = await (await projector(new Request(api("/")))).text();
  assertEquals(projHtml.includes('<img class="brand-logo"'), false);
  assertEquals(projHtml.includes('class="shell has-logo"'), false);

  const playHtml = await (await player(new Request(api("/")))).text();
  assertEquals(playHtml.includes('<img class="brand-logo"'), false);
  assertEquals(playHtml.includes('class="shell has-logo"'), false);
});

Deno.test("UI embeds logo data URL top-right when provided", async () => {
  const session = new Session(quiz);
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const projector = createProjectorHandler(
    session,
    config,
    SESSION_ID,
    undefined,
    dataUrl,
  );
  const player = createPlayerHandler(session, SESSION_ID, undefined, dataUrl);

  const projHtml = await (await projector(new Request(api("/")))).text();
  assertEquals(projHtml.includes('<img class="brand-logo"'), true);
  assertEquals(projHtml.includes('class="shell has-logo"'), true);
  assertEquals(projHtml.includes(dataUrl), true);

  const playHtml = await (await player(new Request(api("/")))).text();
  assertEquals(playHtml.includes('<img class="brand-logo"'), true);
  assertEquals(playHtml.includes('class="shell has-logo"'), true);
  assertEquals(playHtml.includes(dataUrl), true);
});

Deno.test("loadLogoDataUrl returns null for missing file", async () => {
  resetLogoCache();
  const missing = await loadLogoDataUrl(
    `.qwuo/no-such-logo-${crypto.randomUUID()}.png`,
  );
  assertEquals(missing, null);
});

Deno.test("loadLogoDataUrl returns data URL for PNG file", async () => {
  resetLogoCache();
  const dir = await Deno.makeTempDir();
  const path = `${dir}/logo.png`;
  // 1×1 transparent PNG
  const png = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ), (c) => c.charCodeAt(0));
  try {
    await Deno.writeFile(path, png);
    const url = await loadLogoDataUrl(path);
    assertEquals(typeof url, "string");
    assertEquals(url?.startsWith("data:image/png;base64,"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
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

const filterQuiz: Quiz = {
  title: "HTTP Filter",
  questions: [
    {
      text: "Q1",
      choices: ["A", "B"],
      correct: 0,
      explain: "",
      metadata: { live: true, domain: "A" },
    },
    {
      text: "Q2",
      choices: ["A", "B"],
      correct: 0,
      explain: "",
      metadata: { live: false, domain: "B" },
    },
  ],
};

Deno.test("projector POST /api/filter preview does not mutate or save", async () => {
  const session = new Session(filterQuiz);
  let saves = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {
      saves += 1;
    },
    clear: async () => {},
  };
  const handler = createProjectorHandler(session, config, SESSION_ID, hooks);
  const res = await handler(
    new Request(api("/api/filter"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filters: [{ key: "live", value: "true" }],
        preview: true,
      }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.preview, true);
  assertEquals(body.matchCount, 1);
  assertEquals(session.questionCount, 2);
  assertEquals(saves, 0);
});

Deno.test("projector POST /api/filter apply in LOBBY saves", async () => {
  const session = new Session(filterQuiz);
  let saves = 0;
  const hooks: SessionPersistHooks = {
    save: async () => {
      saves += 1;
    },
    clear: async () => {},
  };
  const handler = createProjectorHandler(session, config, SESSION_ID, hooks);
  const res = await handler(
    new Request(api("/api/filter"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters: [{ key: "live", value: "true" }] }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.questionCount, 1);
  assertEquals(body.bankQuestionCount, 2);
  assertEquals(body.activeFilters, [{ key: "live", value: "true" }]);
  assertEquals(session.questionCount, 1);
  assertEquals(saves, 1);
});

Deno.test("projector POST /api/filter empty match is 400", async () => {
  const session = new Session(filterQuiz);
  const handler = createProjectorHandler(session, config, SESSION_ID);
  const res = await handler(
    new Request(api("/api/filter"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters: [{ key: "domain", value: "Z" }] }),
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(session.questionCount, 2);
});

Deno.test("projector POST /api/filter outside LOBBY is 409", async () => {
  const session = new Session(filterQuiz);
  session.advance();
  const handler = createProjectorHandler(session, config, SESSION_ID);
  const res = await handler(
    new Request(api("/api/filter"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters: [{ key: "live", value: "true" }] }),
    }),
  );
  assertEquals(res.status, 409);
  assertEquals(session.questionCount, 2);
});

Deno.test("projector rejects non-local Origin on filter", async () => {
  const session = new Session(filterQuiz);
  const handler = createProjectorHandler(session, config, SESSION_ID);
  const res = await handler(
    new Request(api("/api/filter"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ filters: [] }),
    }),
  );
  assertEquals(res.status, 403);
});

Deno.test("player POST /api/filter rejected", async () => {
  const session = new Session(filterQuiz);
  const handler = createPlayerHandler(session, SESSION_ID);
  const res = await handler(
    new Request(`http://0.0.0.0${BASE}/api/filter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters: [] }),
    }),
  );
  assertEquals(res.status, 403);
});

Deno.test("player answer after Back from CORRECT gets 409 with clear error", async () => {
  const session = new Session(quiz);
  const player = createPlayerHandler(session, SESSION_ID);
  const projector = createProjectorHandler(session, config, SESSION_ID);
  const { id } = session.join("Late");
  for (const step of ["advance", "advance", "back"]) {
    const r = await projector(new Request(api(`/api/${step}`), { method: "POST" }));
    await r.body?.cancel();
  }
  const state = await (await projector(new Request(api("/api/state")))).json();
  assertEquals(state.phase, "QUESTION");
  assertEquals(state.answersLocked, true);
  assertEquals(state.countdown, null);

  const res = await player(
    new Request(api("/api/answer"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, choiceIndex: state.question.correct }),
    }),
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(String(body.error).includes("closed"), true);
  assertEquals(session.getParticipant(id)?.score, 0);
});

Deno.test("player answer response and state do not reveal the result during QUESTION", async () => {
  const session = new Session(quiz);
  const player = createPlayerHandler(session, SESSION_ID);
  const { id } = session.join("Early");
  session.advance(); // QUESTION
  const correct = session.projectorState().question!.correct;
  const res = await player(
    new Request(api("/api/answer"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, choiceIndex: correct }),
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { choiceIndex: correct, score: 0 });
  assertEquals(session.getParticipant(id)?.score, 1);

  const open = await (await player(new Request(api(`/api/state?id=${id}`)))).json();
  assertEquals(open.question.correctIndex, null);
  assertEquals(open.participant.score, 0);
  assertEquals(open.participant.choiceIndex, correct);
  assertEquals("correct" in open.question, false);

  session.advance(); // CORRECT
  const shown = await (await player(new Request(api(`/api/state?id=${id}`)))).json();
  assertEquals(shown.question.correctIndex, correct);
  assertEquals(shown.participant.score, 1);
});
