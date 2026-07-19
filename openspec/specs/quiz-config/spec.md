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
The quiz root MAY include a `metadata` field. When present and not null, `metadata` MUST be a JSON object (not an array or primitive). The object MAY contain arbitrary property names and nested JSON values. The system SHALL retain `metadata` on the loaded in-memory quiz representation. When `metadata` is omitted or null, the loaded quiz MUST behave as today with no metadata property required. The system MUST reject quiz files where `metadata` is present as a non-object value (array, string, number, or boolean) and MUST NOT start the session.

#### Scenario: Metadata object loaded
- **WHEN** the quiz JSON includes `"metadata": { "source": "cms", "tags": ["intro"], "version": 3 }`
- **THEN** validation succeeds and the loaded quiz exposes an equivalent `metadata` object with those properties

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
