## ADDED Requirements

### Requirement: Startup metadata filters select the playable question set
The system SHALL accept zero or more metadata filter entries at process startup. When one or more entries are present, the system MUST replace the playable quiz’s `questions` array with the ordered subset of loaded questions that match the filters, and MUST use that subset for the session, fingerprinting, and the process lifetime. When no filter entries are present, the system MUST keep every question from the loaded quiz (subject to normal validation). Relative order of matching questions MUST match their order in the loaded file.

#### Scenario: No filters keeps full bank
- **WHEN** the process starts with a valid quiz and no metadata filter entries
- **THEN** the playable quiz includes every validated question from the file in file order

#### Scenario: Single filter reduces the set
- **WHEN** the process starts with filter entry `live=true` and the file contains questions with `metadata.live` true and false
- **THEN** the playable quiz includes only questions whose `metadata.live` is boolean `true`, in original file order

#### Scenario: Filtered quiz drives session length
- **WHEN** filters reduce the loaded bank from N questions to M (M ≥ 1)
- **THEN** the live session exposes M questions and startup logging reflects the filtered count

### Requirement: Multiple filter entries use AND across keys and OR within a key
The system MUST treat multiple filter entries as follows: entries are grouped by metadata key; a question matches only if it satisfies every key group; within a single key group, a question matches if it satisfies **any** entry value for that key.

#### Scenario: Same key multiple values is OR
- **WHEN** filters are `domain=A` and `domain=B`
- **THEN** a question matches if its `metadata.domain` equals `A` or equals `B`

#### Scenario: Different keys are AND
- **WHEN** filters are `live=true` and `domain=A`
- **THEN** a question matches only if it satisfies both the live constraint and the domain constraint

#### Scenario: Combined AND of keys with OR of values
- **WHEN** filters are `live=true`, `domain=A`, and `domain=B`
- **THEN** a question matches only if `metadata.live` is true and `metadata.domain` is `A` or `B`

### Requirement: Filter value matching for scalars and arrays
For each filter entry `key=value`, the system MUST read `question.metadata[key]` when `metadata` is a present object. A missing `metadata` object or missing key MUST NOT match that entry. Matching MUST follow:

- string field: exact equality with the filter value after edge-trim of the filter value only (question string as stored; **internal whitespace significant**; no case-folding)
- boolean field: filter value is exactly `true` or `false` and equals the boolean
- number field: filter value denotes the same finite number as the field
- null field: filter value is exactly `null`
- array field: match if any **scalar** element matches the filter value under the rules above
- object field (non-array): MUST NOT match

Keys and values MAY contain whitespace. When parsing an entry string, the system MUST split on the first `=` only, trim leading/trailing whitespace on `key` and on `value` separately, and MUST preserve all internal whitespace in both.

#### Scenario: Boolean live flag
- **WHEN** a question has `"metadata": { "live": true }` and the filter is `live=true`
- **THEN** the question matches that entry

#### Scenario: String domain exact match with spaces
- **WHEN** a question has `"metadata": { "domain": "Tool Design & MCP Integration" }` and the filter entry value is `Tool Design & MCP Integration` (internal spaces preserved)
- **THEN** the question matches that entry

#### Scenario: Internal spaces are significant
- **WHEN** a question has `"metadata": { "domain": "Tool Design & MCP Integration" }` and the filter value is `Tool Design& MCP Integration` (different spacing)
- **THEN** the question does not match that entry

#### Scenario: Array membership
- **WHEN** a question has `"metadata": { "tags": ["intro", "exam"] }` and the filter is `tags=intro`
- **THEN** the question matches that entry

#### Scenario: Missing key does not match
- **WHEN** a question has no `metadata` or has metadata without `domain`, and a `domain=…` filter is active
- **THEN** the question does not match the `domain` group

### Requirement: Filter sources are CLI and environment
The system SHALL accept filter entries from:

1. Environment variable `QUIZ_FILTER`: a `;`-separated list of `key=value` segments (empty segments ignored after trim of the segment)
2. Repeatable CLI options `--filter <key=value>` and `--filter=<key=value>` from process arguments intended for the app

The system MUST merge env entries first, then CLI entries, into one list governed by the multi-entry semantics above. Each entry’s `key` MUST be the non-empty substring before the first `=` (after edge-trim); the `value` MUST be the remainder after that `=` after edge-trim (internal spaces kept). Entries without a `=` or with an empty key MUST be rejected as malformed.

Operator documentation MUST show that values (and keys) containing whitespace or shell-special characters such as `&` require proper shell quoting so each `key=value` arrives as a single argument or intact env segment—for example `--filter "domain=Tool Design & MCP Integration"` and `QUIZ_FILTER='live=true;domain=Tool Design & MCP Integration'`. The application does not re-join shell-split tokens into one value.

#### Scenario: Env only
- **WHEN** `QUIZ_FILTER=live=true` is set and no CLI filters are passed
- **THEN** the system applies a single `live=true` filter

#### Scenario: Env segment with spaced value
- **WHEN** `QUIZ_FILTER` is the single string `domain=Tool Design & MCP Integration` (as stored in the environment after shell assignment quoting)
- **THEN** the system applies one filter with key `domain` and value `Tool Design & MCP Integration`

#### Scenario: Repeatable CLI flags
- **WHEN** the process is started with `--filter live=true --filter domain=A`
- **THEN** both entries are applied under AND/OR rules

#### Scenario: CLI filter argv preserves spaced value
- **WHEN** `Deno.args` contains `--filter` and `domain=Tool Design & MCP Integration` as two elements (host quoted the value token), or `--filter=domain=Tool Design & MCP Integration` as one element
- **THEN** the applied filter value is `Tool Design & MCP Integration` including internal spaces

#### Scenario: Env and CLI merge
- **WHEN** `QUIZ_FILTER=live=true` and CLI includes `--filter domain=A`
- **THEN** both constraints apply (live and domain)

### Requirement: Malformed filters and empty match sets fail startup
The system MUST NOT start the HTTP session when any filter entry is malformed, when unrecognized app CLI arguments are present among the filter-parsed operands, or when filters are non-empty and zero questions match. The process MUST exit non-zero with an error message that describes the problem. For an empty match set, the message MUST include that no questions matched and SHOULD include the filter summary and source question count.

#### Scenario: Empty match set
- **WHEN** filters are valid but no loaded question matches
- **THEN** the process exits non-zero and does not listen for projector/player traffic

#### Scenario: Malformed entry
- **WHEN** a filter segment has no `=` or an empty key (e.g. `=true` or `novalue`)
- **THEN** the process exits non-zero with a clear parse error before creating a session

#### Scenario: Unknown CLI operand
- **WHEN** app CLI args include a token that is not a valid `--filter` form
- **THEN** the process exits non-zero with a usage-oriented error

### Requirement: Successful filter is visible at boot
When filters are applied and at least one question remains, the system MUST log the pre-filter and post-filter question counts (and MAY log a short filter summary) during startup so the host can confirm the subset.

#### Scenario: Boot log shows reduction
- **WHEN** a 60-question file is filtered to 12 questions
- **THEN** startup output indicates 12 playable questions (and the reduction from 60)
