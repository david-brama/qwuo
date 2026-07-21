## ADDED Requirements

### Requirement: Projector state exposes runtime filter context
Host projector state MUST include runtime filter context for the filter panel:

- `bankQuestionCount`: number of questions in the process bank (after startup filters, before runtime filters)
- `activeFilters`: the currently applied runtime metadata filter entries (empty array when none)
- `filterFacets`: ordered facet descriptors derived from the process bank — each entry has a metadata `key` and a list of `{ value, count }` options
- `canApplyFilter`: true only when the session phase allows applying runtime filters (LOBBY)

Existing fields `questionCount` and phase content MUST continue to reflect the **playable** set after runtime filters. Player state MUST NOT be required to include filter facets or `activeFilters`.

#### Scenario: Unfiltered lobby state
- **WHEN** the session is in LOBBY with no runtime filters
- **THEN** projector state has `activeFilters` as `[]`, `bankQuestionCount` equal to `questionCount`, and `canApplyFilter` true

#### Scenario: Filtered playable count
- **WHEN** runtime filters reduce the bank from 60 to 12 playable questions
- **THEN** projector state has `bankQuestionCount` 60, `questionCount` 12, and `activeFilters` reflecting the applied entries

#### Scenario: Facets come from the bank
- **WHEN** runtime filters hide all questions with `domain=B` from the playable set but the bank still contains `domain=B`
- **THEN** `filterFacets` still includes value `B` under `domain` with a positive count

#### Scenario: Player state omits filter panel fields
- **WHEN** a player requests player state
- **THEN** the payload is not required to include `filterFacets`, `activeFilters`, `bankQuestionCount`, or `canApplyFilter`

### Requirement: Projector filter mutation endpoint
The projector HTTP API MUST accept `POST /s/{sessionId}/api/filter` with a JSON body containing `filters` (array of `{ key, value }` string entries) and optional `preview` boolean. The handler MUST enforce the same loopback Origin rules as other projector mutations. Preview requests MUST NOT mutate the session. Non-preview apply MUST delegate to the session runtime filter apply rules (LOBBY-only, reject empty match). Successful non-preview apply MUST trigger the same durable-save hook pattern as advance/reset when hooks are configured.

#### Scenario: Preview does not persist
- **WHEN** a client POSTs filter with `preview: true`
- **THEN** the response reports match count and the session playable set and durable snapshot are unchanged

#### Scenario: Apply in LOBBY persists
- **WHEN** a client POSTs a non-preview filter apply in LOBBY that matches at least one question and persist hooks are configured
- **THEN** the session playable set updates and the save hook runs

#### Scenario: Foreign Origin blocked on filter
- **WHEN** a client POSTs to `/s/{sessionId}/api/filter` on the projector port with `Origin: https://evil.example`
- **THEN** the response status is 403 and the session is unchanged
