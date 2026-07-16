import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";
import {
  clearSnapshot,
  isValidSnapshot,
  loadSnapshot,
  quizFingerprint,
  saveSnapshot,
  sessionFromSnapshot,
  sessionToSnapshot,
} from "./persist.ts";

const sampleQuiz: Quiz = {
  title: "Persist Test",
  questions: [
    {
      text: "Q1?",
      choices: ["A", "B", "C"],
      correct: 1,
      explain: "B is right",
    },
    {
      text: "Q2?",
      choices: ["X", "Y"],
      correct: 0,
      explain: "",
    },
  ],
};

function tmpPath(name: string): string {
  return `${Deno.makeTempDirSync()}/${name}`;
}

Deno.test("quizFingerprint is stable for same quiz", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const b = await quizFingerprint(sampleQuiz);
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("quizFingerprint changes when quiz changes", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const other = {
    ...sampleQuiz,
    title: "Other",
  };
  const b = await quizFingerprint(other);
  assertNotEquals(a, b);
});

Deno.test("sessionToSnapshot / sessionFromSnapshot round-trip", async () => {
  const session = new Session(sampleQuiz);
  const { id } = session.join("Alice");
  session.advance(); // QUESTION
  session.answer(id, 1); // correct
  session.advance(); // CORRECT

  const fp = await quizFingerprint(sampleQuiz);
  const snap = sessionToSnapshot(session, fp);
  assertEquals(snap.version, 1);
  assertEquals(snap.phase, "CORRECT");
  assertEquals(snap.questionIndex, 0);
  assertEquals(snap.participants.length, 1);
  assertEquals(snap.participants[0].score, 1);
  assertEquals(snap.participants[0].answers["0"], 1);

  const restored = sessionFromSnapshot(sampleQuiz, snap);
  assertEquals(restored.phase, "CORRECT");
  assertEquals(restored.questionIndex, 0);
  assertEquals(restored.participantCount(), 1);
  const p = restored.getParticipant(id);
  assertExists(p);
  assertEquals(p.name, "Alice");
  assertEquals(p.score, 1);
  assertEquals(p.answers.get(0), 1);
  assertEquals(restored.hasAnswered(id, 0), true);

  // phase machine continues
  assertEquals(restored.advance(), "EXPLAIN");
});

Deno.test("toHydrate / fromHydrate preserves maps", () => {
  const session = new Session(sampleQuiz);
  const { id } = session.join("Bob");
  session.advance();
  session.answer(id, 0); // wrong
  const h = session.toHydrate();
  const again = Session.fromHydrate(sampleQuiz, h);
  assertEquals(again.getParticipant(id)?.score, 0);
  assertEquals(again.getParticipant(id)?.answers.get(0), 0);
  assertEquals(again.phase, "QUESTION");
});

Deno.test("isValidSnapshot rejects bad shapes", () => {
  assertEquals(isValidSnapshot(null), false);
  assertEquals(isValidSnapshot({}), false);
  assertEquals(
    isValidSnapshot({
      version: 1,
      quizFingerprint: "abc",
      phase: "NOPE",
      questionIndex: 0,
      nextJoinOrder: 0,
      participants: [],
    }),
    false,
  );
});

Deno.test("loadSnapshot: missing file returns null", async () => {
  const path = tmpPath("missing.json");
  const result = await loadSnapshot(path, "fp");
  assertEquals(result, null);
});

Deno.test("loadSnapshot: corrupt JSON returns null", async () => {
  const path = tmpPath("corrupt.json");
  await Deno.writeTextFile(path, "{not json");
  const result = await loadSnapshot(path, "fp");
  assertEquals(result, null);
});

Deno.test("loadSnapshot: fingerprint mismatch returns null", async () => {
  const path = tmpPath("mismatch.json");
  const session = new Session(sampleQuiz);
  session.join("Cara");
  const snap = sessionToSnapshot(session, "right-fp");
  await saveSnapshot(path, snap);
  const result = await loadSnapshot(path, "wrong-fp");
  assertEquals(result, null);
});

Deno.test("saveSnapshot atomic load round-trip", async () => {
  const path = tmpPath("session.json");
  const session = new Session(sampleQuiz);
  const { id } = session.join("Dana");
  session.advance();
  session.answer(id, 1);
  const fp = await quizFingerprint(sampleQuiz);
  const snap = sessionToSnapshot(session, fp);
  await saveSnapshot(path, snap);

  const loaded = await loadSnapshot(path, fp);
  assertExists(loaded);
  assertEquals(loaded.participants[0].id, id);
  assertEquals(loaded.participants[0].score, 1);

  const restored = sessionFromSnapshot(sampleQuiz, loaded);
  assertEquals(restored.getParticipant(id)?.score, 1);
});

Deno.test("clearSnapshot removes file", async () => {
  const path = tmpPath("clear-me.json");
  const session = new Session(sampleQuiz);
  const fp = await quizFingerprint(sampleQuiz);
  await saveSnapshot(path, sessionToSnapshot(session, fp));
  await clearSnapshot(path);
  const loaded = await loadSnapshot(path, fp);
  assertEquals(loaded, null);
  // second clear is fine
  await clearSnapshot(path);
});

Deno.test("join/answer/advance then save → new Session matches; reset clears", async () => {
  const path = tmpPath("integration.json");
  const fp = await quizFingerprint(sampleQuiz);

  const live = new Session(sampleQuiz);
  const alice = live.join("Alice");
  const bob = live.join("Bob");
  live.advance(); // Q0
  live.answer(alice.id, 1); // +1
  live.answer(bob.id, 0); // +0
  live.advance(); // CORRECT
  live.advance(); // EXPLAIN
  live.advance(); // LEADERBOARD
  live.advance(); // Q1
  live.answer(alice.id, 0); // +1 → score 2

  await saveSnapshot(path, sessionToSnapshot(live, fp));

  const snap = await loadSnapshot(path, fp);
  assertExists(snap);
  const restored = sessionFromSnapshot(sampleQuiz, snap);

  assertEquals(restored.phase, "QUESTION");
  assertEquals(restored.questionIndex, 1);
  assertEquals(restored.getParticipant(alice.id)?.score, 2);
  assertEquals(restored.getParticipant(bob.id)?.score, 0);
  assertEquals(restored.hasAnswered(alice.id, 0), true);
  assertEquals(restored.hasAnswered(alice.id, 1), true);
  assertEquals(restored.hasAnswered(bob.id, 1), false);

  // leaderboard order
  const board = restored.leaderboard();
  assertEquals(board[0].id, alice.id);
  assertEquals(board[1].id, bob.id);

  restored.reset();
  assertEquals(restored.phase, "LOBBY");
  assertEquals(restored.participantCount(), 0);
  await clearSnapshot(path);
  assertEquals(await loadSnapshot(path, fp), null);
});

Deno.test("Session.reset empties room", () => {
  const session = new Session(sampleQuiz);
  session.join("Eve");
  session.advance();
  session.reset();
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.questionIndex, 0);
  assertEquals(session.participantCount(), 0);
});
