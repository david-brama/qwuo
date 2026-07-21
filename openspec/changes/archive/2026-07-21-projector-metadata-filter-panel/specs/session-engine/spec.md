## ADDED Requirements

### Requirement: Runtime metadata filters subset the process bank
The session MUST retain the process question bank (the quiz `questions` array after startup filters) separately from the playable question list used for phases, indices, scoring, and `questionCount`. The session MUST support an ordered list of runtime metadata filter entries. When runtime filters are empty, the playable list MUST include every bank question (after normal per-question choice shuffle for play). When runtime filters are non-empty, the playable list MUST be the ordered subset of bank questions that match those filters under the same AND-across-keys / OR-within-key rules as startup metadata filters, then prepared for play (choice shuffle). Relative order of matching questions MUST match bank order.

#### Scenario: No runtime filters plays full bank
- **WHEN** a session is created with a bank of N questions and no runtime filters
- **THEN** `questionCount` is N

#### Scenario: Runtime filter reduces playable set
- **WHEN** the host applies runtime filter `live=true` against a bank containing both live true and false questions
- **THEN** `questionCount` equals the number of bank questions with `metadata.live` boolean true, in bank order

#### Scenario: Clearing runtime filters restores bank
- **WHEN** runtime filters are applied and later replaced with an empty filter list while apply is allowed
- **THEN** `questionCount` returns to the full bank size

### Requirement: Runtime filter apply only in LOBBY
The session MUST accept a mutating runtime filter apply only while phase is LOBBY. A successful apply MUST set the active runtime filters, rebuild the playable list, and reset `questionIndex` to 0. Participants already in the lobby MUST be retained. If the filters are well-formed but match zero bank questions, the session MUST reject the apply, leave playable questions and active filters unchanged, and signal a client error. Applies outside LOBBY MUST be rejected without mutation.

#### Scenario: Apply in LOBBY succeeds
- **WHEN** phase is LOBBY and filters match at least one bank question
- **THEN** the playable set updates, `questionIndex` is 0, and phase remains LOBBY

#### Scenario: Empty match rejected
- **WHEN** phase is LOBBY and filters match zero bank questions
- **THEN** the apply fails, active filters stay as before, and `questionCount` is unchanged

#### Scenario: Apply during QUESTION rejected
- **WHEN** phase is QUESTION and a runtime filter apply is requested
- **THEN** the apply is rejected and the playable set is unchanged

### Requirement: Reset returns to lobby and clears runtime filters
Host reset MUST set phase to LOBBY and `questionIndex` to 0, clear runtime filters, and rebuild the playable list as the full process bank with a fresh choice shuffle. Reset MUST retain participants and their scores. Reset MUST clear per-question answer maps so answer indices remain consistent with the rebuilt playable set.

#### Scenario: Reset clears filters and keeps roster
- **WHEN** runtime filters have reduced the bank to M playable questions, participants have joined and scored, and the host resets
- **THEN** the session is in LOBBY, `activeFilters` is empty, `questionCount` equals the full bank size, participants remain with the same scores, and per-question answers are cleared

### Requirement: Runtime filters are durable
After a successful runtime filter apply, durable session state MUST include enough information to restore the same active runtime filters and playable subset (including play-time choice order) on process restart with a matching quiz fingerprint. Snapshots that predate runtime filters (no filter field, effective list length equal to bank length) MUST continue to restore as a full-bank session with empty runtime filters when otherwise valid.

#### Scenario: Filtered session survives restart
- **WHEN** the host applies runtime filters and the process restarts with a matching snapshot
- **THEN** the restored session has the same runtime filters and the same playable question count and texts in order

#### Scenario: Legacy full-bank snapshot
- **WHEN** a snapshot has no runtime filter field and effective questions length equals the loaded bank length
- **THEN** restore succeeds with empty runtime filters when other snapshot checks pass

### Requirement: Filter facets derived from process bank
The session MUST expose filter facets for projector state by scanning metadata on the process bank: each distinct top-level metadata key that has at least one matchable scalar or array-scalar value yields a facet; each distinct stringified value includes a count of bank questions that match `key=value` alone. Facets MUST NOT be limited to the current playable subset.

#### Scenario: Facet count ignores current playable hide
- **WHEN** the bank has 5 questions with `domain=A` and runtime filters currently play only a subset that still includes some `domain=A` questions
- **THEN** the `domain`/`A` facet count remains 5
