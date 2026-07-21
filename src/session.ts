import {
  buildMetadataFilterFacets,
  copyQuestion,
  filterQuestionsByMetadata,
  resolveSlideMetadata,
  shuffleQuestionChoices,
  type MetadataFacet,
  type MetadataFilter,
  type Question,
  type Quiz,
  type RandomInt,
} from "./quiz.ts";

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
};

/** Server-side name cap (matches player input maxlength). */
export const MAX_NAME_LENGTH = 40;
export const MAX_PARTICIPANTS = 200;

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
  private nextJoinOrder = 0;
  private readonly randomInt?: RandomInt;

  constructor(quiz: Quiz, options?: SessionOptions) {
    this.quiz = quiz;
    this.randomInt = options?.randomInt;
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
    for (const p of state.participants) {
      session.participants.set(p.id, {
        id: p.id,
        name: p.name,
        joinOrder: p.joinOrder,
        score: p.score,
        answers: new Map(p.answers),
      });
    }
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
    };
  }

  /**
   * Soft host reset: return to LOBBY, clear runtime filters (full bank +
   * fresh shuffle), keep participants and scores. Per-question answers are
   * cleared so indices stay consistent with the rebuilt playable set.
   */
  reset(): void {
    this.phase = "LOBBY";
    this.questionIndex = 0;
    this.runtimeFilters = [];
    this.playQuestions = this.buildShuffledPlayQuestions([]);
    for (const p of this.participants.values()) {
      p.answers.clear();
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
    return { id, name: trimmed };
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
    const correct = choiceIndex === q.correct;
    if (correct) p.score += 1;

    return { correct, correctIndex: q.correct, score: p.score };
  }

  advance(): Phase {
    switch (this.phase) {
      case "LOBBY":
        this.phase = "QUESTION";
        this.questionIndex = 0;
        break;
      case "QUESTION":
        // Unanswered stay at 0 — no retroactive answers after this
        this.phase = "CORRECT";
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
    return this.phase;
  }

  /**
   * Reverse one host step (projector Back). LOBBY is a no-op.
   * Does not clear answers or scores — only phase / question index.
   */
  back(): Phase {
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
    return this.phase;
  }

  /** True when Back would change phase (not LOBBY). */
  canGoBack(): boolean {
    return this.phase !== "LOBBY";
  }

  leaderboard(): LeaderboardEntry[] {
    const list = [...this.participants.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.joinOrder - b.joinOrder;
    });
    return list.map((p, i) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      joinOrder: p.joinOrder,
      rank: i + 1,
    }));
  }

  hasAnswered(participantId: string, questionIndex = this.questionIndex): boolean {
    const p = this.participants.get(participantId);
    return p ? p.answers.has(questionIndex) : false;
  }

  participantCount(): number {
    return this.participants.size;
  }

  /** Host-facing full state */
  projectorState() {
    const q = this.phase === "LOBBY" || this.phase === "END"
      ? null
      : this.currentQuestion;

    const slideKeys = this.quiz.config?.slideMetadataKeys;

    return {
      role: "projector" as const,
      title: this.quiz.title,
      phase: this.phase,
      questionIndex: this.questionIndex,
      questionCount: this.questionCount,
      bankQuestionCount: this.bankQuestionCount,
      participantCount: this.participantCount(),
      canGoBack: this.canGoBack(),
      canApplyFilter: this.phase === "LOBBY",
      activeFilters: this.getRuntimeFilters(),
      filterFacets: this.getFilterFacets(),
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

export class SessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}
