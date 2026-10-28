/** Shared professional high-contrast training styles */
export const SHARED_CSS = /* css */ `
:root {
  --bg: #0f1419;
  --surface: #1a2332;
  --surface-2: #243044;
  --text: #f0f4f8;
  --muted: #8b9cb3;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --correct: #22c55e;
  --correct-bg: rgba(34, 197, 94, 0.15);
  --incorrect: #ef4444;
  --incorrect-bg: rgba(239, 68, 68, 0.15);
  --border: #2d3a4f;
  --radius: 12px;
  --font: "Segoe UI", system-ui, -apple-system, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  border-radius: var(--radius);
  font-weight: 600;
  transition: background 0.15s, transform 0.1s;
}
button:active { transform: scale(0.98); }
button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.choice {
  display: block;
  width: 100%;
  text-align: left;
  padding: 1rem 1.25rem;
  background: var(--surface);
  color: var(--text);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  font-size: 1.15rem;
  margin-bottom: 0.75rem;
}
.choice:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-2);
}
.choice.correct {
  border-color: var(--correct);
  background: var(--correct-bg);
}
.choice.incorrect {
  border-color: var(--incorrect);
  background: var(--incorrect-bg);
}
.choice.highlight {
  border-color: var(--correct);
  background: var(--correct-bg);
  box-shadow: 0 0 0 2px var(--correct);
}

.muted { color: var(--muted); }
.score { font-variant-numeric: tabular-nums; font-weight: 700; }
`;

export const PROJECTOR_CSS = /* css */ `
${SHARED_CSS}

/*
 * Projector: everything fits one screen at 1024x768 … 1920x1080 and up.
 * Sizes below are maxima; the page script shrinks the slide via --fit
 * (on #main) until nothing overflows, so #main never scrolls.
 */
html, body {
  height: 100%;
  height: 100dvh;
  max-height: 100%;
  max-height: 100dvh;
  overflow: hidden;
  margin: 0;
}

body {
  display: flex;
  flex-direction: column;
}

/* App shell: flex column = header | main | footer */
.shell {
  --pad-y: clamp(10px, 1.8vh, 24px);
  --pad-x: clamp(16px, 2.4vw, 48px);
  --hdr: clamp(48px, 7.5vh, 84px);
  --gap: clamp(8px, 1.4vh, 18px);
  --fit: 1;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding: var(--pad-y) var(--pad-x);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

/* Overlays (QR modal, filters) — never participate in the column flex */
.chrome {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  overflow: visible;
}
.chrome > * {
  pointer-events: auto;
}
.chrome .qr-modal[hidden],
.chrome .filter-panel[hidden],
.chrome .filter-panel-toggle[hidden] {
  pointer-events: none;
}

/* Header: one row — phase + title/metadata | answered · timer · logo · QR */
.header {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: clamp(10px, 1.5vw, 28px);
  min-height: var(--hdr);
  margin: 0;
  z-index: 2;
  position: relative;
}

.header-left {
  flex: 1 1 auto;
  min-width: 0;
}

.phase-label {
  font-size: clamp(13px, 2vh, 22px);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header h1 {
  font-size: clamp(14px, 2vh, 22px);
  font-weight: 600;
  line-height: 1.3;
  color: var(--muted);
  letter-spacing: 0.01em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.header h1.is-meta {
  color: #93c5fd;
}

.header-right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: clamp(8px, 1.2vw, 22px);
}

/* "X of N answered": big count, small label under it */
.answered {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.05;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}
.answered-num { font-size: clamp(20px, 4vh, 44px); }
.answered-num .score { color: var(--text); font-weight: 800; }
.answered-label {
  font-size: clamp(11px, 1.6vh, 18px);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.answered[hidden] { display: none; }

/*
 * QUESTION countdown (server deadline): ring with large seconds in the
 * header, plus a full-width bar in the gap under the header. Amber at
 * 10 s, red at 5 s. Hidden with no countdown or when answers are locked.
 */
.countdown {
  --ring: calc(var(--hdr) * 1.3);
  --ring-color: var(--correct);
  flex: 0 0 auto;
  position: relative;
  width: var(--ring);
  height: var(--ring);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #0b0f14;
}
.countdown-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-track,
.ring-fill {
  fill: none;
  stroke-width: 10;
}
.ring-track { stroke: var(--surface-2); }
.ring-fill {
  stroke: var(--ring-color);
  stroke-dasharray: 100;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear, stroke 0.2s;
}
.countdown-num {
  position: relative;
  font-size: calc(var(--ring) * 0.46);
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #fff;
}
.countdown.warn { --ring-color: #f59e0b; }
.countdown.urgent { --ring-color: var(--incorrect); }
.countdown.urgent .countdown-num { color: #fecaca; }
.countdown[hidden] {
  display: none !important;
}

.time-bar {
  --bar: clamp(5px, 0.8vh, 10px);
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(-0.5 * (var(--gap) + var(--bar)));
  height: var(--bar);
  border-radius: var(--bar);
  background: var(--surface-2);
  overflow: hidden;
  pointer-events: none;
}
.time-bar[hidden] { display: none; }
.time-bar-fill {
  height: 100%;
  background: var(--correct);
  transform-origin: left center;
  transition: transform 0.25s linear, background 0.2s;
}
.time-bar.warn .time-bar-fill { background: #f59e0b; }
.time-bar.urgent .time-bar-fill { background: var(--incorrect); }

/* Optional gitignored logo.png */
.brand-logo {
  display: block;
  max-height: calc(var(--hdr) * 0.5);
  max-width: min(220px, 16vw);
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/* Compact join QR (non-lobby); click opens the modal */
.qr-small {
  flex: 0 0 auto;
  width: var(--hdr);
  height: var(--hdr);
  background: #fff;
  border-radius: 8px;
  padding: 3px;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.qr-small[hidden] { display: none; }
.qr-small:hover { transform: scale(1.06); }
.qr-small:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.qr-small svg { display: block; width: 100%; height: 100%; }

.qr-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.qr-modal[hidden] { display: none; }
.qr-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}
.qr-modal-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: var(--bg, #0f1419);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2.5rem 2rem 2rem;
  box-shadow: 0 24px 80px rgba(0,0,0,0.55);
  max-width: min(900px, 100%);
  width: auto;
}
.qr-modal-panel .qr-large {
  width: min(62vh, 70vw);
  height: min(62vh, 70vw);
  margin-bottom: 1.25rem;
}
.qr-modal-panel .join-url {
  max-width: 100%;
}
.qr-modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.85rem;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.qr-modal-close:hover {
  color: var(--text);
  background: var(--surface);
}

/* Middle pane — fits by shrinking (--fit), never scrolls */
.main {
  --fit: 1;
  --q-scale: 1;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.slide-content {
  width: 100%;
  max-width: 1680px;
}

/* Lobby: big QR, join URL under it */
.main.lobby-main {
  text-align: center;
  --qr-max: min(68vh, 45vw);
}

.qr-large {
  flex: 0 0 auto;
  width: calc(var(--qr-max, min(68vh, 45vw)) * var(--fit));
  height: calc(var(--qr-max, min(68vh, 45vw)) * var(--fit));
  background: #fff;
  border-radius: 16px;
  padding: clamp(10px, 1.6vh, 18px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
  margin-bottom: calc(clamp(10px, 2vh, 24px) * var(--fit));
}
.qr-large svg { display: block; width: 100%; height: 100%; }

.join-url {
  font-size: calc(clamp(20px, 3.4vh, 40px) * var(--fit));
  font-weight: 600;
  line-height: 1.25;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: var(--text);
  background: var(--surface);
  padding: 0.35em 0.7em;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow-wrap: anywhere;
  max-width: 100%;
}

.participant-count {
  margin-top: calc(clamp(8px, 1.6vh, 20px) * var(--fit));
  font-size: calc(clamp(16px, 2.6vh, 30px) * var(--fit));
  color: var(--muted);
}

/* Question slide */
.q-text {
  font-size: calc(clamp(24px, min(4.6vh, 2.9vw), 64px) * var(--fit) * var(--q-scale));
  font-weight: 600;
  line-height: 1.28;
  margin-bottom: 0.6em;
  overflow-wrap: break-word;
}

.q-text p,
.explain-box p {
  margin: 0 0 0.65em;
}
.q-text p:last-child,
.explain-box p:last-child {
  margin-bottom: 0;
}
.q-text h1, .q-text h2, .q-text h3,
.explain-box h1, .explain-box h2, .explain-box h3 {
  margin: 0 0 0.5em;
  line-height: 1.25;
  font-weight: 800;
}
.q-text ul, .q-text ol,
.explain-box ul, .explain-box ol {
  margin: 0 0 0.65em;
  padding-left: 1.35em;
}
.q-text code, .explain-box code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.q-text pre, .explain-box pre {
  margin: 0 0 0.75em;
  padding: 0.85rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.q-text pre code, .explain-box pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
}
.q-text strong, .explain-box strong { font-weight: 800; }

.choices {
  display: grid;
  grid-template-columns: 1fr;
  gap: calc(clamp(6px, 1.3vh, 16px) * var(--fit));
}

.choices .choice {
  display: flex;
  align-items: center;
  gap: 0.6em;
  margin: 0;
  font-size: calc(clamp(20px, min(3.5vh, 2.4vw), 48px) * var(--fit) * var(--q-scale));
  line-height: 1.28;
  padding: 0.4em 0.7em;
  cursor: default;
}
.choices .choice:hover { border-color: var(--border); background: var(--surface); }
.choices .choice.highlight:hover {
  border-color: var(--correct);
  background: var(--correct-bg);
}

.choice-letter {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 0.3em;
  background: var(--surface-2);
  font-weight: 800;
  font-size: 0.85em;
  color: var(--muted);
}
.choice-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: break-word;
}
.choice.highlight .choice-letter {
  background: var(--correct);
  color: #fff;
}
.choices .choice.highlight {
  border-width: 0.16em;
  font-weight: 800;
  box-shadow: none;
}
.choices .choice:not(.highlight) .choice-text { color: #c3cedc; }
.choice-mark {
  flex: 0 0 auto;
  font-size: 1.25em;
  font-weight: 900;
  line-height: 1;
  color: var(--correct);
}

/* EXPLAIN: question + choices condensed above the explanation */
.q-text.q-recap {
  font-size: calc(clamp(16px, min(2.9vh, 1.8vw), 36px) * var(--fit) * var(--q-scale));
  font-weight: 500;
  color: #c3cedc;
  margin-bottom: 0.45em;
}
.q-recap strong { color: var(--text); }
.choices.choices-recap {
  gap: calc(clamp(3px, 0.7vh, 8px) * var(--fit));
  margin-bottom: calc(clamp(8px, 1.6vh, 20px) * var(--fit));
}
.choices.choices-recap .choice {
  font-size: calc(clamp(14px, min(2.5vh, 1.6vw), 30px) * var(--fit) * var(--q-scale));
  padding: 0.22em 0.6em;
  line-height: 1.22;
}
.explain-slide .explain-box {
  font-size: calc(clamp(18px, min(4vh, 2.4vw), 48px) * var(--fit) * var(--q-scale));
}
/* Tight screens: only the correct choice (✓) stays, the explanation grows */
.explain-compact .choices-recap .choice:not(.highlight) { display: none; }
.explain-compact .choices.choices-recap .choice {
  font-size: calc(clamp(16px, min(2.9vh, 2vw), 36px) * var(--fit) * var(--q-scale));
}
.explain-slide.explain-compact .explain-box {
  font-size: calc(clamp(24px, min(4.8vh, 3.2vw), 56px) * var(--fit) * var(--q-scale));
}

.explain-box {
  font-size: calc(clamp(22px, min(5.2vh, 3.1vw), 64px) * var(--fit) * var(--q-scale));
  line-height: 1.4;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.8em 1em;
  overflow-wrap: break-word;
}

/* Leaderboard / end: top 10 at full size, sized to fit, no fade */
.lb-slide {
  max-width: 1400px;
  margin: 0 auto;
}

.leaderboard {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(clamp(4px, 0.9vh, 12px) * var(--fit));
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 0.8em;
  padding: 0.22em 0.8em;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  font-size: calc(clamp(20px, 4.4vh, 52px) * var(--fit));
  line-height: 1.25;
}
.lb-row.top3 { border-color: var(--accent); }
.lb-rank {
  width: 2.6em;
  flex: 0 0 auto;
  font-weight: 800;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.lb-name { flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-score { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text); flex-shrink: 0; }
.lb-of { color: var(--muted); font-weight: 600; font-size: 0.8em; }

.end-title {
  font-size: calc(clamp(28px, 5.5vh, 64px) * var(--fit));
  font-weight: 800;
  line-height: 1.15;
  margin-bottom: 0.1em;
  text-align: center;
}

.lb-end-sub {
  margin-bottom: 0.6em;
  font-size: calc(clamp(16px, 2.4vh, 28px) * var(--fit));
  text-align: center;
}

/* END podium: 2nd · 1st · 3rd, block height by rank */
.podium {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: calc(clamp(10px, 1.6vw, 28px) * var(--fit));
  font-size: calc(clamp(20px, 4vh, 48px) * var(--fit));
  margin-bottom: calc(clamp(8px, 1.8vh, 22px) * var(--fit));
}
.podium-place {
  flex: 0 1 30%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}
.podium-name {
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.podium-score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  margin-bottom: 0.2em;
}
.podium-block {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.15em;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--surface-2);
  border: 2px solid var(--border);
  border-bottom: none;
}
.podium-rank {
  font-size: 1.8em;
  font-weight: 900;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.place-1 .podium-block { height: 4.2em; background: #3d3415; border-color: #facc15; }
.place-1 .podium-rank { color: #facc15; }
.place-1 .podium-name { font-size: 1.15em; }
.place-2 .podium-block { height: 3em; border-color: #cbd5e1; }
.place-2 .podium-rank { color: #e2e8f0; }
.place-3 .podium-block { height: 2.2em; border-color: #d97706; }
.place-3 .podium-rank { color: #fbbf24; }

/* Places 4–10 in two columns under the podium */
.leaderboard.lb-rest {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: calc(clamp(10px, 1.6vw, 28px) * var(--fit));
}
.lb-rest .lb-row {
  font-size: calc(clamp(16px, 3vh, 36px) * var(--fit));
}

/* Right-side runtime filter panel (host projector) */
.shell.has-filter-panel {
  padding-right: calc(clamp(260px, 22vw, 320px) + var(--pad-x));
}

.filter-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: clamp(260px, 22vw, 320px);
  z-index: 12;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.35);
  padding: 1rem 0.9rem 1rem;
  overflow: hidden;
}
.filter-panel[hidden] {
  display: none !important;
}
.filter-panel-toggle[hidden] {
  display: none !important;
}

.filter-panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
  flex-shrink: 0;
}

.filter-panel-title {
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

.filter-panel-count {
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.filter-panel-hint {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 0.75rem;
  line-height: 1.35;
  flex-shrink: 0;
}

.filter-panel-hint.warn {
  color: #fbbf24;
}

.filter-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding-right: 0.15rem;
}

.filter-facet {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 0.55rem 0.6rem 0.65rem;
}

.filter-facet-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #93c5fd;
  margin-bottom: 0.4rem;
}

.filter-select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  appearance: auto;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.3;
  padding: 0.5rem 0.55rem;
  cursor: pointer;
  max-width: 100%;
}

.filter-select:hover:not(:disabled) {
  border-color: var(--accent);
}

.filter-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.filter-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filter-select option {
  background: var(--surface);
  color: var(--text);
}

.filter-panel-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-shrink: 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.filter-panel-actions button {
  flex: 1;
  font-size: 0.9rem;
  padding: 0.65rem 0.5rem;
  min-width: 0;
}

.filter-apply-btn {
  background: var(--accent);
  color: #fff;
}
.filter-apply-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.filter-apply-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.filter-clear-btn {
  background: transparent;
  color: var(--text);
  border: 2px solid var(--border);
}
.filter-clear-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--bg);
}
.filter-clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.filter-panel-error {
  font-size: 0.78rem;
  color: var(--incorrect, #f87171);
  margin-top: 0.5rem;
  line-height: 1.3;
  flex-shrink: 0;
}

.filter-panel-empty {
  font-size: 0.85rem;
  color: var(--muted);
  padding: 0.5rem 0;
}

.filter-panel-toggle {
  display: none;
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  z-index: 13;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  background: var(--surface);
  color: var(--accent);
  border: 1px solid var(--border);
  border-right: none;
  border-radius: 10px 0 0 10px;
  padding: 0.85rem 0.45rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
}

@media (max-width: 1100px) {
  .shell.has-filter-panel {
    padding-right: var(--pad-x);
  }
  .filter-panel {
    width: min(320px, 92vw);
    transform: translateX(100%);
    transition: transform 0.18s ease;
  }
  .filter-panel.is-open {
    transform: translateX(0);
  }
  .filter-panel-toggle {
    display: flex;
  }
}

.filter-panel-toggle:hover {
  background: var(--bg);
  color: #fff;
}

@media (min-width: 1101px) {
  .filter-panel-toggle {
    display: none !important;
  }
  .filter-panel {
    transform: none !important;
  }
}

/* Reconnecting banner: over the header, above everything but dialogs */
.conn-banner {
  position: fixed;
  top: clamp(6px, 1vh, 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 110;
  display: flex;
  align-items: center;
  gap: 0.6em;
  max-width: calc(100vw - 24px);
  padding: 0.45em 1.1em;
  border-radius: 999px;
  background: #78350f;
  border: 2px solid #f59e0b;
  color: #fff7ed;
  font-size: clamp(16px, 2.6vh, 30px);
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
}
.conn-banner[hidden] { display: none; }
.conn-dot {
  width: 0.7em;
  height: 0.7em;
  border-radius: 50%;
  background: #f59e0b;
  animation: conn-pulse 1s ease-in-out infinite;
}
@keyframes conn-pulse {
  50% { opacity: 0.25; }
}

/* Host controls auto-hide when the mouse is idle (layout does not move) */
.footer-right {
  transition: opacity 0.3s ease, visibility 0.3s;
}
.shell.controls-hidden .footer-right {
  opacity: 0;
  visibility: hidden;
}
.shell.controls-hidden,
.shell.controls-hidden * {
  cursor: none !important;
}

/* Reset confirm (in-page, replaces window.confirm) */
.confirm-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.confirm-modal[hidden] { display: none; }
.confirm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}
.confirm-panel {
  position: relative;
  z-index: 1;
  width: min(640px, 100%);
  background: var(--surface);
  border: 2px solid #7f1d1d;
  border-radius: 20px;
  padding: clamp(20px, 3vh, 36px) clamp(20px, 2.5vw, 40px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}
.confirm-title {
  font-size: clamp(22px, 3.4vh, 36px);
  font-weight: 800;
  margin-bottom: 0.4em;
}
.confirm-text {
  font-size: clamp(16px, 2.2vh, 24px);
  color: #c3cedc;
  line-height: 1.4;
  margin-bottom: 1.2em;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
.confirm-actions button {
  font-size: clamp(15px, 2vh, 20px);
  padding: 0.6em 1.3em;
}
.confirm-actions .ghost-btn:focus-visible,
.confirm-actions button:focus {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.danger-solid-btn {
  background: #b91c1c;
  color: #fff;
}
.danger-solid-btn:hover { background: #dc2626; }

/* Footer: always one row */
.footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: nowrap;
  gap: 1rem;
  margin: 0;
  padding-top: clamp(6px, 1.1vh, 14px);
  border-top: 1px solid var(--border);
  z-index: 2;
  position: relative;
  min-width: 0;
}

.status-line {
  flex: 1 1 auto;
  min-width: 0;
  font-size: clamp(13px, 1.7vh, 18px);
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer-right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: clamp(6px, 0.8vw, 14px);
}

.font-slider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: clamp(12px, 1.5vh, 15px);
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
}

.font-slider input[type="range"] {
  width: clamp(70px, 7vw, 120px);
  accent-color: var(--accent);
  cursor: pointer;
}

@media (max-width: 1279px) {
  .font-slider-label { display: none; }
}

#next-btn,
.ghost-btn,
#back-btn,
#reset-btn,
#fs-btn {
  font-size: clamp(14px, 1.8vh, 19px);
  padding: 0.55em 1.2em;
  white-space: nowrap;
}

#next-btn {
  background: var(--accent);
  color: #fff;
  min-width: 6.5em;
}
#next-btn:hover:not(:disabled) { background: var(--accent-hover); }

.ghost-btn,
#back-btn,
#reset-btn,
#fs-btn {
  background: transparent;
  color: var(--text);
  border: 2px solid var(--border);
}
.ghost-btn:hover:not(:disabled),
#back-btn:hover:not(:disabled),
#fs-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface);
  color: #fff;
}
.ghost-btn:disabled,
#back-btn:disabled,
#reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.danger-btn,
#reset-btn {
  border-color: #7f1d1d;
  color: #fca5a5;
}
.danger-btn:hover:not(:disabled),
#reset-btn:hover:not(:disabled) {
  border-color: #ef4444;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
}
`;

export const PLAYER_CSS = /* css */ `
${SHARED_CSS}

html, body {
  height: 100%;
  height: 100dvh;
  overflow: hidden;
}

body {
  overscroll-behavior: none;
}

.shell {
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  max-width: 480px;
  margin: 0 auto;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

/* Top bar: one compact line, title left, optional logo right */
.player-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.player-top-left {
  min-width: 0;
  flex: 1;
}

.player-top .brand-logo {
  position: static;
  flex-shrink: 0;
  align-self: center;
  max-height: 22px;
  max-width: min(140px, 42vw);
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/* "Live Training" label: kept for screen readers, hidden to save space */
.brand {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.view { display: none; }
.view.active { display: flex; flex-direction: column; flex: 1; min-height: min-content; }

h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

label {
  display: block;
  font-size: 0.9rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
  font-weight: 600;
}

input[type="text"] {
  width: 100%;
  padding: 0.9rem 1rem;
  font-size: 1.15rem;
  border-radius: var(--radius);
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  margin-bottom: 1rem;
  outline: none;
}
input[type="text"]:focus { border-color: var(--accent); }

.primary {
  background: var(--accent);
  color: #fff;
  font-size: 1.1rem;
  padding: 0.95rem 1.5rem;
  width: 100%;
}
.primary:hover:not(:disabled) { background: var(--accent-hover); }

.error {
  color: var(--incorrect);
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  min-height: 1.25rem;
}

.wait-icon {
  font-size: 3rem;
  margin: 2rem 0 1rem;
  text-align: center;
  opacity: 0.7;
}

.wait-msg {
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.wait-sub {
  text-align: center;
  color: var(--muted);
  font-size: 1rem;
}

.player-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0 0.45rem;
  margin-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.95rem;
}
.player-bar > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-bar .score { flex-shrink: 0; }

/* "Question N of M" with the countdown pill on the right */
.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
  min-height: 2rem;
}

.q-meta {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
}

/* Player countdown: pill with large seconds; amber at 10 s, red at 5 s */
.card .countdown {
  flex-shrink: 0;
  align-self: center;
  min-width: 3.6rem;
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  border: 2px solid var(--correct);
  background: var(--surface);
  color: #fff;
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.card .countdown.warn { border-color: #f59e0b; color: #fde68a; }
.card .countdown.urgent {
  border-color: var(--incorrect);
  background: var(--incorrect-bg);
  color: #fecaca;
}
.card .countdown[hidden] { display: none; }
#fb-countdown { margin-bottom: 0.5rem; }

.time-bar {
  flex-shrink: 0;
  height: 4px;
  margin-bottom: 0.75rem;
  border-radius: 2px;
  background: var(--surface-2);
  overflow: hidden;
}
.time-bar > span {
  display: block;
  height: 100%;
  background: var(--correct);
  transition: width 0.25s linear;
}
.time-bar.warn > span { background: #f59e0b; }
.time-bar.urgent > span { background: var(--incorrect); }
.time-bar[hidden] { display: none; }

.q-text {
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1.35;
  margin-bottom: 1rem;
}

.q-text p { margin: 0 0 0.55em; }
.q-text p:last-child { margin-bottom: 0; }
.q-text ul, .q-text ol { margin: 0 0 0.55em; padding-left: 1.25em; }
.q-text code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.q-text pre {
  margin: 0 0 0.65em;
  padding: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.q-text pre code { background: none; padding: 0; }
.q-text strong { font-weight: 800; }

.choices .choice {
  font-size: 1.05rem;
  padding: 0.85rem 1rem;
}
.choice-letter { font-weight: 800; }
/* Touch screens keep :hover after a tap; it looked like a selected choice */
@media (hover: none) {
  .choice:hover:not(:disabled) {
    border-color: var(--border);
    background: var(--surface);
  }
}

/*
 * Small phones (iPhone SE: 375x667): tighter type and spacing so every
 * question in the bank shows all of its choices without scrolling. The
 * footer note is dropped; it adds nothing during play.
 */
@media (max-height: 760px) {
  .shell {
    padding: 0.5rem 0.75rem;
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
  }
  .player-top { margin-bottom: 0.35rem; }
  .player-bar { font-size: 0.875rem; padding-bottom: 0.3rem; margin-bottom: 0.35rem; }
  .q-head { margin-bottom: 0.25rem; min-height: 1.75rem; }
  .card .countdown { font-size: 1.1rem; line-height: 1.2; }
  .time-bar { margin-bottom: 0.4rem; }
  .q-text {
    font-size: 0.95rem;
    line-height: 1.25;
    margin-bottom: 0.5rem;
  }
  .q-text p { margin-bottom: 0.3em; }
  .choices .choice {
    font-size: 0.875rem;
    line-height: 1.22;
    padding: 0.35rem 0.6rem;
    margin-bottom: 0.3rem;
    border-width: 1.5px;
  }
  .footer-note { display: none; }
}

.feedback {
  text-align: center;
  padding: 1.5rem 0;
}
.feedback .big {
  font-size: 1.75rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}
.feedback.ok .big { color: var(--correct); }
.feedback.bad .big { color: var(--incorrect); }

/* Reconnecting banner and answer errors: above the scrolling card */
.conn-banner {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-shrink: 0;
  margin-bottom: 0.6rem;
  padding: 0.55rem 0.85rem;
  border-radius: 10px;
  background: #78350f;
  border: 2px solid #f59e0b;
  color: #fff7ed;
  font-size: 0.95rem;
  font-weight: 700;
}
.conn-banner[hidden] { display: none; }
.conn-dot {
  flex-shrink: 0;
  width: 0.7em;
  height: 0.7em;
  border-radius: 50%;
  background: #f59e0b;
  animation: conn-pulse 1s ease-in-out infinite;
}
@keyframes conn-pulse {
  50% { opacity: 0.25; }
}
.top-error {
  flex-shrink: 0;
  min-height: 0;
  margin-bottom: 0.6rem;
  padding: 0.5rem 0.85rem;
  border-radius: 10px;
  background: var(--incorrect-bg);
  border: 1px solid var(--incorrect);
  color: #fecaca;
  font-weight: 600;
}
.top-error:empty { display: none; }

.footer-note {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted);
  flex-shrink: 0;
}
`;
