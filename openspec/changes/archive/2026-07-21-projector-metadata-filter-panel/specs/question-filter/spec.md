## ADDED Requirements

### Requirement: Startup filters define the process bank for runtime filtering
When startup metadata filters are applied at process boot, the resulting in-memory quiz `questions` array is the **process bank** for the session lifetime. Runtime projector filters MUST further subset only this bank and MUST NOT reintroduce questions dropped by startup filters. When no startup filters are present, the process bank is the full validated file question list. Scalar and array field matching for each runtime entry MUST match startup filter matching. Runtime apply MUST accept at most one value per metadata key (intersection across keys only). Startup CLI/env filters MAY still use multiple values per key (OR within a key); that OR mode is not exposed on the projector panel.

#### Scenario: Runtime cannot restore startup-dropped questions
- **WHEN** startup filters reduce the file from 60 to 20 questions and the host later clears all runtime filters
- **THEN** the playable set has 20 questions, not 60

#### Scenario: Runtime uses same scalar match rules as startup
- **WHEN** a runtime filter entry is `domain=Tool Design & MCP Integration`
- **THEN** matching uses the same exact string rules as an equivalent startup `--filter` entry for that key and value

### Requirement: Metadata facets for host filter UI
The system MUST be able to compute, from a question list (the process bank), the set of filterable metadata keys and distinct matchable values with per-value question counts, suitable for driving a host single-select dropdown UI. Computation MUST use the same value stringification and matchability rules as filter matching (scalars and array elements; non-array objects do not contribute values).

#### Scenario: Distinct domain values
- **WHEN** the bank has questions with `metadata.domain` values `A` and `B` only
- **THEN** facet discovery for `domain` includes values `A` and `B` with correct counts and no other domain values

#### Scenario: Boolean live facet
- **WHEN** the bank includes `metadata.live` true and false
- **THEN** facet discovery includes values `true` and `false` for key `live`

#### Scenario: Array tags contribute membership values
- **WHEN** a question has `"metadata": { "tags": ["intro", "exam"] }`
- **THEN** facet discovery for `tags` includes `intro` and `exam` (counts include that question for each)
