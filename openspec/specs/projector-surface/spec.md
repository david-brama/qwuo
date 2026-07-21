## Purpose

Localhost projector UI: QR placement, phase content, configured question metadata on slides, host Next/Back/Reset, runtime filter state and API.

## Requirements

### Requirement: Projector binds localhost only
The system SHALL serve the projector surface on a dedicated HTTP port bound to localhost only (default port 3000, overridable by configuration). The live projector room MUST be served under `/s/{sessionId}/` for the active session UUID.

#### Scenario: Local access at session path
- **WHEN** a browser on the host machine requests `/s/{sessionId}/` on the projector port
- **THEN** the projector UI is served

#### Scenario: Not exposed with player tunnel
- **WHEN** an operator tunnels only the player port
- **THEN** the projector surface remains unreachable via that tunnel

### Requirement: Lobby shows large QR
While the session phase is LOBBY, the projector UI MUST display a large QR code encoding the **session-scoped** public player join URL (`…/s/{sessionId}`), plus human-readable URL text.

#### Scenario: Lobby QR content
- **WHEN** the projector is in LOBBY and `PUBLIC_URL` is set
- **THEN** the QR encodes `{PUBLIC_URL}/s/{sessionId}` (normalized)

#### Scenario: Lobby without PUBLIC_URL
- **WHEN** the projector is in LOBBY and `PUBLIC_URL` is not set
- **THEN** the QR encodes the local player base URL plus `/s/{sessionId}`

### Requirement: Small QR on non-lobby screens
On all projector phases other than LOBBY, the projector UI MUST show a small QR code in the top-right corner encoding the same **session-scoped** player join URL.

#### Scenario: Question phase QR placement
- **WHEN** the projector is in QUESTION, CORRECT, EXPLAIN, LEADERBOARD, or END
- **THEN** a small QR appears in the top-right encoding the session-scoped join URL and main content remains readable

### Requirement: Projector client uses session-scoped API base
The projector client MUST call host APIs under `/s/{sessionId}/api/…` (state, advance, reset) derived from the current page path.

#### Scenario: Advance under session prefix
- **WHEN** the host activates Next
- **THEN** the client posts to `/s/{sessionId}/api/advance`

### Requirement: Phase-specific main content
The projector UI MUST show phase-appropriate main content:

- QUESTION: question text and all choices in the session's effective choice order without indicating the correct answer
- CORRECT: same content and order with the correct choice highlighted using the session's remapped correct index
- EXPLAIN: explanation text for the current question (or a "No explanation" placeholder if empty)
- LEADERBOARD: ranked participant names and scores
- END: session complete indication

#### Scenario: Question hides correct answer
- **WHEN** the projector phase is QUESTION
- **THEN** no visual treatment identifies which choice is correct

#### Scenario: Correct highlights answer
- **WHEN** the projector phase is CORRECT
- **THEN** the correct choice is visually highlighted

#### Scenario: Empty explanation
- **WHEN** the projector phase is EXPLAIN and the question has no explanation text
- **THEN** the UI shows a "No explanation" placeholder

#### Scenario: Choices match session order
- **WHEN** the projector phase is QUESTION or CORRECT
- **THEN** choices are shown in the order returned by projector state for the current question (shared with players)

### Requirement: Host advances with Next button
The projector UI MUST provide a visible **Next** button that advances the session phase. Keyboard shortcuts are not required.

#### Scenario: Next advances phase
- **WHEN** the host activates the Next button
- **THEN** the session advances one step in the phase machine and the UI reflects the new phase

### Requirement: Projector fullscreen control
The projector UI MUST provide a visible control that requests browser fullscreen for the projector page (and exits fullscreen when already active), when the Fullscreen API is available. When the API is unavailable, the control MAY be hidden. Fullscreen MUST NOT be required for normal host operation.

#### Scenario: Enter fullscreen
- **WHEN** the host activates the fullscreen control while not in fullscreen and the API is available
- **THEN** the browser enters fullscreen for the projector document

#### Scenario: Exit fullscreen
- **WHEN** the host activates the fullscreen control while already in fullscreen
- **THEN** the browser exits fullscreen

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

### Requirement: Professional training appearance
The projector UI MUST use a clean, high-contrast, professional visual style suitable for a training projector (large readable type, no party-game chrome).

#### Scenario: Readable on projector
- **WHEN** the projector page is displayed fullscreen on a typical 1080p display
- **THEN** question text and choices remain legible from a training-room distance

### Requirement: Projector rejects non-local Origin
The projector HTTP handler SHALL reject any request that includes an `Origin` header whose host is not a loopback address. Loopback hosts MUST include `127.0.0.1`, `localhost`, and `::1` (IPv6 loopback), with `http` or `https` scheme. When `Origin` is absent or empty, the handler MUST process the request normally (non-browser clients and unit tests). A rejected origin MUST receive HTTP 403 and MUST NOT mutate session state.

#### Scenario: Foreign Origin blocked on reset
- **WHEN** a client POSTs to `/s/{sessionId}/api/reset` on the projector port with `Origin: https://evil.example`
- **THEN** the response status is 403 and the session is unchanged

#### Scenario: Loopback Origin allowed on reset
- **WHEN** a client POSTs to `/s/{sessionId}/api/reset` on the projector port with `Origin: http://127.0.0.1:3000`
- **THEN** the request is not rejected for origin and reset proceeds if the path is valid

#### Scenario: Missing Origin allowed
- **WHEN** a client POSTs to `/s/{sessionId}/api/advance` on the projector port without an `Origin` header
- **THEN** the request is not rejected for origin

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
