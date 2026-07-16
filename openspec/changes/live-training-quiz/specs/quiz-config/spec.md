## ADDED Requirements

### Requirement: Quiz content loads from JSON file
The system SHALL load quiz content from a JSON file path provided at startup (default `quiz.json` in the working directory).

#### Scenario: Valid quiz file
- **WHEN** the process starts with a valid quiz JSON file
- **THEN** the system loads the title and all questions into memory and continues startup

#### Scenario: Missing or invalid quiz file
- **WHEN** the quiz file is missing, unreadable, or fails schema validation
- **THEN** the process exits with a non-zero status and a clear error message describing the problem

### Requirement: Quiz JSON schema
Each quiz file MUST include a non-empty `title` string and a non-empty `questions` array. Each question MUST include non-empty `text`, a `choices` array of at least two non-empty strings, a `correct` integer index into `choices`, and MAY include an `explain` string.

#### Scenario: Correct index in range
- **WHEN** a question's `correct` value is between 0 and `choices.length - 1` inclusive
- **THEN** validation accepts that question

#### Scenario: Correct index out of range
- **WHEN** a question's `correct` value is outside the choices range
- **THEN** validation fails and the process does not start the session

### Requirement: Content is fixed for the session
The system SHALL use the quiz content loaded at startup for the entire process lifetime (no hot-reload required).

#### Scenario: File edited after start
- **WHEN** the quiz JSON file is modified on disk after the process has started
- **THEN** the running session continues using the originally loaded content
