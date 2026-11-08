# Architecture

To Buy Server is an Express 4 application with an in-memory shopping-list
protocol for the Arduino client.

## Application

- `bin/www` loads `.env`, listens on `PORT` (default `3000`), and starts and
  retries the Keep integration. It also accepts a named pipe.
- `app.js` mounts the Arduino HTTP route and exposes an app factory that accepts
  a list store for isolated integration tests.
- `routes/health.js` handles `GET /health` with a JSON `{ "status": "ok" }`
  response for service liveness checks.
- `routes/tobuy.js` handles `GET /tobuy` and returns the shared revisioned
  list document.
- `services/tobuy-store.js` owns the in-memory periodic and missing lists,
  validates protocol constraints, and emits change events.
- `services/tobuy-websocket.js` attaches the `/ws` endpoint to the HTTP server,
  forwards periodic-item requests, broadcasts list changes, and uses the
  `ws` library's automatic ping/pong handling.
- `services/keep-checklist.js` extracts protocol items from the selected
  checklist, maps item IDs, and enforces protocol limits.
- `services/keep-sync.js` serializes polls and Arduino changes, publishing only
  confirmed Keep state. `services/keep-client.js` manages the Python helper;
  `services/keep-worker.py` uses the unofficial `gkeepapi` client.
- Other HTTP paths, including `/` and `/users`, are not part of the service and
  return Express's default 404 response.

The shared list is an in-memory projection of the selected Keep note. Add or
remove items in the note; the server has no public API for those operations.
See the [Google Keep guide](google-keep.md) and
[Arduino client integration](arduino-client.md) for limitations.
