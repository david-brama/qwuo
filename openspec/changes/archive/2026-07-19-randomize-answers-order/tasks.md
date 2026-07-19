## 1. Shuffle helper

- [x] 1.1 Add a pure `shuffleQuestionChoices` (or equivalent) helper that permutes a question's `choices` via Fisher–Yates, remaps `correct` to the same choice text, and does not mutate the input
- [x] 1.2 Accept an injectable random-int function for deterministic unit tests; default to `crypto.getRandomValues`
- [x] 1.3 Unit tests: multiset of choices preserved; `choices[correct]` matches original correct text; injected RNG produces a known permutation

## 2. Session effective play order

- [x] 2.1 On `new Session(quiz)`, deep-copy questions and shuffle each question into session-owned playable questions used by `currentQuestion`, `answer`, `projectorState`, and `playerState`
- [x] 2.2 Keep loaded/canonical quiz identity separate so callers/fingerprint can still use authoring order (`quiz` reference or explicit canonical copy — do not shuffle the object passed to `quizFingerprint`)
- [x] 2.3 On `reset()`, clear participants/phase as today and rebuild playable questions with a fresh shuffle
- [x] 2.4 Change `fromHydrate` so restore applies provided effective questions and never reshuffles
- [x] 2.5 Extend `SessionHydrate` / `toHydrate` to include effective questions (`choices` + `correct` at minimum; full `Question[]` is fine)
- [x] 2.6 Session tests: projector and player state share choice order; answering the correct text scores +1 after shuffle; restore keeps order; reset changes order under controlled RNG

## 3. Snapshot persistence

- [x] 3.1 Bump `SNAPSHOT_VERSION` and add effective questions to `SessionSnapshot`
- [x] 3.2 Update `sessionToSnapshot` / `sessionFromSnapshot` / `isValidSnapshot` to write, read, and validate effective questions (length must match loaded quiz question count; each `correct` in range)
- [x] 3.3 On missing/invalid effective order for the new version, refuse restore (same outcome as invalid snapshot → new empty session path in callers)
- [x] 3.4 Confirm `quizFingerprint` still hashes canonical loaded quiz only (no session order)
- [x] 3.5 Persist tests: join/answer/advance → save → restore preserves effective choices, answers, and scores; v1 or incomplete payloads do not partially restore under a new shuffle

## 4. Surfaces and smoke

- [x] 4.1 Verify player UI still renders API `choices` and feedback `correctIndex` without client reordering (adjust only if needed)
- [x] 4.2 Verify projector QUESTION/CORRECT highlight uses session `correct` against the same choice list
- [x] 4.3 Run full test suite (`deno test`) and fix any fixtures that assumed authoring order equals session order
