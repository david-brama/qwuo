import { PROJECTOR_CSS } from "./styles.ts";
import {
  markedBundleScript,
  purifyBundleScript,
  MD_RENDER_JS,
} from "./markdown.ts";

export function projectorHtml(joinUrl: string, qrSvgMarkup: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Training Quiz — Projector</title>
  <style>${PROJECTOR_CSS}</style>
</head>
<body>
  <div class="shell">
    <div id="qr-small" class="qr-small" hidden title="Show join QR" role="button" tabindex="0">${qrSvgMarkup}</div>
    <div id="qr-modal" class="qr-modal" hidden>
      <div class="qr-modal-backdrop" data-close></div>
      <div class="qr-modal-panel" role="dialog" aria-label="Join QR code">
        <button type="button" class="qr-modal-close" data-close aria-label="Close">×</button>
        <div class="lobby-sub">Scan to join on your phone</div>
        <div class="qr-large">${qrSvgMarkup}</div>
        <div class="join-url">${joinUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</div>
      </div>
    </div>
    <div class="header">
      <div>
        <div class="phase-label" id="phase-label">LOBBY</div>
        <h1 id="quiz-title">Loading…</h1>
      </div>
    </div>
    <div class="main" id="main"></div>
    <div class="footer">
      <div class="status-line" id="status"></div>
      <div class="footer-right">
        <label class="font-slider" title="Question text size">
          Text size
          <input type="range" id="font-scale" min="0.7" max="1.6" step="0.05" value="1" />
        </label>
        <button type="button" id="back-btn" class="ghost-btn" disabled>Back</button>
        <button type="button" id="next-btn">Next</button>
      </div>
    </div>
  </div>
  <script>${markedBundleScript()}</script>
  <script>${purifyBundleScript()}</script>
  <script>
    ${MD_RENDER_JS}
    const JOIN_URL = ${JSON.stringify(joinUrl)};
    const QR_SVG = ${JSON.stringify(qrSvgMarkup)};
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    // Derive /s/{uuid} from current path so APIs stay session-scoped
    const SESSION_BASE = (function () {
      const m = location.pathname.match(/^\\/s\\/[^/]+/);
      return m ? m[0] : "";
    })();

    const main = document.getElementById("main");
    const phaseLabel = document.getElementById("phase-label");
    const quizTitle = document.getElementById("quiz-title");
    const statusEl = document.getElementById("status");
    const backBtn = document.getElementById("back-btn");
    const nextBtn = document.getElementById("next-btn");
    const qrSmall = document.getElementById("qr-small");
    const qrModal = document.getElementById("qr-modal");
    const fontScale = document.getElementById("font-scale");

    let state = null;
    let navBusy = false;

    function openQrModal() {
      qrModal.hidden = false;
    }

    function closeQrModal() {
      qrModal.hidden = true;
    }

    qrSmall.addEventListener("click", openQrModal);
    qrSmall.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openQrModal();
      }
    });
    qrModal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeQrModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !qrModal.hidden) closeQrModal();
    });

    function applyFontScale(v) {
      const n = Math.min(1.6, Math.max(0.7, Number(v) || 1));
      main.style.setProperty("--q-scale", String(n));
      fontScale.value = String(n);
      try { localStorage.setItem("projector-q-scale", String(n)); } catch (_) {}
    }

    try {
      const saved = localStorage.getItem("projector-q-scale");
      if (saved != null) applyFontScale(saved);
    } catch (_) {}

    fontScale.addEventListener("input", () => applyFontScale(fontScale.value));

    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderChoices(choices, highlightIndex) {
      return choices.map((c, i) => {
        const cls = highlightIndex === i ? "choice highlight" : "choice";
        return \`<div class="\${cls}"><span class="choice-letter">\${LETTERS[i] || i + 1}</span>\${esc(c)}</div>\`;
      }).join("");
    }

    /** Humanize metadata keys for display (use-case → Use case). */
    function formatMetaLabel(key) {
      return String(key)
        .replace(/[-_]+/g, " ")
        .replace(/\\b\\w/g, (c) => c.toUpperCase());
    }

    /**
     * Fixed left rail — outside the question column so it never gets clipped
     * by overflow or squeezed by long question text.
     */
    function renderSlideMetadata(entries) {
      if (!entries || !entries.length) return "";
      const cards = entries.map((e) =>
        \`<div class="slide-meta-card">
          <div class="slide-meta-key">\${esc(formatMetaLabel(e.key))}</div>
          <div class="slide-meta-value">\${esc(e.value)}</div>
        </div>\`
      ).join("");
      return \`<aside class="slide-meta-rail" aria-label="Question metadata">\${cards}</aside>\`;
    }

    function updateNavButtons() {
      if (!state) {
        backBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }
      if (navBusy) return;
      backBtn.disabled = !state.canGoBack;
      nextBtn.disabled = state.phase === "END";
      nextBtn.textContent = state.phase === "END" ? "Done" : "Next";
    }

    function render() {
      if (!state) return;
      quizTitle.textContent = state.title;
      phaseLabel.textContent = state.phase;
      updateNavButtons();

      const isLobby = state.phase === "LOBBY";
      qrSmall.hidden = isLobby;
      if (isLobby) closeQrModal();

      const q = state.question;
      const metaHtml = (state.phase === "QUESTION" || state.phase === "CORRECT" ||
        state.phase === "EXPLAIN" || state.phase === "LEADERBOARD")
        ? renderSlideMetadata(q && q.slideMetadata)
        : "";
      const hasMeta = !!metaHtml;
      main.className = isLobby
        ? "main lobby-main"
        : (hasMeta ? "main has-meta-rail" : "main");

      statusEl.textContent = state.phase === "END"
        ? "Session complete"
        : \`\${state.participantCount} joined · Q\${state.phase === "LOBBY" ? "—" : state.questionIndex + 1}/\${state.questionCount}\`;

      if (state.phase === "LOBBY") {
        main.innerHTML = \`
          <div class="lobby-title">\${esc(state.title)}</div>
          <div class="lobby-sub">Scan to join on your phone</div>
          <div class="qr-large">\${QR_SVG}</div>
          <div class="join-url">\${esc(JOIN_URL)}</div>
          <div class="participant-count"><span class="score">\${state.participantCount}</span> participant\${state.participantCount === 1 ? "" : "s"} waiting</div>
        \`;
        return;
      }

      if (state.phase === "QUESTION" || state.phase === "CORRECT") {
        const hi = state.phase === "CORRECT" ? q.correct : -1;
        main.innerHTML = \`
          \${metaHtml}
          <div class="slide-content">
            <div class="q-progress">Question \${state.questionIndex + 1} of \${state.questionCount}</div>
            <div class="q-text">\${md(q.text)}</div>
            <div class="choices">\${renderChoices(q.choices, hi)}</div>
          </div>
        \`;
        return;
      }

      if (state.phase === "EXPLAIN") {
        main.innerHTML = \`
          \${metaHtml}
          <div class="slide-content">
            <div class="q-progress">Explanation · Q\${state.questionIndex + 1}</div>
            <div class="explain-box">\${md(q.explain || "No explanation")}</div>
          </div>
        \`;
        return;
      }

      if (state.phase === "LEADERBOARD") {
        const rows = state.leaderboard.map((e) => \`
          <div class="lb-row \${e.rank <= 3 ? "top3" : ""}">
            <div class="lb-rank">#\${e.rank}</div>
            <div class="lb-name">\${esc(e.name)}</div>
            <div class="lb-score">\${e.score}</div>
          </div>
        \`).join("") || \`<p class="muted">No participants yet</p>\`;
        main.innerHTML = \`
          \${metaHtml}
          <div class="slide-content">
            <div class="q-progress">Leaderboard · after Q\${state.questionIndex + 1}</div>
            <div class="leaderboard">\${rows}</div>
          </div>
        \`;
        return;
      }

      if (state.phase === "END") {
        const rows = state.leaderboard.slice(0, 10).map((e) => \`
          <div class="lb-row \${e.rank <= 3 ? "top3" : ""}">
            <div class="lb-rank">#\${e.rank}</div>
            <div class="lb-name">\${esc(e.name)}</div>
            <div class="lb-score">\${e.score}</div>
          </div>
        \`).join("");
        main.innerHTML = \`
          <div class="slide-content">
            <div class="end-title">Session complete</div>
            <p class="muted" style="margin-bottom:1.5rem;font-size:1.25rem">Final standings</p>
            <div class="leaderboard">\${rows}</div>
          </div>
        \`;
      }
    }

    async function fetchState() {
      const res = await fetch(SESSION_BASE + "/api/state");
      if (!res.ok) throw new Error("state failed");
      state = await res.json();
      render();
    }

    async function postNav(path) {
      if (navBusy) return;
      navBusy = true;
      backBtn.disabled = true;
      nextBtn.disabled = true;
      try {
        const res = await fetch(SESSION_BASE + path, { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(err);
        } else {
          state = await res.json();
          render();
        }
      } finally {
        navBusy = false;
        updateNavButtons();
      }
    }

    backBtn.addEventListener("click", () => postNav("/api/back"));
    nextBtn.addEventListener("click", () => postNav("/api/advance"));

    fetchState().catch((e) => {
      main.innerHTML = \`<p class="muted">Failed to load: \${esc(e.message)}</p>\`;
    });

    // light poll so join count updates in lobby
    setInterval(() => {
      if (!navBusy) fetchState().catch(() => {});
    }, 1500);
  </script>
</body>
</html>`;
}
