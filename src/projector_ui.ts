import { PROJECTOR_CSS } from "./styles.ts";
import {
  markedBundleScript,
  purifyBundleScript,
  MD_RENDER_JS,
} from "./markdown.ts";

export function projectorHtml(
  joinUrl: string,
  qrSvgMarkup: string,
  logoHtml = "",
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Training Quiz — Projector</title>
  <style>${PROJECTOR_CSS}</style>
</head>
<body>
  <div class="shell${logoHtml ? " has-logo" : ""}" id="shell">
    <!-- Fixed/absolute chrome — out of flex flow -->
    <div class="chrome" aria-hidden="false">
      <div id="qr-modal" class="qr-modal" hidden>
        <div class="qr-modal-backdrop" data-close></div>
        <div class="qr-modal-panel" role="dialog" aria-label="Join QR code">
          <button type="button" class="qr-modal-close" data-close aria-label="Close">×</button>
          <div class="lobby-sub">Scan to join on your phone</div>
          <div class="qr-large">${qrSvgMarkup}</div>
          <div class="join-url">${joinUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</div>
        </div>
      </div>
      <button type="button" class="filter-panel-toggle" id="filter-toggle" hidden aria-expanded="false" aria-controls="filter-panel">Filter</button>
      <aside class="filter-panel" id="filter-panel" hidden aria-label="Question filters">
        <div class="filter-panel-header">
          <div class="filter-panel-title">Filters</div>
          <div class="filter-panel-count" id="filter-count">—</div>
        </div>
        <div class="filter-panel-hint" id="filter-hint">One value per field · combined as intersection</div>
        <div class="filter-panel-body" id="filter-body">
          <div class="filter-panel-empty">Loading filters…</div>
        </div>
        <div class="filter-panel-actions">
          <button type="button" class="filter-clear-btn" id="filter-clear">Clear</button>
          <button type="button" class="filter-apply-btn" id="filter-apply">Apply</button>
        </div>
        <div class="filter-panel-error" id="filter-error" hidden></div>
      </aside>
    </div>

    <!-- Viewport flex column: header | main | footer -->
    <header class="header" id="header">
      <div class="header-left">
        <div class="phase-label" id="phase-label">LOBBY</div>
        <h1 id="quiz-title">Loading…</h1>
      </div>
      <div class="header-right">
        <div class="answered" id="answered" hidden></div>
        <div class="countdown" id="countdown" hidden role="timer" aria-atomic="true">
          <svg class="countdown-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="ring-track" cx="50" cy="50" r="44" />
            <circle class="ring-fill" id="ring-fill" cx="50" cy="50" r="44" pathLength="100" />
          </svg>
          <span class="countdown-num" id="countdown-num"></span>
        </div>
        ${logoHtml}
        <div id="qr-small" class="qr-small" hidden title="Show join QR" role="button" tabindex="0">${qrSvgMarkup}</div>
      </div>
      <div class="time-bar" id="time-bar" hidden aria-hidden="true"><div class="time-bar-fill" id="time-bar-fill"></div></div>
    </header>
    <main class="main" id="main"></main>
    <footer class="footer" id="footer">
      <div class="status-line" id="status"></div>
      <div class="footer-right">
        <label class="font-slider" title="Question text size">
          <span class="font-slider-label">Text size</span>
          <input type="range" id="font-scale" min="0.7" max="1.6" step="0.05" value="1" />
        </label>
        <button type="button" id="fs-btn" class="ghost-btn" title="Toggle fullscreen">Fullscreen</button>
        <button type="button" id="reset-btn" class="ghost-btn danger-btn">Reset</button>
        <button type="button" id="back-btn" class="ghost-btn" disabled>Back</button>
        <button type="button" id="next-btn">Next</button>
      </div>
    </footer>
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

    const shell = document.getElementById("shell");
    const main = document.getElementById("main");
    const phaseLabel = document.getElementById("phase-label");
    const quizTitle = document.getElementById("quiz-title");
    const statusEl = document.getElementById("status");
    const backBtn = document.getElementById("back-btn");
    const nextBtn = document.getElementById("next-btn");
    const resetBtn = document.getElementById("reset-btn");
    const fsBtn = document.getElementById("fs-btn");
    const qrSmall = document.getElementById("qr-small");
    const qrModal = document.getElementById("qr-modal");
    const fontScale = document.getElementById("font-scale");
    const filterPanel = document.getElementById("filter-panel");
    const filterBody = document.getElementById("filter-body");
    const filterCount = document.getElementById("filter-count");
    const filterHint = document.getElementById("filter-hint");
    const filterApply = document.getElementById("filter-apply");
    const filterClear = document.getElementById("filter-clear");
    const filterError = document.getElementById("filter-error");
    const filterToggle = document.getElementById("filter-toggle");
    const countdownEl = document.getElementById("countdown");
    const countdownNum = document.getElementById("countdown-num");
    const ringFill = document.getElementById("ring-fill");
    const timeBar = document.getElementById("time-bar");
    const timeBarFill = document.getElementById("time-bar-fill");
    const answeredEl = document.getElementById("answered");

    let state = null;
    let navBusy = false;
    let filterBusy = false;
    let countdownTickTimer = null;
    /** Draft selections: key -> single value string (empty = unconstrained) */
    let draftSelections = new Map();
    let facetsSignature = "";
    let previewTimer = null;
    let lastPreviewCount = null;

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

    filterToggle.addEventListener("click", () => {
      const open = !filterPanel.classList.contains("is-open");
      filterPanel.classList.toggle("is-open", open);
      filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    function applyFontScale(v) {
      const n = Math.min(1.6, Math.max(0.7, Number(v) || 1));
      main.style.setProperty("--q-scale", String(n));
      fontScale.value = String(n);
      try { localStorage.setItem("projector-q-scale", String(n)); } catch (_) {}
      fitMain();
    }

    /**
     * Shrink the slide (fonts, QR) via --fit until #main no longer
     * overflows. Sizes in CSS are the maximum; nothing ever scrolls.
     */
    function fitMain() {
      // scrollHeight rounds to whole px; also compare exact child boxes
      const over = () => {
        if (
          main.scrollHeight > main.clientHeight ||
          main.scrollWidth > main.clientWidth
        ) return true;
        const box = main.getBoundingClientRect();
        for (const el of main.children) {
          const r = el.getBoundingClientRect();
          if (r.top < box.top - 0.25 || r.bottom > box.bottom - 1) return true;
        }
        return false;
      };
      main.style.setProperty("--fit", "1");
      if (!over()) return;
      let lo = 0.3;
      let hi = 1;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        main.style.setProperty("--fit", String(mid));
        if (over()) hi = mid;
        else lo = mid;
      }
      main.style.setProperty("--fit", String(lo));
    }

    window.addEventListener("resize", fitMain);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitMain);
    }

    try {
      const saved = localStorage.getItem("projector-q-scale");
      if (saved != null) applyFontScale(saved);
    } catch (_) {}

    fontScale.addEventListener("input", () => applyFontScale(fontScale.value));

    function isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function fullscreenSupported() {
      const el = document.documentElement;
      return !!(
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        document.exitFullscreen ||
        document.webkitExitFullscreen
      );
    }

    function updateFullscreenBtn() {
      if (!fsBtn) return;
      if (!fullscreenSupported()) {
        fsBtn.hidden = true;
        return;
      }
      fsBtn.hidden = false;
      const on = isFullscreen();
      fsBtn.textContent = on ? "Exit full" : "Fullscreen";
      fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
      fsBtn.title = on ? "Exit fullscreen" : "Enter fullscreen";
    }

    async function toggleFullscreen() {
      try {
        if (isFullscreen()) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          const el = document.documentElement;
          if (el.requestFullscreen) await el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
      } catch (err) {
        console.error("Fullscreen failed:", err);
      }
      updateFullscreenBtn();
    }

    fsBtn.addEventListener("click", () => toggleFullscreen());
    document.addEventListener("fullscreenchange", updateFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);
    updateFullscreenBtn();

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
        return \`<div class="\${cls}"><span class="choice-letter">\${LETTERS[i] || i + 1}</span><span class="choice-text">\${esc(c)}</span></div>\`;
      }).join("");
    }

    /** Humanize metadata keys for display (use-case → Use case). */
    function formatMetaLabel(key) {
      return String(key)
        .replace(/[-_]+/g, " ")
        .replace(/\\b\\w/g, (c) => c.toUpperCase());
    }

    /**
     * Slide metadata as one header line (values only; keys in the tooltip)
     * so it costs no slide height.
     */
    function slideMetadataLine(entries) {
      if (!entries || !entries.length) return null;
      return {
        text: entries.map((e) => e.value).join("  ·  "),
        title: entries.map((e) => formatMetaLabel(e.key) + ": " + e.value).join("\\n"),
      };
    }

    function filtersSignature(filters) {
      return (filters || [])
        .map((f) => f.key + "=" + f.value)
        .sort()
        .join("|");
    }

    function facetsSig(facets) {
      if (!facets || !facets.length) return "";
      return facets.map((f) =>
        f.key + ":" + f.values.map((v) => v.value + "@" + v.count).join(",")
      ).join(";");
    }

    function draftFromActive(activeFilters) {
      const map = new Map();
      // One value per key (last wins if snapshot ever had duplicates)
      for (const f of activeFilters || []) {
        map.set(f.key, f.value);
      }
      return map;
    }

    function draftToFilters() {
      const out = [];
      for (const [key, value] of draftSelections) {
        if (value != null && value !== "") {
          out.push({ key, value });
        }
      }
      return out;
    }

    function setFilterError(msg) {
      if (!msg) {
        filterError.hidden = true;
        filterError.textContent = "";
        return;
      }
      filterError.hidden = false;
      filterError.textContent = msg;
    }

    /** Filter panel is lobby-only chrome. */
    function setFilterPanelVisible(visible) {
      filterPanel.hidden = !visible;
      filterToggle.hidden = !visible;
      shell.classList.toggle("has-filter-panel", visible);
      if (!visible) {
        filterPanel.classList.remove("is-open");
        filterToggle.setAttribute("aria-expanded", "false");
      }
    }

    function updateFilterChrome() {
      if (!state) return;
      const bank = state.bankQuestionCount != null
        ? state.bankQuestionCount
        : state.questionCount;
      const play = state.questionCount;
      const preview = lastPreviewCount;
      if (preview != null && state.canApplyFilter) {
        filterCount.textContent = preview + " / " + bank;
      } else {
        filterCount.textContent = play + " / " + bank + " playable";
      }

      const canApply = !!state.canApplyFilter && !filterBusy;
      filterApply.disabled = !canApply;
      filterClear.disabled = filterBusy;
      filterHint.textContent = "One value per field · combined as intersection";
      filterHint.classList.remove("warn");

      filterBody.querySelectorAll("select.filter-select").forEach((el) => {
        el.disabled = filterBusy;
      });
    }

    function renderFilterPanel(forceRebuild) {
      if (!state) return;
      const inLobby = state.phase === "LOBBY";
      setFilterPanelVisible(inLobby);
      if (!inLobby) return;

      const facets = state.filterFacets || [];
      const sig = facetsSig(facets);
      const needRebuild = forceRebuild || sig !== facetsSignature;

      if (needRebuild) {
        facetsSignature = sig;
        draftSelections = draftFromActive(state.activeFilters);

        if (!facets.length) {
          filterBody.innerHTML =
            '<div class="filter-panel-empty">No question metadata to filter</div>';
        } else {
          filterBody.innerHTML = facets.map((facet) => {
            const selected = draftSelections.get(facet.key) || "";
            const opts = facet.values.map((v) => {
              const sel = v.value === selected ? " selected" : "";
              const label = v.value + " (" + v.count + ")";
              return \`<option value="\${esc(v.value)}"\${sel}>\${esc(label)}</option>\`;
            }).join("");
            const id = "ff-" + encodeURIComponent(facet.key);
            const anySelected = selected === "" ? " selected" : "";
            return \`<div class="filter-facet">
              <label class="filter-facet-label" for="\${id}">\${esc(formatMetaLabel(facet.key))}</label>
              <select class="filter-select" id="\${id}" data-key="\${esc(facet.key)}" aria-label="\${esc(formatMetaLabel(facet.key))}">
                <option value=""\${anySelected}>Any</option>
                \${opts}
              </select>
            </div>\`;
          }).join("");
        }
      } else {
        // Sync select values from draft
        filterBody.querySelectorAll("select.filter-select").forEach((el) => {
          const key = el.getAttribute("data-key");
          const v = draftSelections.get(key);
          el.value = v != null ? v : "";
        });
      }

      updateFilterChrome();
    }

    function onDraftChange() {
      draftSelections = new Map();
      filterBody.querySelectorAll("select.filter-select").forEach((el) => {
        const key = el.getAttribute("data-key");
        const value = el.value;
        if (value) draftSelections.set(key, value);
      });
      setFilterError("");
      schedulePreview();
      updateFilterChrome();
    }

    filterBody.addEventListener("change", (e) => {
      if (e.target && e.target.matches && e.target.matches("select.filter-select")) {
        onDraftChange();
      }
    });

    function schedulePreview() {
      if (!state || !state.canApplyFilter) {
        lastPreviewCount = null;
        updateFilterChrome();
        return;
      }
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        previewTimer = null;
        runPreview();
      }, 200);
    }

    async function runPreview() {
      if (!state || !state.canApplyFilter || filterBusy) return;
      const filters = draftToFilters();
      try {
        const res = await fetch(SESSION_BASE + "/api/filter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filters, preview: true }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.preview) {
          lastPreviewCount = data.matchCount;
          updateFilterChrome();
        }
      } catch (_) {
        // ignore preview errors
      }
    }

    async function postFilter(filters) {
      if (filterBusy) return;
      filterBusy = true;
      setFilterError("");
      updateFilterChrome();
      try {
        const res = await fetch(SESSION_BASE + "/api/filter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filters }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFilterError(data.error || ("Filter failed (" + res.status + ")"));
          return;
        }
        state = data;
        lastPreviewCount = null;
        // Force rebuild draft from new active filters
        facetsSignature = "";
        render();
        renderFilterPanel(true);
      } catch (e) {
        setFilterError(e.message || "Filter request failed");
      } finally {
        filterBusy = false;
        updateFilterChrome();
      }
    }

    filterApply.addEventListener("click", () => {
      if (!state || !state.canApplyFilter) return;
      postFilter(draftToFilters());
    });

    filterClear.addEventListener("click", () => {
      draftSelections = new Map();
      filterBody.querySelectorAll("select.filter-select").forEach((el) => {
        el.value = "";
      });
      setFilterError("");
      if (state && state.canApplyFilter) {
        postFilter([]);
      } else {
        lastPreviewCount = null;
        updateFilterChrome();
      }
    });

    function updateNavButtons() {
      if (!state) {
        backBtn.disabled = true;
        nextBtn.disabled = true;
        resetBtn.disabled = true;
        return;
      }
      if (navBusy) return;
      backBtn.disabled = !state.canGoBack;
      nextBtn.disabled = state.phase === "END";
      nextBtn.textContent = state.phase === "END" ? "Done" : "Next";
      // Reset: back to LOBBY, clear filters, keep participants, zero scores
      resetBtn.disabled = false;
    }

    /** Playable set size (after runtime filters) — not the full process bank. */
    function playableCount() {
      return state && state.questionCount != null ? state.questionCount : 0;
    }

    /** Questions scored so far (revealed), not the whole playable set. */
    function questionsAsked() {
      return state && typeof state.questionsAsked === "number"
        ? state.questionsAsked
        : 0;
    }

    function formatScore(n) {
      return n + '<span class="lb-of">/' + questionsAsked() + "</span>";
    }

    /** Running QUESTION countdown, or null (none, or answers locked). */
    function activeCountdown() {
      if (!state || state.phase !== "QUESTION" || state.answersLocked) return null;
      const c = state.countdown;
      return c && c.deadlineMs != null ? c : null;
    }

    /** Ring + large seconds in the header, full-width bar under it. */
    function paintCountdown() {
      const c = activeCountdown();
      if (!c) {
        countdownEl.hidden = true;
        timeBar.hidden = true;
        countdownNum.textContent = "";
        countdownEl.classList.remove("warn", "urgent");
        timeBar.classList.remove("warn", "urgent");
        return;
      }
      const leftMs = Math.max(0, c.deadlineMs - Date.now());
      const sec = Math.ceil(leftMs / 1000);
      const frac = c.totalSeconds > 0
        ? Math.min(1, leftMs / (c.totalSeconds * 1000))
        : 0;
      const urgent = sec <= 5;
      const warn = !urgent && sec <= 10;
      countdownEl.hidden = false;
      timeBar.hidden = false;
      countdownNum.textContent = String(sec);
      ringFill.style.strokeDashoffset = String(100 * (1 - frac));
      timeBarFill.style.transform = "scaleX(" + frac + ")";
      for (const el of [countdownEl, timeBar]) {
        el.classList.toggle("urgent", urgent);
        el.classList.toggle("warn", warn);
      }
      countdownEl.setAttribute("aria-label", sec + " seconds remaining");
    }

    function syncCountdownTick() {
      const active = !!activeCountdown();
      if (active && countdownTickTimer === null) {
        countdownTickTimer = setInterval(paintCountdown, 250);
      } else if (!active && countdownTickTimer !== null) {
        clearInterval(countdownTickTimer);
        countdownTickTimer = null;
      }
      paintCountdown();
    }

    function render() {
      if (!state) return;
      updateNavButtons();
      syncCountdownTick();

      const isLobby = state.phase === "LOBBY";
      qrSmall.hidden = isLobby;
      if (isLobby) closeQrModal();

      const q = state.question;
      const total = playableCount();
      const qNo = state.questionIndex + 1;
      const inSlide = state.phase === "QUESTION" || state.phase === "CORRECT" ||
        state.phase === "EXPLAIN" || state.phase === "LEADERBOARD";
      const meta = inSlide ? slideMetadataLine(q && q.slideMetadata) : null;

      const phaseText = {
        LOBBY: "Lobby · scan to join",
        QUESTION: \`Question \${qNo} of \${total}\${state.answersLocked ? " · Answers closed" : ""}\`,
        CORRECT: \`Answer · Question \${qNo} of \${total}\`,
        EXPLAIN: \`Explanation · Question \${qNo} of \${total}\`,
        LEADERBOARD: \`Leaderboard · after question \${qNo} of \${total}\`,
        END: "Session complete",
      }[state.phase] || state.phase;
      phaseLabel.textContent = phaseText;
      quizTitle.textContent = meta ? meta.text : state.title;
      quizTitle.title = meta ? meta.title : "";
      quizTitle.classList.toggle("is-meta", !!meta);
      document.title = state.title + " — Projector";

      const isLb = state.phase === "LEADERBOARD" || state.phase === "END";
      const mainClasses = ["main"];
      if (isLobby) mainClasses.push("lobby-main");
      else if (isLb) mainClasses.push("lb-main");
      main.className = mainClasses.join(" ");
      shell.classList.toggle("is-lobby", isLobby);

      const num = (v) => typeof v === "number" ? v : 0;
      // Engagement (≥2 answers in the last 4 questions) — host-only footer
      const activeN = num(state.activeUserCount);
      const onlineN = num(state.onlineCount);
      const answeredN = num(state.answeredCount);
      const activePart = isLobby ? "" : \` · \${activeN} active\`;
      const countPart = state.phase === "END"
        ? "Session complete · " + total + " question" + (total === 1 ? "" : "s") +
          activePart
        : state.phase === "LOBBY"
        ? \`\${state.participantCount} joined · \${onlineN} online · \${total} question\${total === 1 ? "" : "s"}\`
        : \`\${state.participantCount} joined · \${onlineN} online\${activePart} · Q\${qNo}/\${total}\`;
      statusEl.textContent = countPart;

      // X of N: answers to this question of those who can answer it
      const showAnswered = state.phase === "QUESTION" || state.phase === "CORRECT" ||
        state.phase === "EXPLAIN";
      answeredEl.hidden = !showAnswered;
      answeredEl.innerHTML = showAnswered
        ? \`<span class="answered-num"><span class="score">\${answeredN}</span> of <span class="score">\${onlineN}</span></span><span class="answered-label">answered</span>\`
        : "";
      answeredEl.title = showAnswered
        ? "Answers to this question, of participants online now (polled in the last 15 s) or already answered"
        : "";

      renderFilterPanel(false);
      main.innerHTML = slideHtml(q, total, onlineN);
      fitMain();
    }

    function leaderboardRows(entries) {
      return entries.map((e) => \`
        <div class="lb-row \${e.rank <= 3 ? "top3" : ""}">
          <div class="lb-rank">#\${e.rank}</div>
          <div class="lb-name">\${esc(e.name)}</div>
          <div class="lb-score">\${formatScore(e.score)}</div>
        </div>
      \`).join("");
    }

    /** END: top three on a podium (2nd · 1st · 3rd), places 4–10 below. */
    function podiumHtml(entries) {
      const top = entries.slice(0, 3);
      const order = [top[1], top[0], top[2]].filter(Boolean);
      const places = order.map((e) => \`
        <div class="podium-place place-\${Math.min(e.rank, 3)}">
          <div class="podium-name">\${esc(e.name)}</div>
          <div class="podium-score">\${formatScore(e.score)}</div>
          <div class="podium-block"><span class="podium-rank">\${e.rank}</span></div>
        </div>
      \`).join("");
      const rest = entries.slice(3, 10);
      return \`
        <div class="podium">\${places}</div>
        \${rest.length ? \`<div class="leaderboard lb-rest">\${leaderboardRows(rest)}</div>\` : ""}
      \`;
    }

    function slideHtml(q, total, onlineN) {
      if (state.phase === "LOBBY") {
        const n = state.participantCount;
        return \`
          <div class="qr-large">\${QR_SVG}</div>
          <div class="join-url">\${esc(JOIN_URL)}</div>
          <div class="participant-count"><span class="score">\${n}</span> joined · <span class="score">\${onlineN}</span> online · <span class="score">\${total}</span> question\${total === 1 ? "" : "s"}</div>
        \`;
      }

      if (state.phase === "QUESTION" || state.phase === "CORRECT") {
        const hi = state.phase === "CORRECT" ? q.correct : -1;
        return \`
          <div class="slide-content">
            <div class="q-text">\${md(q.text)}</div>
            <div class="choices">\${renderChoices(q.choices, hi)}</div>
          </div>
        \`;
      }

      if (state.phase === "EXPLAIN") {
        return \`
          <div class="slide-content">
            <div class="explain-box">\${md(q.explain || "No explanation")}</div>
          </div>
        \`;
      }

      if (state.phase === "LEADERBOARD") {
        const rows = leaderboardRows(state.leaderboard.slice(0, 10)) ||
          \`<p class="muted">No participants yet</p>\`;
        return \`
          <div class="slide-content lb-slide">
            <div class="leaderboard">\${rows}</div>
          </div>
        \`;
      }

      if (state.phase === "END") {
        const asked = questionsAsked();
        const board = state.leaderboard.length
          ? podiumHtml(state.leaderboard)
          : \`<p class="muted">No participants</p>\`;
        return \`
          <div class="slide-content lb-slide end-slide">
            <div class="end-title">Final standings</div>
            <p class="muted lb-end-sub">Scores out of \${asked} question\${asked === 1 ? "" : "s"}</p>
            \${board}
          </div>
        \`;
      }
      return "";
    }

    async function fetchState() {
      const res = await fetch(SESSION_BASE + "/api/state");
      if (!res.ok) throw new Error("state failed");
      const next = await res.json();
      // Avoid clobbering draft while host is editing selects: only replace
      // draft when active filters from server change.
      const prevActive = state ? filtersSignature(state.activeFilters) : null;
      const nextActive = filtersSignature(next.activeFilters);
      state = next;
      if (prevActive !== nextActive) {
        facetsSignature = "";
        lastPreviewCount = null;
      }
      render();
    }

    async function postNav(path) {
      if (navBusy) return;
      navBusy = true;
      backBtn.disabled = true;
      nextBtn.disabled = true;
      resetBtn.disabled = true;
      try {
        const res = await fetch(SESSION_BASE + path, { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(err);
        } else {
          state = await res.json();
          lastPreviewCount = null;
          facetsSignature = "";
          render();
        }
      } finally {
        navBusy = false;
        updateNavButtons();
      }
    }

    backBtn.addEventListener("click", () => postNav("/api/back"));
    nextBtn.addEventListener("click", () => postNav("/api/advance"));
    resetBtn.addEventListener("click", () => {
      if (navBusy) return;
      const ok = confirm(
        "Return to lobby and clear filters? Participants stay joined; all scores reset to 0.",
      );
      if (!ok) return;
      postNav("/api/reset");
    });

    fetchState().catch((e) => {
      main.innerHTML = \`<p class="muted">Failed to load: \${esc(e.message)}</p>\`;
    });

    // light poll so join count updates in lobby
    setInterval(() => {
      if (!navBusy && !filterBusy) fetchState().catch(() => {});
    }, 1500);
  </script>
</body>
</html>`;
}
