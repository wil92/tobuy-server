# Architecture

To Buy Server is currently a generated Express 4 application, not yet a
shopping-list service.

## Application

- `bin/www` loads `app.js`, creates the HTTP server, and listens on `PORT`
  (default `3000`). It also accepts a named pipe.
- `app.js` configures EJS views, Morgan request logging, JSON and URL-encoded
  body parsing, cookie parsing, static files from `public/`, and routes.
- `routes/index.js` handles `GET /` and renders `views/index.ejs` with the
  title `Express`.
- `routes/users.js` handles `GET /users` with the placeholder text
  `respond with a resource`.
- Unmatched requests are forwarded as 404 errors. The error handler renders
  `views/error.ejs`; error details are exposed to the view only in development.
- `public/` contains static assets; `views/` contains EJS templates.

There is no shopping-list storage, authentication, `GET /tobuy`, or WebSocket
server. The [Arduino client integration](arduino-client.md) describes the
future contract, not current behavior.
