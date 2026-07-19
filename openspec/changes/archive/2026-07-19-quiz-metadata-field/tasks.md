## 1. Schema and types

- [x] 1.1 Add optional `metadata` property to `quiz.schema.json` as a JSON object with `additionalProperties: true` (not required)
- [x] 1.2 Extend `Quiz` in `src/quiz.ts` with optional `metadata?: Record<string, unknown>`

## 2. Validation and load

- [x] 2.1 In `validateQuiz`, accept omitted/`null` metadata (omit on result), accept object values (shallow-copy onto result), reject arrays and other non-objects with a clear path-qualified error
- [x] 2.2 Confirm `loadQuiz` continues to return the validated `Quiz` including `metadata` with no extra changes

## 3. Fingerprint policy

- [x] 3.1 Verify `quizFingerprint` in `src/persist.ts` still hashes only title + questions (exclude metadata); add or adjust a test if needed so metadata-only differences do not change the fingerprint

## 4. Tests

- [x] 4.1 Add unit tests for `validateQuiz`: object loaded, omitted, null-as-absent, empty object, array/primitive rejection
- [x] 4.2 Run existing quiz/persist/http tests and fix any fixtures that break on the new optional field

## 5. Verification

- [x] 5.1 Manually or via test confirm a minimal quiz with sample `metadata` loads successfully and one with `"metadata": []` fails at validation
