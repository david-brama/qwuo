export type Question = {
  text: string;
  choices: string[];
  correct: number;
  explain: string;
  metadata?: Record<string, unknown>;
};

/** Quiz-level presentation/config retained at load (known fields only). */
export type QuizConfig = {
  /** Ordered question.metadata keys to show on projector slides. */
  slideMetadataKeys: string[];
};

/** One resolved metadata entry for projector slides. */
export type SlideMetadataEntry = {
  key: string;
  value: string;
};

export type Quiz = {
  title: string;
  questions: Question[];
  metadata?: Record<string, unknown>;
  config?: QuizConfig;
};

/**
 * Root metadata catalog property → per-question metadata key.
 * When the catalog array is present on quiz.metadata, question values must match.
 */
export const METADATA_CATALOG_PAIRS: ReadonlyArray<{
  catalogKey: string;
  questionKey: string;
}> = [
  { catalogKey: "domains", questionKey: "domain" },
  { catalogKey: "use_cases", questionKey: "use-case" },
];

/** One metadata filter entry: `key=value` after parse. */
export type MetadataFilter = {
  key: string;
  value: string;
};

/** Returns an integer in `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

/** Unbiased integer in `[0, maxExclusive)` via `crypto.getRandomValues`. */
export function cryptoRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer");
  }
  const buf = new Uint32Array(1);
  // Rejection sampling avoids modulo bias
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % maxExclusive;
}

function parseMetadataField(
  raw: unknown,
  loc: string,
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${loc}: "metadata" must be a JSON object if present`);
  }
  return { ...(raw as Record<string, unknown>) };
}

/**
 * Parse optional root `config`. Known fields only (`slideMetadataKeys`).
 * Omitted/null → undefined. Empty object → config with empty keys list.
 */
function parseQuizConfig(
  raw: unknown,
  loc: string,
): QuizConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${loc}: "config" must be a JSON object if present`);
  }
  const obj = raw as Record<string, unknown>;
  let slideMetadataKeys: string[] = [];

  if (obj.slideMetadataKeys !== undefined && obj.slideMetadataKeys !== null) {
    if (!Array.isArray(obj.slideMetadataKeys)) {
      throw new Error(
        `${loc}: config.slideMetadataKeys must be an array of non-empty strings`,
      );
    }
    const seen = new Set<string>();
    for (let i = 0; i < obj.slideMetadataKeys.length; i++) {
      const k = obj.slideMetadataKeys[i];
      if (!isNonEmptyString(k)) {
        throw new Error(
          `${loc}: config.slideMetadataKeys[${i}] must be a non-empty string`,
        );
      }
      const key = k.trim();
      if (seen.has(key)) {
        throw new Error(
          `${loc}: config.slideMetadataKeys must not contain duplicates ("${key}")`,
        );
      }
      seen.add(key);
      slideMetadataKeys.push(key);
    }
  }

  return { slideMetadataKeys };
}

/**
 * When root metadata includes a catalog array, validate elements and that
 * each question's paired key (if set) is a string member of the catalog.
 */
function enforceMetadataCatalogs(
  metadata: Record<string, unknown> | undefined,
  questions: Question[],
  path: string,
): void {
  if (!metadata) return;

  for (const { catalogKey, questionKey } of METADATA_CATALOG_PAIRS) {
    if (!(catalogKey in metadata)) continue;
    const catalogRaw = metadata[catalogKey];
    if (!Array.isArray(catalogRaw)) {
      throw new Error(
        `${path}: metadata.${catalogKey} must be an array of non-empty strings if present`,
      );
    }
    const allowed = new Set<string>();
    for (let i = 0; i < catalogRaw.length; i++) {
      const el = catalogRaw[i];
      if (!isNonEmptyString(el)) {
        throw new Error(
          `${path}: metadata.${catalogKey}[${i}] must be a non-empty string`,
        );
      }
      allowed.add(el);
    }

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi]!;
      const meta = q.metadata;
      if (!meta || !(questionKey in meta)) continue;
      const val = meta[questionKey];
      const loc = `${path}: questions[${qi}].metadata.${questionKey}`;
      if (typeof val !== "string") {
        throw new Error(
          `${loc} must be a string when metadata.${catalogKey} catalog is present`,
        );
      }
      if (!allowed.has(val)) {
        throw new Error(
          `${loc} value ${JSON.stringify(val)} is not in metadata.${catalogKey} catalog`,
        );
      }
    }
  }
}

/**
 * Resolve ordered slide metadata entries from config keys + question metadata.
 * Scalars (string/number/boolean) are stringified; missing/null/object/array skipped.
 */
export function resolveSlideMetadata(
  keys: readonly string[] | undefined,
  questionMetadata: Record<string, unknown> | undefined,
): SlideMetadataEntry[] {
  if (!keys || keys.length === 0) return [];
  const meta = questionMetadata;
  if (!meta) return [];
  const out: SlideMetadataEntry[] = [];
  for (const key of keys) {
    if (!(key in meta)) continue;
    const v = meta[key];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push({ key, value: String(v) });
    }
  }
  return out;
}

/** Deep-copy a question (new choices array; shallow-copy metadata bag). */
export function copyQuestion(q: Question): Question {
  const out: Question = {
    text: q.text,
    choices: [...q.choices],
    correct: q.correct,
    explain: q.explain,
  };
  if (q.metadata !== undefined) {
    out.metadata = { ...q.metadata };
  }
  return out;
}

/**
 * Fisher–Yates shuffle of choice order; remaps `correct` to the same choice
 * text by original index (safe with duplicate labels). Does not mutate input.
 * Preserves `metadata` when present.
 */
export function shuffleQuestionChoices(
  question: Question,
  randomInt: RandomInt = cryptoRandomInt,
): Question {
  const n = question.choices.length;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(
        `randomInt(${i + 1}) must return an integer in [0, ${i}], got ${j}`,
      );
    }
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const choices = order.map((i) => question.choices[i]!);
  const correct = order.indexOf(question.correct);
  const out: Question = {
    text: question.text,
    choices,
    correct,
    explain: question.explain,
  };
  if (question.metadata !== undefined) {
    out.metadata = { ...question.metadata };
  }
  return out;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Parse a single `key=value` filter entry.
 * Splits on the first `=`; edge-trims key and value; preserves internal spaces.
 */
export function parseFilterEntry(raw: string): MetadataFilter {
  const eq = raw.indexOf("=");
  if (eq < 0) {
    throw new Error(
      `Invalid filter "${raw}": expected key=value (missing "=")`,
    );
  }
  const key = raw.slice(0, eq).trim();
  const value = raw.slice(eq + 1).trim();
  if (!key) {
    throw new Error(
      `Invalid filter "${raw}": key must be non-empty before "="`,
    );
  }
  return { key, value };
}

/** True if a scalar field matches the filter value string. */
function scalarMatches(field: unknown, filterValue: string): boolean {
  if (typeof field === "string") {
    return field === filterValue;
  }
  if (typeof field === "boolean") {
    return (
      (filterValue === "true" && field === true) ||
      (filterValue === "false" && field === false)
    );
  }
  if (typeof field === "number") {
    if (!Number.isFinite(field)) return false;
    if (filterValue === String(field)) return true;
    const n = Number(filterValue);
    return Number.isFinite(n) && n === field;
  }
  if (field === null) {
    return filterValue === "null";
  }
  return false;
}

/** True if metadata[key] matches one filter value under design rules. */
function fieldMatchesFilterValue(
  field: unknown,
  filterValue: string,
): boolean {
  if (Array.isArray(field)) {
    for (const el of field) {
      if (scalarMatches(el, filterValue)) return true;
    }
    return false;
  }
  if (field !== null && typeof field === "object") {
    return false;
  }
  return scalarMatches(field, filterValue);
}

/**
 * Filter questions by metadata entries.
 * AND across different keys; OR within the same key.
 * Missing metadata/key does not match. Preserves relative order.
 * Empty `filters` returns a shallow copy of the questions array (all kept).
 */
export function filterQuestionsByMetadata(
  questions: Question[],
  filters: MetadataFilter[],
): Question[] {
  if (filters.length === 0) return [...questions];

  const byKey = new Map<string, string[]>();
  for (const f of filters) {
    const list = byKey.get(f.key);
    if (list) list.push(f.value);
    else byKey.set(f.key, [f.value]);
  }

  return questions.filter((q) => {
    const meta = q.metadata;
    if (!meta) return false;
    for (const [key, values] of byKey) {
      if (!(key in meta)) return false;
      const field = meta[key];
      const ok = values.some((v) => fieldMatchesFilterValue(field, v));
      if (!ok) return false;
    }
    return true;
  });
}

/** Human-readable filter list for logs/errors. */
export function formatFiltersSummary(filters: MetadataFilter[]): string {
  return filters.map((f) => `${f.key}=${f.value}`).join("; ");
}

/** Distinct top-level metadata keys present on any question (sorted). */
export function collectQuestionMetadataKeys(questions: Question[]): string[] {
  const keys = new Set<string>();
  for (const q of questions) {
    if (!q.metadata) continue;
    for (const k of Object.keys(q.metadata)) keys.add(k);
  }
  return [...keys].sort();
}

/**
 * Normalize for fuzzy key comparison: lowercase, treat `_` and `-` as the same.
 */
function normalizeMetaKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

/**
 * For filter keys missing from the bank, suggest close available keys
 * (e.g. `use_case` → `use-case`).
 */
export function suggestMetadataKeys(
  filterKeys: string[],
  availableKeys: string[],
): { missing: string; suggestions: string[] }[] {
  const available = availableKeys;
  const out: { missing: string; suggestions: string[] }[] = [];
  for (const fk of filterKeys) {
    if (available.includes(fk)) continue;
    const norm = normalizeMetaKey(fk);
    const suggestions = available.filter(
      (ak) => normalizeMetaKey(ak) === norm || normalizeMetaKey(ak).includes(norm) ||
        norm.includes(normalizeMetaKey(ak)),
    );
    // Prefer exact hyphen/underscore variants first
    suggestions.sort((a, b) => {
      const aExact = normalizeMetaKey(a) === norm ? 0 : 1;
      const bExact = normalizeMetaKey(b) === norm ? 0 : 1;
      return aExact - bExact || a.localeCompare(b);
    });
    out.push({ missing: fk, suggestions: [...new Set(suggestions)] });
  }
  return out;
}

/**
 * Build a multi-line empty-filter diagnostic for stderr.
 */
export function formatEmptyFilterDiagnostic(
  questionCount: number,
  filters: MetadataFilter[],
  questions: Question[],
): string {
  const summary = formatFiltersSummary(filters);
  const lines = [
    `Quiz filter matched 0 of ${questionCount} questions (filters: ${summary})`,
  ];
  const available = collectQuestionMetadataKeys(questions);
  if (available.length > 0) {
    lines.push(`Available metadata keys: ${available.join(", ")}`);
  } else {
    lines.push("No questions in this file define a metadata object.");
  }
  const filterKeys = [...new Set(filters.map((f) => f.key))];
  const hints = suggestMetadataKeys(filterKeys, available);
  for (const h of hints) {
    if (h.suggestions.length > 0) {
      lines.push(
        `Unknown key "${h.missing}" — did you mean: ${h.suggestions.join(", ")}?`,
      );
    } else if (!available.includes(h.missing)) {
      lines.push(
        `Unknown key "${h.missing}" — not present on any question metadata.`,
      );
    }
  }
  lines.push(
    'Tip: keys/values are exact (use-case not use_case). Quote spaced values: --filter "use-case=Customer Support Resolution Agent"',
  );
  return lines.join("\n");
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

  const metadata = parseMetadataField(root.metadata, path);
  const config = parseQuizConfig(root.config, path);

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

    const qMeta = parseMetadataField(qobj.metadata, loc);
    const question: Question = {
      text: qobj.text.trim(),
      choices,
      correct: qobj.correct,
      explain,
    };
    if (qMeta !== undefined) {
      question.metadata = qMeta;
    }
    questions.push(question);
  }

  enforceMetadataCatalogs(metadata, questions, path);

  const quiz: Quiz = { title: root.title.trim(), questions };
  if (metadata !== undefined) {
    quiz.metadata = metadata;
  }
  if (config !== undefined) {
    quiz.config = config;
  }
  return quiz;
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
