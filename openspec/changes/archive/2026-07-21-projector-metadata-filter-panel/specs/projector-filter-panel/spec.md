## ADDED Requirements

### Requirement: Projector right-side filter panel
The projector UI MUST provide a filter controller in a right-side panel **only while the session phase is LOBBY**. Outside LOBBY the panel MUST be hidden and MUST NOT reserve layout space. While visible, the panel MUST present one **single-select dropdown** per filterable question-metadata key exposed in projector state facets. Each dropdown MUST include an unconstrained option (e.g. “Any”) plus one option per facet value. The host MUST be able to choose at most one value per key, apply the selection, and clear all runtime filters from the panel.

#### Scenario: Panel lists facet keys as dropdowns in LOBBY
- **WHEN** projector phase is LOBBY and state includes `filterFacets` with keys `domain` and `live` and their values
- **THEN** the right-side panel is visible and shows a single-select dropdown for each key with those values as options

#### Scenario: Panel hidden outside LOBBY
- **WHEN** projector phase is QUESTION, CORRECT, EXPLAIN, LEADERBOARD, or END
- **THEN** the filter panel is not shown

#### Scenario: Clear all removes runtime filters in LOBBY
- **WHEN** the session is in LOBBY and the host activates Clear all
- **THEN** the client requests an apply with an empty filter list and the UI reflects no active runtime filters after success

### Requirement: Combined filter is intersection across keys only
When the host applies filters from the panel, selections MUST be sent such that each key contributes at most one value and multiple keys are combined with intersection (AND). Keys left on “Any” (no selection) MUST NOT constrain the match. The panel MUST NOT offer multi-value (OR) selection within a single key.

#### Scenario: Two keys intersect
- **WHEN** the host selects `domain=A` and `live=true` and applies
- **THEN** the request includes both constraints and the resulting playable set includes only questions matching both

#### Scenario: Single value per key
- **WHEN** the host changes the `domain` dropdown from `A` to `B` and applies
- **THEN** the request includes only one `domain` entry (`B`) and does not retain `A`

#### Scenario: Unselected key is unconstrained
- **WHEN** the host selects only `live=true` and leaves `domain` on Any
- **THEN** the applied filters do not include a domain constraint

### Requirement: Filter apply and preview via projector API
The projector client MUST call a session-scoped projector API to preview match counts and to apply runtime filters. Preview MUST NOT change session state. Apply MUST refresh projector state (including `questionCount`, `activeFilters`, and facet data as provided by the server).

#### Scenario: Preview before apply
- **WHEN** the host changes selections and the UI requests a preview for the draft filters
- **THEN** the client receives a match count without changing the session’s playable set

#### Scenario: Successful apply updates counts
- **WHEN** the host applies valid filters in LOBBY that match at least one bank question
- **THEN** the UI shows the new playable question count from the response state

#### Scenario: Empty match keeps prior set
- **WHEN** apply would match zero bank questions
- **THEN** the UI surfaces the error and continues showing the previous playable set and selections context without treating the apply as success
