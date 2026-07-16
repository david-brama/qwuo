## ADDED Requirements

### Requirement: Projector rejects non-local Origin
The projector HTTP handler SHALL reject any request that includes an `Origin` header whose host is not a loopback address. Loopback hosts MUST include `127.0.0.1`, `localhost`, and `::1` (IPv6 loopback), with `http` or `https` scheme. When `Origin` is absent or empty, the handler MUST process the request normally (non-browser clients and unit tests). A rejected origin MUST receive HTTP 403 and MUST NOT mutate session state.

#### Scenario: Foreign Origin blocked on reset
- **WHEN** a client POSTs to `/s/{sessionId}/api/reset` on the projector port with `Origin: https://evil.example`
- **THEN** the response status is 403 and the session is unchanged

#### Scenario: Loopback Origin allowed on reset
- **WHEN** a client POSTs to `/s/{sessionId}/api/reset` on the projector port with `Origin: http://127.0.0.1:3000`
- **THEN** the request is not rejected for origin and reset proceeds if the path is valid

#### Scenario: Missing Origin allowed
- **WHEN** a client POSTs to `/s/{sessionId}/api/advance` on the projector port without an `Origin` header
- **THEN** the request is not rejected for origin
