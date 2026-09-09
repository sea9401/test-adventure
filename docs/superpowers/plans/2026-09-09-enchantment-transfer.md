# Enchantment Transfer Implementation Plan

> Execute inline using executing-plans and TDD. AGENTS.md prohibits subagents and repeated approval gates; retain changes on the current feature branch.

**Goal:** Same-slot full enchantment transfer with source retention, stage/line costs and confirmation.
**Architecture:** Shared pricing and revision utilities; pure transfer service; authenticated transactional route using existing UUID receipt storage; a separate transfer flow and confirmation dialog mounted from the enchantment panel.
**Tech Stack:** TypeScript, Next.js route handlers, React, Drizzle, Vitest/Testing Library.

## Constraints
Follow the approved spec at `docs/superpowers/specs/2026-09-09-enchantment-transfer-design.md`. No deployment or external writes. Preserve current user work. No schema migration: revision is an optional equipment JSON field, transfer receipts reuse the existing table with an operation-specific intent key.

## Task 1 — Shared rules and transfer service
- [x] Write `src/lib/server/equipmentEnchantmentTransfer.test.ts` exercising `applyEquipmentEnchantmentTransfer({character,equipment,sourceIid,targetIid,expectedSourceRevision,expectedTargetRevision})` and `enchantmentTransferCost(state)` in `src/adventure/data/v2/equipmentEnchantmentTransfer.ts`.
- [x] Run failing tests: all nine costs; preserve source/destination metadata; replace all target enchantment; reject invalid ownership/slot/eligibility/empty source/stale/gold without mutation.
- [x] Implement `{baseGoldCost, additionalGoldCost, goldCost}` pricing and `equipmentLiberationRevision(instance)`. Persist optional `liberationRevision` in `v2Equipment.ts`; retain it after removal and advance it on existing liberation service changes. Update existing panel request revision.
- [x] Verify transfer→re-enchant rejects old revision and parsed saves retain tombstones. Run service and equipment parser tests.

## Task 2 — Transactional route
- [x] Write `src/app/api/v2/me/equipment/enchantment-transfer/route.test.ts` using real transfer service and mocked transaction boundaries following existing liberate route tests.
- [x] Run red for auth/feature/input guards, successful transfer and repeat UUID, conflicting intent, concurrent double transfer, stale target and rollback on receipt failure.
- [x] Implement POST body `{sourceIid,targetIid,expectedSourceRevision,expectedTargetRevision,requestId}`. Strictly validate JSON types and safe revisions. Lock character, check receipt, lock equipment, apply service, persist both saves and receipt atomically. Receipt iid is `enchantment-transfer:` plus JSON array `[sourceIid,targetIid,expectedTargetRevision]`; expectedRevision stores source revision. Generalize receipt response typing without altering old API shape.
- [x] Run new and existing liberation route tests.

## Task 3 — UI and confirmation
- [x] Write `src/adventure/v2/liberation/EquipmentEnchantmentTransfer.test.tsx`: no request before confirmation, matching slot targets, all transferred options/levels and target overwrite warning, focus cancel, exact price, success updates both items/wallet, network retry UUID reuse, stale closes confirmation.
- [x] Implement `EquipmentEnchantmentTransfer` with `source`, `candidates`, wallet and item-update callbacks, and `onClose`. Keep its pending request ref stable across network errors. Prevent duplicate submit with synchronous ref.
- [x] Implement `EnchantmentTransferConfirmDialog` with opaque surfaces, scroll bounds, modal accessibility and cancellation focus. Snapshot both revisions at confirmation opening and reject changed selections/state before submit.
- [x] Mount flow from `EquipmentLiberationPanel`, blocking reroll/selection while transferring. Retain selected source after success and display completion. Existing callbacks use functional updates so both items are updated together in a React batch.
- [x] Run UI tests and existing enchantment panel/view model tests.

## Task 4 — Review and verification
- [x] Review invariants, request replay and no resurrection of removed options, light/dark surface styles and small viewport layout. Run related tests, `npx tsc --noEmit`, changed-file eslint, `git diff --check` and module budgets.
- [x] Mark plan complete, commit locally and report checks and deployment status.

## Verification result

- 15 related Vitest files: 171 tests passed.
- Full TypeScript check passed with `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`; the default 2 GB run exhausted its heap.
- Changed-file ESLint passed.
- Playwright Chromium at 320×568 in light/dark: modal fits viewport, no horizontal overflow, all content/actions scroll into view, cancel is initially focused and closes without a request; no page errors. Opaque surface colors verified after the opening animation. Temporary preview route removed after inspection.
- Reviewed transfer state preservation, pricing, receipt intent collisions, replay, stale revisions across removal/reapplication, transactional save order, and client error/retry handling inline per AGENTS.md (no subagents).
