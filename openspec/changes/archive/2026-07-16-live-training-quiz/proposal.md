## Why

Training sessions need a live, lockstep quiz with a professional look — not party-game energy and not a hosted SaaS. Hosts want something that runs on their laptop, is configured by a JSON file, and lets phones join via QR with no accounts.

## What Changes

- New local Deno app that runs a live training quiz from `quiz.json`
- Projector surface on a **localhost-only** port: lobby (large QR) → question → correct → explain → leaderboard, advanced by a **Next** button
- Player surface on a separate (tunneled) port: name join, answer pad, **instant** correct/incorrect feedback after selection
- Session rules: no timer (host-driven), +1 per correct answer, late join allowed (score starts at 0), duplicate names allowed
- Small QR top-right on all non-lobby projector screens
- Ad-hoc operation via cloudflared (or equivalent) pointed at the player port; not packaged for distribution

## Capabilities

### New Capabilities

- `quiz-config`: Load and shape of `quiz.json` (title, questions, choices, correct index, explanation)
- `session-engine`: In-memory session state — lobby/phases, join by name, answers, scoring, host advance, late join
- `projector-surface`: Localhost projector UI and Next control; QR placement rules
- `player-surface`: Public player UI — name entry, answer flow, instant feedback, wait states

### Modified Capabilities

- (none — greenfield)

## Impact

- New Deno TypeScript codebase (no existing app code)
- Runtime deps: Deno standard library only preferred; minimal third-party if needed (e.g. QR generation)
- Ops: host runs Deno + optional cloudflared; sets `PUBLIC_URL` for QR when using a tunnel
- No persistence, no auth, no multi-room, no admin CMS
