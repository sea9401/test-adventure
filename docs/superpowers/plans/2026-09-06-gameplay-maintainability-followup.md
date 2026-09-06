# Gameplay maintainability follow-up

## Approved design and scope

Implement the six audit stages in order, preserving current game rules. Work in the existing isolated worktree on top of the unshipped wallet reset fix. No deployment, push, or integration is authorized. No subagents. Prefer leaf modules and existing state slices over additional state systems. Preserve transaction boundaries, locks, RNG calls, arithmetic order, and public response shapes.

## Tasks and verification

1. Wallet synchronization: add a failing summon-stone craft regression (successful zero balance and failed request), apply authoritative resource patch only after validated success. Run unexplored client/service tests.
2. Marketplace reads: add an instance-local request coordinator with in-flight deduplication, explicit fresh reads after mutations, and stale-result protection. Test deferred response races, failure/retry, and existing request behavior.
3. Narrow subscriptions: migrate resource/action-only consumers to existing dedicated contexts. Adjust test providers/mocks and verify affected components and context isolation.
4. Life content: extract shared gathering response parsing and canvas infrastructure/render modules. Cache canvas layout between resize notifications. Preserve life rewards and verification. Run gathering/fishing and sizing tests.
5. Server/admin boundaries: extract grid support/combat helpers, guild workshop access/read models, and operations dashboard sections/aggregation into leaf modules. Preserve query bounds and transaction order. Run respective route/component tests.
6. Combat boundaries and cleanup: extract boss-specific ATB helpers and safe PvP skill phases. Preserve deterministic results and acyclic imports. Remove only verified orphan files. Update module budgets; run combat golden/boundary tests, full tests, lint, typecheck and build.

Each stage receives a local commit after relevant verification. Record findings and deviations here. Do not claim runtime speed improvements without measurements; structural reductions and avoided requests/layout reads are independently testable.

## Progress

- Plan reviewed against the approved audit. Existing wallet reset change retained.
- Stage 1: summon-stone crafting now patches shared wallet balances after validated success; failed network requests leave them alone. Client regression observed failing before the fix. Client 28 tests and server 10 tests passed.
- Stage 2: instance-local in-flight coordinator covers browse/history/prices/bids/alerts. Successful mutations invalidate earlier reads, unmount ignores outstanding results, and browse tabs cannot overwrite newer shared metadata. Deferred-race and component request tests passed.
- Stage 3: seven consumers use existing resource/world/refresh contexts. Inbox interaction and provider isolation tests passed; broad-subscription regression guard added.
- Stage 4: shared gathering parsers/transport retain verification and domain-specific results. Fishing canvas and drawing separated; layout measured initially and on resize, DPR remains live. Related 59 tests, lint and typecheck passed.
- Stage 5: grid support/read-model/combat, workshop access/read handler and operations aggregation/UI sections extracted. All 103 original function bodies compared identical. Related 51 tests, lint and typecheck passed.
- Stage 6: six boss families and ATB log helpers separated; PvP cast input, provoke, stats, side updates and initial state isolated. All 75 original combat function bodies compared identical (cast preparation recomposed for comparison). Combat suite 897 tests passed before final aggregate verification. Module budgets expanded to 53 targeted files with reduced parent limits.
- Verified orphan marketplace files `EquipmentBuyOrderCatalogOption.tsx` and `lifeItemPurchaseGroups.ts` removed. The server-only script stub is retained.

## Deliberate boundaries

- No speculative database cache or query-limit changes: existing dashboard read bounds, transaction scopes and lock order are unchanged. No live database profiling or deployment performed.
- Existing resource contexts are reused; multi-slice screens were not forced into an additional subscription abstraction.
- Gathering shares transport/parsing without merging domain rewards. Canvas motion/phase timing and drawing bodies are unchanged; the test measures avoided layout reads, not an asserted end-to-end FPS improvement.
- PvP/PvE remain distinct. Large effect orchestrators can be split further later, but this pass creates testable input and boss boundaries without rewriting battle rules.

## Final verification

- Full lint, 53-file module budgets and production build passed. Independent typecheck passed (the production build intentionally skips it).
- Full regression suite: 1,196 passed files / 5 skipped; 9,471 passed tests / 23 skipped (267.74 seconds). Final post-format/import targeted run: 25 passed tests. Final independent typecheck and targeted lint passed; `git diff --check` is clean.
- All six stages completed locally. Preserve `fix/unexplored-wallet-sync-20260906` and `/tmp/adventure-gameplay-refactor-20260906`; no merge, push, deployment, or maintenance-mode change.
