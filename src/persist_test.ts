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
  SNAPSHOT_VERSION,
  snapshotMatchesQuiz,
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

/** Always pick j=0 in Fisher–Yates → deterministic reverse-ish order. */
function alwaysZero(_max: number): number {
  return 0;
}

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

Deno.test("quizFingerprint ignores metadata-only differences", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const withMeta: Quiz = {
    ...sampleQuiz,
    metadata: { source: "cms", tags: ["a"] },
  };
  const b = await quizFingerprint(withMeta);
  assertEquals(a, b);
});

Deno.test("quizFingerprint ignores question metadata-only differences", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const withQMeta: Quiz = {
    ...sampleQuiz,
    questions: sampleQuiz.questions.map((q, i) =>
      i === 0 ? { ...q, metadata: { live: true, domain: "X Y" } } : { ...q }
    ),
  };
  const b = await quizFingerprint(withQMeta);
  assertEquals(a, b);
});

Deno.test("quizFingerprint ignores config-only differences", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const withConfig: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: ["domain", "use-case"] },
  };
  const b = await quizFingerprint(withConfig);
  assertEquals(a, b);
});

Deno.test("quizFingerprint ignores session shuffle (canonical quiz only)", async () => {
  const fpBefore = await quizFingerprint(sampleQuiz);
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  // Mutating session play order must not affect fingerprint of sampleQuiz
  const fpAfter = await quizFingerprint(sampleQuiz);
  assertEquals(fpBefore, fpAfter);
  // Session's effective order may differ from authoring
  const eff = session.getEffectiveQuestions()[0]!;
  assertEquals(eff.choices[eff.correct], sampleQuiz.questions[0]!.choices[1]);
  assertEquals(await quizFingerprint(session.quiz), fpBefore);
});

Deno.test("sessionToSnapshot / sessionFromSnapshot round-trip", async () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const { id } = session.join("Alice");
  session.advance(); // QUESTION
  const q0 = session.getEffectiveQuestions()[0]!;
  const correctIdx = q0.correct;
  session.answer(id, correctIdx); // correct under effective order
  session.advance(); // CORRECT

  const fp = await quizFingerprint(sampleQuiz);
  const snap = sessionToSnapshot(session, fp);
  assertEquals(snap.version, SNAPSHOT_VERSION);
  assertEquals(snap.phase, "CORRECT");
  assertEquals(snap.questionIndex, 0);
  assertEquals(snap.participants.length, 1);
  assertEquals(snap.participants[0].score, 1);
  assertEquals(snap.participants[0].answers["0"], correctIdx);
  assertEquals(snap.effectiveQuestions.length, 2);
  assertEquals(snap.effectiveQuestions[0]!.choices, q0.choices);
  assertEquals(snap.effectiveQuestions[0]!.correct, q0.correct);

  const restored = sessionFromSnapshot(sampleQuiz, snap);
  assertEquals(restored.phase, "CORRECT");
  assertEquals(restored.questionIndex, 0);
  assertEquals(restored.participantCount(), 1);
  const p = restored.getParticipant(id);
  assertExists(p);
  assertEquals(p.name, "Alice");
  assertEquals(p.score, 1);
  assertEquals(p.answers.get(0), correctIdx);
  assertEquals(restored.hasAnswered(id, 0), true);
  assertEquals(
    restored.getEffectiveQuestions()[0]!.choices,
    q0.choices,
  );

  // phase machine continues
  assertEquals(restored.advance(), "EXPLAIN");
});

Deno.test("toHydrate / fromHydrate preserves maps and effective order", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const { id } = session.join("Bob");
  session.advance();
  const wrongIdx = session.getEffectiveQuestions()[0]!.correct === 0 ? 1 : 0;
  session.answer(id, wrongIdx);
  const h = session.toHydrate();
  const again = Session.fromHydrate(sampleQuiz, h);
  assertEquals(again.getParticipant(id)?.score, 0);
  assertEquals(again.getParticipant(id)?.answers.get(0), wrongIdx);
  assertEquals(again.phase, "QUESTION");
  assertEquals(
    again.getEffectiveQuestions()[0]!.choices,
    session.getEffectiveQuestions()[0]!.choices,
  );
});

Deno.test("isValidSnapshot rejects bad shapes and v1", () => {
  assertEquals(isValidSnapshot(null), false);
  assertEquals(isValidSnapshot({}), false);
  assertEquals(
    isValidSnapshot({
      version: 1,
      quizFingerprint: "abc",
      phase: "LOBBY",
      questionIndex: 0,
      nextJoinOrder: 0,
      participants: [],
    }),
    false,
  );
  assertEquals(
    isValidSnapshot({
      version: SNAPSHOT_VERSION,
      quizFingerprint: "abc",
      phase: "NOPE",
      questionIndex: 0,
      nextJoinOrder: 0,
      participants: [],
      effectiveQuestions: [
        { text: "Q", choices: ["A", "B"], correct: 0, explain: "" },
      ],
    }),
    false,
  );
  assertEquals(
    isValidSnapshot({
      version: SNAPSHOT_VERSION,
      quizFingerprint: "abc",
      phase: "LOBBY",
      questionIndex: 0,
      nextJoinOrder: 0,
      participants: [],
      // missing effectiveQuestions
    }),
    false,
  );
});

Deno.test("snapshotMatchesQuiz rejects length/multiset mismatch", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const snap = sessionToSnapshot(session, "fp");
  assertEquals(snapshotMatchesQuiz(snap, sampleQuiz), true);

  const badLen = {
    ...snap,
    effectiveQuestions: snap.effectiveQuestions.slice(0, 1),
  };
  assertEquals(snapshotMatchesQuiz(badLen, sampleQuiz), false);

  const badChoices = {
    ...snap,
    effectiveQuestions: [
      { ...snap.effectiveQuestions[0]!, choices: ["Z", "Y", "X"] },
      snap.effectiveQuestions[1]!,
    ],
  };
  assertEquals(snapshotMatchesQuiz(badChoices, sampleQuiz), false);
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
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  session.join("Cara");
  const snap = sessionToSnapshot(session, "right-fp");
  await saveSnapshot(path, snap);
  const result = await loadSnapshot(path, "wrong-fp");
  assertEquals(result, null);
});

Deno.test("loadSnapshot: v1 snapshot without effectiveQuestions returns null", async () => {
  const path = tmpPath("v1.json");
  await Deno.writeTextFile(
    path,
    JSON.stringify({
      version: 1,
      quizFingerprint: "fp",
      phase: "LOBBY",
      questionIndex: 0,
      nextJoinOrder: 0,
      participants: [],
    }),
  );
  const result = await loadSnapshot(path, "fp", sampleQuiz);
  assertEquals(result, null);
});

Deno.test("loadSnapshot: effective questions mismatch returns null", async () => {
  const path = tmpPath("eff-mismatch.json");
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const fp = await quizFingerprint(sampleQuiz);
  const snap = sessionToSnapshot(session, fp);
  // Corrupt choices multiset
  snap.effectiveQuestions[0] = {
    ...snap.effectiveQuestions[0]!,
    choices: ["nope", "nope2", "nope3"],
    correct: 0,
  };
  await saveSnapshot(path, snap);
  const result = await loadSnapshot(path, fp, sampleQuiz);
  assertEquals(result, null);
});

Deno.test("saveSnapshot atomic load round-trip (uuid-named file)", async () => {
  const sessionUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const path = tmpPath(`${sessionUuid}.json`);
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const { id } = session.join("Dana");
  session.advance();
  const correctIdx = session.getEffectiveQuestions()[0]!.correct;
  session.answer(id, correctIdx);
  const fp = await quizFingerprint(sampleQuiz);
  const snap = sessionToSnapshot(session, fp);
  await saveSnapshot(path, snap);

  const loaded = await loadSnapshot(path, fp, sampleQuiz);
  assertExists(loaded);
  assertEquals(loaded.participants[0].id, id);
  assertEquals(loaded.participants[0].score, 1);
  assertEquals(path.endsWith(`${sessionUuid}.json`), true);

  const restored = sessionFromSnapshot(sampleQuiz, loaded);
  assertEquals(restored.getParticipant(id)?.score, 1);
  assertEquals(
    restored.getEffectiveQuestions()[0]!.choices,
    session.getEffectiveQuestions()[0]!.choices,
  );
});

Deno.test("clearSnapshot removes file", async () => {
  const path = tmpPath("clear-me.json");
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
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

  const live = new Session(sampleQuiz, { randomInt: alwaysZero });
  const alice = live.join("Alice");
  const bob = live.join("Bob");
  live.advance(); // Q0
  const c0 = live.getEffectiveQuestions()[0]!.correct;
  const wrong0 = c0 === 0 ? 1 : 0;
  live.answer(alice.id, c0); // +1
  live.answer(bob.id, wrong0); // +0
  live.advance(); // CORRECT
  live.advance(); // EXPLAIN
  live.advance(); // LEADERBOARD
  live.advance(); // Q1
  const c1 = live.getEffectiveQuestions()[1]!.correct;
  live.answer(alice.id, c1); // +1 → score 2

  const liveEff = live.getEffectiveQuestions();
  await saveSnapshot(path, sessionToSnapshot(live, fp));

  const snap = await loadSnapshot(path, fp, sampleQuiz);
  assertExists(snap);
  const restored = sessionFromSnapshot(sampleQuiz, snap);

  assertEquals(restored.phase, "QUESTION");
  assertEquals(restored.questionIndex, 1);
  assertEquals(restored.getParticipant(alice.id)?.score, 2);
  assertEquals(restored.getParticipant(bob.id)?.score, 0);
  assertEquals(restored.hasAnswered(alice.id, 0), true);
  assertEquals(restored.hasAnswered(alice.id, 1), true);
  assertEquals(restored.hasAnswered(bob.id, 1), false);
  assertEquals(restored.getEffectiveQuestions()[0]!.choices, liveEff[0]!.choices);
  assertEquals(restored.getEffectiveQuestions()[1]!.choices, liveEff[1]!.choices);

  // leaderboard order
  const board = restored.leaderboard();
  assertEquals(board[0].id, alice.id);
  assertEquals(board[1].id, bob.id);

  restored.reset();
  assertEquals(restored.phase, "LOBBY");
  assertEquals(restored.participantCount(), 2);
  assertEquals(restored.getParticipant(alice.id)?.score, 2);
  assertEquals(restored.getParticipant(bob.id)?.score, 0);
  assertEquals(restored.hasAnswered(alice.id, 0), false);
  await clearSnapshot(path);
  assertEquals(await loadSnapshot(path, fp), null);
});

Deno.test("Session.reset returns to lobby and keeps roster", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  session.join("Eve");
  session.advance();
  session.reset();
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.questionIndex, 0);
  assertEquals(session.participantCount(), 1);
});

Deno.test("filtered session snapshot round-trip restores runtime filters", async () => {
  const quiz: Quiz = {
    title: "Filtered Persist",
    questions: [
      {
        text: "Q1",
        choices: ["A", "B"],
        correct: 0,
        explain: "e1",
        metadata: { live: true },
      },
      {
        text: "Q2",
        choices: ["X", "Y"],
        correct: 1,
        explain: "e2",
        metadata: { live: false },
      },
      {
        text: "Q3",
        choices: ["M", "N"],
        correct: 0,
        explain: "e3",
        metadata: { live: true },
      },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.applyRuntimeFilters([{ key: "live", value: "true" }]);
  session.join("Pat");
  session.advance();
  const fp = await quizFingerprint(quiz);
  const path = tmpPath("filtered.json");
  await saveSnapshot(path, sessionToSnapshot(session, fp));

  const snap = await loadSnapshot(path, fp, quiz);
  assertExists(snap);
  assertEquals(snap!.runtimeFilters, [{ key: "live", value: "true" }]);
  assertEquals(snap!.effectiveQuestions.length, 2);

  const restored = sessionFromSnapshot(quiz, snap!);
  assertEquals(restored.questionCount, 2);
  assertEquals(restored.getRuntimeFilters(), [{ key: "live", value: "true" }]);
  assertEquals(restored.getEffectiveQuestions().map((q) => q.text), ["Q1", "Q3"]);
  assertEquals(restored.phase, "QUESTION");
  assertEquals(restored.participantCount(), 1);
  // metadata restored for slide filters
  assertEquals(restored.getEffectiveQuestions()[0]!.metadata?.live, true);

  await clearSnapshot(path);
});

Deno.test("legacy full-bank snapshot without runtimeFilters still loads", async () => {
  const fp = await quizFingerprint(sampleQuiz);
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const snap = sessionToSnapshot(session, fp);
  // Simulate legacy: no runtimeFilters field
  delete (snap as { runtimeFilters?: unknown }).runtimeFilters;
  assertEquals(snapshotMatchesQuiz(snap, sampleQuiz), true);
  const restored = sessionFromSnapshot(sampleQuiz, snap);
  assertEquals(restored.questionCount, sampleQuiz.questions.length);
  assertEquals(restored.getRuntimeFilters(), []);
});

Deno.test("quizFingerprint ignores countdown-only differences", async () => {
  const a = await quizFingerprint(sampleQuiz);
  const withCd: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
    questions: sampleQuiz.questions.map((q, i) =>
      i === 0 ? { ...q, countdownSeconds: 45 } : { ...q }
    ),
  };
  const b = await quizFingerprint(withCd);
  assertEquals(a, b);
});

Deno.test("snapshot saves and restores future questionDeadlineMs", async () => {
  const quiz: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: [], countdownSeconds: 60 },
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  const deadline = session.getQuestionDeadlineMs()!;
  const fp = await quizFingerprint(quiz);
  const snap = sessionToSnapshot(session, fp);
  assertEquals(snap.questionDeadlineMs, deadline);

  const restored = sessionFromSnapshot(quiz, snap);
  assertEquals(restored.phase, "QUESTION");
  assertEquals(restored.getQuestionDeadlineMs(), deadline);
  assertEquals(restored.projectorState().countdown?.totalSeconds, 60);
});

Deno.test("snapshot restore with past deadline applies expiry", async () => {
  const quiz: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  const fp = await quizFingerprint(quiz);
  const snap = sessionToSnapshot(session, fp);
  snap.questionDeadlineMs = Date.now() - 5000;
  const restored = sessionFromSnapshot(quiz, snap);
  assertEquals(restored.phase, "CORRECT");
  assertEquals(restored.projectorState().countdown, null);
});

Deno.test("legacy snapshot without deadline starts fresh countdown", async () => {
  const quiz: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  const fp = await quizFingerprint(quiz);
  const snap = sessionToSnapshot(session, fp);
  delete snap.questionDeadlineMs;
  const before = Date.now();
  const restored = sessionFromSnapshot(quiz, snap);
  assertEquals(restored.phase, "QUESTION");
  const d = restored.getQuestionDeadlineMs()!;
  assertEquals(d > before, true);
  assertEquals(restored.projectorState().countdown?.totalSeconds, 30);
});
