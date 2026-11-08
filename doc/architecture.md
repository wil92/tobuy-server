# Architecture

To Buy Server is an Express 4 application with an in-memory shopping-list
protocol for the Arduino client.

## Application

- `bin/www` loads `app.js`, creates the HTTP server, and listens on `PORT`
  (default `3000`). It also accepts a named pipe.
- `app.js` mounts the Arduino HTTP route and exposes an app factory that accepts
  a list store for isolated integration tests.
- `routes/tobuy.js` handles `GET /tobuy` and returns the shared revisioned
  list document.
- `services/tobuy-store.js` owns the in-memory periodic and missing lists,
  validates protocol constraints, and emits change events.
- `services/tobuy-websocket.js` attaches the `/ws` endpoint to the HTTP server,
  applies periodic-item requests, broadcasts list changes, and uses the
  `ws` library's automatic ping/pong handling.
- Other HTTP paths, including `/` and `/users`, are not part of the service and
  return Express's default 404 response.

The shopping lists are initially empty and are not persisted. There is no
public API to add or remove list items yet. The [Arduino client integration](arduino-client.md)
describes the implemented protocol and its trusted-network-only limitation.
