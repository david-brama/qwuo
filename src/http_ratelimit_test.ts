import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";
import {
  clientKey,
  createPlayerHandler,
  DEFAULT_RATE_LIMITS,
  type RateLimits,
} from "./http.ts";

const quiz: Quiz = {
  title: "Rate limits",
  questions: [{ text: "Q?", choices: ["A", "B"], correct: 0, explain: "" }],
};

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BASE = `http://127.0.0.1/s/${SESSION_ID}`;

function info(hostname: string): Deno.ServeHandlerInfo {
  return {
    remoteAddr: { transport: "tcp", hostname, port: 40000 },
  } as Deno.ServeHandlerInfo;
}

function joinReq(name: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/join`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ name }),
  });
}

function answerReq(id: string, choiceIndex: number): Request {
  return new Request(`${BASE}/api/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, choiceIndex }),
  });
}

const NAT = info("198.51.100.7");

Deno.test("300 joins from one NAT IP within a minute all succeed", async () => {
  const session = new Session(quiz);
  const player = createPlayerHandler(session, SESSION_ID);
  const statuses: number[] = [];
  for (let i = 0; i < 300; i++) {
    const res = await player(joinReq(`P${i}`), NAT);
    await res.body?.cancel();
    statuses.push(res.status);
  }
  assertEquals(statuses.filter((s) => s !== 200), []);
  assertEquals(session.participantCount(), 300);
});

Deno.test("default join ceiling per IP is at least 1000/min", () => {
  assertEquals(DEFAULT_RATE_LIMITS.joinPerIp.max >= 1000, true);
  assertEquals(DEFAULT_RATE_LIMITS.joinPerIp.windowMs, 60_000);
});

Deno.test("one participant spamming answers is limited; others are not", async () => {
  const session = new Session({
    ...quiz,
    questions: [quiz.questions[0]!, { ...quiz.questions[0]!, text: "Q2?" }],
  });
  const player = createPlayerHandler(session, SESSION_ID);
  const ids: string[] = [];
  for (const name of ["Spammer", "Bob", "Cara"]) {
    const res = await player(joinReq(name), NAT);
    ids.push((await res.json()).id);
  }
  session.advance(); // QUESTION

  const spam: number[] = [];
  for (let i = 0; i < 60; i++) {
    const res = await player(answerReq(ids[0]!, 0), NAT);
    await res.body?.cancel();
    spam.push(res.status);
  }
  assertEquals(spam[0], 200);
  assertEquals(spam.includes(429), true);
  assertEquals(
    spam.filter((s) => s === 429).length,
    60 - DEFAULT_RATE_LIMITS.answerPerParticipant.max,
  );

  // Same NAT IP, different participants: unaffected
  for (const id of ids.slice(1)) {
    const res = await player(answerReq(id, 1), NAT);
    assertEquals(res.status, 200);
    await res.body?.cancel();
  }
});

const TIGHT: RateLimits = {
  ...DEFAULT_RATE_LIMITS,
  joinPerIp: { max: 2, windowMs: 60_000 },
};

Deno.test("spoofed X-Forwarded-For / cf-connecting-ip ignored by default", async () => {
  const session = new Session(quiz);
  const player = createPlayerHandler(session, SESSION_ID, undefined, null, {
    rateLimits: TIGHT,
  });
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await player(
      joinReq(`S${i}`, {
        "x-forwarded-for": `10.0.0.${i}`,
        "cf-connecting-ip": `10.1.0.${i}`,
        "x-real-ip": `10.2.0.${i}`,
      }),
      NAT,
    );
    await res.body?.cancel();
    statuses.push(res.status);
  }
  // All share the socket IP bucket → third is limited
  assertEquals(statuses, [200, 200, 429]);
});

Deno.test("trusted proxy header is honoured when configured", async () => {
  const session = new Session(quiz);
  const player = createPlayerHandler(session, SESSION_ID, undefined, null, {
    rateLimits: TIGHT,
    trustProxyHeader: "cf-connecting-ip",
  });
  const tunnel = info("127.0.0.1");
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await player(
      joinReq(`T${i}`, { "cf-connecting-ip": `203.0.113.${i}` }),
      tunnel,
    );
    await res.body?.cancel();
    statuses.push(res.status);
  }
  // Each distinct client IP has its own bucket
  assertEquals(statuses, [200, 200, 200]);

  const same: number[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await player(
      joinReq(`U${i}`, { "cf-connecting-ip": "203.0.113.99" }),
      tunnel,
    );
    await res.body?.cancel();
    same.push(res.status);
  }
  assertEquals(same, [200, 200, 429]);
});

Deno.test("clientKey: socket address unless a proxy header is trusted", () => {
  const req = new Request(BASE, {
    headers: {
      "x-forwarded-for": "6.6.6.6, 203.0.113.5",
      "cf-connecting-ip": "203.0.113.9",
    },
  });
  assertEquals(clientKey(req, NAT), "ip:198.51.100.7");
  assertEquals(clientKey(req, NAT, null), "ip:198.51.100.7");
  assertEquals(clientKey(req, NAT, "cf-connecting-ip"), "hdr:203.0.113.9");
  // XFF: right-most entry (appended by the trusted proxy), not the spoofable first
  assertEquals(clientKey(req, NAT, "x-forwarded-for"), "hdr:203.0.113.5");
  // Configured header missing → fall back to socket
  assertEquals(clientKey(req, NAT, "x-real-ip"), "ip:198.51.100.7");
});
