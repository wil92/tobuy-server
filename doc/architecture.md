# Architecture

To Buy Server is an Express 4 application with an in-memory shopping-list
protocol for the Arduino client.

## Application

- `bin/www` loads `app.js`, creates the HTTP server, and listens on `PORT`
  (default `3000`). It also accepts a named pipe.
- `app.js` configures EJS views, Morgan request logging, JSON and URL-encoded
  body parsing, cookie parsing, static files from `public/`, and routes. Its
  app factory accepts a list store for isolated integration tests.
- `routes/index.js` handles `GET /` and renders `views/index.ejs` with the
  title `Express`.
- `routes/users.js` handles `GET /users` with the placeholder text
  `respond with a resource`.
- `routes/tobuy.js` handles `GET /tobuy` and returns the shared revisioned
  list document.
- `services/tobuy-store.js` owns the in-memory periodic and missing lists,
  validates protocol constraints, and emits change events.
- `services/tobuy-websocket.js` attaches the `/ws` endpoint to the HTTP server,
  applies periodic-item requests, broadcasts list changes, and uses the
  `ws` library's automatic ping/pong handling.
- Unmatched requests are forwarded as 404 errors. The error handler renders
  `views/error.ejs`; error details are exposed to the view only in development.
- `public/` contains static assets; `views/` contains EJS templates.

The shopping lists are initially empty and are not persisted. There is no
public API to add or remove list items yet. The [Arduino client integration](arduino-client.md)
describes the implemented protocol and its trusted-network-only limitation.
