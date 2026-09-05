# Staging Production Promotion Tool Implementation Plan

> **Execution note:** Complete each task in order with focused red/green tests, then run the full toolkit verification before committing.

**Goal:** Prepare an auditable, conflict-aware squash candidate from the current tested staging state without automatically committing, pushing, merging, deploying, or changing maintenance mode.

**Architecture:** Add two release commands to the existing toolkit. A standalone promotion pipeline owns history validation, three-point Git auditing, isolated worktree preparation, and atomic history recording; the CLI remains a thin parser/dispatcher.

**Tech Stack:** TypeScript, Node.js filesystem/process APIs, Git CLI, Vitest

---

### Task 1: Define the CLI contract

- Extend `toolkit/cli/command.test.ts` with valid and invalid promotion commands.
- Extend `toolkit/cli/command.ts` with typed `promote-staging` and `record-promotion` variants and usage text.
- Run the focused parser tests.

### Task 2: Audit staging against the last successful promotion

- Add tests for history parsing, ancestry checks, changed-path classification, overlap detection, and no-op rejection.
- Add `toolkit/pipelines/productionPromotion.ts` with pure validation/classification helpers and Git-backed auditing.
- Seed `docs/release-promotions/staging-production.json` from the verified 2026-09-05 promotion.

### Task 3: Prepare an isolated squash candidate

- Add integration tests using temporary Git repositories for dry-run immutability, successful staged application, conflict preservation, and unsafe target rejection.
- Create the worktree from exact `origin/main`, apply the exact staging range as a binary 3-way patch, and persist an ignored local audit/record draft.
- Do not commit, push, open or merge a PR, deploy, or alter maintenance mode.

### Task 4: Record a completed promotion

- Add tests for duplicate/out-of-order records, SHA/ancestry checks, document paths, dry-run, and atomic persistence.
- Implement the history-recording operation and wire both commands through the toolkit runtime.

### Task 5: Document and verify

- Update `docs/staging-release-flow.md` with the repeatable preparation, review, deployment, and post-deployment recording sequence.
- Run focused tests, all toolkit tests, TypeScript, ESLint, and the relevant full project test suite.
- Review the diff for scope and safety, then commit the implementation on the isolated feature branch.
