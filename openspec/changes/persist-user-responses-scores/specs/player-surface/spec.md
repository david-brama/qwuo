## MODIFIED Requirements

### Requirement: Session reattach
The player client MUST retain its participant id across page reloads in the same browser and reattach to the existing participant when the server still knows that id. Reattach MUST succeed after a server process restart when the restored session still contains that participant.

#### Scenario: Reload mid-session
- **WHEN** a joined participant reloads the player page while the server still has their participant
- **THEN** they resume as the same participant without re-entering a name

#### Scenario: Reattach after server restart
- **WHEN** a joined participant has a stored participant id
- **AND** the server process restarts and restores a snapshot that includes that id
- **AND** the participant opens or reloads the player page
- **THEN** they resume as the same participant with the restored score and answer state without re-entering a name

#### Scenario: Stale id after fresh session
- **WHEN** a client has a stored participant id that is not present in the current session
- **THEN** the client clears the stored id and prompts for a new name join
