import {
  buildMetadataFilterFacets,
  copyQuestion,
  effectiveCountdownSeconds,
  filterQuestionsByMetadata,
  resolveSlideMetadata,
  shuffleQuestionChoices,
  type MetadataFacet,
  type MetadataFilter,
  type Question,
  type Quiz,
  type RandomInt,
} from "./quiz.ts";

/** Countdown payload for projector/player state during QUESTION. */
export type CountdownState = {
  totalSeconds: number;
  deadlineMs: number;
};

/** Hooks for countdown auto-advance side effects (e.g. durable save). */
export type CountdownHooks = {
  onAutoAdvance?: () => void | Promise<void>;
};

export type Phase =
  | "LOBBY"
  | "QUESTION"
  | "CORRECT"
  | "EXPLAIN"
  | "LEADERBOARD"
  | "END";

export type Participant = {
  id: string;
  name: string;
  joinOrder: number;
  score: number;
  /** questionIndex -> choiceIndex (effective play order) */
  answers: Map<number, number>;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  joinOrder: number;
  rank: number;
};

/** Serializable runtime state for hydrate/persist (answers as Map). */
export type SessionHydrate = {
  phase: Phase;
  questionIndex: number;
  nextJoinOrder: number;
  participants: Participant[];
  /** Effective play questions (shuffled choices + remapped correct). */
  effectiveQuestions: Question[];
  /** Runtime metadata filters (empty = full process bank). */
  runtimeFilters?: MetadataFilter[];
  /**
   * Absolute QUESTION deadline (epoch ms). Null/omitted = no active deadline
   * (or legacy snapshot — caller may start a fresh countdown).
   */
  questionDeadlineMs?: number | null;
  /**
   * Highest question index whose correct answer has been shown (-1 = none).
   * Omitted (legacy snapshot) → derived from phase / questionIndex.
   */
  revealedThrough?: number;
};

/** Server-side name cap (matches player input maxlength). */
export const MAX_NAME_LENGTH = 40;
export const MAX_PARTICIPANTS = 500;

/**
 * A participant whose phone polled within this window counts as online.
 * Phones poll every second, so 15 s rides out short Wi-Fi drops.
 */
export const ONLINE_WINDOW_MS = 15_000;

/** Rolling window size for active-user engagement. */
export const ENGAGEMENT_WINDOW_SIZE = 4;
/** Minimum answers within the window to count as active. */
export const ACTIVE_ANSWER_THRESHOLD = 2;

/**
 * Playable question indices in the engagement window (at most
 * ENGAGEMENT_WINDOW_SIZE), ending at the phase reference index.
 * LOBBY → empty; END → last playable index; question cycle → current index.
 */
export function engagementWindowIndices(
  phase: Phase,
  questionIndex: number,
  questionCount: number,
): number[] {
  let ref: number;
  if (phase === "LOBBY") {
    return [];
  }
  if (phase === "END") {
    if (questionCount <= 0) return [];
    ref = questionCount - 1;
  } else {
    ref = questionIndex;
  }
  const start = Math.max(0, ref - (ENGAGEMENT_WINDOW_SIZE - 1));
  const out: number[] = [];
  for (let i = start; i <= ref; i++) out.push(i);
  return out;
}

/** True if the participant has ≥ ACTIVE_ANSWER_THRESHOLD answers in window. */
export function isActiveParticipant(
  answers: ReadonlyMap<number, number>,
  window: readonly number[],
): boolean {
  if (window.length < ACTIVE_ANSWER_THRESHOLD) return false;
  let n = 0;
  for (const idx of window) {
    if (answers.has(idx)) {
      n++;
      if (n >= ACTIVE_ANSWER_THRESHOLD) return true;
    }
  }
  return false;
}

/**
 * Competition ranks ("1224") for scores already sorted high → low:
 * equal scores share a rank, and the next rank skips the tied places.
 */
export function competitionRanks(sortedScores: readonly number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sortedScores.length; i++) {
    ranks.push(
      i > 0 && sortedScores[i] === sortedScores[i - 1] ? ranks[i - 1] : i + 1,
    );
  }
  return ranks;
}

/** Strip C0 controls + DEL; trim; enforce max length. */
export function normalizeParticipantName(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function cloneQuestions(questions: Question[]): Question[] {
  return questions.map(copyQuestion);
}

function cloneFilters(filters: MetadataFilter[]): MetadataFilter[] {
  return filters.map((f) => ({ key: f.key, value: f.value }));
}

/**
 * Normalize runtime filters: one value per key (intersection only).
 * Duplicate keys are rejected — OR-within-key is startup/CLI only.
 */
function normalizeFilterList(filters: MetadataFilter[]): MetadataFilter[] {
  const out: MetadataFilter[] = [];
  const seen = new Set<string>();
  for (const f of filters) {
    if (!f || typeof f.key !== "string" || typeof f.value !== "string") {
      throw new SessionError("Invalid filter entry", 400);
    }
    const key = f.key.trim();
    const value = f.value.trim();
    if (!key) {
      throw new SessionError("Invalid filter entry: empty key", 400);
    }
    if (seen.has(key)) {
      throw new SessionError(
        `Duplicate filter key "${key}": runtime filters allow one value per key`,
        400,
      );
    }
    seen.add(key);
    out.push({ key, value });
  }
  return out;
}

export type SessionOptions = {
  /** Injectable RNG for tests; used when building a fresh shuffle. */
  randomInt?: RandomInt;
  /**
   * When set, use these play questions instead of shuffling (restore path).
   * Length must match the filtered bank under runtimeFilters.
   */
  effectiveQuestions?: Question[];
  /** Initial runtime metadata filters (default none). */
  runtimeFilters?: MetadataFilter[];
  /** Injectable clock for presence tests (default Date.now). */
  now?: () => number;
};

export class Session {
  /**
   * Canonical loaded quiz (authoring order). Used for title/metadata and
   * must remain unshuffled for fingerprinting by callers.
   * `quiz.questions` is the process bank (after startup filters).
   */
  readonly quiz: Quiz;
  /** Playable questions for this room (shuffled choices). */
  private playQuestions: Question[];
  /** Active runtime metadata filters (subset of process bank). */
  private runtimeFilters: MetadataFilter[] = [];
  phase: Phase = "LOBBY";
  questionIndex = 0;
  private participants = new Map<string, Participant>();
  /** participant id → last poll/join/answer time (epoch ms); not persisted. */
  private lastSeenMs = new Map<string, number>();
  private now: () => number = Date.now;
  private nextJoinOrder = 0;
  private readonly randomInt?: RandomInt;

  /** Absolute deadline for current QUESTION countdown; null if none. */
  private questionDeadlineMs: number | null = null;
  /** Effective total seconds for the active countdown (for client display). */
  private countdownTotalSeconds: number | null = null;
  /** Incremented each time a QUESTION countdown is armed; stale timers no-op. */
  private countdownGeneration = 0;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownHooks: CountdownHooks = {};
  /**
   * Highest question index whose answer has been revealed (reached CORRECT).
   * Play is lockstep, so every lower index is revealed too. A QUESTION at or
   * below this index is read-only: no answers, no countdown.
   */
  private revealedThrough = -1;

  constructor(quiz: Quiz, options?: SessionOptions) {
    this.quiz = quiz;
    this.randomInt = options?.randomInt;
    if (options?.now) this.now = options.now;
    this.runtimeFilters = cloneFilters(options?.runtimeFilters ?? []);
    if (options?.effectiveQuestions) {
      if (options.effectiveQuestions.length === 0) {
        throw new Error("effectiveQuestions must be non-empty");
      }
      this.playQuestions = cloneQuestions(options.effectiveQuestions);
    } else {
      this.playQuestions = this.buildShuffledPlayQuestions(this.runtimeFilters);
    }
  }

  /** Register hooks (e.g. durable save) invoked after countdown auto-advance. */
  setCountdownHooks(hooks: CountdownHooks): void {
    this.countdownHooks = hooks;
  }

  /** Current absolute QUESTION deadline, or null. */
  getQuestionDeadlineMs(): number | null {
    return this.questionDeadlineMs;
  }

  /** True when the current QUESTION's answer was already revealed (Back). */
  get answersLocked(): boolean {
    return this.phase === "QUESTION" &&
      this.questionIndex <= this.revealedThrough;
  }

  /** Highest revealed question index (-1 = none). */
  getRevealedThrough(): number {
    return this.revealedThrough;
  }

  /** Record that the current question's answer is now shown. */
  private markCurrentRevealed(): void {
    if (this.questionIndex > this.revealedThrough) {
      this.revealedThrough = this.questionIndex;
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /** Clear deadline + timer without changing phase. */
  private clearCountdown(): void {
    this.clearCountdownTimer();
    this.questionDeadlineMs = null;
    this.countdownTotalSeconds = null;
  }

  /**
   * Arm countdown for the current QUESTION from effective duration.
   * Cancels any prior timer first.
   */
  private startCountdownForCurrentQuestion(): void {
    this.clearCountdownTimer();
    if (this.answersLocked) {
      this.questionDeadlineMs = null;
      this.countdownTotalSeconds = null;
      return;
    }
    const effective = effectiveCountdownSeconds(this.quiz, this.currentQuestion);
    if (effective === null || effective <= 0) {
      this.questionDeadlineMs = null;
      this.countdownTotalSeconds = null;
      return;
    }
    this.countdownGeneration += 1;
    const gen = this.countdownGeneration;
    this.countdownTotalSeconds = effective;
    this.questionDeadlineMs = Date.now() + effective * 1000;
    this.scheduleCountdownExpiry(gen);
  }

  /**
   * Restore or start a countdown while phase is already QUESTION (hydrate path).
   * - future deadlineMs → use it
   * - past deadlineMs → apply expiry immediately (QUESTION→CORRECT)
   * - null/undefined deadline + effective > 0 → fresh full countdown
   * - no effective countdown → clear
   */
  restoreCountdown(deadlineMs: number | null | undefined): void {
    this.clearCountdownTimer();
    if (this.phase !== "QUESTION" || this.answersLocked) {
      this.questionDeadlineMs = null;
      this.countdownTotalSeconds = null;
      return;
    }
    const effective = effectiveCountdownSeconds(this.quiz, this.currentQuestion);
    if (effective === null || effective <= 0) {
      this.questionDeadlineMs = null;
      this.countdownTotalSeconds = null;
      return;
    }

    if (deadlineMs === null || deadlineMs === undefined) {
      // Legacy snapshot: start a new full countdown from now
      this.startCountdownForCurrentQuestion();
      return;
    }

    if (!Number.isFinite(deadlineMs)) {
      this.startCountdownForCurrentQuestion();
      return;
    }

    const now = Date.now();
    if (deadlineMs <= now) {
      // Overdue: apply expiry (same as timer fire)
      this.questionDeadlineMs = null;
      this.countdownTotalSeconds = null;
      if (this.phase === "QUESTION") {
        this.phase = "CORRECT";
        this.markCurrentRevealed();
      }
      return;
    }

    this.countdownGeneration += 1;
    const gen = this.countdownGeneration;
    this.countdownTotalSeconds = effective;
    this.questionDeadlineMs = deadlineMs;
    this.scheduleCountdownExpiry(gen);
  }

  private scheduleCountdownExpiry(generation: number): void {
    this.clearCountdownTimer();
    if (this.questionDeadlineMs === null) return;
    const delay = Math.max(0, this.questionDeadlineMs - Date.now());
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = null;
      this.onCountdownFire(generation);
    }, delay);
  }

  private onCountdownFire(generation: number): void {
    if (generation !== this.countdownGeneration) return;
    if (this.phase !== "QUESTION") return;
    // Unanswered stay at 0 — same as host advance from QUESTION
    this.phase = "CORRECT";
    this.markCurrentRevealed();
    this.clearCountdown();
    const hook = this.countdownHooks.onAutoAdvance;
    if (hook) {
      try {
        const result = hook();
        if (result && typeof (result as Promise<void>).then === "function") {
          (result as Promise<void>).catch((err) => {
            console.error("Countdown auto-advance save failed:", err);
          });
        }
      } catch (err) {
        console.error("Countdown auto-advance hook failed:", err);
      }
    }
  }

  private countdownPayload(): CountdownState | null {
    if (
      this.phase !== "QUESTION" ||
      this.questionDeadlineMs === null ||
      this.countdownTotalSeconds === null ||
      this.countdownTotalSeconds <= 0
    ) {
      return null;
    }
    return {
      totalSeconds: this.countdownTotalSeconds,
      deadlineMs: this.questionDeadlineMs,
    };
  }

  /** Process bank size (startup-filtered quiz). */
  get bankQuestionCount(): number {
    return this.quiz.questions.length;
  }

  getRuntimeFilters(): MetadataFilter[] {
    return cloneFilters(this.runtimeFilters);
  }

  getFilterFacets(): MetadataFacet[] {
    return buildMetadataFilterFacets(this.quiz.questions);
  }

  /** Match count for filters against the process bank (no mutation). */
  previewRuntimeFilters(filters: MetadataFilter[]): {
    matchCount: number;
    bankQuestionCount: number;
    filters: MetadataFilter[];
  } {
    const normalized = normalizeFilterList(filters);
    const matched = filterQuestionsByMetadata(
      this.quiz.questions,
      normalized,
    );
    return {
      matchCount: matched.length,
      bankQuestionCount: this.bankQuestionCount,
      filters: normalized,
    };
  }

  /**
   * Apply runtime filters in LOBBY. Empty list clears to full bank.
   * Rejects empty match sets and non-LOBBY phases.
   */
  applyRuntimeFilters(filters: MetadataFilter[]): void {
    if (this.phase !== "LOBBY") {
      throw new SessionError(
        "Filters can only be applied in LOBBY",
        409,
      );
    }
    const normalized = normalizeFilterList(filters);
    const matched = filterQuestionsByMetadata(
      this.quiz.questions,
      normalized,
    );
    if (matched.length === 0) {
      throw new SessionError(
        "No questions match the selected filters",
        400,
      );
    }
    this.runtimeFilters = normalized;
    this.playQuestions = this.shuffleBankSubset(matched);
    this.questionIndex = 0;
    // Indices now point at a different question set: the reveal watermark
    // and per-index answers no longer apply. Scores already earned stay.
    this.revealedThrough = -1;
    for (const p of this.participants.values()) p.answers.clear();
  }

  private buildShuffledPlayQuestions(
    filters: MetadataFilter[],
  ): Question[] {
    const matched = filterQuestionsByMetadata(this.quiz.questions, filters);
    if (matched.length === 0) {
      throw new Error("Playable question set is empty");
    }
    return this.shuffleBankSubset(matched);
  }

  private shuffleBankSubset(questions: Question[]): Question[] {
    const rng = this.randomInt;
    return questions.map((q) =>
      rng ? shuffleQuestionChoices(q, rng) : shuffleQuestionChoices(q)
    );
  }

  /**
   * Restore without reshuffling. `state.effectiveQuestions` is the playable
   * list (may be a subset of the bank). Caller/persist validates shape.
   */
  static fromHydrate(quiz: Quiz, state: SessionHydrate): Session {
    const session = new Session(quiz, {
      effectiveQuestions: state.effectiveQuestions,
      runtimeFilters: state.runtimeFilters ?? [],
      // randomInt unused on hydrate path
    });
    session.phase = state.phase;
    session.questionIndex = state.questionIndex;
    session.nextJoinOrder = state.nextJoinOrder;
    session.revealedThrough = state.revealedThrough ??
      legacyRevealedThrough(state.phase, state.questionIndex, session.questionCount);
    for (const p of state.participants) {
      session.participants.set(p.id, {
        id: p.id,
        name: p.name,
        joinOrder: p.joinOrder,
        score: p.score,
        answers: new Map(p.answers),
      });
    }
    // Restore countdown last so phase/index are set; may advance overdue QUESTION.
    session.restoreCountdown(state.questionDeadlineMs);
    return session;
  }

  toHydrate(): SessionHydrate {
    return {
      phase: this.phase,
      questionIndex: this.questionIndex,
      nextJoinOrder: this.nextJoinOrder,
      participants: [...this.participants.values()].map((p) => ({
        id: p.id,
        name: p.name,
        joinOrder: p.joinOrder,
        score: p.score,
        answers: new Map(p.answers),
      })),
      effectiveQuestions: cloneQuestions(this.playQuestions),
      runtimeFilters: cloneFilters(this.runtimeFilters),
      questionDeadlineMs: this.questionDeadlineMs,
      revealedThrough: this.revealedThrough,
    };
  }

  /**
   * Soft host reset: return to LOBBY, clear runtime filters (full bank +
   * fresh shuffle), keep participants (same QR / ids). Scores and
   * per-question answers are zeroed so a replay cannot score twice.
   */
  reset(): void {
    this.clearCountdown();
    this.phase = "LOBBY";
    this.questionIndex = 0;
    this.revealedThrough = -1;
    this.runtimeFilters = [];
    this.playQuestions = this.buildShuffledPlayQuestions([]);
    for (const p of this.participants.values()) {
      p.answers.clear();
      p.score = 0;
    }
  }

  get questionCount(): number {
    return this.playQuestions.length;
  }

  get currentQuestion(): Question {
    return this.playQuestions[this.questionIndex]!;
  }

  /** Effective play questions (copy). */
  getEffectiveQuestions(): Question[] {
    return cloneQuestions(this.playQuestions);
  }

  join(name: string): { id: string; name: string } {
    if (this.participants.size >= MAX_PARTICIPANTS) {
      throw new SessionError("Session is full", 403);
    }
    const trimmed = normalizeParticipantName(name);
    if (!trimmed) {
      throw new SessionError("Name is required", 400);
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new SessionError(
        `Name must be at most ${MAX_NAME_LENGTH} characters`,
        400,
      );
    }
    const id = crypto.randomUUID();
    const participant: Participant = {
      id,
      name: trimmed,
      joinOrder: this.nextJoinOrder++,
      score: 0,
      answers: new Map(),
    };
    this.participants.set(id, participant);
    this.markSeen(id);
    return { id, name: trimmed };
  }

  /** Record that a participant's phone is connected (poll, join, answer). */
  markSeen(participantId: string): void {
    if (this.participants.has(participantId)) {
      this.lastSeenMs.set(participantId, this.now());
    }
  }

  getParticipant(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  answer(
    participantId: string,
    choiceIndex: number,
  ): { correct: boolean; correctIndex: number; score: number } {
    if (this.phase !== "QUESTION") {
      throw new SessionError("Answers only accepted during QUESTION phase", 400);
    }
    if (this.answersLocked) {
      throw new SessionError(
        "Answers are closed: the correct answer was already shown",
        409,
      );
    }
    const p = this.participants.get(participantId);
    if (!p) {
      throw new SessionError("Unknown participant", 404);
    }
    if (p.answers.has(this.questionIndex)) {
      throw new SessionError("Already answered this question", 409);
    }
    const q = this.currentQuestion;
    if (
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= q.choices.length
    ) {
      throw new SessionError("Invalid choice index", 400);
    }

    p.answers.set(this.questionIndex, choiceIndex);
    this.markSeen(participantId);
    const correct = choiceIndex === q.correct;
    if (correct) p.score += 1;

    return { correct, correctIndex: q.correct, score: p.score };
  }

  advance(): Phase {
    const prev = this.phase;
    switch (this.phase) {
      case "LOBBY":
        this.phase = "QUESTION";
        this.questionIndex = 0;
        break;
      case "QUESTION":
        // Unanswered stay at 0 — no retroactive answers after this
        this.phase = "CORRECT";
        this.markCurrentRevealed();
        break;
      case "CORRECT":
        this.phase = "EXPLAIN";
        break;
      case "EXPLAIN":
        this.phase = "LEADERBOARD";
        break;
      case "LEADERBOARD":
        if (this.questionIndex + 1 < this.questionCount) {
          this.questionIndex += 1;
          this.phase = "QUESTION";
        } else {
          this.phase = "END";
        }
        break;
      case "END":
        // stay at END
        break;
    }
    this.syncCountdownAfterPhaseChange(prev, this.phase);
    return this.phase;
  }

  /**
   * Reverse one host step (projector Back). LOBBY is a no-op.
   * Does not clear answers or scores — only phase / question index.
   * Back from CORRECT shows the QUESTION read-only (answersLocked): answers
   * are rejected and no countdown runs, since the answer was already shown.
   * Re-entering an unrevealed QUESTION (Back past it, then Next) starts a
   * full countdown (does not resume partial).
   */
  back(): Phase {
    const prev = this.phase;
    switch (this.phase) {
      case "LOBBY":
        break;
      case "QUESTION":
        if (this.questionIndex <= 0) {
          this.phase = "LOBBY";
          this.questionIndex = 0;
        } else {
          this.questionIndex -= 1;
          this.phase = "LEADERBOARD";
        }
        break;
      case "CORRECT":
        this.phase = "QUESTION";
        break;
      case "EXPLAIN":
        this.phase = "CORRECT";
        break;
      case "LEADERBOARD":
        this.phase = "EXPLAIN";
        break;
      case "END":
        if (this.questionCount > 0) {
          this.questionIndex = this.questionCount - 1;
          this.phase = "LEADERBOARD";
        } else {
          this.phase = "LOBBY";
        }
        break;
    }
    this.syncCountdownAfterPhaseChange(prev, this.phase);
    return this.phase;
  }

  /** Start/clear countdown when phase enters or leaves QUESTION. */
  private syncCountdownAfterPhaseChange(prev: Phase, next: Phase): void {
    if (next === "QUESTION" && prev !== "QUESTION") {
      this.startCountdownForCurrentQuestion();
      return;
    }
    if (prev === "QUESTION" && next !== "QUESTION") {
      this.clearCountdown();
    }
  }

  /** True when Back would change phase (not LOBBY). */
  canGoBack(): boolean {
    return this.phase !== "LOBBY";
  }

  /**
   * Score order with competition ranking: equal scores share a rank and the
   * next rank skips (1, 1, 3). Ties list in join order.
   */
  leaderboard(): LeaderboardEntry[] {
    const list = [...this.participants.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.joinOrder - b.joinOrder;
    });
    return competitionRanks(list.map((p) => p.score)).map((rank, i) => ({
      id: list[i].id,
      name: list[i].name,
      score: list[i].score,
      joinOrder: list[i].joinOrder,
      rank,
    }));
  }

  /**
   * Questions whose answer has been revealed (scored) so far — the fair
   * denominator for leaderboard scores.
   */
  questionsAsked(): number {
    return Math.min(this.questionCount, Math.max(0, this.revealedThrough + 1));
  }

  hasAnswered(participantId: string, questionIndex = this.questionIndex): boolean {
    const p = this.participants.get(participantId);
    return p ? p.answers.has(questionIndex) : false;
  }

  participantCount(): number {
    return this.participants.size;
  }

  /**
   * Host engagement metrics derived from answer maps.
   * activeAnsweredCount is 0 in LOBBY/END (no current-question slide).
   */
  private engagementMetrics(): {
    activeUserCount: number;
    activeAnsweredCount: number;
  } {
    const window = engagementWindowIndices(
      this.phase,
      this.questionIndex,
      this.questionCount,
    );
    const trackCurrentAnswered =
      this.phase !== "LOBBY" && this.phase !== "END";
    let activeUserCount = 0;
    let activeAnsweredCount = 0;
    for (const p of this.participants.values()) {
      if (!isActiveParticipant(p.answers, window)) continue;
      activeUserCount++;
      if (trackCurrentAnswered && p.answers.has(this.questionIndex)) {
        activeAnsweredCount++;
      }
    }
    return { activeUserCount, activeAnsweredCount };
  }

  /**
   * "X of N answered" for the current question. X = answers to it.
   * N = participants who can answer it: online now (polled within
   * ONLINE_WINDOW_MS) or already answered, so X ≤ N and closed or
   * abandoned phones do not inflate N. Both 0 in LOBBY/END.
   */
  answerProgress(): { answeredCount: number; onlineCount: number } {
    const cutoff = this.now() - ONLINE_WINDOW_MS;
    const onSlide = this.phase !== "LOBBY" && this.phase !== "END";
    let answeredCount = 0;
    let onlineCount = 0;
    for (const p of this.participants.values()) {
      const answered = onSlide && p.answers.has(this.questionIndex);
      if (answered) answeredCount++;
      if (answered || (this.lastSeenMs.get(p.id) ?? -Infinity) >= cutoff) {
        onlineCount++;
      }
    }
    return { answeredCount, onlineCount };
  }

  /** Host-facing full state */
  projectorState() {
    const q = this.phase === "LOBBY" || this.phase === "END"
      ? null
      : this.currentQuestion;

    const slideKeys = this.quiz.config?.slideMetadataKeys;
    const { activeUserCount, activeAnsweredCount } = this.engagementMetrics();
    const { answeredCount, onlineCount } = this.answerProgress();

    return {
      role: "projector" as const,
      title: this.quiz.title,
      phase: this.phase,
      questionIndex: this.questionIndex,
      questionCount: this.questionCount,
      bankQuestionCount: this.bankQuestionCount,
      questionsAsked: this.questionsAsked(),
      participantCount: this.participantCount(),
      answeredCount,
      onlineCount,
      activeUserCount,
      activeAnsweredCount,
      canGoBack: this.canGoBack(),
      canApplyFilter: this.phase === "LOBBY",
      activeFilters: this.getRuntimeFilters(),
      filterFacets: this.getFilterFacets(),
      countdown: this.countdownPayload(),
      answersLocked: this.answersLocked,
      question: q
        ? {
          text: q.text,
          choices: q.choices,
          correct: q.correct,
          explain: q.explain || "No explanation",
          slideMetadata: resolveSlideMetadata(slideKeys, q.metadata),
        }
        : null,
      leaderboard: this.leaderboard(),
    };
  }

  /** Player-facing state — never leaks correct index before answer */
  playerState(participantId?: string | null) {
    const p = participantId ? this.participants.get(participantId) : undefined;
    const answered = p ? p.answers.has(this.questionIndex) : false;
    const q = this.phase === "LOBBY" || this.phase === "END"
      ? null
      : this.currentQuestion;

    return {
      role: "player" as const,
      title: this.quiz.title,
      phase: this.phase,
      questionIndex: this.questionIndex,
      questionCount: this.questionCount,
      countdown: this.countdownPayload(),
      answersLocked: this.answersLocked,
      question: q
        ? {
          text: q.text,
          choices: q.choices,
        }
        : null,
      participant: p
        ? {
          id: p.id,
          name: p.name,
          score: p.score,
          answered,
        }
        : null,
    };
  }
}

/**
 * Revealed watermark for snapshots saved before it was stored. Lockstep play
 * means every index before the current one was revealed, plus the current one
 * once past QUESTION.
 */
export function legacyRevealedThrough(
  phase: Phase,
  questionIndex: number,
  questionCount: number,
): number {
  switch (phase) {
    case "LOBBY":
      return -1;
    case "QUESTION":
      return questionIndex - 1;
    case "END":
      return questionCount - 1;
    default:
      return questionIndex;
  }
}

export class SessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}
