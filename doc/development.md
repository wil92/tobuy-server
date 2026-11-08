# Development

## Setup and run

Install Node.js and npm, then from the repository root:

```sh
npm ci
npm start
```

The server listens on port `3000` by default. Override it with, for example,
`PORT=3001 npm start`. The Arduino API is at `http://localhost:3000/tobuy` and
its WebSocket endpoint is `ws://localhost:3000/ws`. Check server liveness at
`http://localhost:3000/health`. Set `DEBUG=tobuy-server:server` to see the
server's listening message.

No Node.js version is pinned in the repository. Keep `package-lock.json` in
sync with any dependency changes and use `npm ci` for a reproducible install.

## Build and tests

The test suite uses Node.js's built-in test runner (Node.js 18 or newer):

```sh
npm test
```

`package.json` defines `npm start` and `npm test`; there is no separate build
script or configured linter. The server runs JavaScript directly, so there is
no compilation step. Check the current scripts with `npm run` before choosing
validation commands.

For a syntax-only check of the application files, run:

```sh
node --check app.js
node --check bin/www
node --check routes/health.js
node --check routes/tobuy.js
node --check services/tobuy-store.js
node --check services/tobuy-websocket.js
```

These checks do not replace a build or automated tests. For changes, add or
update focused tests when needed, execute the applicable project scripts if
they exist, and report missing or blocked validation rather than claiming
success. If introducing a test runner or build step, document its requirements
and commands here and update the relevant agent skills.
