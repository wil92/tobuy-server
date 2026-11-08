# Development

## Setup and run

Install Node.js and npm, then from the repository root:

```sh
npm ci
npm start
```

The server listens on port `3000` by default. Override it with, for example,
`PORT=3001 npm start`. Visit `http://localhost:3000/` for the placeholder
page or `http://localhost:3000/users` for the placeholder users response.
Set `DEBUG=tobuy-server:server` to see the server's listening message.

No Node.js version is pinned in the repository. Keep `package-lock.json` in
sync with any dependency changes and use `npm ci` for a reproducible install.

## Build and tests

`package.json` currently defines only `npm start`: there is no build script,
test script, test suite, or configured linter. The server runs JavaScript
directly; there is no compilation step. Check the current scripts with
`npm run` before choosing validation commands.

For a syntax-only check of the current application files, run:

```sh
node --check app.js
node --check bin/www
node --check routes/index.js
node --check routes/users.js
```

These checks do not replace a build or automated tests. For changes, add or
update focused tests when needed, execute the applicable project scripts if
they exist, and report missing or blocked validation rather than claiming
success. If introducing a test runner or build step, document its requirements
and commands here and update the relevant agent skills.
