---
name: justlovejazz-release
description: Verify and publish a scoped JUSTLOVEJAZZ change when the user requests a commit, push or pull request.
---

# JUSTLOVEJAZZ release

Inspect the working tree and final diff; preserve unrelated work. Follow
[Development](../../docs/DEVELOPMENT.md) for the complete runtime release gate
and the documentation-only exception. Run `git diff --check` before delivery.

When publication is requested, use a scoped non-default branch, stage only
intended files, write a Conventional Commit, push and open a PR against `main`.
Describe the outcome, checks and material limits. Loading this skill alone does
not authorize external publication. Read CI/review results for this change;
resolve failures without adding unrelated cleanup or repeated full checks.
