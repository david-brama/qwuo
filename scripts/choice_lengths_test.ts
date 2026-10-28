import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatReport, LIMITS, lengthReport } from "./choice_lengths.ts";

Deno.test("lengthReport: strict, tied and mean ratio", () => {
  const r = lengthReport([
    { choices: ["aaaa", "bb", "cc", "dd"], correct: 0, metadata: { id: "Q1" } }, // strict, ratio 2
    { choices: ["aa", "bb", "cc", "dd"], correct: 1, metadata: { id: "Q2" } }, // tied, ratio 1
    { choices: ["a", "bbbb", "cc", "dd"], correct: 0 }, // shortest, ratio 0.375
  ]);
  assertEquals(r.strictLongest, 1);
  assertEquals(r.longestOrTied, 2);
  assertEquals(r.offenders.map((o) => o.id), ["Q1"]);
  assert(Math.abs(r.meanRatio - (2 + 1 + 0.375) / 3) < 1e-9);
});

// quiz.json is not in git (.gitignore); skip when it is absent
const QUIZ = new URL("../quiz.json", import.meta.url);
const hasQuiz = await Deno.stat(QUIZ).then(() => true, () => false);

Deno.test({
  name: "quiz.json: the correct choice is not a length giveaway",
  ignore: !hasQuiz,
  async fn() {
    const quiz = JSON.parse(await Deno.readTextFile(QUIZ)) as {
      questions: Parameters<typeof lengthReport>[0];
    };
    const r = lengthReport(quiz.questions);
    const msg = formatReport(r);
    assert(r.strictShare <= LIMITS.strictShare, msg);
    assert(r.meanRatio <= LIMITS.meanRatio, msg);
  },
});
