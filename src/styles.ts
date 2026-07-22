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

/* Full-viewport frame — nothing scrolls at the document level */
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
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 2.5rem 1.25rem;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

/* Overlays (logo, QR, filters) — never participate in the column flex */
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
/* Modal / fixed panels manage their own hit-testing */
.chrome .qr-modal[hidden],
.chrome .filter-panel[hidden],
.chrome .filter-panel-toggle[hidden],
.chrome .qr-small[hidden] {
  pointer-events: none;
}

.header {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding-bottom: 1rem;
  margin: 0;
  z-index: 2;
  background: var(--bg);
  position: relative;
}

.header h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.phase-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
  font-weight: 700;
}

/* QUESTION countdown (server deadline; whole seconds) */
.countdown {
  flex: 0 0 auto;
  min-width: 3.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--text);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  border: 2px solid var(--border);
  background: var(--surface);
}

.countdown.urgent {
  color: var(--incorrect);
  border-color: var(--incorrect);
  outline: 2px solid transparent;
}

.countdown[hidden] {
  display: none !important;
}

/* Optional gitignored logo.png — top-right branding */
.brand-logo {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  max-height: 36px;
  max-width: min(220px, 28vw);
  width: auto;
  height: auto;
  object-fit: contain;
  z-index: 11;
  pointer-events: none;
  user-select: none;
}

/* When logo is present, keep compact QR below it */
.shell.has-logo .qr-small {
  top: 4.25rem;
}

.qr-small {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  width: 88px;
  height: 88px;
  background: #fff;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  z-index: 10;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.qr-small:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 20px rgba(0,0,0,0.45);
}
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
  max-width: min(480px, 100%);
  width: 100%;
}
.qr-modal-panel .qr-large {
  width: min(360px, 70vw);
  height: min(360px, 70vw);
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

/* Middle pane — only region that scrolls / clips content */
.main {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: safe center;
  align-self: stretch;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  padding-right: 100px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  position: relative;
  z-index: 1;
  --q-scale: 1;
}

.main.lobby-main {
  padding-right: 0;
  align-items: center;
  text-align: center;
}

/* Leaderboard / end standings: fill middle pane, clip list with fade */
.main.lb-main {
  justify-content: flex-start;
  overflow: hidden;
  max-width: none;
}

.slide-content.lb-slide {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  width: 100%;
  max-width: 700px;
  margin: 0 auto;
}

/* Room for fixed left metadata rail + keep question readable */
.main.has-meta-rail {
  max-width: none;
  padding-left: clamp(280px, 26vw, 360px);
  padding-right: 100px;
}

.slide-content {
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

.lobby-title {
  font-size: 2.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.lobby-sub {
  font-size: 1.35rem;
  color: var(--muted);
  margin-bottom: 2rem;
}

.qr-large {
  width: min(340px, 55vw);
  height: min(340px, 55vw);
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
  margin-bottom: 1.25rem;
}
.qr-large svg { display: block; width: 100%; height: 100%; }

.join-url {
  font-size: 1.15rem;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: var(--text);
  background: var(--surface);
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  word-break: break-all;
  max-width: 90%;
}

.participant-count {
  margin-top: 1.25rem;
  font-size: 1.25rem;
  color: var(--muted);
}

.q-progress {
  font-size: 1rem;
  color: var(--muted);
  margin-bottom: 0.75rem;
  font-weight: 600;
}

/* Fixed left rail — always on-screen, not clipped by main scroll */
.slide-meta-rail {
  position: fixed;
  left: 1.5rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 8;
  width: clamp(240px, 22vw, 320px);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  pointer-events: none;
}

.slide-meta-card {
  pointer-events: auto;
  background: #1e2a3d;
  border: 1px solid #4b7fd4;
  border-left: 5px solid #60a5fa;
  border-radius: 16px;
  padding: 1.1rem 1.2rem 1.15rem;
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(96, 165, 250, 0.12);
}

.slide-meta-key {
  display: block;
  color: #93c5fd;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.45rem;
  line-height: 1.2;
}

.slide-meta-value {
  display: block;
  color: #f8fafc;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  word-break: break-word;
}

@media (max-width: 960px) {
  .main.has-meta-rail {
    padding-left: 0;
    padding-right: 100px;
  }
  .slide-meta-rail {
    position: static;
    transform: none;
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    pointer-events: auto;
  }
  .slide-meta-card {
    flex: 1 1 200px;
  }
}

/* Right-side runtime filter panel (host projector) */
.shell.has-filter-panel {
  padding-right: clamp(280px, 24vw, 340px);
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

/* Leave room for fixed QR / logo when filter panel is open */
.shell.has-filter-panel .qr-small,
.shell.has-filter-panel .brand-logo {
  right: calc(clamp(260px, 22vw, 320px) + 1rem);
}

.main.has-filter-panel {
  padding-right: 1.5rem;
}

@media (max-width: 1100px) {
  .shell.has-filter-panel {
    padding-right: 2.5rem;
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
  .shell.has-filter-panel .qr-small,
  .shell.has-filter-panel .brand-logo {
    right: 1.25rem;
  }
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

.q-text {
  font-size: calc(clamp(1.2rem, 2.2vw, 1.75rem) * var(--q-scale, 1));
  font-weight: 600;
  line-height: 1.35;
  margin-bottom: 1.25rem;
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
  gap: 0.65rem;
  grid-template-columns: 1fr;
}

.choices .choice {
  font-size: calc(clamp(0.95rem, 1.4vw, 1.2rem) * var(--q-scale, 1));
  padding: 0.85rem 1.15rem;
  cursor: default;
}
.choices .choice:hover { border-color: var(--border); background: var(--surface); }

.choice-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: var(--surface-2);
  margin-right: 0.85rem;
  font-weight: 700;
  font-size: 1rem;
  color: var(--muted);
  flex-shrink: 0;
}
.choice.highlight .choice-letter {
  background: var(--correct);
  color: #fff;
}

.explain-box {
  font-size: calc(clamp(1.05rem, 1.8vw, 1.45rem) * var(--q-scale, 1));
  line-height: 1.5;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 900px;
}

.leaderboard {
  width: 100%;
  max-width: 700px;
}

/* Trim long standings: hide overflow with a long soft fade at the bottom */
.lb-slide .leaderboard {
  flex: 1 1 auto;
  min-height: 0;
  max-width: none;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 58%,
    rgba(0, 0, 0, 0.55) 78%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 58%,
    rgba(0, 0, 0, 0.55) 78%,
    transparent 100%
  );
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 0.6rem;
  font-size: 1.35rem;
}
.lb-row:last-child { margin-bottom: 0; }
.lb-row.top3 { border-color: var(--accent); }
.lb-rank {
  width: 2.5rem;
  font-weight: 800;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.lb-name { flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-score { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--accent); flex-shrink: 0; }

.end-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.lb-end-sub {
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.lb-slide .q-progress {
  flex-shrink: 0;
}

.footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  z-index: 2;
  background: var(--bg);
  position: relative;
}

.footer-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem 1.25rem;
}

.font-slider {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
}

.font-slider input[type="range"] {
  width: 110px;
  accent-color: var(--accent);
  cursor: pointer;
}

#next-btn {
  background: var(--accent);
  color: #fff;
  font-size: 1.15rem;
  padding: 0.85rem 2.25rem;
  min-width: 140px;
}
#next-btn:hover:not(:disabled) { background: var(--accent-hover); }

.ghost-btn,
#back-btn,
#reset-btn,
#fs-btn {
  background: transparent;
  color: var(--text);
  border: 2px solid var(--border);
  font-size: 1.15rem;
  padding: 0.85rem 1.75rem;
  min-width: 120px;
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

.status-line {
  font-size: 0.95rem;
  color: var(--muted);
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

/* Top bar: brand/title left, optional logo top-right */
.player-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.player-top-left {
  min-width: 0;
  flex: 1;
}

.player-top .brand-logo {
  position: static;
  flex-shrink: 0;
  align-self: flex-start;
  max-height: 32px;
  max-width: min(140px, 42vw);
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.brand {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 0;
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
  padding: 0.75rem 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.95rem;
}

.q-meta {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

/* Player QUESTION countdown */
.card .countdown {
  display: inline-block;
  min-width: 2.75rem;
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  padding: 0.25rem 0.65rem;
}

.q-text {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.35;
  margin-bottom: 1.25rem;
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
  padding: 1rem;
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

.footer-note {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted);
  flex-shrink: 0;
}
`;
