/// <reference lib="dom" />
/**
 * Projector and phone layout check: starts the app on free ports with a
 * temp session dir, drives it through LOBBY → QUESTION → CORRECT → EXPLAIN
 * → LEADERBOARD → END in headless Chrome at four projector sizes and a
 * 375x667 phone, and fails on scroll overflow, clipped/overlapped content,
 * a QR that does not decode, or a phone question whose choices do not fit
 * (all of them for typical-length questions, at least two for the rest).
 * The phone also gets slow-press, offline, no-early-reveal and reload checks.
 *
 *   deno task test:ui                      # every question in quiz.json
 *   UI_CHECK_LONGEST=8 deno task test:ui   # 8 longest + a sample
 *   SHOTS_DIR=/tmp/shots deno task test:ui # also save screenshots
 *   CHROME_PATH=/path/to/chrome            # override browser discovery
 */
import type { Browser, Page } from "playwright-core";

const ROOT = new URL("..", import.meta.url).pathname;

export const PROJECTOR_VIEWPORTS: [number, number][] = [
  [1920, 1080],
  [1280, 720],
  [1280, 800],
  [1024, 768],
];
export const PHONE_VIEWPORT: [number, number] = [375, 667];

/** Font floors (px) the check enforces; 1080p carries the room target. */
const FONT_FLOORS: Record<
  string,
  {
    q: number;
    choice: number;
    lb: number;
    timer: number;
    explain: number;
    recap: number;
  }
> = {
  "1920x1080": { q: 40, choice: 30, lb: 40, timer: 44, explain: 30, recap: 22 },
  default: { q: 24, choice: 20, lb: 22, timer: 28, explain: 18, recap: 14 },
};

const PUBLIC_URL = "https://quiet-harbor-example-lantern.trycloudflare.com";
const SESSION_ID = "0e9c2b4a-7d51-4f3e-9a86-2c4d1b7e5f30";

// --------------------------------------------------------------------------
// Browser discovery

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Chrome/Chromium executable, or null when none is installed. */
export function findBrowser(): string | null {
  const env = Deno.env.get("CHROME_PATH");
  if (env) return exists(env) ? env : null;
  const fixed = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of fixed) if (exists(p)) return p;
  const home = Deno.env.get("HOME");
  const caches = [
    home && `${home}/Library/Caches/ms-playwright`,
    home && `${home}/.cache/ms-playwright`,
  ].filter(Boolean) as string[];
  for (const dir of caches) {
    let builds: string[] = [];
    try {
      builds = [...Deno.readDirSync(dir)]
        .map((e) => e.name)
        .filter((n) => /^chromium-\d+$/.test(n))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    } catch {
      continue;
    }
    for (const b of builds) {
      for (
        const rel of [
          "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
          "chrome-linux/chrome",
          "chrome-linux64/chrome",
        ]
      ) {
        if (exists(`${dir}/${b}/${rel}`)) return `${dir}/${b}/${rel}`;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Question selection

interface QuizFile {
  questions: {
    text: string;
    choices: string[];
    explain?: string;
    countdownSeconds?: number;
  }[];
  config?: { countdownSeconds?: number };
  [k: string]: unknown;
}

function slideLen(q: QuizFile["questions"][number]): number {
  return q.text.length + q.choices.reduce((n, c) => n + c.length, 0);
}

/**
 * All questions, or (when `longest` is set) the N longest question slides,
 * the N longest explanations and every `sampleEvery`-th question.
 */
export function selectQuestions(
  quiz: QuizFile,
  longest?: number,
  sampleEvery = 10,
): number[] {
  const n = quiz.questions.length;
  const all = [...Array(n).keys()];
  if (!longest || longest >= n) return all;
  const picked = new Set<number>();
  [...all].sort((a, b) => slideLen(quiz.questions[b]) - slideLen(quiz.questions[a]))
    .slice(0, longest).forEach((i) => picked.add(i));
  [...all].sort((a, b) =>
    (quiz.questions[b].explain ?? "").length -
    (quiz.questions[a].explain ?? "").length
  ).slice(0, longest).forEach((i) => picked.add(i));
  for (let i = 0; i < n; i += sampleEvery) picked.add(i);
  return [...picked].sort((a, b) => a - b);
}

// --------------------------------------------------------------------------
// App process

function freePort(): number {
  const l = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (l.addr as Deno.NetAddr).port;
  l.close();
  return port;
}

interface App {
  projector: string;
  player: string;
  joinUrl: string;
  stop: () => Promise<void>;
}

async function startApp(quizPath: string, sessionsDir: string): Promise<App> {
  const projectorPort = freePort();
  const playerPort = freePort();
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-net",
      "--allow-env",
      "--allow-read",
      `--allow-write=${sessionsDir}`,
      "main.ts",
    ],
    cwd: ROOT,
    env: {
      QUIZ_PATH: quizPath,
      SESSIONS_DIR: sessionsDir,
      SESSION_ID,
      SESSION_FRESH: "1",
      PROJECTOR_PORT: String(projectorPort),
      PLAYER_PORT: String(playerPort),
      PUBLIC_URL,
      QUIZ_FILTER: "",
      QUIZ_IDS: "",
    },
    stdout: "null",
    stderr: "piped",
  }).spawn();
  const projector = `http://127.0.0.1:${projectorPort}/s/${SESSION_ID}`;
  const player = `http://127.0.0.1:${playerPort}/s/${SESSION_ID}`;
  const stop = async () => {
    try {
      child.kill("SIGTERM");
    } catch { /* already gone */ }
    await child.stderr.cancel().catch(() => {});
    await child.status;
  };
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${projector}/api/state`);
      await r.body?.cancel();
      if (r.ok) {
        return { projector, player, joinUrl: `${PUBLIC_URL}/s/${SESSION_ID}`, stop };
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const err = await new Response(child.stderr).text().catch(() => "");
  await stop();
  throw new Error(`App did not start within 30s\n${err}`);
}

async function post(url: string, body?: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`POST ${url} → ${r.status} ${JSON.stringify(data)}`);
  return data;
}

interface ProjState {
  phase: string;
  questionIndex: number;
  questionCount: number;
}

async function projState(app: App): Promise<ProjState> {
  const r = await fetch(`${app.projector}/api/state`);
  return await r.json();
}

/** Advance until `phase` (and, if given, question index) is reached. */
async function goTo(app: App, phase: string, index?: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const s = await projState(app);
    if (s.phase === phase && (index === undefined || s.questionIndex === index)) {
      return;
    }
    await post(`${app.projector}/api/advance`);
  }
  throw new Error(`Could not reach ${phase} ${index ?? ""}`);
}

// --------------------------------------------------------------------------
// In-page measurement (runs in the browser; keep it self-contained)

export interface Measure {
  issues: string[];
  qFont: number | null;
  choiceFont: number | null;
  explainFont: number | null;
  /** Leaderboard rows and podium places on screen. */
  lbRows: number;
  lbFont: number | null;
  podium: number;
  /** "X of N" answered counter text, when shown. */
  answered: string | null;
  /** EXPLAIN recap: choice font, highlighted+✓ choices, question shown. */
  recapFont: number | null;
  correctMarks: number;
  recapQuestion: number;
  /** Countdown seconds font (px) when the countdown is shown. */
  countdownFont: number | null;
  qrBox: { x: number; y: number; width: number; height: number } | null;
}

function measureInPage(): Measure {
  const issues: string[] = [];
  const vw = innerWidth, vh = innerHeight;
  const de = document.documentElement;
  if (de.scrollHeight > de.clientHeight + 1) {
    issues.push(`document scrolls vertically by ${de.scrollHeight - de.clientHeight}px`);
  }
  if (de.scrollWidth > de.clientWidth + 1) {
    issues.push(`document scrolls horizontally by ${de.scrollWidth - de.clientWidth}px`);
  }
  const main = document.getElementById("main")!;
  if (main.scrollHeight > main.clientHeight + 1) {
    issues.push(`#main overflows by ${main.scrollHeight - main.clientHeight}px`);
  }
  if (main.scrollWidth > main.clientWidth + 1) {
    issues.push(`#main overflows horizontally by ${main.scrollWidth - main.clientWidth}px`);
  }

  const label = (el: Element) => {
    const cls = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).join(".")
      : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}${text ? ` "${text}"` : ""}`;
  };

  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** Box inside viewport, inside every clipping ancestor, not cut inside. */
  const checkBox = (el: Element, ownOverflow: boolean) => {
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
      issues.push(`${label(el)} outside viewport (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
      return;
    }
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const ar = a.getBoundingClientRect();
      if (
        r.left < ar.left - 0.5 || r.top < ar.top - 0.5 ||
        r.right > ar.right + 0.5 || r.bottom > ar.bottom + 0.5
      ) {
        issues.push(`${label(el)} clipped by ${label(a).slice(0, 40)}`);
        return;
      }
    }
    const h = el as HTMLElement;
    if (ownOverflow && (h.scrollHeight > h.clientHeight + 1 || h.scrollWidth > h.clientWidth + 1)) {
      issues.push(`${label(el)} content cut inside its box`);
    }
  };

  /** Grid of points must hit `el` (or a descendant): nothing covers it. */
  const checkUncovered = (el: Element, steps: number) => {
    const r = el.getBoundingClientRect();
    // Inset keeps sample points inside rounded corners
    const inset = Math.min(8, r.width / 4, r.height / 4);
    let bad = 0, total = 0;
    let coverer: Element | null = null;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const x = r.left + inset + (r.width - 2 * inset) * (steps === 1 ? 0.5 : i / (steps - 1));
        const y = r.top + inset + (r.height - 2 * inset) * (steps === 1 ? 0.5 : j / (steps - 1));
        total++;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) {
          bad++;
          coverer = coverer ?? hit;
        }
      }
    }
    if (bad > 0) {
      issues.push(`${label(el)} overlapped at ${bad}/${total} points by ${coverer ? label(coverer).slice(0, 50) : "nothing"}`);
    }
  };

  const content = [
    ...document.querySelectorAll(
      "#main .q-text, #main .choice, #main .explain-box, #main .lb-row, " +
        "#main .join-url, #main .participant-count, #main .end-title, " +
        "#main .slide-meta-card, #main .lobby-sub, #main .q-progress, " +
        "#main .podium-place, #main .lb-end-sub",
    ),
  ].filter(visible);
  for (const el of content) {
    checkBox(el, el.matches(".choice, .q-text, .explain-box, .join-url"));
    checkUncovered(el, el.matches(".choice, .q-text, .explain-box") ? 3 : 2);
  }

  // Chrome that must stay on screen and uncovered
  for (const sel of ["#countdown", "#answered", "#next-btn", "#back-btn", "#qr-small", ".brand-logo"]) {
    const el = document.querySelector(sel);
    if (el && visible(el)) {
      checkBox(el, false);
      if (sel !== ".brand-logo") checkUncovered(el, 2);
    }
  }

  // Countdown ring and time bar: nothing else may overlap their boxes
  // (the bar ignores pointer events, so elementFromPoint cannot see it)
  const hit = (a: DOMRect, b: DOMRect) =>
    a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const sel of ["#countdown", "#time-bar"]) {
    const el = document.querySelector(sel);
    if (!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (sel === "#time-bar") checkBox(el, false);
    const others = [
      ...document.querySelectorAll(
        ".brand-logo, #qr-small, #answered, .header-left, #countdown",
      ),
      ...content,
    ].filter((o) => o !== el && visible(o));
    for (const o of others) {
      if (hit(r, o.getBoundingClientRect())) issues.push(`${sel} overlaps ${label(o).slice(0, 50)}`);
    }
  }

  // The runner moves the mouse first, so the host controls must be shown
  // (and are then checked for clipping/overlap like any other chrome)
  const controls = document.querySelector(".footer-right");
  if (controls && getComputedStyle(controls).visibility === "hidden") {
    issues.push("host controls hidden right after mouse movement");
  }

  // Footer must be one row
  const footer = document.getElementById("footer")!;
  const items = [...footer.querySelectorAll("button, .status-line, .font-slider")]
    .filter(visible)
    .map((e) => e.getBoundingClientRect());
  if (items.length) {
    const mids = items.map((r) => (r.top + r.bottom) / 2);
    if (Math.max(...mids) - Math.min(...mids) > 8) issues.push("footer wraps to more than one row");
  }

  let qrBox: Measure["qrBox"] = null;
  const qr = document.querySelector("#main .qr-large");
  if (qr && visible(qr)) {
    checkBox(qr, false);
    checkUncovered(qr, 7);
    const r = qr.getBoundingClientRect();
    qrBox = { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  const font = (sel: string) => {
    const els = [...document.querySelectorAll(sel)].filter(visible);
    if (!els.length) return null;
    return Math.min(...els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  };
  return {
    issues,
    qFont: font("#main .q-text:not(.q-recap)"),
    choiceFont: font("#main .choices:not(.choices-recap) .choice"),
    recapFont: font("#main .choices-recap .choice"),
    correctMarks: [...document.querySelectorAll("#main .choice.highlight")]
      .filter((el) => el.querySelector(".choice-mark") && visible(el)).length,
    recapQuestion: [...document.querySelectorAll("#main .q-recap")].filter(visible).length,
    explainFont: font("#main .explain-box"),
    lbRows: [...document.querySelectorAll("#main .lb-row")].filter(visible).length,
    lbFont: font("#main .leaderboard:not(.lb-rest) .lb-row"),
    podium: [...document.querySelectorAll("#main .podium-place")].filter(visible).length,
    countdownFont: font("#countdown .countdown-num"),
    answered: (() => {
      const el = document.querySelector("#answered .answered-num");
      return el && visible(el) ? (el.textContent || "").trim() : null;
    })(),
    qrBox,
  };
}

// --------------------------------------------------------------------------
// Presenter keys (run from END; leaves the session at END)

async function checkPresenterKeys(app: App, page: Page): Promise<string[]> {
  const fails: string[] = [];
  const pause = (ms = 500) => new Promise((r) => setTimeout(r, ms));
  const phase = async () => (await projState(app)).phase;
  const expect = async (want: string, what: string) => {
    await pause();
    const got = await phase();
    if (got !== want) fails.push(`${what}: phase ${got}, want ${want}`);
  };
  await page.mouse.click(5, 5); // focus the page, not a control
  await page.keyboard.press("ArrowLeft");
  await expect("LEADERBOARD", "ArrowLeft from END");
  await page.keyboard.press("PageDown");
  await expect("END", "PageDown (clicker)");
  await page.keyboard.press("PageUp");
  await expect("LEADERBOARD", "PageUp (clicker)");
  await page.keyboard.press("Space");
  await expect("END", "Space");
  await page.keyboard.press("PageUp");
  await expect("LEADERBOARD", "PageUp");
  await page.keyboard.press("Enter");
  await expect("END", "Enter");
  // Two presses 150 ms apart (clicker double-send) = one step, even
  // though the first request has finished by then
  await page.keyboard.press("ArrowLeft");
  await pause(150);
  await page.keyboard.press("ArrowLeft");
  await expect("LEADERBOARD", "double ArrowLeft within debounce");
  await page.keyboard.press("ArrowRight");
  await expect("END", "ArrowRight");
  // Held key: repeats are ignored
  await page.keyboard.down("ArrowLeft");
  for (let i = 0; i < 4; i++) {
    await pause(150);
    await page.keyboard.down("ArrowLeft");
  }
  await page.keyboard.up("ArrowLeft");
  await expect("LEADERBOARD", "held ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect("END", "ArrowRight");
  // No single key resets
  for (const key of ["r", "R", "Delete", "Backspace", "Escape", "Home"]) {
    await page.keyboard.press(key);
  }
  await expect("END", "reset-like keys");
  // Typing in a control: the text-size slider keeps its arrows
  await page.focus("#font-scale");
  await page.keyboard.press("ArrowLeft");
  await expect("END", "ArrowLeft on the text-size slider");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Open QR modal: keys do nothing
  await page.click("#qr-small");
  await page.keyboard.press("ArrowLeft");
  await expect("END", "ArrowLeft with the QR modal open");
  await page.keyboard.press("Escape");
  await pause(100);
  if (await page.isVisible("#qr-modal")) fails.push("Escape did not close the QR modal");
  return fails;
}

// --------------------------------------------------------------------------
// Reconnecting banner: state polls fail → banner; recovery → gone

async function checkReconnectBanner(
  page: Page,
  vp: string,
  shot: (page: Page, name: string) => Promise<void>,
): Promise<string[]> {
  const fails: string[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const shown = () => page.isVisible("#conn-banner");
  if (await shown()) fails.push("banner shown while the server is up");
  await page.route("**/api/state", (r) => r.abort());
  await pause(1000); // at most one failed poll (1.5 s interval): not yet
  if (await shown()) fails.push("banner after a single failed poll");
  await page.waitForSelector("#conn-banner", { state: "visible", timeout: 5000 })
    .catch(() => fails.push("no banner after polls kept failing"));
  const inView = await page.evaluate(() => {
    const r = document.getElementById("conn-banner")!.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  if (!inView) fails.push("banner outside the viewport");
  await shot(page, `projector-reconnecting-${vp}`);
  await page.unroute("**/api/state");
  await page.waitForSelector("#conn-banner", { state: "hidden", timeout: 5000 })
    .catch(() => fails.push("banner not cleared after recovery"));
  return fails;
}

// --------------------------------------------------------------------------
// Phone question layout at 375x667: how many choices are fully on screen
// with the card scrolled to the top, plus font sizes and the countdown

/** Phone font floors (px). */
const PHONE_FLOORS = { q: 15, choice: 14 };

export interface PhoneMeasure {
  choices: number;
  visible: number;
  qFont: number;
  choiceFont: number;
  countdownInView: boolean;
  overflowX: boolean;
}

function measurePhoneInPage(): PhoneMeasure {
  const card = document.querySelector(".card") as HTMLElement;
  card.scrollTop = 0;
  const limit = Math.min(innerHeight, card.getBoundingClientRect().bottom) + 0.5;
  const btns = [...document.querySelectorAll("#q-choices .choice")];
  const cd = document.getElementById("q-countdown")!;
  const r = cd.getBoundingClientRect();
  const px = (el: Element | null) => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  return {
    choices: btns.length,
    visible: btns.filter((b) => b.getBoundingClientRect().bottom <= limit).length,
    qFont: px(document.querySelector("#q-text p") ?? document.getElementById("q-text")),
    choiceFont: px(btns[0] ?? null),
    countdownInView: !cd.hidden && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  };
}

export interface PhoneStats {
  checks: number;
  /** Questions at or under the typical (median) length, and how many fit. */
  typical: number;
  typicalAllVisible: number;
  allVisible: number;
  minVisible: number;
  minQFont: number;
  minChoiceFont: number;
}

// --------------------------------------------------------------------------
// Phone: slow (400 ms) presses on a choice must all register even though the
// state poll runs every second. Answers are stubbed to fail so the question
// stays on screen; every registered press is one /api/answer request.

export const SLOW_PRESSES = 20;

async function checkSlowPresses(phone: Page): Promise<string[]> {
  const fails: string[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let hits = 0;
  await phone.route("**/api/answer", (r) => {
    hits++;
    return r.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "ui_check: press counted" }),
    });
  });
  try {
    for (let i = 0; i < SLOW_PRESSES; i++) {
      const btn = phone.locator("#q-choices .choice").nth(i % 2);
      await btn.scrollIntoViewIfNeeded();
      const box = await btn.boundingBox();
      if (!box) {
        fails.push("no choice button to press");
        break;
      }
      await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await phone.mouse.down();
      await pause(400);
      await phone.mouse.up();
      // Wait for this press's request to finish before the next press
      for (let t = 0; t < 40 && hits <= i; t++) await pause(50);
      await phone.waitForFunction(() =>
        [...document.querySelectorAll<HTMLButtonElement>("#q-choices .choice")]
          .every((b) => !b.disabled), undefined, { timeout: 3000 }).catch(() => {});
    }
  } finally {
    await phone.unroute("**/api/answer");
  }
  if (hits !== SLOW_PRESSES) {
    fails.push(`${hits}/${SLOW_PRESSES} slow (400 ms) presses registered`);
  }
  return fails;
}

// --------------------------------------------------------------------------
// Phone offline: failed polls and a failed answer show a banner and an error
// at the top of the screen, even when the choices are scrolled into view

function phoneInView(phone: Page, sel: string): Promise<boolean> {
  return phone.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 &&
      r.bottom <= innerHeight && r.right <= innerWidth;
  }, sel);
}

async function checkPhoneOffline(
  phone: Page,
  shot: (page: Page, name: string) => Promise<void>,
  vp: string,
): Promise<string[]> {
  const fails: string[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The slow-press check left a (stubbed) answer error with the card scrolled
  if (!(await phone.textContent("#answer-error"))?.includes("press counted")) {
    fails.push("answer error not shown");
  } else if (!(await phoneInView(phone, "#answer-error"))) {
    fails.push("answer error not visible without scrolling");
  }
  if (await phone.isVisible("#conn-banner")) fails.push("banner shown while the server is up");
  await phone.route("**/api/state*", (r) => r.abort());
  await phone.route("**/api/answer", (r) => r.abort());
  try {
    await phone.waitForSelector("#conn-banner", { state: "visible", timeout: 5000 })
      .catch(() => fails.push("no banner after polls kept failing"));
    const btn = phone.locator("#q-choices .choice").last();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await pause(300);
    if (!(await phoneInView(phone, "#conn-banner"))) fails.push("banner not visible without scrolling");
    const err = (await phone.textContent("#answer-error")) ?? "";
    if (!/not sent/.test(err)) fails.push(`offline tap: answer error "${err}"`);
    else if (!(await phoneInView(phone, "#answer-error"))) {
      fails.push("offline answer error not visible without scrolling");
    }
    if (!(await phone.isVisible("#view-question.active"))) fails.push("offline tap left the question");
    await shot(phone, `player-offline-tap-${vp}`);
  } finally {
    await phone.unroute("**/api/state*");
    await phone.unroute("**/api/answer");
  }
  await phone.waitForSelector("#conn-banner", { state: "hidden", timeout: 5000 })
    .catch(() => fails.push("banner not cleared after recovery"));
  return fails;
}

// --------------------------------------------------------------------------
// Phone: the correct/incorrect result is still there after a reload

async function checkPhoneResult(phone: Page, wantCorrect: boolean): Promise<string[]> {
  const fails: string[] = [];
  const want = wantCorrect ? "Correct" : "Incorrect";
  const read = async () => {
    await phone.waitForSelector("#view-feedback.active", { timeout: 5000 })
      .catch(() => {});
    await phone.waitForFunction(
      (w) => document.getElementById("fb-big")?.textContent === w,
      want,
      { timeout: 3000 },
    ).catch(() => {});
    return (await phone.textContent("#fb-big"))?.trim() ?? "";
  };
  const before = await read();
  if (before !== want) fails.push(`result "${before}", want "${want}"`);
  await phone.reload();
  const after = await read();
  if (after !== want) fails.push(`after reload: result "${after}", want "${want}"`);
  return fails;
}

// --------------------------------------------------------------------------
// Auto-hiding host controls and the Reset confirm

async function checkHostChrome(
  app: App,
  page: Page,
  vp: string,
  shot: (page: Page, name: string) => Promise<void>,
  confirmReset: boolean,
): Promise<string[]> {
  const fails: string[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const phase = async () => (await projState(app)).phase;
  const controlsShown = () =>
    page.evaluate(() => {
      const el = document.querySelector(".footer-right")!;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && Number(cs.opacity) > 0.5;
    });
  const native: string[] = [];
  const onDialog = (d: { type(): string; dismiss(): Promise<void> }) => {
    native.push(d.type());
    d.dismiss().catch(() => {});
  };
  page.on("dialog", onDialog);
  const start = await phase();
  const [w, h] = vp.split("x").map(Number);

  await page.mouse.move(w / 2, h / 2 - 20);
  await pause(400);
  if (!(await controlsShown())) fails.push("hidden right after mouse movement");
  await pause(3600);
  if (await controlsShown()) fails.push("still shown after 3.6 s without mouse movement");
  await page.mouse.move(w / 2, h / 2 + 20);
  await pause(400);
  if (!(await controlsShown())) fails.push("not shown again on mouse movement");
  await pause(3600);
  await page.keyboard.press("Shift");
  await pause(400);
  if (!(await controlsShown())) fails.push("not shown again on a key press");

  // Reset opens the in-page confirm; Enter / Escape / arrows do not reset
  const confirmOpen = () => page.isVisible("#reset-confirm");
  await page.click("#reset-btn");
  await pause(200);
  if (!(await confirmOpen())) fails.push("Reset did not open the confirm");
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== "reset-cancel") fails.push(`confirm focus on #${focused}, want #reset-cancel`);
  const panel = await page.evaluate(() => {
    const r = document.querySelector(".confirm-panel")!.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  if (!panel) fails.push("confirm panel outside the viewport");
  await shot(page, `projector-reset-confirm-${vp}`);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await pause(500);
  if (await confirmOpen()) fails.push("Enter on Cancel did not close the confirm");
  await page.click("#reset-btn");
  await page.keyboard.press("Escape");
  await pause(300);
  if (await confirmOpen()) fails.push("Escape did not close the confirm");
  if (await phase() !== start) fails.push(`phase changed to ${await phase()} without confirming`);

  if (confirmReset) {
    await page.click("#reset-btn");
    await page.click("#reset-ok");
    await pause(500);
    if (await phase() !== "LOBBY") fails.push(`confirmed Reset left phase ${await phase()}`);
  }
  page.off("dialog", onDialog);
  if (native.length) fails.push(`native dialog(s) used: ${native.join(", ")}`);
  return fails;
}

// --------------------------------------------------------------------------
// Runner

export interface UiCheckOptions {
  /** Only the N longest question slides / explanations plus a sample. */
  longest?: number;
  /** Directory for screenshots; omitted = no screenshots. */
  shotsDir?: string;
  /** Screenshot every question (default: first, longest, longest explain). */
  shotsAll?: boolean;
  log?: (line: string) => void;
}

export interface ViewportStats {
  viewport: string;
  minQFont: number;
  minChoiceFont: number;
  minExplainFont: number;
  minRecapFont: number;
  qrSide: number;
  qrDecoded: boolean;
  checks: number;
}

export interface UiCheckResult {
  failures: string[];
  stats: ViewportStats[];
  phone: PhoneStats;
  questions: number;
}

export async function runUiCheck(opts: UiCheckOptions = {}): Promise<UiCheckResult> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome/Chromium found (set CHROME_PATH)");
  const { chromium } = await import("playwright-core");
  const jsqrMod = await import("jsqr");
  // CJS interop: at runtime `default` is the function; the typings nest it
  const jsQR = jsqrMod.default as unknown as typeof jsqrMod.default.default;
  const { PNG } = await import("pngjs");

  const quizPath = Deno.env.get("QUIZ_PATH") || `${ROOT}quiz.json`;
  const quiz = JSON.parse(await Deno.readTextFile(quizPath)) as QuizFile;
  const picked = selectQuestions(quiz, opts.longest);
  const tmp = await Deno.makeTempDir({ prefix: "qwuo-ui-" });
  const subset = { ...quiz, questions: picked.map((i) => quiz.questions[i]) };
  delete (subset as Record<string, unknown>).$schema;
  const tmpQuiz = `${tmp}/quiz.json`;
  await Deno.writeTextFile(tmpQuiz, JSON.stringify(subset));
  if (opts.shotsDir) await Deno.mkdir(opts.shotsDir, { recursive: true });

  // Which play positions get screenshots (play order is shuffled per run)
  const longestSlide = subset.questions.reduce(
    (b, q, i, a) => slideLen(q) > slideLen(a[b]) ? i : b,
    0,
  );
  const longestExplain = subset.questions.reduce(
    (b, q, i, a) => (q.explain ?? "").length > (a[b].explain ?? "").length ? i : b,
    0,
  );

  // "Typical" question for the phone: at or under the bank's median length
  const lens = quiz.questions.map(slideLen).sort((a, b) => a - b);
  const typicalLen = lens[Math.floor((lens.length - 1) / 2)];

  const failures: string[] = [];
  const stats = new Map<string, ViewportStats>();
  const phoneStats: PhoneStats = {
    checks: 0,
    typical: 0,
    typicalAllVisible: 0,
    allVisible: 0,
    minVisible: Infinity,
    minQFont: Infinity,
    minChoiceFont: Infinity,
  };
  let app: App | null = null;
  let browser: Browser | null = null;
  try {
    app = await startApp(tmpQuiz, `${tmp}/sessions`);
    browser = await chromium.launch({ executablePath: exe, headless: true });
    const pages: { vp: string; w: number; h: number; page: Page }[] = [];
    for (const [w, h] of PROJECTOR_VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(`${app.projector}/`);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const vp = `${w}x${h}`;
      pages.push({ vp, w, h, page });
      stats.set(vp, {
        viewport: vp,
        minQFont: Infinity,
        minChoiceFont: Infinity,
        minExplainFont: Infinity,
        minRecapFont: Infinity,
        qrSide: 0,
        qrDecoded: false,
        checks: 0,
      });
    }
    const phoneCtx = await browser.newContext({
      viewport: { width: PHONE_VIEWPORT[0], height: PHONE_VIEWPORT[1] },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const phone = await phoneCtx.newPage();
    const phoneVp = `${PHONE_VIEWPORT[0]}x${PHONE_VIEWPORT[1]}`;

    const shot = async (page: Page, name: string) => {
      if (opts.shotsDir) await page.screenshot({ path: `${opts.shotsDir}/${name}.png` });
    };

    // Several players, including a long and an RTL name
    const names = [
      "Dana", "Avraham Ben-David Rosenthal-Goldberg", "יוסי כהן", "Noa", "Omer",
      "Lior", "Tamar", "Yossi", "Maya", "Eitan", "Shira", "Gal",
    ];
    const players: { id: string }[] = [];
    for (const name of names) {
      players.push(await post(`${app.player}/api/join`, { name }) as { id: string });
    }
    await phone.goto(`${app.player}/`);
    await shot(phone, `player-join-${phoneVp}`);
    await phone.fill("#name", "Phone Player");
    await phone.click("#join-btn");
    await phone.waitForSelector("#view-wait.active");
    await shot(phone, `player-lobby-${phoneVp}`);
    const joined = players.length + 1;
    // Whether the question on screen runs a countdown
    let hasCountdown = false;
    let accepted = 0;

    const check = async (tag: string, label: string, shotName: string | null) => {
      for (const { vp, w, h, page } of pages) {
        // Mouse movement shows the auto-hiding host controls
        await page.mouse.move(w / 2 + (stats.get(vp)!.checks % 2 ? 7 : -7), h / 2);
        await page.evaluate(async () => {
          // deno-lint-ignore no-explicit-any
          await (globalThis as any).fetchState();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const m = await page.evaluate(measureInPage);
        const s = stats.get(vp)!;
        s.checks++;
        for (const issue of m.issues) failures.push(`${vp} ${label}: ${issue}`);
        const floor = FONT_FLOORS[vp] ?? FONT_FLOORS.default;
        if (m.qFont !== null) {
          s.minQFont = Math.min(s.minQFont, m.qFont);
          if (m.qFont < floor.q) failures.push(`${vp} ${label}: question font ${m.qFont}px < ${floor.q}px`);
        }
        if (m.choiceFont !== null) {
          s.minChoiceFont = Math.min(s.minChoiceFont, m.choiceFont);
          if (m.choiceFont < floor.choice) {
            failures.push(`${vp} ${label}: choice font ${m.choiceFont}px < ${floor.choice}px`);
          }
        }
        if (m.explainFont !== null) s.minExplainFont = Math.min(s.minExplainFont, m.explainFont);
        const wantTimer = tag === "question" && hasCountdown;
        if (wantTimer !== (m.countdownFont !== null)) {
          failures.push(`${vp} ${label}: countdown ${wantTimer ? "missing" : "shown"}`);
        } else if (m.countdownFont !== null && m.countdownFont < floor.timer) {
          failures.push(`${vp} ${label}: countdown font ${m.countdownFont}px < ${floor.timer}px`);
        }
        if (tag === "question" || tag === "correct" || tag === "explain") {
          // N moves with the 15 s online window, so only bound it
          const m2 = m.answered?.match(/^(\d+) of (\d+)$/);
          const wantX = tag === "question" ? 0 : accepted;
          if (!m2) {
            failures.push(`${vp} ${label}: no "X of N answered" counter (got ${JSON.stringify(m.answered)})`);
          } else if (
            Number(m2[1]) !== wantX || Number(m2[2]) < Math.max(1, wantX) ||
            Number(m2[2]) > joined
          ) {
            failures.push(`${vp} ${label}: answered counter "${m.answered}", want ${wantX} of ${Math.max(1, wantX)}…${joined}`);
          }
        }
        if (tag === "correct" && m.correctMarks !== 1) {
          failures.push(`${vp} ${label}: ${m.correctMarks} choices marked ✓ correct, want 1`);
        }
        if (tag === "explain") {
          if (m.recapQuestion !== 1) failures.push(`${vp} ${label}: question not shown above the explanation`);
          if (m.correctMarks !== 1) failures.push(`${vp} ${label}: ${m.correctMarks} choices marked ✓ correct, want 1`);
          if (m.explainFont !== null && m.explainFont < floor.explain) {
            failures.push(`${vp} ${label}: explanation font ${m.explainFont}px < ${floor.explain}px`);
          }
          if (m.recapFont !== null) s.minRecapFont = Math.min(s.minRecapFont, m.recapFont);
          if (m.recapFont !== null && m.recapFont < floor.recap) {
            failures.push(`${vp} ${label}: choice font ${m.recapFont}px < ${floor.recap}px`);
          }
        }
        if (tag === "leaderboard") {
          if (m.lbRows !== Math.min(10, joined)) {
            failures.push(`${vp} ${label}: ${m.lbRows} leaderboard rows, want ${Math.min(10, joined)}`);
          }
          if (m.lbFont !== null && m.lbFont < floor.lb) {
            failures.push(`${vp} ${label}: leaderboard font ${m.lbFont}px < ${floor.lb}px`);
          }
        }
        if (tag === "end") {
          if (m.podium !== Math.min(3, joined)) {
            failures.push(`${vp} ${label}: ${m.podium} podium places, want ${Math.min(3, joined)}`);
          }
          const rest = Math.max(0, Math.min(10, joined) - 3);
          if (m.lbRows !== rest) failures.push(`${vp} ${label}: ${m.lbRows} rows under podium, want ${rest}`);
        }
        if (tag === "lobby") {
          if (!m.qrBox) {
            failures.push(`${vp} ${label}: no join QR`);
          } else {
            const side = Math.round(Math.min(m.qrBox.width, m.qrBox.height));
            s.qrSide = side;
            const want = Math.round(0.85 * Math.min(0.65 * h, 0.45 * w));
            if (side < want) failures.push(`${vp} ${label}: QR ${side}px < ${want}px`);
            const png = PNG.sync.read(await page.screenshot());
            const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
            s.qrDecoded = code?.data === app!.joinUrl;
            if (!s.qrDecoded) {
              failures.push(`${vp} ${label}: QR did not decode to the join URL (got ${code ? JSON.stringify(code.data) : "nothing"})`);
            }
          }
        }
        if (shotName) await shot(page, `projector-${shotName}-${vp}`);
      }
    };

    await check("lobby", "LOBBY", "lobby");

    const total = subset.questions.length;
    for (let qi = 0; qi < total; qi++) {
      await goTo(app, "QUESTION", qi);
      const st = await (await fetch(`${app.projector}/api/state`)).json() as {
        question: { text: string };
      };
      const src = subset.questions.findIndex((q) => q.text === st.question.text);
      const tag = `Q${qi + 1}(${picked[src] + 1})`;
      hasCountdown = (subset.questions[src].countdownSeconds ??
        subset.config?.countdownSeconds ?? 0) > 0;
      const want = opts.shotsAll || qi === 0 || src === longestSlide ||
        src === longestExplain;
      const nm = (phase: string) =>
        want ? `${phase}-q${String(picked[src] + 1).padStart(2, "0")}` : null;
      await check("question", `${tag} QUESTION`, nm("question"));
      await phone.waitForFunction(
        (n) => document.getElementById("view-question")!.classList.contains("active") &&
          document.getElementById("q-meta")!.textContent!.startsWith(`Question ${n} of`),
        qi + 1,
        { timeout: 5000 },
      ).catch(() => failures.push(`${phoneVp} ${tag}: phone did not show the question`));
      {
        const pm = await phone.evaluate(measurePhoneInPage);
        const typical = slideLen(subset.questions[src]) <= typicalLen;
        const ps = phoneStats;
        ps.checks++;
        ps.minVisible = Math.min(ps.minVisible, pm.visible);
        ps.minQFont = Math.min(ps.minQFont, pm.qFont);
        ps.minChoiceFont = Math.min(ps.minChoiceFont, pm.choiceFont);
        if (pm.visible === pm.choices) ps.allVisible++;
        if (typical) {
          ps.typical++;
          if (pm.visible === pm.choices) ps.typicalAllVisible++;
        }
        const need = typical ? pm.choices : Math.min(2, pm.choices);
        if (pm.visible < need) {
          failures.push(`${phoneVp} ${tag}: ${pm.visible}/${pm.choices} choices visible without scrolling, want ${need}${typical ? " (typical length)" : ""}`);
        }
        if (pm.qFont < PHONE_FLOORS.q) failures.push(`${phoneVp} ${tag}: question font ${pm.qFont}px < ${PHONE_FLOORS.q}px`);
        if (pm.choiceFont < PHONE_FLOORS.choice) {
          failures.push(`${phoneVp} ${tag}: choice font ${pm.choiceFont}px < ${PHONE_FLOORS.choice}px`);
        }
        if (hasCountdown && !pm.countdownInView) failures.push(`${phoneVp} ${tag}: countdown not on screen`);
        if (pm.overflowX) failures.push(`${phoneVp} ${tag}: horizontal overflow`);
      }
      if (want) await shot(phone, `player-${nm("question")}-${phoneVp}`);
      // The phone answers Q1 itself (first choice) after the slow presses
      let phoneChoice: number | null = null;
      if (qi === 0) {
        await phone.waitForSelector("#view-question.active");
        for (const f of await checkSlowPresses(phone)) failures.push(`${phoneVp} ${tag}: ${f}`);
        for (const f of await checkPhoneOffline(phone, shot, phoneVp)) {
          failures.push(`${phoneVp} ${tag} offline: ${f}`);
        }
        await phone.locator("#q-choices .choice").first().click();
        await phone.waitForSelector("#view-feedback.active", { timeout: 5000 })
          .then(() => phoneChoice = 0)
          .catch(() => failures.push(`${phoneVp} ${tag}: answer tap did not show feedback`));
        // Before the reveal: no correct/incorrect, also not after a poll
        await phone.waitForTimeout(1300);
        const early = await phone.evaluate(() => ({
          big: document.getElementById("fb-big")?.textContent ?? "",
          cls: document.getElementById("fb-box")?.className ?? "",
          text: document.body.innerText,
        }));
        if (
          early.big !== "Answer locked in" || /\b(ok|bad)\b/.test(early.cls) ||
          /Correct answer|Incorrect/.test(early.text)
        ) {
          failures.push(`${phoneVp} ${tag}: result shown before the reveal ("${early.big}", class "${early.cls}")`);
        }
        await shot(phone, `player-locked-in-${phoneVp}`);
      }
      // A few answers so the counters are non-zero
      // (the per-player rate limit rejects some in a fast full run)
      accepted = 0;
      for (const [i, p] of players.slice(0, 7).entries()) {
        const choiceIndex = (qi + Math.floor(i / 2)) % 4;
        await post(`${app.player}/api/answer`, { id: p.id, choiceIndex })
          .then(() => accepted++, () => {});
      }
      if (phoneChoice !== null) accepted++;
      await goTo(app, "CORRECT", qi);
      await check("correct", `${tag} CORRECT`, nm("correct"));
      if (phoneChoice !== null) {
        const correct = (await (await fetch(`${app.projector}/api/state`)).json() as {
          question: { correct: number };
        }).question.correct;
        for (const f of await checkPhoneResult(phone, phoneChoice === correct)) {
          failures.push(`${phoneVp} ${tag} CORRECT: ${f}`);
        }
        await shot(phone, `player-correct-reloaded-${phoneVp}`);
      }
      if (qi === 0) {
        // Back from CORRECT: answers locked → no countdown
        await post(`${app.projector}/api/back`);
        await check("locked", `${tag} QUESTION (locked)`, null);
        await goTo(app, "CORRECT", qi);
      }
      await goTo(app, "EXPLAIN", qi);
      await check("explain", `${tag} EXPLAIN`, nm("explain"));
      if (want) {
        await phone.waitForSelector("#view-wait.active, #view-feedback.active", { timeout: 5000 })
          .catch(() => failures.push(`${phoneVp} ${tag} EXPLAIN: phone still on the question`));
        await shot(phone, `player-${nm("explain")}-${phoneVp}`);
      }
      await goTo(app, "LEADERBOARD", qi);
      await check("leaderboard", `${tag} LEADERBOARD`, nm("leaderboard"));
      log(`  ${tag} checked (${failures.length} failures so far)`);
    }
    await goTo(app, "END");
    await check("end", "END", "end");
    await phone.waitForFunction(
      () => document.getElementById("wait-msg")?.textContent === "Session complete",
      undefined,
      { timeout: 5000 },
    ).catch(() => failures.push(`${phoneVp} END: phone does not show "Session complete"`));
    await shot(phone, `player-end-${phoneVp}`);
    for (const f of await checkPresenterKeys(app, pages[0].page)) {
      failures.push(`${pages[0].vp} keys: ${f}`);
    }
    const lost = await Promise.all(
      pages.map(({ vp, page }) => checkReconnectBanner(page, vp, shot)),
    );
    lost.forEach((fs, i) => fs.forEach((f) => failures.push(`${pages[i].vp} reconnect: ${f}`)));
    // Last: ends with a confirmed Reset (session back in LOBBY)
    for (const { vp, page } of pages) {
      for (const f of await checkHostChrome(app, page, vp, shot, vp === pages.at(-1)!.vp)) {
        failures.push(`${vp} host controls: ${f}`);
      }
    }
  } finally {
    await browser?.close().catch(() => {});
    await app?.stop();
    await Deno.remove(tmp, { recursive: true }).catch(() => {});
  }

  return {
    failures,
    stats: [...stats.values()],
    phone: phoneStats,
    questions: picked.length,
  };
}

export function formatStats(stats: ViewportStats[], phone?: PhoneStats): string {
  const f = (n: number) => Number.isFinite(n) ? n.toFixed(1) : "—";
  const lines = stats.map((s) =>
    `${s.viewport.padEnd(10)} checks=${s.checks} minQuestion=${f(s.minQFont)}px ` +
    `minChoice=${f(s.minChoiceFont)}px minExplain=${f(s.minExplainFont)}px ` +
    `minExplainChoice=${f(s.minRecapFont)}px ` +
    `qr=${s.qrSide}px decoded=${s.qrDecoded}`
  );
  if (phone) {
    const [w, h] = PHONE_VIEWPORT;
    lines.push(
      `${`${w}x${h}`.padEnd(10)} questions=${phone.checks} ` +
        `allChoicesVisible=${phone.allVisible}/${phone.checks} ` +
        `typical=${phone.typicalAllVisible}/${phone.typical} ` +
        `minVisible=${Number.isFinite(phone.minVisible) ? phone.minVisible : "—"} ` +
        `minQuestion=${f(phone.minQFont)}px minChoice=${f(phone.minChoiceFont)}px`,
    );
  }
  return lines.join("\n");
}

if (import.meta.main) {
  if (!findBrowser()) {
    console.log("ui_check: no Chrome/Chromium found — skipped (set CHROME_PATH)");
    Deno.exit(0);
  }
  const longest = Number(Deno.env.get("UI_CHECK_LONGEST") || "") || undefined;
  const res = await runUiCheck({
    longest,
    shotsDir: Deno.env.get("SHOTS_DIR") || undefined,
    shotsAll: Deno.env.get("SHOTS_ALL") === "1",
  });
  console.log(`\nQuestions checked: ${res.questions}`);
  console.log(formatStats(res.stats, res.phone));
  if (res.failures.length) {
    const max = 80;
    console.log(`\nFAIL: ${res.failures.length} problem(s)`);
    for (const f of res.failures.slice(0, max)) console.log("  " + f);
    if (res.failures.length > max) console.log(`  … ${res.failures.length - max} more`);
    Deno.exit(1);
  }
  console.log("\nOK: no overflow, clipping or overlap; QR decodes at every size");
}
