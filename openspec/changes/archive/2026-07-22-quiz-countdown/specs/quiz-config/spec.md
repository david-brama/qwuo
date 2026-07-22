## ADDED Requirements

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

## MODIFIED Requirements

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
