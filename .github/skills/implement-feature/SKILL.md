---
name: implement-feature
description: Implement an Express server issue or feature, validate it, and commit the completed changes.
---

# Implement a feature

1. Read the issue or request, relevant code, tests, documentation, and
   [`doc/coding-rules.md`](../../../doc/coding-rules.md). Identify acceptance
   criteria, edge cases, and client protocol implications. Clarify material
   ambiguities before making a consequential behavior decision.
2. Implement the change following the coding rules and existing patterns.
   Update relevant documentation and preserve unrelated work.
3. Use [`create-new-test`](../create-new-test/SKILL.md) to add or update tests
   when needed for the behavior and regressions.
4. Use [`build-project`](../build-project/SKILL.md) and
   [`run-tests`](../run-tests/SKILL.md). Fix failures caused by the change and
   rerun affected checks. Investigate failing tests rather than weakening them
   to pass. Report pre-existing failures and any blocked or missing validation.
5. Review the final diff and use
   [`commit-changes`](../commit-changes/SKILL.md) to commit the completed task,
   unless the user or a higher-priority instruction prohibits it. Do not
   commit a known failing or incomplete implementation as complete; report
   blockers instead.
