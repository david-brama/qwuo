## Purpose

Load and validate quiz content from a JSON file at process startup.

## Requirements

### Requirement: Quiz content loads from JSON file
The system SHALL load quiz content from a JSON file path provided at startup (default `quiz.json` in the working directory).

#### Scenario: Valid quiz file
- **WHEN** the process starts with a valid quiz JSON file
- **THEN** the system loads the title and all questions into memory and continues startup

#### Scenario: Missing or invalid quiz file
- **WHEN** the quiz file is missing, unreadable, or fails schema validation
- **THEN** the process exits with a non-zero status and a clear error message describing the problem

### Requirement: Quiz JSON schema
Each quiz file MUST include a non-empty `title` string and a non-empty `questions` array. Each question MUST include non-empty `text`, a `choices` array of at least two non-empty strings, a `correct` integer index into `choices`, and MAY include an `explain` string.

#### Scenario: Correct index in range
- **WHEN** a question's `correct` value is between 0 and `choices.length - 1` inclusive
- **THEN** validation accepts that question

#### Scenario: Correct index out of range
- **WHEN** a question's `correct` value is outside the choices range
- **THEN** validation fails and the process does not start the session

### Requirement: Optional quiz metadata object
The quiz root MAY include a `metadata` field. When present and not null, `metadata` MUST be a JSON object (not an array or primitive). The object MAY contain arbitrary property names and nested JSON values, including optional well-known catalog arrays `domains` and `use_cases` (arrays of non-empty strings) and optional authoring strings such as `credential` and `note`. The system SHALL retain `metadata` on the loaded in-memory quiz representation. When `metadata` is omitted or null, the loaded quiz MUST behave as today with no metadata property required. The system MUST reject quiz files where `metadata` is present as a non-object value (array, string, number, or boolean) and MUST NOT start the session. When catalog arrays are present, membership rules in “Root metadata catalogs constrain paired question fields” apply. The JSON Schema for the quiz file MUST document the well-known catalog and authoring properties on root `metadata` while still allowing additional properties.

#### Scenario: Metadata object loaded
- **WHEN** the quiz JSON includes `"metadata": { "source": "cms", "tags": ["intro"], "version": 3 }`
- **THEN** validation succeeds and the loaded quiz exposes an equivalent `metadata` object with those properties

#### Scenario: Catalog-shaped metadata loaded
- **WHEN** the quiz JSON includes `"metadata": { "credential": "X", "domains": ["A"], "use_cases": ["U"], "note": "n" }`
- **THEN** validation succeeds and the loaded quiz retains those properties

#### Scenario: Metadata omitted
- **WHEN** the quiz JSON has no `metadata` field
- **THEN** validation succeeds and the loaded quiz has no required metadata

#### Scenario: Metadata null treated as absent
- **WHEN** the quiz JSON includes `"metadata": null`
- **THEN** validation succeeds and the loaded quiz has no metadata (same as omitted)

#### Scenario: Empty metadata object
- **WHEN** the quiz JSON includes `"metadata": {}`
- **THEN** validation succeeds and the loaded quiz retains an empty metadata object

#### Scenario: Metadata array rejected
- **WHEN** the quiz JSON includes `"metadata": []` or another non-object JSON value for `metadata`
- **THEN** validation fails and the process does not start the session

### Requirement: Root metadata catalogs constrain paired question fields
When quiz-root `metadata` includes a catalog array property, the system MUST enforce membership for the paired per-question metadata key on every question that sets that key:

| Root catalog property | Question metadata key |
|-----------------------|------------------------|
| `domains`             | `domain`               |
| `use_cases`           | `use-case`             |

A catalog property is “present” when it appears on root `metadata` as a JSON array (including empty). Each catalog element MUST be a non-empty string (whitespace-only rejected). When a question sets the paired key, its value MUST be a string that exactly equals one catalog element (internal spaces significant; no case-folding). When the paired key is omitted on a question, that question MUST still validate. When the catalog property is omitted from root `metadata`, the system MUST NOT apply membership checks for that pair. Non-array values for a catalog property MUST fail validation. The system MUST reject the quiz and MUST NOT start the session when any catalog or membership rule fails. Other root `metadata` properties (`credential`, `note`, and additional authoring fields) remain allowed and are not catalog-checked unless listed in the pairing table.

#### Scenario: Domain value in catalog accepted
- **WHEN** root `metadata.domains` is `["A", "B"]` and a question has `"metadata": { "domain": "A" }`
- **THEN** validation succeeds

#### Scenario: Domain value missing from catalog rejected
- **WHEN** root `metadata.domains` is `["A", "B"]` and a question has `"metadata": { "domain": "C" }`
- **THEN** validation fails and the process does not start the session

#### Scenario: Use-case catalog pairing
- **WHEN** root `metadata.use_cases` lists allowed labels and a question’s `metadata.use-case` is one of those labels
- **THEN** validation succeeds; a question `use-case` not in the list fails validation

#### Scenario: Catalog omitted leaves free-form values
- **WHEN** root `metadata` omits `domains` and a question has `"domain": "Any Free Form"`
- **THEN** validation succeeds (no membership check)

#### Scenario: Question omits paired key while catalog present
- **WHEN** root `metadata.domains` is present and a question has metadata without `domain`
- **THEN** validation succeeds for that pair

#### Scenario: Non-string paired value rejected when catalog present
- **WHEN** root `metadata.domains` is present and a question has `"domain": true` (or another non-string)
- **THEN** validation fails and the process does not start the session

#### Scenario: Catalog array element must be non-empty string
- **WHEN** root `metadata.domains` is `[""]` or `[123]` or contains a non-string element
- **THEN** validation fails and the process does not start the session

### Requirement: Optional quiz config object for slide metadata keys
The quiz root MAY include a `config` field. When present and not null, `config` MUST be a JSON object (not an array or primitive). The system SHALL retain a loaded config representation that includes optional `slideMetadataKeys`: an array of non-empty strings naming question-level metadata keys to show on the projector slide, in display order, and optional `countdownSeconds` as specified in “Optional quiz default countdown seconds”. Duplicate keys in `slideMetadataKeys` MUST be rejected. When `config` is omitted or null, the loaded quiz MUST have no required config (equivalent to no slide metadata keys and no countdown default). When `config` is present as a non-object value, validation MUST fail and the process MUST NOT start the session. Empty `config` object and empty `slideMetadataKeys` array are valid. Quiz identity fingerprinting MUST NOT include `config` (same policy as metadata).

#### Scenario: Config with slide metadata keys loaded
- **WHEN** the quiz JSON includes `"config": { "slideMetadataKeys": ["domain", "use-case"] }`
- **THEN** validation succeeds and the loaded quiz exposes those keys in order

#### Scenario: Config omitted
- **WHEN** the quiz JSON has no `config` field
- **THEN** validation succeeds and the loaded quiz has no required config / no slide metadata keys

#### Scenario: Config null treated as absent
- **WHEN** the quiz JSON includes `"config": null`
- **THEN** validation succeeds and the loaded quiz has no config (same as omitted)

#### Scenario: Empty slideMetadataKeys
- **WHEN** the quiz JSON includes `"config": { "slideMetadataKeys": [] }`
- **THEN** validation succeeds and no keys are configured for slides

#### Scenario: Duplicate slideMetadataKeys rejected
- **WHEN** `slideMetadataKeys` contains the same key twice
- **THEN** validation fails and the process does not start the session

#### Scenario: Non-object config rejected
- **WHEN** the quiz JSON includes `"config": []` or another non-object JSON value for `config`
- **THEN** validation fails and the process does not start the session

#### Scenario: Fingerprint ignores config-only edits
- **WHEN** two quizzes differ only in root `config` content
- **THEN** their quiz identity fingerprints are equal

#### Scenario: Config may combine slide keys and countdown default
- **WHEN** the quiz JSON includes `"config": { "slideMetadataKeys": ["domain"], "countdownSeconds": 30 }`
- **THEN** validation succeeds and the loaded config retains both fields

### Requirement: Optional quiz default countdown seconds
The quiz root `config` object MAY include `countdownSeconds`. When present and not null, `countdownSeconds` MUST be a JSON integer greater than or equal to `0`. The system SHALL retain the value on the loaded quiz config. When `countdownSeconds` is omitted or null on `config`, the loaded config MUST treat the quiz default as unset (no default countdown). The system MUST reject quiz files where `config.countdownSeconds` is present as a non-integer number (including floats), a negative integer, or a non-number type, and MUST NOT start the session. Value `0` means the quiz default disables countdown unless a question overrides with a positive value. The JSON Schema for the quiz file MUST document `config.countdownSeconds`. Quiz identity fingerprinting MUST NOT include `config.countdownSeconds` (same policy as other `config` fields).

#### Scenario: Config countdown default loaded
- **WHEN** the quiz JSON includes `"config": { "countdownSeconds": 30 }`
- **THEN** validation succeeds and the loaded quiz config exposes `countdownSeconds` of `30`

#### Scenario: Config countdown omitted
- **WHEN** the quiz JSON has `config` without `countdownSeconds`, or has no `config`
- **THEN** validation succeeds and no quiz-level countdown default is set

#### Scenario: Config countdown zero disables default
- **WHEN** the quiz JSON includes `"config": { "countdownSeconds": 0 }`
- **THEN** validation succeeds and the loaded default is `0` (no active countdown unless a question overrides with a positive value)

#### Scenario: Config countdown null treated as unset
- **WHEN** the quiz JSON includes `"config": { "countdownSeconds": null }`
- **THEN** validation succeeds and the quiz-level countdown default is unset

#### Scenario: Config countdown non-integer rejected
- **WHEN** `config.countdownSeconds` is `30.5`, a string, a boolean, or a negative integer
- **THEN** validation fails and the process does not start the session

#### Scenario: Fingerprint ignores countdown config
- **WHEN** two quizzes differ only in `config.countdownSeconds`
- **THEN** their quiz identity fingerprints are equal

### Requirement: Optional per-question countdown override
Each question MAY include a top-level `countdownSeconds` field (not under `metadata`). When present and not null, `countdownSeconds` MUST be a JSON integer greater than or equal to `0`. The system SHALL retain the value on the loaded question. When omitted or null, that question has no override. The system MUST reject non-integer, negative, or non-number values and MUST NOT start the session. Value `0` on a question means no countdown for that question even if the quiz default is positive. The JSON Schema MUST document per-question `countdownSeconds`. Quiz identity fingerprinting MUST NOT include per-question `countdownSeconds`.

#### Scenario: Question override loaded
- **WHEN** a question includes `"countdownSeconds": 45`
- **THEN** validation succeeds and the loaded question exposes `countdownSeconds` of `45`

#### Scenario: Question countdown omitted
- **WHEN** a question has no `countdownSeconds` field
- **THEN** validation succeeds and that question has no override

#### Scenario: Question countdown zero overrides default
- **WHEN** a question includes `"countdownSeconds": 0`
- **THEN** validation succeeds and the loaded override is `0`

#### Scenario: Question countdown null treated as unset
- **WHEN** a question includes `"countdownSeconds": null`
- **THEN** validation succeeds and that question has no override (same as omitted)

#### Scenario: Question countdown invalid rejected
- **WHEN** a question’s `countdownSeconds` is a float, string, boolean, or negative integer
- **THEN** validation fails and the process does not start the session

#### Scenario: Fingerprint ignores question countdown-only edits
- **WHEN** two quizzes differ only in per-question `countdownSeconds` values
- **THEN** their quiz identity fingerprints are equal

### Requirement: Effective countdown resolution
The system SHALL resolve the effective countdown seconds for a question as: the question’s `countdownSeconds` when that override is set; otherwise the quiz `config.countdownSeconds` when that default is set; otherwise unset (no countdown). An active countdown exists only when the effective value is an integer **greater than** `0`. Effective `0` or unset means host-paced QUESTION with no timer.

#### Scenario: Override wins over default
- **WHEN** quiz `config.countdownSeconds` is `30` and the current question has `countdownSeconds` `45`
- **THEN** the effective countdown for that question is `45`

#### Scenario: Default applies when question omits field
- **WHEN** quiz `config.countdownSeconds` is `30` and the current question omits `countdownSeconds`
- **THEN** the effective countdown for that question is `30`

#### Scenario: Question zero disables despite default
- **WHEN** quiz `config.countdownSeconds` is `30` and the current question has `countdownSeconds` `0`
- **THEN** there is no active countdown for that question

#### Scenario: Neither set means no countdown
- **WHEN** both quiz default and question override are unset
- **THEN** there is no active countdown for that question

### Requirement: Content is fixed for the session
The system SHALL use the quiz content loaded at startup for the entire process lifetime (no hot-reload required).

#### Scenario: File edited after start
- **WHEN** the quiz JSON file is modified on disk after the process has started
- **THEN** the running session continues using the originally loaded content

### Requirement: Authoring choice order is canonical on disk
The quiz file's per-question `choices` array and `correct` index SHALL remain the canonical authoring order on disk and after `loadQuiz` / validation. The system MUST NOT rewrite the quiz file when presenting a live session. Runtime reordering of choices for play is a session concern and MUST NOT change the loaded quiz identity used for content fingerprinting.

#### Scenario: Load preserves file order
- **WHEN** a quiz file defines choices in a specific order with a matching `correct` index
- **THEN** the loaded in-memory quiz retains that order and index prior to any session play preparation

#### Scenario: Fingerprint ignores live shuffle
- **WHEN** a live session shuffles choice order for play
- **THEN** the quiz identity fingerprint for the loaded file remains based on the canonical loaded content, not the session's display order

### Requirement: Quiz Markdown rendered as sanitized HTML
Question `text` and `explain` fields MAY contain Markdown (GFM). When the projector or player UI renders those fields as HTML, the system MUST parse Markdown and then sanitize the HTML so that script and other dangerous markup from quiz content cannot execute in the browser. Choice labels MUST continue to be escaped as plain text (not Markdown).

#### Scenario: Markdown formatting preserved safely
- **WHEN** a question `text` contains GFM emphasis or lists without script tags
- **THEN** the UI shows the intended formatting after sanitize

#### Scenario: Script payload neutralized
- **WHEN** quiz content includes HTML/script that would execute if injected raw into the page
- **THEN** after render the dangerous markup does not execute (sanitizer removes or neutralizes it)

### Requirement: Optional per-question metadata object
Each question MAY include a `metadata` field. When present and not null, `metadata` MUST be a JSON object (not an array or primitive). The object MAY contain arbitrary property names and nested JSON values. The system SHALL retain `metadata` on the loaded in-memory question representation. When `metadata` is omitted or null, the loaded question MUST have no metadata property required. The system MUST reject quiz files where a question’s `metadata` is present as a non-object value (array, string, number, or boolean) and MUST NOT start the session. Question `metadata` MUST NOT be required for scoring fields and MUST NOT be included in the quiz identity fingerprint payload (same policy as quiz-root metadata).

#### Scenario: Question metadata object loaded
- **WHEN** a question includes `"metadata": { "id": "Q1", "live": true, "domain": "Tool Design & MCP Integration" }`
- **THEN** validation succeeds and the loaded question exposes an equivalent `metadata` object with those properties

#### Scenario: Question metadata omitted
- **WHEN** a question has no `metadata` field
- **THEN** validation succeeds and that question has no required metadata

#### Scenario: Question metadata null treated as absent
- **WHEN** a question includes `"metadata": null`
- **THEN** validation succeeds and that question has no metadata (same as omitted)

#### Scenario: Empty question metadata object
- **WHEN** a question includes `"metadata": {}`
- **THEN** validation succeeds and the loaded question retains an empty metadata object

#### Scenario: Question metadata array rejected
- **WHEN** a question includes `"metadata": []` or another non-object JSON value for `metadata`
- **THEN** validation fails and the process does not start the session

#### Scenario: Fingerprint ignores question metadata-only edits
- **WHEN** two quizzes differ only in per-question `metadata` content
- **THEN** their quiz identity fingerprints are equal

### Requirement: Playable questions may be a filtered subset after load
After successful validation of the quiz file, the system MAY reduce the in-memory quiz’s `questions` array to a subset selected by startup metadata filters (see `question-filter`). The quiz file on disk MUST NOT be rewritten. For the process lifetime, the filtered list is the quiz content used for the session (same “content is fixed for the session” rule as an unfiltered load). Choice authoring order on each retained question remains canonical prior to any session shuffle.

#### Scenario: Filter does not rewrite the quiz file
- **WHEN** the process starts with metadata filters that drop some questions
- **THEN** the quiz JSON file on disk is unchanged and only the in-memory playable list is reduced

#### Scenario: Retained questions keep authoring choice order at load
- **WHEN** a filtered question is kept for play
- **THEN** its loaded `choices` and `correct` match the file until session play preparation shuffles them
