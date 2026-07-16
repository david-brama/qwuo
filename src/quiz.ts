export type Question = {
  text: string;
  choices: string[];
  correct: number;
  explain: string;
};

export type Quiz = {
  title: string;
  questions: Question[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateQuiz(data: unknown, path: string): Quiz {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${path}: root must be a JSON object`);
  }
  const root = data as Record<string, unknown>;

  if (!isNonEmptyString(root.title)) {
    throw new Error(`${path}: "title" must be a non-empty string`);
  }

  if (!Array.isArray(root.questions) || root.questions.length === 0) {
    throw new Error(`${path}: "questions" must be a non-empty array`);
  }

  const questions: Question[] = [];

  for (let i = 0; i < root.questions.length; i++) {
    const q = root.questions[i];
    const loc = `${path}: questions[${i}]`;

    if (q === null || typeof q !== "object" || Array.isArray(q)) {
      throw new Error(`${loc}: must be an object`);
    }
    const qobj = q as Record<string, unknown>;

    if (!isNonEmptyString(qobj.text)) {
      throw new Error(`${loc}: "text" must be a non-empty string`);
    }

    if (!Array.isArray(qobj.choices) || qobj.choices.length < 2) {
      throw new Error(`${loc}: "choices" must be an array of at least 2 strings`);
    }

    const choices: string[] = [];
    for (let c = 0; c < qobj.choices.length; c++) {
      const choice = qobj.choices[c];
      if (!isNonEmptyString(choice)) {
        throw new Error(`${loc}: choices[${c}] must be a non-empty string`);
      }
      choices.push(choice.trim());
    }

    if (typeof qobj.correct !== "number" || !Number.isInteger(qobj.correct)) {
      throw new Error(`${loc}: "correct" must be an integer index into choices`);
    }
    if (qobj.correct < 0 || qobj.correct >= choices.length) {
      throw new Error(
        `${loc}: "correct" index ${qobj.correct} out of range (0–${choices.length - 1})`,
      );
    }

    let explain = "";
    if (qobj.explain !== undefined && qobj.explain !== null) {
      if (typeof qobj.explain !== "string") {
        throw new Error(`${loc}: "explain" must be a string if present`);
      }
      explain = qobj.explain.trim();
    }

    questions.push({
      text: qobj.text.trim(),
      choices,
      correct: qobj.correct,
      explain,
    });
  }

  return { title: root.title.trim(), questions };
}

export async function loadQuiz(path: string): Promise<Quiz> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read quiz file "${path}": ${msg}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in "${path}": ${msg}`);
  }

  return validateQuiz(data, path);
}
