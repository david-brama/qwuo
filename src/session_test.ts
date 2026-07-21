import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Quiz } from "./quiz.ts";
import { Session } from "./session.ts";

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

Deno.test("reset clears runtime filters and keeps participants/scores", () => {
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
  assertEquals(session.getParticipant(id)?.score, 1);
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
