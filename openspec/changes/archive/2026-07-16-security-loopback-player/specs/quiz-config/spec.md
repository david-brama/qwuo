## ADDED Requirements

### Requirement: Quiz Markdown rendered as sanitized HTML
Question `text` and `explain` fields MAY contain Markdown (GFM). When the projector or player UI renders those fields as HTML, the system MUST parse Markdown and then sanitize the HTML so that script and other dangerous markup from quiz content cannot execute in the browser. Choice labels MUST continue to be escaped as plain text (not Markdown).

#### Scenario: Markdown formatting preserved safely
- **WHEN** a question `text` contains GFM emphasis or lists without script tags
- **THEN** the UI shows the intended formatting after sanitize

#### Scenario: Script payload neutralized
- **WHEN** quiz content includes HTML/script that would execute if injected raw into the page
- **THEN** after render the dangerous markup does not execute (sanitizer removes or neutralizes it)
