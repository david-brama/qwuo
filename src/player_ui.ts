import { PLAYER_CSS } from "./styles.ts";
import {
  markedBundleScript,
  purifyBundleScript,
  MD_RENDER_JS,
} from "./markdown.ts";

export function playerHtml(logoHtml = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Join Quiz</title>
  <style>${PLAYER_CSS}</style>
</head>
<body>
  <div class="shell${logoHtml ? " has-logo" : ""}">
    <div class="player-top">
      <div class="player-top-left">
        <div class="brand">Live Training</div>
        <div class="title" id="quiz-title">…</div>
      </div>
      ${logoHtml}
    </div>

    <!-- Outside the scrolling card, so it is seen without scrolling -->
    <div id="conn-banner" class="conn-banner" role="alert" hidden>
      <span class="conn-dot" aria-hidden="true"></span>
      <span id="conn-text">Connection lost · reconnecting…</span>
    </div>
    <div class="error top-error" id="answer-error" role="alert"></div>

    <div class="card">
      <!-- JOIN -->
      <div class="view active" id="view-join">
        <h2>Join session</h2>
        <label for="name">Display name</label>
        <input type="text" id="name" maxlength="40" autocomplete="nickname" placeholder="Your name" />
        <div class="error" id="join-error"></div>
        <button type="button" class="primary" id="join-btn">Join</button>
      </div>

      <!-- WAIT / LOBBY -->
      <div class="view" id="view-wait">
        <div class="player-bar">
          <span id="wait-name"></span>
          <span class="score">Score: <span id="wait-score">0</span></span>
        </div>
        <div class="wait-icon">◎</div>
        <div class="wait-msg" id="wait-msg">Waiting for host…</div>
        <div class="wait-sub" id="wait-sub">Keep this page open</div>
      </div>

      <!-- QUESTION -->
      <div class="view" id="view-question">
        <div class="player-bar">
          <span id="q-name"></span>
          <span class="score">Score: <span id="q-score">0</span></span>
        </div>
        <div class="q-head">
          <div class="q-meta" id="q-meta"></div>
          <div class="countdown" id="q-countdown" hidden aria-live="polite" aria-atomic="true"></div>
        </div>
        <div class="time-bar" id="q-timebar" hidden><span></span></div>
        <div class="q-text" id="q-text"></div>
        <div class="choices" id="q-choices"></div>
      </div>

      <!-- FEEDBACK -->
      <div class="view" id="view-feedback">
        <div class="player-bar">
          <span id="fb-name"></span>
          <span class="score">Score: <span id="fb-score">0</span></span>
        </div>
        <div class="countdown" id="fb-countdown" hidden aria-live="polite" aria-atomic="true"></div>
        <div class="feedback" id="fb-box">
          <div class="big" id="fb-big"></div>
          <div class="muted" id="fb-detail"></div>
        </div>
        <div class="wait-sub" id="fb-sub" style="margin-top:1.5rem">Waiting for host to continue…</div>
      </div>
    </div>

    <div class="footer-note">No account needed · answers locked after submit</div>
  </div>
  <script>${markedBundleScript()}</script>
  <script>${purifyBundleScript()}</script>
  <script>
    ${MD_RENDER_JS}
    const STORAGE_KEY = "ltq_participant_id";
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    // Derive /s/{uuid} from current path so APIs stay session-scoped
    const SESSION_BASE = (function () {
      const m = location.pathname.match(/^\\/s\\/[^/]+/);
      return m ? m[0] : "";
    })();

    let participantId = localStorage.getItem(STORAGE_KEY) || null;
    let participantName = "";
    let score = 0;
    let state = null;
    let lastFeedback = null; // { choiceIndex, questionIndex } until the next poll
    let answering = false;
    let renderedQuestionKey = null; // question whose buttons are on screen
    let countdownTickTimer = null;

    const views = {
      join: document.getElementById("view-join"),
      wait: document.getElementById("view-wait"),
      question: document.getElementById("view-question"),
      feedback: document.getElementById("view-feedback"),
    };

    function show(name) {
      for (const [k, el] of Object.entries(views)) {
        el.classList.toggle("active", k === name);
      }
      if (name !== "question") document.getElementById("answer-error").textContent = "";
    }

    async function fetchWithTimeout(url, init, ms) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), ms);
      try {
        return await fetch(url, { ...init, signal: ctl.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    // Reconnecting banner: shown after CONN_FAILS_TO_WARN failed polls in a
    // row (~2 s at the 1 s poll) or at once when an answer cannot be sent;
    // cleared by the next good response
    const CONN_FAILS_TO_WARN = 2;
    const connBanner = document.getElementById("conn-banner");
    const connText = document.getElementById("conn-text");
    let connFails = 0;

    function noteConnection(ok) {
      if (ok) {
        connFails = 0;
        connBanner.hidden = true;
        return;
      }
      connFails += 1;
      if (connFails >= CONN_FAILS_TO_WARN) {
        connText.textContent = "Connection lost · reconnecting…";
        connBanner.hidden = false;
      }
    }

    function showOffline(message) {
      connFails = Math.max(connFails, CONN_FAILS_TO_WARN);
      connText.textContent = message;
      connBanner.hidden = false;
    }

    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function setNames() {
      for (const id of ["wait-name", "q-name", "fb-name"]) {
        document.getElementById(id).textContent = participantName || "";
      }
      for (const id of ["wait-score", "q-score", "fb-score"]) {
        document.getElementById(id).textContent = String(score);
      }
    }

    function remainingSeconds(deadlineMs) {
      return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    }

    function paintCountdownEls() {
      const c = state && state.phase === "QUESTION" ? state.countdown : null;
      for (const id of ["q-countdown", "fb-countdown"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (!c || c.deadlineMs == null) {
          el.hidden = true;
          el.textContent = "";
          el.classList.remove("warn", "urgent");
          continue;
        }
        const sec = remainingSeconds(c.deadlineMs);
        el.hidden = false;
        el.textContent = sec + "s";
        // Amber at 10 s, red at 5 s (as on the projector)
        el.classList.toggle("warn", sec <= 10 && sec > 5);
        el.classList.toggle("urgent", sec <= 5);
        el.setAttribute("aria-label", sec + " seconds remaining");
      }
      const bar = document.getElementById("q-timebar");
      bar.hidden = !c || c.deadlineMs == null || !c.totalSeconds;
      if (!bar.hidden) {
        const left = Math.max(0, (c.deadlineMs - Date.now()) / 1000);
        const sec = Math.ceil(left);
        bar.firstElementChild.style.width =
          Math.min(100, (100 * left) / c.totalSeconds).toFixed(1) + "%";
        bar.classList.toggle("warn", sec <= 10 && sec > 5);
        bar.classList.toggle("urgent", sec <= 5);
      }
    }

    function syncCountdownTick() {
      const active = state && state.phase === "QUESTION" && state.countdown &&
        state.countdown.deadlineMs != null;
      if (active && countdownTickTimer === null) {
        countdownTickTimer = setInterval(paintCountdownEls, 250);
      } else if (!active && countdownTickTimer !== null) {
        clearInterval(countdownTickTimer);
        countdownTickTimer = null;
      }
      paintCountdownEls();
    }

    async function fetchState() {
      const url = participantId
        ? SESSION_BASE + "/api/state?id=" + encodeURIComponent(participantId)
        : SESSION_BASE + "/api/state";
      let next;
      try {
        const res = await fetchWithTimeout(url, {}, 4000);
        if (!res.ok) throw new Error("state failed");
        next = await res.json();
      } catch (e) {
        noteConnection(false);
        throw e;
      }
      noteConnection(true);
      state = next;
      document.getElementById("quiz-title").textContent = state.title || "Quiz";

      if (state.participant) {
        participantName = state.participant.name;
        score = state.participant.score;
        if (!participantId) {
          participantId = state.participant.id;
          localStorage.setItem(STORAGE_KEY, participantId);
        }
      } else if (participantId) {
        // stale id (reset / new session / missing from snapshot)
        localStorage.removeItem(STORAGE_KEY);
        participantId = null;
        participantName = "";
        score = 0;
        lastFeedback = null;
      }

      setNames();
      render();
    }

    function render() {
      if (!state) return;
      syncCountdownTick();

      if (!participantId || !state.participant) {
        show("join");
        return;
      }

      const phase = state.phase;
      // Feedback from the answer response covers the gap until the next poll
      if (lastFeedback && lastFeedback.questionIndex !== state.questionIndex) {
        lastFeedback = null;
      }
      if (phase === "LOBBY" || phase === "END") lastFeedback = null;
      const answered = state.participant.answered || !!lastFeedback;
      const revealed = revealedNow();

      if (phase === "QUESTION" && state.answersLocked && !answered) {
        show("wait");
        document.getElementById("wait-msg").textContent = "Answers closed";
        document.getElementById("wait-sub").textContent =
          "The host is reviewing this question · score " + score;
        return;
      }

      if (phase === "QUESTION" && !answered) {
        show("question");
        const box = document.getElementById("q-choices");
        // Rebuild only for a new question: replacing the buttons on every
        // poll drops a press that is still held down when the poll lands
        const key = JSON.stringify([
          state.questionIndex, state.question.text, state.question.choices,
        ]);
        if (key !== renderedQuestionKey) {
          renderedQuestionKey = key;
          document.getElementById("q-meta").textContent =
            "Question " + (state.questionIndex + 1) + " of " + state.questionCount;
          document.getElementById("q-text").innerHTML = md(state.question.text);
          box.innerHTML = state.question.choices.map((c, i) =>
            \`<button type="button" class="choice" data-i="\${i}">
              <span class="choice-letter">\${LETTERS[i] || i + 1}: </span>\${esc(c)}
            </button>\`
          ).join("");
          document.getElementById("answer-error").textContent = "";
          box.querySelectorAll(".choice").forEach((btn) => {
            btn.addEventListener("click", () => submitAnswer(Number(btn.dataset.i)));
          });
        }
        box.querySelectorAll(".choice").forEach((btn) => {
          btn.disabled = answering;
        });
        return;
      }

      const reviewing = phase === "CORRECT" || phase === "EXPLAIN" || phase === "LEADERBOARD";
      if ((answered && (phase === "QUESTION" || revealed)) || (reviewing && revealed)) {
        show("feedback");
        paintFeedback();
        return;
      }

      show("wait");
      const msg = document.getElementById("wait-msg");
      const sub = document.getElementById("wait-sub");
      if (phase === "LOBBY") {
        msg.textContent = "You're in!";
        sub.textContent = "Waiting for the host to start…";
      } else if (phase === "END") {
        msg.textContent = "Session complete";
        sub.textContent = "Final score: " + score;
      } else if (reviewing) {
        msg.textContent = "Hang tight";
        sub.textContent = "Host is reviewing · score " + score;
      } else {
        msg.textContent = "Waiting for host…";
        sub.textContent = "Keep this page open";
      }
    }

    function paintFeedback() {
      const box = document.getElementById("fb-box");
      const big = document.getElementById("fb-big");
      const detail = document.getElementById("fb-detail");
      const q = state.question;
      const mine = state.participant ? state.participant.choiceIndex : null;
      if (q && q.correctIndex != null && mine != null) {
        // Revealed: the server's record, so it survives a reload
        const ok = mine === q.correctIndex;
        box.className = "feedback " + (ok ? "ok" : "bad");
        big.textContent = ok ? "Correct" : "Incorrect";
        detail.textContent = ok
          ? "Score: " + score
          : correctAnswerLine(q);
      } else if (q && q.correctIndex != null && !lastFeedback) {
        // Revealed, no answer from this player
        box.className = "feedback missed";
        big.textContent = "You didn't answer";
        detail.textContent = correctAnswerLine(q);
      } else {
        // Still open: no hint of the result until the answer is revealed
        const pick = mine != null ? mine : (lastFeedback ? lastFeedback.choiceIndex : null);
        box.className = "feedback";
        big.textContent = "Answer locked in";
        detail.textContent = q && pick != null
          ? "You picked " + (LETTERS[pick] || String(pick + 1)) + ". " + (q.choices[pick] || "")
          : "";
      }
      document.getElementById("fb-sub").textContent = revealedNow()
        ? "Waiting for host to continue…"
        : "Your result appears when the answer is revealed";
    }

    function correctAnswerLine(q) {
      return "Correct answer: " + (LETTERS[q.correctIndex] || String(q.correctIndex + 1)) +
        ". " + (q.choices[q.correctIndex] || "");
    }

    function revealedNow() {
      return !!(state && state.question && state.question.correctIndex != null);
    }

    async function submitAnswer(choiceIndex) {
      if (answering || !participantId) return;
      answering = true;
      document.getElementById("answer-error").textContent = "";
      try {
        let res;
        try {
          res = await fetchWithTimeout(SESSION_BASE + "/api/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: participantId, choiceIndex }),
          }, 8000);
        } catch {
          showOffline("No connection · answer not sent");
          document.getElementById("answer-error").textContent =
            "Your answer was not sent. Check your connection and tap again.";
          return;
        }
        noteConnection(true);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          document.getElementById("answer-error").textContent =
            data.error || "Could not submit answer";
          answering = false;
          return;
        }
        lastFeedback = {
          choiceIndex,
          questionIndex: state.questionIndex,
        };
        score = data.score;
        setNames();
        show("feedback");
        paintFeedback();
      } catch (e) {
        document.getElementById("answer-error").textContent = e.message || "Network error";
      } finally {
        answering = false;
      }
    }

    document.getElementById("join-btn").addEventListener("click", async () => {
      const name = document.getElementById("name").value;
      const err = document.getElementById("join-error");
      err.textContent = "";
      if (!name.trim()) {
        err.textContent = "Enter a name";
        return;
      }
      try {
        const res = await fetch(SESSION_BASE + "/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          err.textContent = data.error || "Join failed";
          return;
        }
        participantId = data.id;
        participantName = data.name;
        score = 0;
        localStorage.setItem(STORAGE_KEY, participantId);
        setNames();
        await fetchState();
      } catch (e) {
        err.textContent = e.message || "Network error";
      }
    });

    document.getElementById("name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("join-btn").click();
    });

    fetchState().catch((e) => {
      document.getElementById("join-error").textContent = e.message;
    });
    setInterval(() => {
      fetchState().catch(() => {});
    }, 1000);
  </script>
</body>
</html>`;
}
