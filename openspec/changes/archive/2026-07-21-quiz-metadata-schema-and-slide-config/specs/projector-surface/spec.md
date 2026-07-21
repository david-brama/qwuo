## ADDED Requirements

### Requirement: Projector shows configured question metadata on slides
When the projector state includes a current `question` object and that question’s `slideMetadata` array is non-empty, the projector UI MUST display those metadata entries on the slide (readable labels/values) during phases that show the question content. Entries MUST appear in the order provided by projector state. Values MUST be rendered as plain text (escaped), not as Markdown. When `slideMetadata` is missing or empty, the projector MUST NOT reserve a required metadata chrome region (behavior matches today’s question-only layout).

#### Scenario: Domain and use-case on question slide
- **WHEN** projector phase is QUESTION and the current question’s `slideMetadata` is `[{ "key": "domain", "value": "Tool Design & MCP Integration" }, { "key": "use-case", "value": "Customer Support Resolution Agent" }]`
- **THEN** the UI shows both values in that order in a compact metadata area near the question

#### Scenario: No slide metadata configured
- **WHEN** the current question’s `slideMetadata` is `[]` or absent
- **THEN** the question text and choices render without a required metadata strip

#### Scenario: Correct and explain keep metadata visible
- **WHEN** the projector phase is CORRECT or EXPLAIN and `slideMetadata` is non-empty
- **THEN** the same metadata entries remain visible with the phase content

### Requirement: Projector state includes resolved slide metadata
For host projector state, when `question` is non-null, the system MUST include `slideMetadata` on that object: an ordered array of `{ key, value }` objects derived from the loaded quiz’s `config.slideMetadataKeys` (or an empty list when config/keys are absent). For each configured key, if the current playable question’s `metadata` has a string, number, or boolean value at that key, the system MUST append one entry with `value` as its string form. The system MUST skip keys that are missing, null, objects, or arrays on the question. Player state MUST NOT be required to include slide metadata.

#### Scenario: Resolved entries follow config order
- **WHEN** `config.slideMetadataKeys` is `["use-case", "domain"]` and the current question metadata has both keys
- **THEN** projector `question.slideMetadata` lists `use-case` then `domain`

#### Scenario: Missing key skipped
- **WHEN** `slideMetadataKeys` includes `task-statement` but the current question metadata omits it
- **THEN** projector `slideMetadata` omits that key and still includes other present configured keys

#### Scenario: Lobby has no question metadata payload
- **WHEN** projector phase is LOBBY
- **THEN** `question` is null and no slide metadata is required
