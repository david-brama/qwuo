import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMetadataFilterFacets,
  collectQuestionMetadataKeys,
  filterQuestionsByMetadata,
  formatEmptyFilterDiagnostic,
  loadQuiz,
  parseFilterEntry,
  resolveSlideMetadata,
  shuffleQuestionChoices,
  suggestMetadataKeys,
  validateQuiz,
  type Question,
} from "./quiz.ts";

const minimalQuestion = {
  text: "Q?",
  choices: ["A", "B"],
  correct: 0,
};

function minimalRoot(extra: Record<string, unknown> = {}) {
  return {
    title: "Meta Test",
    questions: [minimalQuestion],
    ...extra,
  };
}

function q(
  text: string,
  metadata?: Record<string, unknown>,
): Question {
  const out: Question = {
    text,
    choices: ["A", "B"],
    correct: 0,
    explain: "",
  };
  if (metadata !== undefined) out.metadata = metadata;
  return out;
}

Deno.test("validateQuiz: metadata object is loaded (shallow copy)", () => {
  const meta = { source: "cms", tags: ["intro"], version: 3 };
  const quiz = validateQuiz(minimalRoot({ metadata: meta }), "t.json");
  assertExists(quiz.metadata);
  assertEquals(quiz.metadata, meta);
  // Shallow copy: top-level reassignment on input must not affect result
  (meta as { source: string }).source = "mutated";
  assertEquals(quiz.metadata!.source, "cms");
});

Deno.test("validateQuiz: metadata omitted", () => {
  const quiz = validateQuiz(minimalRoot(), "t.json");
  assertEquals(quiz.metadata, undefined);
  assertEquals("metadata" in quiz, false);
});

Deno.test("validateQuiz: metadata null treated as absent", () => {
  const quiz = validateQuiz(minimalRoot({ metadata: null }), "t.json");
  assertEquals(quiz.metadata, undefined);
  assertEquals("metadata" in quiz, false);
});

Deno.test("validateQuiz: empty metadata object retained", () => {
  const quiz = validateQuiz(minimalRoot({ metadata: {} }), "t.json");
  assertEquals(quiz.metadata, {});
});

Deno.test("validateQuiz: metadata array rejected", () => {
  assertThrows(
    () => validateQuiz(minimalRoot({ metadata: [] }), "t.json"),
    Error,
    '"metadata" must be a JSON object if present',
  );
});

Deno.test("validateQuiz: metadata primitive rejected", () => {
  for (const bad of ["x", 1, true]) {
    assertThrows(
      () => validateQuiz(minimalRoot({ metadata: bad }), "t.json"),
      Error,
      '"metadata" must be a JSON object if present',
    );
  }
});

Deno.test("validateQuiz: question metadata object loaded (shallow copy)", () => {
  const qMeta = {
    id: "Q1",
    live: true,
    domain: "Tool Design & MCP Integration",
  };
  const quiz = validateQuiz(
    {
      title: "T",
      questions: [{ ...minimalQuestion, metadata: qMeta }],
    },
    "t.json",
  );
  assertEquals(quiz.questions[0]!.metadata, qMeta);
  (qMeta as { id: string }).id = "mutated";
  assertEquals(quiz.questions[0]!.metadata!.id, "Q1");
});

Deno.test("validateQuiz: question metadata omitted / null / empty", () => {
  const omit = validateQuiz(minimalRoot(), "t.json");
  assertEquals(omit.questions[0]!.metadata, undefined);
  assertEquals("metadata" in omit.questions[0]!, false);

  const nulled = validateQuiz(
    {
      title: "T",
      questions: [{ ...minimalQuestion, metadata: null }],
    },
    "t.json",
  );
  assertEquals(nulled.questions[0]!.metadata, undefined);

  const empty = validateQuiz(
    {
      title: "T",
      questions: [{ ...minimalQuestion, metadata: {} }],
    },
    "t.json",
  );
  assertEquals(empty.questions[0]!.metadata, {});
});

Deno.test("validateQuiz: question metadata non-object rejected", () => {
  for (const bad of [[], "x", 1, true]) {
    assertThrows(
      () =>
        validateQuiz(
          {
            title: "T",
            questions: [{ ...minimalQuestion, metadata: bad }],
          },
          "t.json",
        ),
      Error,
      '"metadata" must be a JSON object if present',
    );
  }
});

Deno.test("validateQuiz: config with slideMetadataKeys loaded", () => {
  const quiz = validateQuiz(
    minimalRoot({
      config: { slideMetadataKeys: ["domain", "use-case"] },
    }),
    "t.json",
  );
  assertEquals(quiz.config, {
    slideMetadataKeys: ["domain", "use-case"],
  });
});

Deno.test("validateQuiz: config omitted / null / empty", () => {
  const omit = validateQuiz(minimalRoot(), "t.json");
  assertEquals(omit.config, undefined);
  assertEquals("config" in omit, false);

  const nulled = validateQuiz(minimalRoot({ config: null }), "t.json");
  assertEquals(nulled.config, undefined);

  const empty = validateQuiz(minimalRoot({ config: {} }), "t.json");
  assertEquals(empty.config, { slideMetadataKeys: [] });

  const emptyKeys = validateQuiz(
    minimalRoot({ config: { slideMetadataKeys: [] } }),
    "t.json",
  );
  assertEquals(emptyKeys.config, { slideMetadataKeys: [] });
});

Deno.test("validateQuiz: config non-object rejected", () => {
  for (const bad of [[], "x", 1, true]) {
    assertThrows(
      () => validateQuiz(minimalRoot({ config: bad }), "t.json"),
      Error,
      '"config" must be a JSON object if present',
    );
  }
});

Deno.test("validateQuiz: slideMetadataKeys duplicates and bad entries rejected", () => {
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({
          config: { slideMetadataKeys: ["domain", "domain"] },
        }),
        "t.json",
      ),
    Error,
    "must not contain duplicates",
  );
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({
          config: { slideMetadataKeys: [""] },
        }),
        "t.json",
      ),
    Error,
    "must be a non-empty string",
  );
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({
          config: { slideMetadataKeys: "domain" },
        }),
        "t.json",
      ),
    Error,
    "must be an array",
  );
});

Deno.test("validateQuiz: config drops unknown keys (known fields only)", () => {
  const quiz = validateQuiz(
    minimalRoot({
      config: { slideMetadataKeys: ["id"], extra: true },
    }),
    "t.json",
  );
  assertEquals(quiz.config, { slideMetadataKeys: ["id"] });
  assertEquals("extra" in (quiz.config as object), false);
});

Deno.test("validateQuiz: domain catalog accepts matching values", () => {
  const quiz = validateQuiz(
    {
      title: "T",
      metadata: { domains: ["A", "B"] },
      questions: [
        { ...minimalQuestion, metadata: { domain: "A" } },
        { ...minimalQuestion, text: "Q2?", metadata: { live: true } },
      ],
    },
    "t.json",
  );
  assertEquals(quiz.questions[0]!.metadata!.domain, "A");
});

Deno.test("validateQuiz: domain catalog rejects unknown value", () => {
  assertThrows(
    () =>
      validateQuiz(
        {
          title: "T",
          metadata: { domains: ["A", "B"] },
          questions: [
            { ...minimalQuestion, metadata: { domain: "C" } },
          ],
        },
        "t.json",
      ),
    Error,
    "not in metadata.domains catalog",
  );
});

Deno.test("validateQuiz: use_cases catalog pairs with use-case", () => {
  const ok = validateQuiz(
    {
      title: "T",
      metadata: { use_cases: ["Customer Support Resolution Agent"] },
      questions: [
        {
          ...minimalQuestion,
          metadata: { "use-case": "Customer Support Resolution Agent" },
        },
      ],
    },
    "t.json",
  );
  assertEquals(
    ok.questions[0]!.metadata!["use-case"],
    "Customer Support Resolution Agent",
  );

  assertThrows(
    () =>
      validateQuiz(
        {
          title: "T",
          metadata: { use_cases: ["Only This"] },
          questions: [
            { ...minimalQuestion, metadata: { "use-case": "Other" } },
          ],
        },
        "t.json",
      ),
    Error,
    "not in metadata.use_cases catalog",
  );
});

Deno.test("validateQuiz: catalog omitted allows free-form domain", () => {
  const quiz = validateQuiz(
    {
      title: "T",
      metadata: { note: "no catalogs" },
      questions: [
        { ...minimalQuestion, metadata: { domain: "Any Free Form" } },
      ],
    },
    "t.json",
  );
  assertEquals(quiz.questions[0]!.metadata!.domain, "Any Free Form");
});

Deno.test("validateQuiz: non-string paired value rejected when catalog present", () => {
  assertThrows(
    () =>
      validateQuiz(
        {
          title: "T",
          metadata: { domains: ["A"] },
          questions: [
            { ...minimalQuestion, metadata: { domain: true } },
          ],
        },
        "t.json",
      ),
    Error,
    "must be a string when metadata.domains catalog is present",
  );
});

Deno.test("validateQuiz: catalog array element must be non-empty string", () => {
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({ metadata: { domains: [""] } }),
        "t.json",
      ),
    Error,
    "must be a non-empty string",
  );
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({ metadata: { domains: [123] } }),
        "t.json",
      ),
    Error,
    "must be a non-empty string",
  );
  assertThrows(
    () =>
      validateQuiz(
        minimalRoot({ metadata: { domains: "A" } }),
        "t.json",
      ),
    Error,
    "must be an array of non-empty strings",
  );
});

Deno.test("resolveSlideMetadata: order, scalars, skips", () => {
  assertEquals(resolveSlideMetadata(undefined, { domain: "A" }), []);
  assertEquals(resolveSlideMetadata([], { domain: "A" }), []);
  assertEquals(
    resolveSlideMetadata(["use-case", "domain"], {
      domain: "D",
      "use-case": "U",
      live: true,
    }),
    [
      { key: "use-case", value: "U" },
      { key: "domain", value: "D" },
    ],
  );
  assertEquals(
    resolveSlideMetadata(["domain", "missing", "live", "tags", "n", "obj"], {
      domain: "D",
      live: true,
      n: 3,
      tags: ["a"],
      obj: { x: 1 },
      nul: null,
    }),
    [
      { key: "domain", value: "D" },
      { key: "live", value: "true" },
      { key: "n", value: "3" },
    ],
  );
  assertEquals(resolveSlideMetadata(["domain"], undefined), []);
});

Deno.test("loadQuiz: accepts file with metadata and rejects array metadata", async () => {
  const dir = Deno.makeTempDirSync();
  const okPath = `${dir}/ok.json`;
  const badPath = `${dir}/bad.json`;

  await Deno.writeTextFile(
    okPath,
    JSON.stringify(
      minimalRoot({
        metadata: { source: "file", nested: { a: 1 } },
      }),
    ),
  );
  await Deno.writeTextFile(
    badPath,
    JSON.stringify(minimalRoot({ metadata: [] })),
  );

  const quiz = await loadQuiz(okPath);
  assertEquals(quiz.metadata, { source: "file", nested: { a: 1 } });

  await assertRejects(
    () => loadQuiz(badPath),
    Error,
    '"metadata" must be a JSON object if present',
  );
});

Deno.test("shuffleQuestionChoices: preserves multiset and correct text", () => {
  const q0: Question = {
    text: "Q?",
    choices: ["A", "B", "C", "D"],
    correct: 0,
    explain: "A wins",
  };
  // Always pick j=0 when swapping → reverse-ish deterministic walk
  const seq = [0, 0, 0]; // for i=3,2,1
  let k = 0;
  const shuffled = shuffleQuestionChoices(q0, (max) => {
    const v = seq[k++] ?? 0;
    return v % max;
  });
  assertEquals([...shuffled.choices].sort(), [...q0.choices].sort());
  assertEquals(shuffled.choices[shuffled.correct], q0.choices[q0.correct]);
  assertEquals(shuffled.text, q0.text);
  assertEquals(shuffled.explain, q0.explain);
  // Input not mutated
  assertEquals(q0.choices, ["A", "B", "C", "D"]);
  assertEquals(q0.correct, 0);
});

Deno.test("shuffleQuestionChoices: preserves metadata", () => {
  const q0: Question = {
    text: "Q?",
    choices: ["A", "B", "C"],
    correct: 0,
    explain: "",
    metadata: { live: true, domain: "X Y" },
  };
  const shuffled = shuffleQuestionChoices(q0, () => 0);
  assertEquals(shuffled.metadata, { live: true, domain: "X Y" });
  assertEquals(q0.metadata, { live: true, domain: "X Y" });
});

Deno.test("shuffleQuestionChoices: injected RNG yields known permutation", () => {
  const q0: Question = {
    text: "Q?",
    choices: ["A", "B", "C"],
    correct: 1, // "B"
    explain: "",
  };
  // Fisher–Yates i=2: j=1 → swap 2,1 → [A,C,B]
  // i=1: j=0 → swap 1,0 → [C,A,B]
  const picks = [1, 0];
  let i = 0;
  const shuffled = shuffleQuestionChoices(q0, () => picks[i++]!);
  assertEquals(shuffled.choices, ["C", "A", "B"]);
  assertEquals(shuffled.correct, 2); // "B" at index 2
  assertEquals(shuffled.choices[shuffled.correct], "B");
});

Deno.test("shuffleQuestionChoices: default RNG can change order", () => {
  const q0: Question = {
    text: "Q?",
    choices: ["W", "X", "Y", "Z"],
    correct: 2,
    explain: "",
  };
  let sawDifferent = false;
  for (let n = 0; n < 40; n++) {
    const s = shuffleQuestionChoices(q0);
    assertEquals(s.choices[s.correct], "Y");
    if (JSON.stringify(s.choices) !== JSON.stringify(q0.choices)) {
      sawDifferent = true;
      break;
    }
  }
  assertEquals(sawDifferent, true);
  assertNotEquals(q0.choices, undefined);
});

// --- parseFilterEntry ---

Deno.test("parseFilterEntry: key=value with internal spaces", () => {
  assertEquals(
    parseFilterEntry("domain=Tool Design & MCP Integration"),
    { key: "domain", value: "Tool Design & MCP Integration" },
  );
});

Deno.test("parseFilterEntry: edge-trim key and value only", () => {
  assertEquals(parseFilterEntry("  live = true  "), {
    key: "live",
    value: "true",
  });
  assertEquals(
    parseFilterEntry(" domain = Tool Design & MCP Integration "),
    { key: "domain", value: "Tool Design & MCP Integration" },
  );
});

Deno.test("parseFilterEntry: value may contain =", () => {
  assertEquals(parseFilterEntry("eq=a=b"), { key: "eq", value: "a=b" });
});

Deno.test("parseFilterEntry: rejects missing = or empty key", () => {
  assertThrows(() => parseFilterEntry("novalue"), Error, "missing");
  assertThrows(() => parseFilterEntry("=true"), Error, "non-empty");
});

// --- filterQuestionsByMetadata ---

const bank: Question[] = [
  q("1", { live: true, domain: "Tool Design & MCP Integration", n: 1 }),
  q("2", { live: false, domain: "Tool Design & MCP Integration", n: 2 }),
  q("3", { live: true, domain: "Prompt Engineering & Structured Output", n: 3 }),
  q("4", { live: true, domain: "Other", tags: ["intro", "exam"], note: null }),
  q("5"), // no metadata
  q("6", { nested: { a: 1 } }),
];

Deno.test("filterQuestionsByMetadata: empty filters keeps all (copy)", () => {
  const out = filterQuestionsByMetadata(bank, []);
  assertEquals(out.length, bank.length);
  assertEquals(out.map((x) => x.text), bank.map((x) => x.text));
});

Deno.test("filterQuestionsByMetadata: boolean live=true", () => {
  const out = filterQuestionsByMetadata(bank, [
    { key: "live", value: "true" },
  ]);
  assertEquals(out.map((x) => x.text), ["1", "3", "4"]);
});

Deno.test("filterQuestionsByMetadata: spaced domain exact match", () => {
  const out = filterQuestionsByMetadata(bank, [
    {
      key: "domain",
      value: "Tool Design & MCP Integration",
    },
  ]);
  assertEquals(out.map((x) => x.text), ["1", "2"]);
});

Deno.test("filterQuestionsByMetadata: spacing is significant", () => {
  const out = filterQuestionsByMetadata(bank, [
    { key: "domain", value: "Tool Design& MCP Integration" },
  ]);
  assertEquals(out.length, 0);
});

Deno.test("filterQuestionsByMetadata: number and null", () => {
  assertEquals(
    filterQuestionsByMetadata(bank, [{ key: "n", value: "2" }]).map((x) =>
      x.text
    ),
    ["2"],
  );
  assertEquals(
    filterQuestionsByMetadata(bank, [{ key: "note", value: "null" }]).map((
      x,
    ) => x.text),
    ["4"],
  );
});

Deno.test("filterQuestionsByMetadata: array membership", () => {
  assertEquals(
    filterQuestionsByMetadata(bank, [{ key: "tags", value: "intro" }]).map((
      x,
    ) => x.text),
    ["4"],
  );
});

Deno.test("filterQuestionsByMetadata: object field never matches", () => {
  assertEquals(
    filterQuestionsByMetadata(bank, [{ key: "nested", value: "x" }]).length,
    0,
  );
});

Deno.test("filterQuestionsByMetadata: missing key / metadata", () => {
  assertEquals(
    filterQuestionsByMetadata(bank, [{ key: "missing", value: "1" }]).length,
    0,
  );
  // q5 has no metadata
  assertEquals(
    filterQuestionsByMetadata([bank[4]!], [{ key: "live", value: "true" }])
      .length,
    0,
  );
});

Deno.test("filterQuestionsByMetadata: OR within key, AND across keys", () => {
  const out = filterQuestionsByMetadata(bank, [
    { key: "live", value: "true" },
    { key: "domain", value: "Tool Design & MCP Integration" },
    { key: "domain", value: "Prompt Engineering & Structured Output" },
  ]);
  assertEquals(out.map((x) => x.text), ["1", "3"]);
});

Deno.test("filterQuestionsByMetadata: preserves relative order", () => {
  const out = filterQuestionsByMetadata(bank, [
    { key: "live", value: "true" },
  ]);
  assertEquals(out.map((x) => x.text), ["1", "3", "4"]);
});

Deno.test("suggestMetadataKeys: use_case → use-case", () => {
  const hints = suggestMetadataKeys(
    ["use_case", "live"],
    ["domain", "live", "use-case"],
  );
  assertEquals(hints.length, 1);
  assertEquals(hints[0]!.missing, "use_case");
  assertEquals(hints[0]!.suggestions[0], "use-case");
});

Deno.test("formatEmptyFilterDiagnostic mentions available keys and suggestion", () => {
  const msg = formatEmptyFilterDiagnostic(
    60,
    [
      { key: "live", value: "true" },
      { key: "use_case", value: "Customer Support Resolution Agent" },
    ],
    [
      q("1", {
        live: true,
        "use-case": "Customer Support Resolution Agent",
      }),
    ],
  );
  assertEquals(msg.includes("matched 0 of 60"), true);
  assertEquals(msg.includes("use-case"), true);
  assertEquals(msg.includes('did you mean: use-case'), true);
  assertEquals(collectQuestionMetadataKeys([
    q("1", { live: true, "use-case": "A" }),
  ]), ["live", "use-case"]);
});

Deno.test("buildMetadataFilterFacets: strings, bools, numbers, arrays; omit objects", () => {
  const questions: Question[] = [
    q("1", {
      live: true,
      domain: "A",
      n: 2,
      tags: ["intro", "exam"],
      nested: { x: 1 },
    }),
    q("2", {
      live: false,
      domain: "B",
      n: 2,
      tags: ["intro"],
    }),
    q("3", {
      domain: "A",
      onlyObj: { y: 2 },
    }),
  ];
  const facets = buildMetadataFilterFacets(questions);
  const keys = facets.map((f) => f.key);
  // well-known first: live, domain — then alpha: n, tags
  assertEquals(keys.includes("live"), true);
  assertEquals(keys.includes("domain"), true);
  assertEquals(keys.includes("nested"), false);
  assertEquals(keys.includes("onlyObj"), false);
  assertEquals(keys.indexOf("live") < keys.indexOf("domain"), true);

  const live = facets.find((f) => f.key === "live")!;
  assertEquals(live.values, [
    { value: "false", count: 1 },
    { value: "true", count: 1 },
  ]);

  const domain = facets.find((f) => f.key === "domain")!;
  assertEquals(domain.values, [
    { value: "A", count: 2 },
    { value: "B", count: 1 },
  ]);

  const tags = facets.find((f) => f.key === "tags")!;
  assertEquals(tags.values, [
    { value: "exam", count: 1 },
    { value: "intro", count: 2 },
  ]);

  const n = facets.find((f) => f.key === "n")!;
  assertEquals(n.values, [{ value: "2", count: 2 }]);
});
