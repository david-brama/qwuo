## ADDED Requirements

### Requirement: Optional quiz metadata object
The quiz root MAY include a `metadata` field. When present and not null, `metadata` MUST be a JSON object (not an array or primitive). The object MAY contain arbitrary property names and nested JSON values. The system SHALL retain `metadata` on the loaded in-memory quiz representation. When `metadata` is omitted or null, the loaded quiz MUST behave as today with no metadata property required. The system MUST reject quiz files where `metadata` is present as a non-object value (array, string, number, or boolean) and MUST NOT start the session.

#### Scenario: Metadata object loaded
- **WHEN** the quiz JSON includes `"metadata": { "source": "cms", "tags": ["intro"], "version": 3 }`
- **THEN** validation succeeds and the loaded quiz exposes an equivalent `metadata` object with those properties

#### Scenario: Metadata omitted
- **WHEN** the quiz JSON has no `metadata` field
- **THEN** validation succeeds and the loaded quiz has no required metadata

#### Scenario: Metadata null treated as absent
- **WHEN** the quiz JSON includes `"metadata": null`
- **THEN** validation succeeds and the loaded quiz has no metadata (same as omitted)

#### Scenario: Empty metadata object
- **WHEN** the quiz JSON includes `"metadata": {}`
- **THEN** validation succeeds and the loaded quiz retains an empty metadata object

#### Scenario: Metadata array rejected
- **WHEN** the quiz JSON includes `"metadata": []` or another non-object JSON value for `metadata`
- **THEN** validation fails and the process does not start the session
