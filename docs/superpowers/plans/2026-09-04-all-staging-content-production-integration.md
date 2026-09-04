# All Staging Content Production Integration Plan

> **For Codex:** Execute this plan with `superpowers:executing-plans`. Use the
> frozen object IDs below. Stop before any production runtime deployment.

**Goal:** Build and verify one union candidate containing every staging-only
change and every production-only change without overwriting either release
line.

**Architecture:** Start at frozen `origin/main`, use the verified logical
common snapshot as an explicit three-way base, and merge `origin/staging` at
the tree/index level. Resolve both-changed paths semantically and prove the
result with path manifests, focused regression tests, and repository-wide
checks.

**Tech Stack:** Git plumbing, TypeScript, Next.js, Vitest, Playwright, ESLint,
Drizzle migrations, repository asset and release checks.

---

## Frozen constants

```text
BASE=25fb95beffce1aa4e05d33fdf8fe560ed872c937
MAIN=b73d4147e555cdb8bfff4520cef5e0dc35202da9
STAGING=6bd1744fe461a22662b20288ca9169621506b440
WORKTREE=/tmp/test-adventure-all-staging-prod-20260904
BRANCH=release/all-staging-content-production-20260904
```

Do not substitute moving remote names for these constants during candidate
construction.

### Task 1: Freeze and verify the three source snapshots

**Files:**

- Verify: Git objects only
- Create: `/tmp/all-staging-production-integration/inputs.txt`
- Create: `/tmp/all-staging-production-integration/staging.paths`
- Create: `/tmp/all-staging-production-integration/main.paths`
- Create: `/tmp/all-staging-production-integration/overlap.paths`

**Step 1: Confirm object identity and logical-base tree equivalence**

Run:

```bash
git rev-parse 25fb95beffce1aa4e05d33fdf8fe560ed872c937^{tree}
git rev-parse 4cf1b586102aa17ac746bb843a6761e28ae82821^{tree}
git rev-parse b73d4147e555cdb8bfff4520cef5e0dc35202da9
git rev-parse 6bd1744fe461a22662b20288ca9169621506b440
```

Expected: the first two tree IDs are equal and the final two commit IDs equal
the frozen inputs.

**Step 2: Generate sorted path manifests**

Run:

```bash
mkdir -p /tmp/all-staging-production-integration
git diff --name-only BASE STAGING | sort -u > /tmp/all-staging-production-integration/staging.paths
git diff --name-only BASE MAIN | sort -u > /tmp/all-staging-production-integration/main.paths
comm -12 /tmp/all-staging-production-integration/main.paths /tmp/all-staging-production-integration/staging.paths > /tmp/all-staging-production-integration/overlap.paths
```

Replace `BASE`, `MAIN`, and `STAGING` with the exact constants, not shell
variables. Expected overlap count: 61.

**Step 3: Record the inputs**

Record the constants, tree IDs, path counts, and UTC timestamp in
`inputs.txt`. This is audit material outside the candidate commit.

**Step 4: Verify the production baseline**

Run:

```bash
npm test
```

Expected at the frozen production input: 1080 test files and 8541 tests pass,
with only the repository's existing skipped tests.

### Task 2: Commit the approved design and executable plan

**Files:**

- Create: `docs/superpowers/specs/2026-09-04-all-staging-content-production-integration-design.md`
- Create: `docs/superpowers/plans/2026-09-04-all-staging-content-production-integration.md`

**Step 1: Review the documents against the approved scope**

Confirm that all staging-only code, UI, balance, tests, docs, assets, scripts,
and toolkit files are in scope; production runtime deployment is out of scope.

**Step 2: Commit the documents**

Run:

```bash
git add docs/superpowers/specs/2026-09-04-all-staging-content-production-integration-design.md docs/superpowers/plans/2026-09-04-all-staging-content-production-integration.md
git commit -m "docs: define complete staging production integration"
```

Expected: one documentation commit on top of the frozen production input.

### Task 3: Construct the explicit-base union candidate

**Files:**

- Modify: every net staging path after the logical base
- Preserve: every net production path after the logical base

**Step 1: Confirm clean state and exact ancestry**

Run:

```bash
git status --short
git rev-parse HEAD^ origin/main origin/staging
```

Expected: clean state; `HEAD^` is the frozen production SHA; remote refs still
match the frozen inputs.

**Step 2: Apply the three-tree merge**

Run:

```bash
git read-tree -m -u 25fb95beffce1aa4e05d33fdf8fe560ed872c937 HEAD 6bd1744fe461a22662b20288ca9169621506b440
```

Expected: all non-conflicting tree changes are staged and conflicted paths
have index stages 1/2/3. Do not commit at this step.

**Step 3: Inventory conflicts**

Run:

```bash
git diff --name-only --diff-filter=U
git ls-files -u
```

Expected: the known 16 textual-conflict paths, subject to exact tree-merge
rename handling. Investigate any additional or missing path before continuing.

### Task 4: Resolve conflicts semantically

**Files:**

- Modify: the 16 conflict paths listed in the design
- Test: adjacent test and snapshot files for each resolved implementation

**Step 1: Inspect each stage and adjacent history**

For every conflict, inspect:

```bash
git show :1:path/to/file
git show :2:path/to/file
git show :3:path/to/file
git log --oneline --all -- path/to/file
```

Use the production version as the environmental and latest-production
behavior baseline, then incorporate all staging intent. Do not use a blanket
checkout of either side.

**Step 2: Resolve by feature family**

Resolve and stage in these groups:

1. Release and asset documentation/scripts.
2. Authenticated E2E database support.
3. Mining, woodcutting, enhancement, and marketplace views.
4. Combat engines and golden snapshot.
5. Equipment liberation/enchantment UI and tests.
6. Unexplored-boss toolkit validators and tests.

After each group, run the narrowest associated tests before staging the next
group. If behavior is not already covered, add a regression test before the
resolution implementation.

**Step 3: Eliminate unresolved entries and markers**

Run:

```bash
git diff --name-only --diff-filter=U
rg -n '^(<<<<<<<|=======|>>>>>>>)' --glob '!package-lock.json' .
```

Expected: both commands produce no conflict result.

### Task 5: Review every both-changed path

**Files:**

- Read: all 61 paths in `/tmp/all-staging-production-integration/overlap.paths`
- Create: `/tmp/all-staging-production-integration/overlap-review.tsv`

**Step 1: Classify each overlap**

For every path, record one of:

- `identical-result`: both intents are represented by the automatic result.
- `manual-union`: manually edited to retain both intents.
- `superseded-main`: production implementation safely subsumes staging intent.
- `superseded-staging`: staging implementation safely subsumes production
  intent without removing production-only behavior.
- `intentional-delete`: deletion reviewed and safe.

Include a short reason and any focused test command in the TSV.

**Step 2: Inspect automatic merges, not only conflicts**

Compare base/main/staging/candidate for each path with `git diff` and
`git show`. Repair semantic collisions such as duplicated imports, reordered
handlers, changed constants, stale snapshots, or one side bypassing the other.

**Step 3: Require full manifest coverage**

Verify that the TSV contains exactly the 61 overlap paths once each. Stop if
there is any omission or duplicate.

### Task 6: Prove one-sided preservation and release safety

**Files:**

- Read: generated path manifests
- Create: `/tmp/all-staging-production-integration/preservation-report.txt`

**Step 1: Audit production-only paths**

For paths changed only by production from the logical base, verify the
candidate blob and mode match the frozen production input exactly.

**Step 2: Audit staging-only paths**

For paths changed only by staging from the logical base, verify the candidate
blob and mode match the frozen staging input exactly.

**Step 3: Audit deletions, renames, binaries, and file modes**

Use `git diff --summary`, `git diff --raw`, and `git ls-tree` against all three
inputs. Confirm every staged deletion and rename is intentional and that no
executable bit or binary asset is lost.

**Step 4: Audit protected production surfaces**

Confirm `.env.example`, `.env.production`, `.github/workflows/`, and `deploy/`
match the frozen production input wherever staging equals the logical base.
Confirm production migrations 0179 through 0182 remain present and unchanged,
and review all staging-added migration ordering.

### Task 7: Run focused verification

**Files:**

- Test: tests adjacent to the 16 conflict paths
- Test: staging feature-family release tests
- Test: production-only payment/review/rating tests

**Step 1: Run tests for manually resolved files**

Build the exact Vitest file list from adjacent tests and run:

```bash
npx vitest run <resolved-area-test-files>
```

Expected: all selected tests pass and snapshots are reviewed, not blindly
updated.

**Step 2: Run feature-family smoke suites**

Cover unexplored content and bosses, enhancement/liberation, dark mode and
surface behavior, admin mail, toolkit adapters, marketplace, and navigation.

**Step 3: Run production-only smoke suites**

Cover Toss payment/review/rating paths and release safeguards so the union
does not regress the production-only work.

### Task 8: Run repository-wide verification

**Files:**

- Verify: whole candidate

Run each command separately and retain its exit code:

```bash
npm test
npx tsc --noEmit
npx eslint .
npm run check-images
npm run check-asset-rights -- --strict
npm run check-migrations
npm run check-secrets
npm run check-action-pins
npm run check-public-release
npm run build
```

Run relevant Playwright suites when their database/browser prerequisites are
available. If infrastructure prevents a suite, record the exact blocker and
do not represent it as passing.

Expected: every executable check passes. `npm run build` must not mutate the
candidate unexpectedly; inspect `git status` afterward.

### Task 9: Review and commit the union candidate

**Files:**

- Modify: all integrated paths

**Step 1: Review candidate diff**

Run:

```bash
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached --summary
```

Confirm that the diff relative to the frozen production SHA contains the
approved design/plan plus the complete staging net change and only necessary
semantic resolutions.

**Step 2: Commit once**

Run:

```bash
git commit -m "release: integrate all staging content with production updates"
```

Expected: one integration commit after the documentation commit. Record the
full candidate SHA and tree ID.

**Step 3: Re-run completion evidence**

At minimum rerun `git diff --check`, TypeScript, focused conflict-area tests,
and any check affected by final edits. Do not claim completion from earlier
output.

### Task 10: Prepare test-server reconciliation without production deploy

**Files:**

- No additional code changes expected

**Step 1: Re-fetch and compare moving branch heads**

Fetch `main` and `staging`. If either differs from the frozen inputs, stop and
reconcile the candidate through the same explicit-base audit before any push.

**Step 2: Push a review branch and open the appropriate PR only when the
approved external-write scope is confirmed**

The PR must state all three frozen SHAs, attach path and overlap audit counts,
list manual resolutions, verification evidence, test-server rollback SHA, and
the production-deployment stopping point.

**Step 3: Deploy the exact candidate tree to the test server**

Do not overwrite `staging` with an unrelated branch or force-push. Use a
reviewed reconciliation PR so the resulting staging tree exactly matches the
candidate while preserving auditable history. Verify test-server health and
`/api/version` against the deployed SHA.

**Step 4: Stop before production runtime deployment**

Report the verified candidate, test-server SHA, remaining production-only
approval, and rollback point. Do not run the production deploy workflow and do
not enable production maintenance until the user explicitly requests the
production deployment.
