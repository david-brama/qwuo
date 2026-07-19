## ADDED Requirements

### Requirement: Authoring choice order is canonical on disk
The quiz file's per-question `choices` array and `correct` index SHALL remain the canonical authoring order on disk and after `loadQuiz` / validation. The system MUST NOT rewrite the quiz file when presenting a live session. Runtime reordering of choices for play is a session concern and MUST NOT change the loaded quiz identity used for content fingerprinting.

#### Scenario: Load preserves file order
- **WHEN** a quiz file defines choices in a specific order with a matching `correct` index
- **THEN** the loaded in-memory quiz retains that order and index prior to any session play preparation

#### Scenario: Fingerprint ignores live shuffle
- **WHEN** a live session shuffles choice order for play
- **THEN** the quiz identity fingerprint for the loaded file remains based on the canonical loaded content, not the session's display order
