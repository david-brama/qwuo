import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import {
  competitionRanks,
  engagementWindowIndices,
  isActiveParticipant,
  legacyRevealedThrough,
  Session,
  SessionError,
} from "./session.ts";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const sampleQuiz: Quiz = {
  title: "Session Shuffle",
  questions: [
    {
      text: "Q1?",
      choices: ["A", "B", "C"],
      correct: 0, // A
      explain: "A",
    },
    {
      text: "Q2?",
      choices: ["X", "Y"],
      correct: 1, // Y
      explain: "",
    },
  ],
};

/** Fisher–Yates always j=0 → deterministic permutation. */
function alwaysZero(_max: number): number {
  return 0;
}

/**
 * Sequence of j picks. For Q1 (3 choices): i=2 then i=1.
 * picks [1, 0] → order [C,A,B] if start [A,B,C] with correct A→ index 1 after.
 */
function sequenceRng(picks: number[]): () => number {
  let i = 0;
  return () => picks[i++] ?? 0;
}

Deno.test("projector and player state share effective choice order", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  session.advance(); // QUESTION
  const proj = session.projectorState();
  const play = session.playerState();
  assertEquals(proj.question?.choices, play.question?.choices);
  assertEquals(proj.question?.text, play.question?.text);
  // correct text matches authoring
  assertEquals(
    proj.question!.choices[proj.question!.correct],
    sampleQuiz.questions[0]!.choices[sampleQuiz.questions[0]!.correct],
  );
});

Deno.test("projectorState slideMetadata follows config order and skips missing", () => {
  const quiz: Quiz = {
    title: "Meta slides",
    config: { slideMetadataKeys: ["use-case", "domain", "task-statement"] },
    questions: [
      {
        text: "Q1?",
        choices: ["A", "B"],
        correct: 0,
        explain: "e",
        metadata: {
          domain: "Tool Design",
          "use-case": "Support",
          live: true,
          tags: ["x"],
        },
      },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  const proj = session.projectorState();
  assertEquals(proj.question!.slideMetadata, [
    { key: "use-case", value: "Support" },
    { key: "domain", value: "Tool Design" },
  ]);
  // player must not receive slide metadata
  const play = session.playerState();
  assertEquals(
    "slideMetadata" in (play.question as Record<string, unknown>),
    false,
  );
});

Deno.test("projectorState slideMetadata empty without config", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  session.advance();
  assertEquals(session.projectorState().question!.slideMetadata, []);
});

Deno.test("projectorState lobby has null question (no slide metadata)", () => {
  const quiz: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: ["domain"] },
    questions: [
      {
        ...sampleQuiz.questions[0]!,
        metadata: { domain: "D" },
      },
      sampleQuiz.questions[1]!,
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.projectorState().question, null);
});

Deno.test("back reverses phase steps without clearing answers", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  assertEquals(session.canGoBack(), false);
  assertEquals(session.projectorState().canGoBack, false);

  session.advance(); // Q0 QUESTION
  assertEquals(session.phase, "QUESTION");
  assertEquals(session.canGoBack(), true);
  const { id } = session.join("Pat");
  session.answer(id, session.projectorState().question!.correct);

  session.advance(); // CORRECT
  session.advance(); // EXPLAIN
  assertEquals(session.phase, "EXPLAIN");
  session.back();
  assertEquals(session.phase, "CORRECT");
  session.back();
  assertEquals(session.phase, "QUESTION");
  assertEquals(session.questionIndex, 0);
  // Answers retained
  assertEquals(session.getParticipant(id)?.score, 1);
  assertEquals(session.hasAnswered(id, 0), true);

  session.back(); // LOBBY
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.canGoBack(), false);

  // Full loop into Q1 then back across leaderboard boundary
  session.advance(); // Q0
  session.advance(); // CORRECT
  session.advance(); // EXPLAIN
  session.advance(); // LEADERBOARD
  session.advance(); // Q1
  assertEquals(session.phase, "QUESTION");
  assertEquals(session.questionIndex, 1);
  session.back();
  assertEquals(session.phase, "LEADERBOARD");
  assertEquals(session.questionIndex, 0);

  // END → last LEADERBOARD
  while (session.phase !== "END") session.advance();
  session.back();
  assertEquals(session.phase, "LEADERBOARD");
  assertEquals(session.questionIndex, 1);
});

Deno.test("answering correct text under shuffle scores +1", () => {
  // Known permutation for 3 choices: j picks 1 then 0 → [C, A, B], correct A at 1
  let call = 0;
  const rng = (_max: number) => {
    // Q1: two calls (i=2, i=1); Q2: one call (i=1)
    const picks = [1, 0, 0];
    return picks[call++] ?? 0;
  };
  const session = new Session(sampleQuiz, { randomInt: rng });
  const { id } = session.join("Pat");
  session.advance();
  const choices = session.playerState().question!.choices;
  assertEquals(choices, ["C", "A", "B"]);
  const correctIdx = choices.indexOf("A");
  assertEquals(correctIdx, 1);
  const result = session.answer(id, correctIdx);
  assertEquals(result.correct, true);
  assertEquals(result.score, 1);
  assertEquals(result.correctIndex, 1);
});

Deno.test("fromHydrate restores same order without reshuffle", () => {
  const session = new Session(sampleQuiz, {
    randomInt: sequenceRng([1, 0, 0]),
  });
  session.advance();
  const before = session.getEffectiveQuestions();
  const { id } = session.join("R");
  session.answer(id, before[0]!.correct);
  const h = session.toHydrate();
  const restored = Session.fromHydrate(sampleQuiz, h);
  assertEquals(restored.getEffectiveQuestions(), before);
  assertEquals(restored.getParticipant(id)?.score, 1);
  // Canonical quiz untouched
  assertEquals(sampleQuiz.questions[0]!.choices, ["A", "B", "C"]);
});

Deno.test("reset rebuilds play order with RNG", () => {
  // Q1 needs 2 FY picks (i=2,i=1); Q2 needs 1 (i=1) → 3 picks per build.
  // Build 1: [0,0,0]  Build 2: [1,0,0] → different Q1 order
  const builds: number[][] = [
    [0, 0, 0],
    [1, 0, 0],
  ];
  let buildIdx = 0;
  let pickIdx = 0;
  const rng = (_max: number) => {
    const v = builds[buildIdx]![pickIdx] ?? 0;
    pickIdx++;
    return v;
  };
  const session = new Session(sampleQuiz, { randomInt: rng });
  const first = session.getEffectiveQuestions()[0]!.choices.slice();
  session.join("Z");
  buildIdx = 1;
  pickIdx = 0;
  session.reset();
  const second = session.getEffectiveQuestions()[0]!.choices.slice();
  assertNotEquals(JSON.stringify(first), JSON.stringify(second));
  assertEquals(session.participantCount(), 1);
  assertEquals(session.phase, "LOBBY");
});

Deno.test("session.quiz remains authoring order for fingerprint callers", () => {
  const session = new Session(sampleQuiz, {
    randomInt: sequenceRng([1, 0, 0]),
  });
  assertEquals(session.quiz.questions[0]!.choices, ["A", "B", "C"]);
  assertEquals(session.quiz.questions[0]!.correct, 0);
  assertNotEquals(
    session.getEffectiveQuestions()[0]!.choices,
    sampleQuiz.questions[0]!.choices,
  );
});

const filterBankQuiz: Quiz = {
  title: "Filter Bank",
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
      metadata: { live: false, domain: "A" },
    },
    {
      text: "Q3",
      choices: ["A", "B"],
      correct: 0,
      explain: "",
      metadata: { live: true, domain: "B" },
    },
  ],
};

Deno.test("runtime filter reduces and clears playable set", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  assertEquals(session.questionCount, 3);
  assertEquals(session.bankQuestionCount, 3);
  session.join("Host");
  session.applyRuntimeFilters([{ key: "live", value: "true" }]);
  assertEquals(session.questionCount, 2);
  assertEquals(session.getEffectiveQuestions().map((q) => q.text), ["Q1", "Q3"]);
  assertEquals(session.participantCount(), 1);
  assertEquals(session.questionIndex, 0);
  assertEquals(session.getRuntimeFilters(), [{ key: "live", value: "true" }]);

  session.applyRuntimeFilters([]);
  assertEquals(session.questionCount, 3);
  assertEquals(session.getRuntimeFilters(), []);
});

Deno.test("runtime filter empty match rejected", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  try {
    session.applyRuntimeFilters([{ key: "domain", value: "Z" }]);
    throw new Error("expected throw");
  } catch (err) {
    assertEquals((err as { status?: number }).status, 400);
  }
  assertEquals(session.questionCount, 3);
  assertEquals(session.getRuntimeFilters(), []);
});

Deno.test("runtime filter rejected outside LOBBY", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  session.advance();
  try {
    session.applyRuntimeFilters([{ key: "live", value: "true" }]);
    throw new Error("expected throw");
  } catch (err) {
    assertEquals((err as { status?: number }).status, 409);
  }
  assertEquals(session.questionCount, 3);
});

Deno.test("reset clears runtime filters, keeps participants, zeroes scores", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  session.applyRuntimeFilters([{ key: "domain", value: "A" }]);
  assertEquals(session.questionCount, 2);
  const { id } = session.join("A");
  session.advance();
  session.answer(id, session.projectorState().question!.correct);
  assertEquals(session.getParticipant(id)?.score, 1);
  session.reset();
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.participantCount(), 1);
  assertEquals(session.getParticipant(id)?.score, 0);
  assertEquals(session.hasAnswered(id, 0), false);
  assertEquals(session.questionCount, 3);
  assertEquals(session.getRuntimeFilters(), []);
});

Deno.test("projectorState exposes filter context; facets from full bank", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  session.applyRuntimeFilters([{ key: "live", value: "true" }]);
  const proj = session.projectorState();
  assertEquals(proj.bankQuestionCount, 3);
  assertEquals(proj.questionCount, 2);
  assertEquals(proj.canApplyFilter, true);
  assertEquals(proj.activeFilters, [{ key: "live", value: "true" }]);
  const domain = proj.filterFacets.find((f) => f.key === "domain")!;
  // bank still has domain B even though filtered playable may omit some
  assertEquals(domain.values.find((v) => v.value === "B")?.count, 1);
  assertEquals(domain.values.find((v) => v.value === "A")?.count, 2);

  session.advance();
  assertEquals(session.projectorState().canApplyFilter, false);

  const play = session.playerState();
  assertEquals("filterFacets" in play, false);
  assertEquals("activeFilters" in play, false);
});

Deno.test("previewRuntimeFilters does not mutate", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  const prev = session.previewRuntimeFilters([{ key: "live", value: "true" }]);
  assertEquals(prev.matchCount, 2);
  assertEquals(session.questionCount, 3);
  assertEquals(session.getRuntimeFilters(), []);
});

Deno.test("runtime filter rejects duplicate keys (no OR)", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  try {
    session.applyRuntimeFilters([
      { key: "domain", value: "A" },
      { key: "domain", value: "B" },
    ]);
    throw new Error("expected throw");
  } catch (err) {
    assertEquals((err as { status?: number }).status, 400);
  }
  assertEquals(session.questionCount, 3);
});

Deno.test("countdown starts on QUESTION with quiz default", () => {
  const quiz: Quiz = {
    ...sampleQuiz,
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  assertEquals(session.projectorState().countdown, null);
  session.advance();
  const c = session.projectorState().countdown;
  assertEquals(c?.totalSeconds, 30);
  assertEquals(typeof c?.deadlineMs, "number");
  assertEquals(c!.deadlineMs > Date.now(), true);
  assertEquals(session.playerState().countdown?.totalSeconds, 30);
});

Deno.test("countdown uses question override over default", () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
    questions: [
      {
        text: "Q1?",
        choices: ["A", "B"],
        correct: 0,
        explain: "",
        countdownSeconds: 10,
      },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  assertEquals(session.projectorState().countdown?.totalSeconds, 10);
});

Deno.test("countdown zero override means no timer", () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
    questions: [
      {
        text: "Q1?",
        choices: ["A", "B"],
        correct: 0,
        explain: "",
        countdownSeconds: 0,
      },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  assertEquals(session.projectorState().countdown, null);
  assertEquals(session.playerState().countdown, null);
});

Deno.test("countdown expiry auto-advances and leaves unanswered at 0", async () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 1 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  let hookCalls = 0;
  session.setCountdownHooks({
    onAutoAdvance: () => {
      hookCalls++;
    },
  });
  const { id } = session.join("A");
  session.advance();
  assertEquals(session.phase, "QUESTION");
  await delay(1200);
  assertEquals(session.phase, "CORRECT");
  assertEquals(session.projectorState().countdown, null);
  assertEquals(session.getParticipant(id)!.score, 0);
  assertEquals(hookCalls, 1);
});

Deno.test("host advance cancels countdown timer", async () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 5 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  let hookCalls = 0;
  session.setCountdownHooks({ onAutoAdvance: () => { hookCalls++; } });
  session.advance(); // QUESTION
  session.advance(); // CORRECT before timer
  assertEquals(session.phase, "CORRECT");
  assertEquals(session.projectorState().countdown, null);
  await delay(100);
  assertEquals(hookCalls, 0);
});

Deno.test("back from CORRECT into QUESTION does not restart countdown", () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance();
  assertEquals(session.getQuestionDeadlineMs() !== null, true);
  session.advance(); // CORRECT
  assertEquals(session.projectorState().countdown, null);
  session.back(); // QUESTION again, read-only
  assertEquals(session.phase, "QUESTION");
  assertEquals(session.getQuestionDeadlineMs(), null);
  assertEquals(session.projectorState().countdown, null);
  assertEquals(session.playerState().countdown, null);
  assertEquals(session.projectorState().answersLocked, true);
  assertEquals(session.playerState().answersLocked, true);
});

Deno.test("re-entering an unrevealed QUESTION restarts full countdown", () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 30 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
      { text: "Q2?", choices: ["A", "B"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance(); // Q0
  session.advance(); // CORRECT
  session.advance(); // EXPLAIN
  session.advance(); // LEADERBOARD
  session.advance(); // Q1 (not revealed)
  const first = session.getQuestionDeadlineMs()!;
  session.back(); // LEADERBOARD Q0
  session.advance(); // Q1 again
  assertEquals(session.answersLocked, false);
  assertEquals(session.projectorState().countdown?.totalSeconds, 30);
  assertEquals(session.getQuestionDeadlineMs()! >= first, true);
});

Deno.test("answers are rejected after Back from CORRECT (no late scoring)", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const early = session.join("Early");
  const late = session.join("Late");
  session.advance(); // QUESTION
  const correct = session.projectorState().question!.correct;
  session.answer(early.id, correct);
  session.advance(); // CORRECT — answer revealed
  session.back(); // QUESTION, locked
  assertEquals(session.phase, "QUESTION");
  let err: unknown;
  try {
    session.answer(late.id, correct);
  } catch (e) {
    err = e;
  }
  assertEquals(err instanceof SessionError, true);
  assertEquals((err as SessionError).status, 409);
  assertEquals((err as SessionError).message.includes("closed"), true);
  assertEquals(session.getParticipant(late.id)?.score, 0);
  assertEquals(session.hasAnswered(late.id), false);
  assertEquals(session.getParticipant(early.id)?.score, 1);

  // Next goes to CORRECT again; going back through the phases keeps it locked
  assertEquals(session.advance(), "CORRECT");
  session.advance(); // EXPLAIN
  session.back(); // CORRECT
  session.back(); // QUESTION
  assertEquals(session.answersLocked, true);
  // Back to LOBBY and in again: still locked (answer was shown)
  session.back(); // LOBBY
  session.advance(); // QUESTION 0
  assertEquals(session.answersLocked, true);
});

Deno.test("changing the question set in LOBBY clears the reveal watermark", () => {
  const session = new Session(filterBankQuiz, { randomInt: alwaysZero });
  const p = session.join("P");
  session.advance(); // QUESTION 0
  session.answer(p.id, session.projectorState().question!.correct);
  session.advance(); // CORRECT — revealed
  session.back(); // QUESTION (locked)
  session.back(); // LOBBY
  assertEquals(session.getRevealedThrough(), 0);

  session.applyRuntimeFilters([{ key: "live", value: "true" }]);
  assertEquals(session.getRevealedThrough(), -1);
  session.advance(); // new QUESTION 0
  assertEquals(session.answersLocked, false);
  assertEquals(session.hasAnswered(p.id), false);
  session.answer(p.id, session.projectorState().question!.correct);
  assertEquals(session.getParticipant(p.id)?.score, 2);

  // Clearing the filter is also a set change
  session.advance(); // CORRECT
  session.back();
  session.back(); // LOBBY
  session.applyRuntimeFilters([]);
  assertEquals(session.getRevealedThrough(), -1);
  session.advance();
  assertEquals(session.answersLocked, false);
});

Deno.test("countdown expiry also locks the question for Back", async () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 1 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  const { id } = session.join("P");
  session.advance();
  await delay(1200);
  assertEquals(session.phase, "CORRECT");
  session.back();
  assertEquals(session.answersLocked, true);
  assertEquals(session.getQuestionDeadlineMs(), null);
  let status = 0;
  try {
    session.answer(id, 0);
  } catch (e) {
    status = (e as SessionError).status;
  }
  assertEquals(status, 409);
});

Deno.test("reset zeroes scores so replaying a question cannot double-score", () => {
  const session = new Session(sampleQuiz, { randomInt: alwaysZero });
  const { id } = session.join("Pat");
  session.advance(); // Q0
  session.answer(id, session.projectorState().question!.correct);
  session.advance(); // CORRECT
  assertEquals(session.getParticipant(id)?.score, 1);

  session.reset();
  assertEquals(session.getParticipant(id)?.score, 0);
  assertEquals(session.getRevealedThrough(), -1);
  assertEquals(session.leaderboard()[0]!.score, 0);

  session.advance(); // Q0 replay — open again
  assertEquals(session.answersLocked, false);
  session.answer(id, session.projectorState().question!.correct);
  assertEquals(session.getParticipant(id)?.score, 1);
});

Deno.test("legacyRevealedThrough derives watermark from phase", () => {
  assertEquals(legacyRevealedThrough("LOBBY", 0, 5), -1);
  assertEquals(legacyRevealedThrough("QUESTION", 0, 5), -1);
  assertEquals(legacyRevealedThrough("QUESTION", 3, 5), 2);
  assertEquals(legacyRevealedThrough("CORRECT", 3, 5), 3);
  assertEquals(legacyRevealedThrough("LEADERBOARD", 3, 5), 3);
  assertEquals(legacyRevealedThrough("END", 4, 5), 4);
});

Deno.test("stale timeout does not advance later question", async () => {
  const quiz: Quiz = {
    title: "T",
    config: { slideMetadataKeys: [], countdownSeconds: 1 },
    questions: [
      { text: "Q1?", choices: ["A", "B"], correct: 0, explain: "" },
      { text: "Q2?", choices: ["X", "Y"], correct: 0, explain: "" },
    ],
  };
  const session = new Session(quiz, { randomInt: alwaysZero });
  session.advance(); // Q0 QUESTION
  // Rapid host advance through Q0 cycle before 1s timer
  session.advance(); // CORRECT
  session.advance(); // EXPLAIN
  session.advance(); // LEADERBOARD
  session.advance(); // Q1 QUESTION
  assertEquals(session.phase, "QUESTION");
  assertEquals(session.questionIndex, 1);
  const deadline = session.getQuestionDeadlineMs();
  await delay(1200);
  // Q1 should still be QUESTION (its own 1s timer may have also fired) —
  // if Q1's timer fired, phase is CORRECT at index 1, not past it via stale Q0.
  assertEquals(session.questionIndex, 1);
  assertEquals(
    session.phase === "QUESTION" || session.phase === "CORRECT",
    true,
  );
  // Ensure we did not skip to Q2 or END from a double-fire
  assertNotEquals(session.phase, "END");
  if (session.phase === "QUESTION") {
    assertEquals(session.getQuestionDeadlineMs() !== null || deadline === null, true);
  }
});

// --- Active user engagement metrics ---

function multiQuiz(n: number): Quiz {
  return {
    title: "Active",
    questions: Array.from({ length: n }, (_, i) => ({
      text: `Q${i + 1}?`,
      choices: ["A", "B"],
      correct: 0,
      explain: "",
    })),
  };
}

/** Advance through a full question cycle ending on LEADERBOARD (or END on last). */
function advanceToLeaderboard(session: Session): void {
  // assume currently QUESTION
  session.advance(); // CORRECT
  session.advance(); // EXPLAIN
  session.advance(); // LEADERBOARD
}

function answerWrong(session: Session, id: string): void {
  const correct = session.projectorState().question!.correct;
  session.answer(id, correct === 0 ? 1 : 0);
}

function answerRight(session: Session, id: string): void {
  session.answer(id, session.projectorState().question!.correct);
}

Deno.test("engagementWindowIndices: LOBBY empty, short, four, END", () => {
  assertEquals(engagementWindowIndices("LOBBY", 0, 10), []);
  assertEquals(engagementWindowIndices("QUESTION", 0, 10), [0]);
  assertEquals(engagementWindowIndices("QUESTION", 1, 10), [0, 1]);
  assertEquals(engagementWindowIndices("CORRECT", 7, 10), [4, 5, 6, 7]);
  assertEquals(engagementWindowIndices("END", 0, 10), [6, 7, 8, 9]);
  assertEquals(engagementWindowIndices("END", 0, 0), []);
});

Deno.test("isActiveParticipant requires two answers in window", () => {
  const window = [0, 1, 2, 3];
  assertEquals(isActiveParticipant(new Map([[0, 0]]), window), false);
  assertEquals(
    isActiveParticipant(new Map([[0, 0], [2, 1]]), window),
    true,
  );
  assertEquals(
    isActiveParticipant(new Map([[0, 0]]), [0]),
    false,
  );
});

Deno.test("active metrics: Q0 never active even after answer", () => {
  const session = new Session(multiQuiz(5), { randomInt: alwaysZero });
  const { id } = session.join("A");
  session.advance(); // Q0 QUESTION
  answerRight(session, id);
  const proj = session.projectorState();
  assertEquals(proj.activeUserCount, 0);
  assertEquals(proj.activeAnsweredCount, 0);
});

Deno.test("active metrics: 2-of-4 active; incorrect counts; non-active excluded", () => {
  const session = new Session(multiQuiz(6), { randomInt: alwaysZero });
  const engaged = session.join("Engaged").id;
  const late = session.join("Late").id;
  session.join("Silent");

  // Q0 — both answer
  session.advance();
  answerWrong(session, engaged);
  answerRight(session, late);
  advanceToLeaderboard(session);

  // Q1 — only engaged answers (wrong); window [0,1]
  session.advance();
  answerWrong(session, engaged);
  const atQ1 = session.projectorState();
  assertEquals(atQ1.activeUserCount, 1); // engaged: 2 answers; late: 1
  assertEquals(atQ1.activeAnsweredCount, 1); // engaged answered Q1

  // Q2 — only late answers; engaged still active from Q0+Q1 but did not answer Q2
  advanceToLeaderboard(session);
  session.advance();
  answerRight(session, late);
  const atQ2 = session.projectorState();
  // window [0,1,2]: engaged answers {0,1} → active; late {0,2} → active
  assertEquals(atQ2.activeUserCount, 2);
  assertEquals(atQ2.activeAnsweredCount, 1); // only late answered Q2 among active
  assertEquals(session.participantCount(), 3);
});

Deno.test("active metrics: LOBBY zeros; player state omits fields", () => {
  const session = new Session(multiQuiz(3), { randomInt: alwaysZero });
  session.join("A");
  const proj = session.projectorState();
  assertEquals(proj.activeUserCount, 0);
  assertEquals(proj.activeAnsweredCount, 0);
  const play = session.playerState() as Record<string, unknown>;
  assertEquals("activeUserCount" in play, false);
  assertEquals("activeAnsweredCount" in play, false);
});

Deno.test("active metrics: END window keeps activeUserCount; activeAnsweredCount 0", () => {
  const session = new Session(multiQuiz(4), { randomInt: alwaysZero });
  const a = session.join("A").id;
  const b = session.join("B").id;
  for (let q = 0; q < 4; q++) {
    session.advance(); // QUESTION
    answerRight(session, a);
    if (q < 2) answerWrong(session, b); // B only first two
    advanceToLeaderboard(session);
    if (q < 3) {
      // stay on LB then next Q via advance in loop start
    }
  }
  // After last LEADERBOARD, one more advance → END
  session.advance();
  assertEquals(session.phase, "END");
  const proj = session.projectorState();
  // window [0,1,2,3]; A answered all 4 → active; B answered 0,1 → active
  assertEquals(proj.activeUserCount, 2);
  assertEquals(proj.activeAnsweredCount, 0);
});

Deno.test("active metrics: answer then re-read state updates counts", () => {
  const session = new Session(multiQuiz(3), { randomInt: alwaysZero });
  const id = session.join("P").id;
  session.advance(); // Q0
  answerRight(session, id);
  advanceToLeaderboard(session);
  session.advance(); // Q1 QUESTION
  assertEquals(session.projectorState().activeUserCount, 0);
  answerWrong(session, id);
  const after = session.projectorState();
  assertEquals(after.activeUserCount, 1);
  assertEquals(after.activeAnsweredCount, 1);
});

Deno.test("active metrics: reset clears active metrics", () => {
  const session = new Session(multiQuiz(3), { randomInt: alwaysZero });
  const id = session.join("P").id;
  session.advance();
  answerRight(session, id);
  advanceToLeaderboard(session);
  session.advance();
  answerRight(session, id);
  assertEquals(session.projectorState().activeUserCount, 1);
  session.reset();
  assertEquals(session.phase, "LOBBY");
  assertEquals(session.projectorState().activeUserCount, 0);
  assertEquals(session.projectorState().activeAnsweredCount, 0);
  assertEquals(session.participantCount(), 1);
});

// --- Leaderboard ranking and denominator ---

Deno.test("competitionRanks: ties share a rank and the next rank skips", () => {
  assertEquals(competitionRanks([]), []);
  assertEquals(competitionRanks([5]), [1]);
  assertEquals(competitionRanks([3, 3, 1]), [1, 1, 3]);
  assertEquals(competitionRanks([4, 3, 3, 3, 2, 2, 0]), [1, 2, 2, 2, 5, 5, 7]);
  assertEquals(competitionRanks([0, 0, 0]), [1, 1, 1]);
});

Deno.test("leaderboard: competition ranking, ties in join order", () => {
  const session = new Session(multiQuiz(3), { randomInt: alwaysZero });
  const a = session.join("Ann").id;
  const b = session.join("Ben").id;
  const c = session.join("Cy").id;
  session.join("Dee");
  session.advance(); // Q0
  answerRight(session, b);
  answerRight(session, c);
  answerWrong(session, a);
  advanceToLeaderboard(session);
  const board = session.leaderboard();
  assertEquals(board.map((e) => [e.name, e.rank, e.score]), [
    ["Ben", 1, 1],
    ["Cy", 1, 1],
    ["Ann", 3, 0],
    ["Dee", 3, 0],
  ]);
  assertEquals(session.projectorState().leaderboard[3]!.rank, 3);
});

Deno.test("questionsAsked counts revealed questions, not the bank", () => {
  const session = new Session(multiQuiz(5), { randomInt: alwaysZero });
  assertEquals(session.projectorState().questionsAsked, 0);
  session.advance(); // Q0 QUESTION
  assertEquals(session.projectorState().questionsAsked, 0);
  advanceToLeaderboard(session);
  assertEquals(session.projectorState().questionsAsked, 1);
  session.advance(); // Q1 QUESTION
  advanceToLeaderboard(session);
  assertEquals(session.projectorState().questionsAsked, 2);
  // Back does not lower the count of questions already revealed
  session.back();
  session.back();
  assertEquals(session.projectorState().questionsAsked, 2);
  session.reset();
  assertEquals(session.projectorState().questionsAsked, 0);
});
