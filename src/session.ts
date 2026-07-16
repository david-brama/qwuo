import type { Quiz } from "./quiz.ts";

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
  /** questionIndex -> choiceIndex */
  answers: Map<number, number>;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  joinOrder: number;
  rank: number;
};

/** Server-side name cap (matches player input maxlength). */
export const MAX_NAME_LENGTH = 40;
export const MAX_PARTICIPANTS = 200;

/** Strip C0 controls + DEL; trim; enforce max length. */
export function normalizeParticipantName(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export class Session {
  readonly quiz: Quiz;
  phase: Phase = "LOBBY";
  questionIndex = 0;
  private participants = new Map<string, Participant>();
  private nextJoinOrder = 0;

  constructor(quiz: Quiz) {
    this.quiz = quiz;
  }

  get questionCount(): number {
    return this.quiz.questions.length;
  }

  get currentQuestion() {
    return this.quiz.questions[this.questionIndex];
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

    return {
      role: "projector" as const,
      title: this.quiz.title,
      phase: this.phase,
      questionIndex: this.questionIndex,
      questionCount: this.questionCount,
      participantCount: this.participantCount(),
      question: q
        ? {
          text: q.text,
          choices: q.choices,
          correct: q.correct,
          explain: q.explain || "No explanation",
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
