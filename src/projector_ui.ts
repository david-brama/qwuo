import { PROJECTOR_CSS } from "./styles.ts";

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
    <div id="qr-small" class="qr-small" hidden>${qrSvgMarkup}</div>
    <div class="header">
      <div>
        <div class="phase-label" id="phase-label">LOBBY</div>
        <h1 id="quiz-title">Loading…</h1>
      </div>
    </div>
    <div class="main" id="main"></div>
    <div class="footer">
      <div class="status-line" id="status"></div>
      <button type="button" id="next-btn">Next</button>
    </div>
  </div>
  <script>
    const JOIN_URL = ${JSON.stringify(joinUrl)};
    const QR_SVG = ${JSON.stringify(qrSvgMarkup)};
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const main = document.getElementById("main");
    const phaseLabel = document.getElementById("phase-label");
    const quizTitle = document.getElementById("quiz-title");
    const statusEl = document.getElementById("status");
    const nextBtn = document.getElementById("next-btn");
    const qrSmall = document.getElementById("qr-small");

    let state = null;

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

    function render() {
      if (!state) return;
      quizTitle.textContent = state.title;
      phaseLabel.textContent = state.phase;
      nextBtn.disabled = state.phase === "END";
      nextBtn.textContent = state.phase === "END" ? "Done" : "Next";

      const isLobby = state.phase === "LOBBY";
      qrSmall.hidden = isLobby;
      main.className = isLobby ? "main lobby-main" : "main";

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
        const q = state.question;
        const hi = state.phase === "CORRECT" ? q.correct : -1;
        main.innerHTML = \`
          <div class="q-progress">Question \${state.questionIndex + 1} of \${state.questionCount}</div>
          <div class="q-text">\${esc(q.text)}</div>
          <div class="choices">\${renderChoices(q.choices, hi)}</div>
        \`;
        return;
      }

      if (state.phase === "EXPLAIN") {
        const q = state.question;
        main.innerHTML = \`
          <div class="q-progress">Explanation · Q\${state.questionIndex + 1}</div>
          <div class="explain-box">\${esc(q.explain || "No explanation")}</div>
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
          <div class="q-progress">Leaderboard · after Q\${state.questionIndex + 1}</div>
          <div class="leaderboard">\${rows}</div>
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
          <div class="end-title">Session complete</div>
          <p class="muted" style="margin-bottom:1.5rem;font-size:1.25rem">Final standings</p>
          <div class="leaderboard">\${rows}</div>
        \`;
      }
    }

    async function fetchState() {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("state failed");
      state = await res.json();
      render();
    }

    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      try {
        const res = await fetch("/api/advance", { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(err);
        } else {
          state = await res.json();
          render();
        }
      } finally {
        if (state && state.phase !== "END") nextBtn.disabled = false;
      }
    });

    fetchState().catch((e) => {
      main.innerHTML = \`<p class="muted">Failed to load: \${esc(e.message)}</p>\`;
    });

    // light poll so join count updates in lobby
    setInterval(() => {
      fetchState().catch(() => {});
    }, 1500);
  </script>
</body>
</html>`;
}
