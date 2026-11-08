# Coding rules

## General

- Read the affected code, tests, and documentation before changing behavior.
  Keep changes focused and preserve existing behavior unless requested.
- Follow the existing CommonJS modules, two-space indentation, semicolons,
  single-quoted JavaScript strings, and callback style in nearby code. Prefer
  clear names and small functions; do not introduce a new style solely for a
  local change.
- Keep `app.js` responsible for application configuration and middleware;
  place route handlers in `routes/`, templates in `views/`, static assets in
  `public/`, and server startup in `bin/www` where appropriate.
- Use the lockfile and update it alongside dependency manifest changes. Avoid
  new dependencies without a concrete need.

## Express and integration

- Validate untrusted input at the boundary, send appropriate HTTP responses,
  and propagate errors to Express error handling rather than silently ignoring
  them. Avoid exposing internal errors or secrets to clients in production.
- Do not hard-code credentials or commit secrets. Do not assume the Arduino
  protocol is implemented or authenticated. For client-facing work, consult
  the [Arduino integration guide](arduino-client.md) and its linked protocol,
  including size, revision, reconnect, and WebSocket requirements.
- Handle asynchronous failures and cleanup explicitly. Avoid blocking the
  event loop and make shared state changes consistent across clients.

## Tests and documentation

- Add or update deterministic tests for changed behavior, edge cases, and
  regressions. Prefer observable HTTP/WebSocket behavior and isolate external
  services; do not use real credentials.
- Run the available build and test commands, fix failures caused by the
  change, and disclose pre-existing failures or missing tooling. See
  [development](development.md) for the current validation limitations.
- Update focused guides under `doc/` when behavior, configuration, commands, or
  integration changes. Keep the root README concise and link to those guides.
