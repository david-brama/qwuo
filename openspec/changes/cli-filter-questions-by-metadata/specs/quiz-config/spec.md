## ADDED Requirements

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
