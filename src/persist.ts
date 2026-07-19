import type { Question, Quiz } from "./quiz.ts";
import { Session, type Phase } from "./session.ts";

export const SNAPSHOT_VERSION = 2 as const;

export type SnapshotParticipant = {
  id: string;
  name: string;
  joinOrder: number;
  score: number;
  /** questionIndex (string key) -> choiceIndex (effective play order) */
  answers: Record<string, number>;
};

/** Effective play question fields required for restore. */
export type SnapshotEffectiveQuestion = {
  text: string;
  choices: string[];
  correct: number;
  explain: string;
};

export type SessionSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  quizFingerprint: string;
  phase: Phase;
  questionIndex: number;
  nextJoinOrder: number;
  participants: SnapshotParticipant[];
  /** Session play order; required for v2. */
  effectiveQuestions: SnapshotEffectiveQuestion[];
};

const PHASES: ReadonlySet<string> = new Set([
  "LOBBY",
  "QUESTION",
  "CORRECT",
  "EXPLAIN",
  "LEADERBOARD",
  "END",
]);

/** Deterministic SHA-256 hex of canonical quiz JSON (authoring order). */
export async function quizFingerprint(quiz: Quiz): Promise<string> {
  const payload = JSON.stringify({
    title: quiz.title,
    questions: quiz.questions.map((q) => ({
      text: q.text,
      choices: q.choices,
      correct: q.correct,
      explain: q.explain,
    })),
  });
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function sessionToSnapshot(
  session: Session,
  fingerprint: string,
): SessionSnapshot {
  const state = session.toHydrate();
  return {
    version: SNAPSHOT_VERSION,
    quizFingerprint: fingerprint,
    phase: state.phase,
    questionIndex: state.questionIndex,
    nextJoinOrder: state.nextJoinOrder,
    participants: state.participants.map((p) => {
      const answers: Record<string, number> = {};
      for (const [qi, ci] of p.answers) {
        answers[String(qi)] = ci;
      }
      return {
        id: p.id,
        name: p.name,
        joinOrder: p.joinOrder,
        score: p.score,
        answers,
      };
    }),
    effectiveQuestions: state.effectiveQuestions.map((q) => ({
      text: q.text,
      choices: [...q.choices],
      correct: q.correct,
      explain: q.explain,
    })),
  };
}

export function sessionFromSnapshot(
  quiz: Quiz,
  snapshot: SessionSnapshot,
): Session {
  if (snapshot.effectiveQuestions.length !== quiz.questions.length) {
    throw new Error(
      `Snapshot effectiveQuestions length mismatch: ${snapshot.effectiveQuestions.length} vs ${quiz.questions.length}`,
    );
  }
  const participants = snapshot.participants.map((p) => {
    const answers = new Map<number, number>();
    for (const [k, v] of Object.entries(p.answers)) {
      const qi = Number(k);
      if (Number.isInteger(qi) && Number.isInteger(v)) {
        answers.set(qi, v);
      }
    }
    return {
      id: p.id,
      name: p.name,
      joinOrder: p.joinOrder,
      score: p.score,
      answers,
    };
  });
  const effectiveQuestions: Question[] = snapshot.effectiveQuestions.map(
    (q) => ({
      text: q.text,
      choices: [...q.choices],
      correct: q.correct,
      explain: q.explain,
    }),
  );
  return Session.fromHydrate(quiz, {
    phase: snapshot.phase,
    questionIndex: snapshot.questionIndex,
    nextJoinOrder: snapshot.nextJoinOrder,
    participants,
    effectiveQuestions,
  });
}

export function isValidSnapshot(data: unknown): data is SessionSnapshot {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const o = data as Record<string, unknown>;
  if (o.version !== SNAPSHOT_VERSION) return false;
  if (typeof o.quizFingerprint !== "string" || !o.quizFingerprint) return false;
  if (typeof o.phase !== "string" || !PHASES.has(o.phase)) return false;
  if (typeof o.questionIndex !== "number" || !Number.isInteger(o.questionIndex)) {
    return false;
  }
  if (o.questionIndex < 0) return false;
  if (
    typeof o.nextJoinOrder !== "number" ||
    !Number.isInteger(o.nextJoinOrder) ||
    o.nextJoinOrder < 0
  ) {
    return false;
  }
  if (!Array.isArray(o.participants)) return false;
  for (const p of o.participants) {
    if (!isValidSnapshotParticipant(p)) return false;
  }
  if (!Array.isArray(o.effectiveQuestions) || o.effectiveQuestions.length === 0) {
    return false;
  }
  for (const q of o.effectiveQuestions) {
    if (!isValidEffectiveQuestion(q)) return false;
  }
  return true;
}

/**
 * Validate snapshot against a loaded quiz: effective question count and
 * choice counts must match; each correct index in range.
 * Used when loading so a corrupt order cannot restore under a new shuffle.
 */
export function snapshotMatchesQuiz(
  snapshot: SessionSnapshot,
  quiz: Quiz,
): boolean {
  if (snapshot.effectiveQuestions.length !== quiz.questions.length) {
    return false;
  }
  for (let i = 0; i < quiz.questions.length; i++) {
    const eff = snapshot.effectiveQuestions[i]!;
    const can = quiz.questions[i]!;
    if (eff.choices.length !== can.choices.length) return false;
    // Same multiset of choice strings (order may differ)
    const a = [...eff.choices].sort();
    const b = [...can.choices].sort();
    for (let c = 0; c < a.length; c++) {
      if (a[c] !== b[c]) return false;
    }
    if (eff.text !== can.text) return false;
  }
  return true;
}

function isValidEffectiveQuestion(q: unknown): q is SnapshotEffectiveQuestion {
  if (q === null || typeof q !== "object" || Array.isArray(q)) return false;
  const o = q as Record<string, unknown>;
  if (typeof o.text !== "string") return false;
  if (!Array.isArray(o.choices) || o.choices.length < 2) return false;
  for (const c of o.choices) {
    if (typeof c !== "string" || !c.trim()) return false;
  }
  if (typeof o.correct !== "number" || !Number.isInteger(o.correct)) {
    return false;
  }
  if (o.correct < 0 || o.correct >= o.choices.length) return false;
  if (typeof o.explain !== "string") return false;
  return true;
}

function isValidSnapshotParticipant(p: unknown): p is SnapshotParticipant {
  if (p === null || typeof p !== "object" || Array.isArray(p)) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.name !== "string") return false;
  if (typeof o.joinOrder !== "number" || !Number.isInteger(o.joinOrder)) {
    return false;
  }
  if (typeof o.score !== "number" || !Number.isInteger(o.score) || o.score < 0) {
    return false;
  }
  if (
    o.answers === null ||
    typeof o.answers !== "object" ||
    Array.isArray(o.answers)
  ) {
    return false;
  }
  for (const [k, v] of Object.entries(o.answers as Record<string, unknown>)) {
    if (!/^\d+$/.test(k)) return false;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return false;
  }
  return true;
}

/**
 * Load snapshot from disk. Returns null if missing, corrupt, quiz mismatch,
 * or effective order unusable. Never throws for those cases.
 */
export async function loadSnapshot(
  path: string,
  expectedFingerprint: string,
  quiz?: Quiz,
): Promise<SessionSnapshot | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    console.error(`Session snapshot unreadable (${path}):`, err);
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`Session snapshot corrupt JSON (${path}); starting fresh`);
    return null;
  }

  if (!isValidSnapshot(data)) {
    console.error(`Session snapshot invalid shape (${path}); starting fresh`);
    return null;
  }

  if (data.quizFingerprint !== expectedFingerprint) {
    console.error(
      `Session snapshot quiz mismatch (${path}); starting fresh`,
    );
    return null;
  }

  if (quiz !== undefined && !snapshotMatchesQuiz(data, quiz)) {
    console.error(
      `Session snapshot effective questions mismatch (${path}); starting fresh`,
    );
    return null;
  }

  return data;
}

/** Atomic write: temp file in same dir, then rename. */
export async function saveSnapshot(
  path: string,
  snapshot: SessionSnapshot,
): Promise<void> {
  const parent = dirname(path);
  if (parent) {
    await Deno.mkdir(parent, { recursive: true });
  }
  const tmp = `${path}.${crypto.randomUUID()}.tmp`;
  const body = JSON.stringify(snapshot);
  try {
    await Deno.writeTextFile(tmp, body);
    await Deno.rename(tmp, path);
  } catch (err) {
    try {
      await Deno.remove(tmp);
    } catch {
      // ignore cleanup
    }
    throw err;
  }
}

export async function clearSnapshot(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return;
    throw err;
  }
}

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) return "";
  return path.slice(0, i);
}
