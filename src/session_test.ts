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
  assertEquals(session.participantCount(), 0);
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
