import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lengthReport } from "./choice_lengths.ts";

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
