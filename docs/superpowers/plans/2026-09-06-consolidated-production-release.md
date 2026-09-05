# 2026-09-06 Consolidated Production Release Plan

**Goal:** Consolidate every reviewed but undeployed change into one commit on the current production base, merge it to `main`, deploy the exact resulting SHA, and disable maintenance after deployment succeeds.

## Scope

- Absorb the 19 local commits on `release/marketplace-my-bids-20260902`.
- Absorb the reviewed bulletin, chat item link, feedback copy, magic penetration, unexplored rare-map, and unexplored refund branches.
- Treat `fix/weekly-facility-conflict-alert` as already absorbed by its source-equivalent final commit on the release branch.
- Exclude all older divergent release-branch history already represented on `main`.

## Execution

- [ ] Apply the selected commits without committing and resolve conflicts against `origin/main`.
- [ ] Review the combined diff and run focused tests, the full test suite, type checking, lint, repository checks, and a production build.
- [ ] Create one consolidated commit and open a pull request to `main`.
- [ ] Wait for required checks, merge, and record the exact `main` SHA.
- [ ] Wait for the exact-SHA production artifact, run the production deployment workflow, and verify the live build ID.
- [ ] Disable maintenance mode only after successful deployment and verify public availability.
