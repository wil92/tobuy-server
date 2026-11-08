---
name: commit-changes
description: Review and commit only the completed task's changes without disturbing unrelated work.
---

# Commit changes

1. Check `git status --short` and review the task diff, including staged
   changes. Preserve unrelated work and never stage it implicitly.
2. Ensure required validation has been run or its limitations reported. Do not
   present a failing or incomplete task as complete.
3. Stage only the specific files belonging to the task. If a file or index
   contains unrelated changes that cannot be separated safely, ask the user
   before proceeding.
4. Create a concise, descriptive commit using the repository's applicable
   commit-message requirements. Do not amend or push unless explicitly
   requested. If the user or a higher-priority instruction prohibits a
   commit, do not commit; report that it was skipped.
