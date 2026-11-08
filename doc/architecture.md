# Architecture

To Buy Server is an Express 4 application with an in-memory shopping-list
protocol for the Arduino client.

## Application

- `bin/www` loads `.env`, listens on `PORT` (default `3000`), and starts and
  retries the Keep integration. It also accepts a named pipe.
- `app.js` mounts the Arduino HTTP route and exposes an app factory that accepts
  a list store for isolated integration tests.
- `routes/health.js` handles `GET /health` with `{ "status": "ok" }`, or
  HTTP 503 `{ "status": "error", ... }` while the last Keep operation (auth,
  request, helper call, or update) failed. `services/keep-sync.js` keeps this
  status in memory; it returns to `ok` after the next successful operation.
- `routes/tobuy.js` handles `GET /tobuy` and
  `DELETE /tobuy/missing/{id}` to mark a non-periodic item done in Keep.
- `routes/temperature.js` and `services/temperature.js` provide
  `GET /temperature` using Open-Meteo for the configured city; see
  [Temperature](temperature.md).
- `services/tobuy-store.js` owns the in-memory periodic and missing lists,
  validates protocol constraints, and emits change events.
- `services/tobuy-websocket.js` attaches the `/ws` endpoint to the HTTP server,
  forwards periodic-item requests, broadcasts list changes, and uses the
  `ws` library's automatic ping/pong handling.
- `services/keep-checklist.js` extracts protocol items from the selected
  checklist, maps item IDs, and enforces protocol limits.
- `services/keep-sync.js` serializes polls and item changes, publishing only
  confirmed Keep state. `services/keep-client.js` manages the Python helper;
  `services/keep-worker.py` uses the unofficial `gkeepapi` client.
- Other HTTP paths, including `/` and `/users`, are not part of the service and
  return Express's default 404 response.

The shared list is an in-memory projection of the selected Keep note. Add,
rename, or permanently delete items in the note.
See the [Google Keep guide](google-keep.md) and
[Arduino client integration](arduino-client.md) for limitations.
