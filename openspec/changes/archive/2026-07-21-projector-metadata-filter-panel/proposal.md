## Why

Hosts often need to narrow a large training bank to a subset for a given room (one domain, a few use-cases) without restarting the process or re-quoting CLI `--filter` flags. Startup filters already exist for ops, but there is no in-session projector control to browse available metadata values and apply an intersection filter before (or when resetting to) the live set.

## What Changes

- Add a **right-side filter panel** on the projector UI with one **single-select dropdown** per filterable question-metadata key (values discovered from the loaded playable bank).
- Host selections across keys combine with **intersection only** (one value per key). Multi-value OR within a key remains a startup CLI/env feature only.
- Add a **projector-only API** to read filter facets (keys → distinct values + counts) and to apply/clear the active runtime filter.
- Applying a filter rebuilds the session’s playable question list from the process bank (startup-filtered quiz, if any), preserving relative file order, and is only allowed when the session is in **LOBBY** (or after host **Reset**, which returns to LOBBY). Empty match sets are rejected without mutating the playable set.
- Projector state exposes active filters and playable/total counts so the panel and status line stay in sync.
- No player-surface filter UI; players only see the resulting question count via normal session state.
- Startup CLI/env filters remain unchanged and define the maximum bank the panel can further narrow.

## Capabilities

### New Capabilities

- `projector-filter-panel`: Host-facing runtime metadata filter controller on the projector (right panel UI, facet discovery, apply/clear, intersection semantics, LOBBY-only apply).

### Modified Capabilities

- `projector-surface`: Projector layout includes a right-side filter panel; projector state includes filter facets/active filters and counts needed to render it.
- `session-engine`: Session supports a runtime metadata filter over the process question bank; applying filters rebuilds the playable set under LOBBY constraints.
- `question-filter`: Clarify that startup filters define the process bank; runtime projector filters further subset that bank with the same AND-keys / OR-values match rules (no new match-rule variants).

## Impact

- `src/projector_ui.ts` + `src/styles.ts` — right-side filter panel chrome, multi-select lists, apply/clear, status feedback.
- `src/session.ts` — retain process bank vs playable list; apply/clear runtime filters; expose facets and active filter summary on projector state.
- `src/http.ts` — projector routes for filter facets/apply (Origin-guarded like other host mutations).
- `src/quiz.ts` — reuse `filterQuestionsByMetadata` / facet helpers; may add distinct-value discovery per key.
- Tests: session filter apply rules, HTTP projector filter endpoints, projector state shape.
- README: document projector filter panel vs startup `--filter` / `QUIZ_FILTER`.
- Persistence: active runtime filters should be part of session snapshot so restore keeps the same playable subset (design details in `design.md`).
