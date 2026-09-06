# September 6 evening pending work squash plan

> Execute inline with executing-plans; no subagents, push, or deployment.

**Goal:** Consolidate the listed pending work and feedback 587 commit into one commit above production ab4032eeaa8388ec0778021f2627da37231f8285.

**Architecture:** Retain deployed module boundaries and port older-branch behavior changes to the extracted modules. Preserve source branches and all regression coverage.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle, Vitest.

## Sources

- Current work: b88fb9eda..2d9d105f6 (10 commits, including the already-refreshed maintenance page).
- Wallet, performance, combat diagnostics: ab4032ee..52358d8fb (24 commits).
- Battle and skill UI: b88fb9eda..36aa8fc2e (2 commits).
- Route point preview: ab4032ee..957429f15 (1 commit).

## Steps

- [x] Create isolated /tmp worktree above production; preserve originals.
- [x] Apply the four bounded source ranges without their already-deployed history.
- [x] Resolve moved-module conflicts in combat healing, triple ward input, marketplace UI, cooperative summoning, and UI tests.
- [x] Verify migration history and snapshot consistency; preserve preexisting production schema.
- [x] Run TypeScript, lint, static guards, unit tests, deterministic level simulation, and local production build; document inherited generated-type errors below.
- [x] Review source coverage and conflict adaptations; prepare the entire result for one squash commit.

## Integration checks

- Keep existing stale-resource and concurrent cooperative boss protections.
- Forward free support through createCoopBossSession; retain initial boss mechanics.
- Keep healing telemetry when using the shared passive-lifesteal helper.
- Preserve both wallet synchronization and shortest-route preview tests.
- Do not activate maintenance, push, or deploy.

## Verification record

- All four bounded ranges contain 37 source commits; all source-added files are present.
- Migration journal passes with 185 entries. Snapshot 0184 follows 0183 and adds only `is_support` and `allow_free_support` columns.
- Static guards passed: secret scanning/self-test, action pins, image references, asset rights, dependency licenses, migration guard, 64 module budgets.
- Full unit run: 1,230 files, 9,723 passing tests, 23 skipped tests, 2 failures. Both failures were stale expectations (character notification accessible name and old maintenance copy) and passed after correction.
- Integration rerun: 7 files / 119 tests passed, including the corrected navigation test.
- Maintenance/security rerun: 2 files / 25 tests passed, including the corrected maintenance assertion.
- Cooperative support focused run: the 4 non-navigation files passed; all 45 other tests in that run passed.
- Passive lifesteal including actual-healing diagnostics assertions: 27 tests passed.
- Deterministic level design simulation: 13 tests passed.
- Full ESLint passed; final changed TypeScript files are linted again with the final typecheck.
- Tests that spawn subprocesses need an unrestricted local execution context: the RDS monitor test passed all 8 tests outside the sandbox.
- Browser E2E, remote CI, push, and deployment are outside this local squash verification.

## Conflict adaptations

- Ported legacy engine.ts / engine-pvp.ts behavior into engine.playerSkills, engine.pveOperations, engine.pvpSkills, engine.pvpOperations, and engine.pvpSkillInput.
- Ported passive derived stats to derivePlayerCombatV2Pure; retained the deployed derivation facade.
- Preserved healing diagnostics in the shared skill-healing helper and added reconciliation assertions.
- Preserved existing cooperative attack regression tests and placed the new support suite in freeSupport.test.ts.
- Preserved standard-boss reward gating, optimistic concurrency protections, and initial boss mechanics; forwarded free-support options through the shared session creator.
- Extracted auction settings and the existing select control to keep the marketplace module under its existing budget.
- Combined wallet synchronization and route preview test cases.
- Matched the app fallback maintenance page to the already-updated static announcement.

## Final validation limitation

The clean-source TypeScript check passed before build (matching the fresh-checkout CI static-check order). Final full ESLint and the Webpack production build passed. An additional TypeScript check including build-generated `.next/types` found 8 inherited Next.js route/page signature errors. All eight referenced source files are byte-identical to production ab4032ee: admin presence, profile avatar, dungeon hunt, combat loadout presets, cultivate, reforge stone combine, friendly training, and the Museun Coin product page. Errors concern unsupported route/page exports and two optional Request parameters. No unrelated API changes or type-check exclusions were introduced to mask them.
