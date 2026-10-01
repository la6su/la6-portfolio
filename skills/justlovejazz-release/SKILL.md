---
name: justlovejazz-release
description: Verify and publish a scoped JUSTLOVEJAZZ change when the user requests a commit, push or pull request.
---

# JUSTLOVEJAZZ release

Inspect the working tree and final diff; preserve unrelated work. Follow
`AGENTS.md` and the current phase/checkpoint in `NEXT.md`. Run the relevant
checks for changed behavior and `git diff --check` before delivery. Do not
claim hardware/browser gates unless they were actually run.

When publication is requested, use a scoped non-default branch, stage only
intended files, write a Conventional Commit, push and open a PR against `main`.
Describe the outcome, checks and material limits. Loading this skill alone does
not authorize external publication. Read CI/review results for this change;
resolve failures without adding unrelated cleanup or repeated full checks.
