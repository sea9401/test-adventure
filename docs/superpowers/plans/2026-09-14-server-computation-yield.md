# Server computation yield implementation plan

> Execute inline using the executing-plans workflow. Repository instructions prohibit
> subagents and repeated approval gates. Keep the change on the current clean feature
> branch; no integration, push or deployment is authorized.

**Goal:** Preserve all 50 battles and ranking results while allowing unrelated requests
to progress during large computations.

**Architecture:** A server-only time-budget checkpoint uses a real Node immediate.
The hunt loop checks it between battles; a sequential map uses it between ranking rows.
Existing transactions, cache lifetimes, error propagation and formulas remain intact.

**Tech Stack:** Next.js 16.2.11 Node route handlers, TypeScript, Vitest.

## Global constraints

- Preserve 50 battles, rewards, logs, early-stop policy and same transaction.
- Preserve ranking formulas, ordering, exclusions and 30-second cache.
- No dependencies, migrations, UI changes, deployment or production writes.
- Read bundled Next route-handler documentation before implementation (done).
- Baseline hunt/ranking tests: 2 files, 35 tests pass.

## Task 1: Actual event-loop checkpoints

Files: `src/lib/server/cooperativeYield.ts`, `cooperativeYield.test.ts`.

- [x] Add tests for the 8ms threshold, no unnecessary scheduling, real immediate
  progress, budget reset after resuming, sequential mapping and thrown error propagation.
- [x] Run `npm test -- src/lib/server/cooperativeYield.test.ts` and observe failure.
- [x] Implement `createCooperativeYield(): () => Promise<void> | undefined` with
  `performance.now()` and `setImmediate` from `node:timers/promises`; reset the budget
  after the immediate resolves. Implement `mapWithCooperativeYield<T, R>(rows:
  readonly T[], map: (row: T, index: number) => R): Promise<R[]>` with ordered iteration.
- [x] Re-run the tests, verify successful output.

## Task 2: Preserve all battles while yielding

Files: `src/app/api/v2/dungeon/hunt/route.ts`, `src/lib/server/huntRoute.test.ts`.

- [x] Add a 50-battle integration test using the real combat code and existing in-memory
  DB. Schedule an immediate during battle one, force the time budget to advance, assert
  it runs while `0 < completed < 50` and before final saves. Assert all 50 wins/replays,
  stamina -50, EXP/gold consistency, mastery events and one lock/save batch.
- [x] Run the test against the current loop and observe failure of intermediate progress.
- [x] Create one checkpoint per batch. Before battle `i > 0`, call it and await only
  a returned promise. Keep all existing early exits, result accumulation and final writes.
- [x] Run hunt route, cooldown, stamina, rare map, tax and drop/proficiency tests.

## Task 3: Cooperative ranking computation

Files: `src/app/api/rankings/route.ts`, `rankingResponsiveness.test.ts`.

- [x] Add tests with real score calculation and controlled monotonic clock: schedule an
  immediate when processing the first candidate and verify progress before all candidates
  finish for both metrics. Verify ties/eligibility, concurrent cold-miss sharing, 30-second
  cache refresh and retry after a rejected calculation.
- [x] Observe the progress tests fail against the synchronous map/flatMap.
- [x] Use the sequential map helper for achievement scoring and combat-power derivation;
  retain final flatten/sort/rank assignment and existing cache logic.
- [x] Run both ranking test files and related eligibility/metric tests.

## Task 4: Review, measure, verify and commit

- [x] Compare actual route computations with/without yielding in a local bounded experiment;
  record completed battles/candidates and timer latency, not a claimed production speedup.
- [x] Review diff for altered game rules, accidental parallel mutations, missing awaits,
  partial cached results, swallowed errors and server-only imports.
- [x] Run `npx tsc --noEmit`, lint changed TypeScript, module budgets, `git diff --check`
  and the relevant regression suites. Fix any introduced errors and repeat affected checks.
- [x] Record test/measurement results and limitations. Commit the scoped changes locally.


## Verification results

- Red: before the change, the hunt pulse saw all 50 battles already completed; both
  ranking pulses saw all 11 eligible candidates already scored. Cache/retry tests passed.
- Green: 22 related test files, 130 tests passed. The 50-battle test also verifies the
  same-user duplicate is rejected while execution is yielded, before final save writes.
- `npx tsc --noEmit`, ESLint for all six changed/new TypeScript files, and
  `git diff --check` passed.
- Module budgets: existing failure in `src/adventure/v2/combat/engine-pvp.ts`, 5,256 lines
  against a 5,254 limit. `git show HEAD:<path>` and the worktree are byte-identical.
  This unrelated file and the limit were not changed. The touched hunt route is within
  its 1,730-line budget.
- Inline review: no parallel game-state mutation, no changed count/benefit policy,
  no dropped replay or reward, no cache of partial rows, and no client imports of the
  Node-only helper. The same transaction and final save batching remain in place.
- Full build/full repository test suite were not run; verification targets the changed
  server routes and their dependent game-rule tests. No production action was taken.

## Local timing experiment

An isolated Vitest fixture in `/tmp/adventure-yield-benchmark` reuses the existing route
DB mocks and real game computations. Baseline replaces only the checkpoint with a no-op
or the cooperative map with synchronous `Array.map`; the improved case uses the actual
helper. Both cases use identical candidate/game fixtures. A real `setImmediate` callback
is queued when a request starts, and its delay is measured with the real monotonic clock.
No artificial compute delay or mocked performance clock is used in this experiment.

After warmup, baseline and improved groups alternate. The hunt fixture uses 50 battles
per request (8 samples per variant); each ranking uses 4,000 generated candidate saves
(6 samples per variant). All three experiment tests pass, comparing the full JSON ranking
response or full hunt response plus every stored save for equality between variants.

| Workload | Other-work delay median, before → after | Request duration median, before → after |
| --- | --- | --- |
| 50 battles | 18.23ms → 8.50ms | 18.20ms → 15.91ms |
| 4,000 combat-power candidates | 55.50ms → 8.32ms | 55.19ms → 52.31ms |
| 4,000 achievement candidates | 1,556.70ms → 8.68ms | 1,556.62ms → 1,588.42ms |

The improved achievement callback still reached 161.50ms in one sample, so 8ms must not
be presented as an absolute latency bound. This change improves opportunities for other
requests to run; it does not eliminate GC, single-item pauses, DB cost, or all CPU work.
The achievement request itself was slightly slower. These are local measurements, not
production latency predictions. Measure production only after separately authorized deployment.

Experiment command:

```sh
npx vitest run --config /tmp/adventure-yield-benchmark/vitest.config.mjs -t 'benchmark actual'
```

Raw local measurements: `/tmp/adventure-yield-benchmark/{hunt,combatPower,achievementScore}-metrics.json`.
