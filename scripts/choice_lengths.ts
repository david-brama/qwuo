/**
 * Answer-length balance of a quiz: test-savvy players should not be able to
 * pick the correct choice just because it is the longest one.
 *
 *   deno task quiz:lengths            # quiz.json (or QUIZ_PATH)
 *   deno task quiz:lengths other.json
 *
 * Reports the share of questions whose correct choice is strictly the
 * longest, longest-or-tied, and the mean of len(correct) / mean(len(others)).
 */

export interface LengthQuestion {
  choices: string[];
  correct: number;
  metadata?: { id?: string } | null;
}

export interface LengthOffender {
  id: string;
  ratio: number;
  correctLen: number;
  maxOtherLen: number;
}

export interface LengthReport {
  questions: number;
  strictLongest: number;
  longestOrTied: number;
  strictShare: number;
  tiedShare: number;
  meanRatio: number;
  /** Questions where the correct choice is strictly the longest. */
  offenders: LengthOffender[];
}

/** Limits enforced by choice_lengths_test.ts. */
export const LIMITS = { strictShare: 0.30, meanRatio: 1.08 };

export function lengthReport(questions: LengthQuestion[]): LengthReport {
  let strict = 0, tied = 0, ratioSum = 0;
  const offenders: LengthOffender[] = [];
  questions.forEach((q, i) => {
    const lens = q.choices.map((c) => c.length);
    const c = lens[q.correct];
    const others = lens.filter((_, j) => j !== q.correct);
    const maxOther = Math.max(...others);
    const ratio = c / (others.reduce((a, b) => a + b, 0) / others.length);
    ratioSum += ratio;
    if (c >= maxOther) tied++;
    if (c > maxOther) {
      strict++;
      offenders.push({ id: q.metadata?.id ?? `#${i + 1}`, ratio, correctLen: c, maxOtherLen: maxOther });
    }
  });
  const n = questions.length;
  return {
    questions: n,
    strictLongest: strict,
    longestOrTied: tied,
    strictShare: n ? strict / n : 0,
    tiedShare: n ? tied / n : 0,
    meanRatio: n ? ratioSum / n : 0,
    offenders: offenders.sort((a, b) => b.ratio - a.ratio),
  };
}

export function formatReport(r: LengthReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `questions:                 ${r.questions}`,
    `correct strictly longest:  ${r.strictLongest}/${r.questions} (${pct(r.strictShare)}, limit ${pct(LIMITS.strictShare)})`,
    `correct longest-or-tied:   ${r.longestOrTied}/${r.questions} (${pct(r.tiedShare)})`,
    `mean len(correct)/mean(len(distractors)): ${r.meanRatio.toFixed(3)} (limit ${LIMITS.meanRatio})`,
  ];
  if (r.offenders.length) {
    lines.push("offenders (correct strictly longest):");
    for (const o of r.offenders) {
      lines.push(`  ${o.id.padEnd(5)} ratio=${o.ratio.toFixed(2)} correct=${o.correctLen} maxOther=${o.maxOtherLen}`);
    }
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const path = Deno.args[0] ?? Deno.env.get("QUIZ_PATH") ??
    new URL("../quiz.json", import.meta.url).pathname;
  const quiz = JSON.parse(await Deno.readTextFile(path)) as { questions: LengthQuestion[] };
  const r = lengthReport(quiz.questions);
  console.log(formatReport(r));
  const ok = r.strictShare <= LIMITS.strictShare && r.meanRatio <= LIMITS.meanRatio;
  if (!ok) console.log("FAIL: over the limits");
  Deno.exit(ok ? 0 : 1);
}
