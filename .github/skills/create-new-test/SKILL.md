---
name: create-new-test
description: Create or update focused automated tests for Express server behavior and regressions.
---

# Create or update a test

1. Inspect the affected behavior, acceptance criteria, existing test scripts,
   test framework, and [`doc/coding-rules.md`](../../../doc/coding-rules.md).
2. Cover observable outcomes, error paths, boundary cases, and regressions with
   deterministic tests. Isolate external services and avoid real credentials.
   For Arduino integration, cover the relevant protocol constraints.
3. Follow the existing test framework when present. There is currently no test
   framework or script; if tests are required, introduce a suitable minimal
   runner and an executable test script, document their requirements and
   commands, and update the lockfile if dependencies change.
4. Run the new tests and applicable suite via
   [`run-tests`](../run-tests/SKILL.md), fix failures caused by the change, and
   report any unresolved failures or blocked checks.
