# Unexplored Presets Implementation Plan

> Execute inline using superpowers:executing-plans. No subagents per AGENTS.md.

**Goal:** Provide three independent node allocations with free switching and existing per-node refund/reset costs.

**Architecture:** Extend the normalized character save while retaining selectedNodeIds as the active allocation. Persist switches and edits through the existing locked mutation route. Add preset controls to the existing tree screen.

**Tech Stack:** TypeScript, Next.js route handlers, React, Vitest.

## Constraints

Exactly three slots; migrate old nodes to slot 1; shared progression; refund cost 500,000G per non-start node; no overwrite/copy or deployment; opaque surfaces; protect other work in the original checkout.

## Tasks

- [x] State/service: add regression cases to `unexploredState.test.ts` and `unexploredService.test.ts` for legacy migration, normalization, free round trips, independent edits, unchanged refund/reset prices, shared point limits and stale requests. Run failing tests, then add `activePresetIndex`, `nodePresets` and switch mutation to `unexploredState.ts` / `unexploredService.ts`. Use `selectedNodeIds` as active source and normalize it into the corresponding slot on each save.
- [x] Route: add `route.test.ts` cases for `switch_preset` and invalid indexes, stale reset and non-persistence. Extend `parseMutation` to accept validated `presetIndex` and `expectedPresetIndex`, defaulting omitted expected index to 0 in the service. Return existing transactional snapshot.
- [x] Hunt: exercise `prepareUnexploredHunt` after switches so inactive nodes cannot affect encounters or rewards. Verify progression grants preserve inactive allocations.
- [x] UI: add interaction regressions in `V2UnexploredTreeView.test.tsx`; then extend `UnexploredClientSnapshot` and render three accessible preset controls. Send expected slot with every mutation, use response as authority, reset inspected node after switch, identify preset in reset confirmation, block duplicate requests with a ref while pending.
- [x] Run related tests, TypeScript, targeted ESLint, diff check; review migration and all consumers of selectedNodeIds; record outcomes and commit only this branch's task changes.

Baseline: 4 files / 62 tests pass before changes.

## Verification and review

- Baseline: 4 files / 62 tests passed.
- Red phase: 15 new state/service regressions, 9 route regressions and 6 UI assertions failed before their implementations.
- Final related suite: `npm test -- unexplored` — 45 files / 698 tests passed.
- After final UI layout refinement: tree view and hunt page model — 2 files / 40 tests passed.
- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false` passed. The default 2 GB heap exhausted memory; increasing the process heap resolved it.
- Targeted ESLint and `git diff --check` passed.
- Actual preset selector rendered with project Tailwind CSS in installed Chromium at 360px and 1280px, both themes: no page/button overflow and opaque panel backgrounds. Screenshots and results are local ignored artifacts under `artifacts/preset-697/`. This was an isolated component visual check, not a full authenticated browser flow.
- Inline review (no subagents per AGENTS.md): traced every non-test consumer of selectedNodeIds; all gameplay consumers retain the active allocation. Shared progression and crafting preserve inactive slots through parsing/spreading. The route keeps row locking and server-controlled allocations; stale edits cannot target a different preset. No copy/delete operation bypasses the existing refund price.
- Changes stay in `feat/unexplored-presets-697` at `/tmp/adventure-feedback-697`; no deployment, push or external feedback update.
