---
name: build-project
description: Build the Express server when a build script exists and report validation gaps otherwise.
---

# Build the project

Inspect `package.json` and [`doc/development.md`](../../../doc/development.md)
for current commands. If a build script exists, run `npm run build`, diagnose
failures, fix issues caused by the change, and repeat the build.

Currently there is no build script or compilation step. Run relevant syntax
checks from the development guide as a limited alternative, but report that no
build was run; syntax checks are not a build. If dependencies are missing,
install from the lockfile with `npm ci` when appropriate. Report unresolved
failures and do not claim blocked validation passed.
