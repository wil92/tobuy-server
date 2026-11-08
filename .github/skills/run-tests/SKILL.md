---
name: run-tests
description: Run the applicable server tests, investigate failures, and report missing test infrastructure.
---

# Run tests

Inspect `package.json`, available tests, and
[`doc/development.md`](../../../doc/development.md). Run the relevant tests
with the configured runner, then run `npm test` if a test script exists and
the full suite is applicable. Fix failures caused by the change and rerun the
affected tests; distinguish pre-existing failures from regressions.

There is currently no test script or test suite. Do not treat `npm test`,
syntax checks, or an unrun suite as a passing test run. If tests are needed,
use [`create-new-test`](../create-new-test/SKILL.md); otherwise report the
missing suite and any other validation gaps explicitly.
