# All Staging Content Production Integration Design

## Goal

Create one production candidate on the exact latest production baseline that
contains every net change currently present only on `staging`, while retaining
every production-only change already present on `main`. The integration must
not deploy the production runtime. It must first produce a reviewable union
candidate whose contents can be proved against both source snapshots.

This scope includes all staging-only application code, UI, balance data,
tests, documentation, images, migrations, scripts, and toolkit content. It is
not limited to the unexplored-region feature family.

## Frozen inputs

- Logical common snapshot:
  `25fb95beffce1aa4e05d33fdf8fe560ed872c937`
- Production input (`origin/main`):
  `b73d4147e555cdb8bfff4520cef5e0dc35202da9`
- Staging input (`origin/staging`):
  `6bd1744fe461a22662b20288ca9169621506b440`

The normal Git merge base is not used because both release lines have been
squash-synchronized. The logical base commit's tree is byte-identical to a
snapshot previously present on `main`, which makes it the shared content
baseline for this integration.

If either remote input changes, this candidate is not silently rebased. The
new input must be frozen and the three-way audit rerun.

## Integration rule

For each path and file mode, compare the logical base (`B`), production (`M`),
and staging (`S`):

| Condition | Candidate result |
| --- | --- |
| `S == B` | Keep `M` |
| `M == B` | Take `S` |
| `M == S` | Keep the shared value |
| `M != B`, `S != B`, and `M != S` | Perform a semantic merge retaining both intended changes |

The same rule applies to additions, deletions, renames, executable bits, and
binary assets. A whole-file `ours` or `theirs` resolution is not acceptable
for a path changed on both sides unless an explicit path-level review proves
that one complete version already contains the other side's intent.

## Construction

Build the candidate in an isolated `/tmp` worktree from the frozen production
SHA. Use Git's recursive content merge with the explicit logical base, not a
broad `staging` branch merge and not a directory copy. Load the resulting tree
into the worktree and resolve all remaining unmerged entries manually.

The initial analysis found 61 paths changed on both release lines. The actual
recursive merge found 15 paths with textual conflicts:

- `docs/staging-release-flow.md`
- `e2e/support/authenticatedDatabase.ts`
- `scripts/check-asset-rights.mjs`
- `src/adventure/v2/MiningView.tsx`
- `src/adventure/v2/V2EnhanceView.tsx`
- `src/adventure/v2/V2MarketplaceView.tsx`
- `src/adventure/v2/WoodcuttingView.tsx`
- `src/adventure/v2/__snapshots__/combatGolden.test.ts.snap`
- `src/adventure/v2/combat/engine.atb.ts`
- `src/adventure/v2/combat/engine.ts`
- `src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx`
- `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`
- `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- `src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts`
- `src/adventure/v2/marketplace/EquipmentBuyOrderDialog.tsx`

Textual conflicts are only a subset of the semantic risk. Every path changed
on both sides must be inspected, including clean auto-merges.

## Environment and production safeguards

Production-only payment, review, rating, deployment, and database changes must
remain present. Staging contributes no net logical-base changes to
`.env.example`, `.env.production`, `.github/workflows/`, or `deploy/`; their
production versions therefore remain unchanged under the integration rule.
No secret value, deployment target, database connection, bucket, webhook, or
environment-specific runtime configuration is copied from the test server.

Database migrations are append-only inputs. Existing production migrations
must not be renamed, reordered, or removed, and staging-only migrations must
be reviewed for numbering and schema compatibility before inclusion.

One-sided preservation may require a narrowly documented compatibility edit.
This integration has three such edits: the staging-only asset-rights library
also recognizes the production rating asset category; the production-only
workshop material-source resolver recognizes staging's unexplored-region
recipe materials; and the staging-only dark-surface audit no longer names the
buy-order dialog removed by production's auction-only marketplace. Their
source-side behavior remains intact and each edit is covered by the
corresponding repository contract tests.

## Proof of completeness

The completed candidate must satisfy all of the following:

1. No unmerged index entries or conflict markers remain.
2. Every staging-only path value is represented unless a documented semantic
   resolution supersedes it.
3. Every production-only path value is represented unless a documented
   semantic resolution supersedes it.
4. Every both-changed path has an explicit review record.
5. Production environment and deployment paths match the frozen production
   input when staging did not change them from the logical base.
6. Migration, image-reference, asset-rights, package-lock, type, lint, unit,
   build, and relevant E2E checks pass.

The source snapshots, overlap manifest, and final candidate tree are recorded
with full SHAs so the integration can be reconstructed and audited.

## Release sequence and stopping point

After local verification, the candidate may be pushed for review and deployed
to the test server only as an exact candidate tree. Test validation must cover
both staging-derived features and production-only payment/review behavior.

The production runtime is explicitly outside this execution's stopping point.
A later explicit production deployment request is required. At that time the
candidate must be reconciled with the then-current `main`, merged, and built by
CI. The existing service remains live until the exact `main` SHA and matching
`production-next-<SHA>` artifact are ready. The deployment workflow enables
maintenance immediately before the runtime swap, and maintenance remains on
until the user separately instructs it to be disabled.

## Rollback

No source branch or worktree is deleted during integration. The frozen
production SHA remains the code rollback point. Test-server deployment can be
rolled back to its prior exact staging SHA without changing production. A
future production rollback must follow the repository runbook and account for
any migrations before reverting application code.
