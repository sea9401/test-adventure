# September 3 Production Pending Squash Design

## Goal

Build one production-ready commit on the exact latest `origin/main` tree that
contains the six explicitly selected undeployed work groups and none of the
test-server-only history.

## Baseline and selected work

- Baseline: `22ab4a3d51f46292a43abae1f0bc365d3f173f3c` (`origin/main` after fetch).
- Accessibility phases one through four: the contiguous accessibility-only
  range from `41a8d9ba3` through `4dc57f7ce`.
- Marketplace unregistered-codex equipment filter: `2876aa604` through
  `098452f5d`.
- Critical-resistance resolution: `e7d8365d5` through `33cba7071`.
- Guild raid attack pagination: `2e98bcfc8`.
- PvP skill-hit martial counter: `46b496bae`.
- Mutant skill-lineage filter: `36e7b1e9d`.

## Integration architecture

Create a linked worktree from the fetched production baseline. Apply only the
listed commit patches without their source branch ancestry, resolve overlaps
against the current production behavior, and stage every selected patch for a
single final commit. Do not merge `staging`, an experimental branch, or a
source branch head.

The accessibility and marketplace filter both touch the marketplace view.
Their user-visible controls and accessibility attributes must coexist. The
production marketplace browse limit of 500 must remain unchanged.

## Safety and verification

- Preserve source branches and checkpoint commits so every input remains
  recoverable.
- Audit the resulting diff for staging-only, unexplored-region, and test-server
  paths or copy.
- Verify focused tests for each work group, lint, TypeScript, the full Vitest
  suite, authenticated/public accessibility E2E where supported, and the
  production build.
- Create exactly one commit relative to the fetched `origin/main` baseline.
- Merge and push only after local verification. Wait for the exact main SHA's
  CI and `production-next-<SHA>` artifact before invoking the production deploy
  workflow.
- Let the deploy workflow enable maintenance immediately before runtime swap.
  Do not independently enable maintenance while the artifact is being built.

## Rollback and exclusions

The prior production SHA remains the rollback point. No staging-only changes,
unexplored-region work, test-server configuration, or unrelated working-tree
changes are included. Source worktrees and branches are not deleted as part of
this integration.
