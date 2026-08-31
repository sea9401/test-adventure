# Unexplored Boss Core Forging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository instructions prohibit subagents unless the user explicitly requests them, so execute inline.

**Goal:** Add a server-authoritative, idempotent boss-core forge for the six 30%/10% unexplored personal-boss uniques while keeping all three 0.5% uniques drop-only.

**Architecture:** Derive a typed recipe catalog from the existing boss definitions, persist the latest 50 equipment-craft receipts in `character.v2.unexplored`, and use a focused pure service to validate and deduct materials. A new authenticated Route Handler mints and appends equipment inside the existing transaction/lock order, records unique acquisition and codex mastery, and the existing client view renders an opaque forge section with the shared game confirmation dialog.

**Tech Stack:** Next.js 16.2 App Router Route Handlers, React 19 client components, TypeScript, Vitest, Testing Library, Drizzle transaction helpers, existing game-dialog and surface components.

## Global Constraints

- Craft exactly the six 30% and 10% uniques; all three 0.5% uniques remain drop-only.
- A 30% unique costs 8 `v2_unexplored_boss_core` plus 25 of each linked pool material.
- A 10% unique costs 25 `v2_unexplored_boss_core` plus 75 of each linked pool material.
- Do not charge gold, traces, summon scrolls, or summon stones.
- Do not require a boss kill or active `deep-boss` node.
- Mint the same tradeable, rolled equipment instances used by boss drops.
- Record unique acquisition and `equipment.craft` mastery, but do not auto-register equipment codex entries.
- Keep only 50 valid equipment-craft receipts, deduplicated by `requestId` with the last record winning.
- Use `SURFACE_CARD`/`SURFACE_INSET`; do not introduce translucent content surfaces or container-wide disabled opacity.
- Do not change the unexplored feature flag, deploy, merge, push, or enable maintenance mode.

---

### Task 1: Recipe catalog and receipt persistence

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/unexploredState.ts`
- Modify: `src/adventure/data/v2/unexploredState.test.ts`

**Interfaces:**
- Produces: `UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES`, `unexploredBossEquipmentCraftRecipe(value)`, `UnexploredBossEquipmentCraftRecipe`.
- Produces: `UnexploredEquipmentCraftReceipt` and `UnexploredSave.equipmentCraftReceipts`.
- Recipe entries expose `bossId`, `equipmentId`, `equipmentName`, `chancePct`, `bossCoreCost`, and two `{ poolId, materialId, materialName, count }` costs.

- [x] **Step 1: Write failing catalog tests**

Add assertions that the recipe equipment IDs are exactly the first two drops of each boss in boss order, their costs are `[8, 25, 25]` for 30% and `[25, 75, 75]` for 10%, their names match `V2_EQUIPMENT`, and the three 0.5% IDs are absent.

```ts
expect(UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES).toHaveLength(6);
expect([recipe.bossCoreCost, ...recipe.materialCosts.map((cost) => cost.count)])
  .toEqual(recipe.chancePct === 30 ? [8, 25, 25] : [25, 75, 75]);
expect(unexploredBossEquipmentCraftRecipe(ultraRareId)).toBeNull();
```

- [x] **Step 2: Run the catalog test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts`

Expected: FAIL because the recipe catalog exports do not exist.

- [x] **Step 3: Implement the derived recipe catalog**

Add `equipmentName` to all nine `UnexploredBossUniqueDrop` records, validate it against `V2_EQUIPMENT` in the test, and derive only `chancePct !== 0.5` entries. Resolve linked material metadata through `UNEXPLORED_POOL_BY_ID`. Export a parser that returns the matching recipe or `null` for any other value.

```ts
export const UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES =
  UNEXPLORED_BOSS_IDS.flatMap((bossId) => {
    const boss = UNEXPLORED_BOSSES[bossId];
    return boss.uniqueDrops.flatMap((drop) => {
      if (drop.chancePct === 0.5) return [];
      const poolMaterialCount = drop.chancePct === 30 ? 25 : 75;
      return [{
        bossId,
        equipmentId: drop.equipmentId,
        equipmentName: drop.equipmentName,
        chancePct: drop.chancePct,
        bossCoreCost: drop.chancePct === 30 ? 8 : 25,
        materialCosts: boss.pools.map((poolId) => ({
          poolId,
          materialId: UNEXPLORED_POOL_BY_ID[poolId].materialId,
          materialName: UNEXPLORED_POOL_BY_ID[poolId].materialName,
          count: poolMaterialCount,
        })),
      }];
    });
  });
```

- [x] **Step 4: Write failing receipt parser tests**

Extend the malformed-save expectation with `equipmentCraftReceipts: {}`. Add a test with 55 valid records, a malformed record, an ultra-rare equipment ID, and duplicate request IDs. Assert that only craftable IDs survive, the last duplicate wins, and the latest 50 remain.

```ts
expect(parsed.equipmentCraftReceipts).toHaveLength(50);
expect(parsed.equipmentCraftReceipts.at(-1)).toMatchObject({
  requestId: "duplicate",
  equipmentId: "v2_unexplored_tracking_blade_dagger",
  equipmentIid: "latest-iid",
});
```

- [x] **Step 5: Run the receipt test and verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredState.test.ts`

Expected: FAIL because `equipmentCraftReceipts` is not part of the normalized save.

- [x] **Step 6: Implement receipt parsing**

Add the typed field to `UnexploredSave` and `emptyUnexploredSave()`. Parse non-empty `requestId`, a craftable `equipmentId`, non-empty `equipmentIid`, and finite non-negative `craftedAt`; deduplicate with a `Map` and retain the final 50 records.

```ts
export type UnexploredEquipmentCraftReceipt = {
  requestId: string;
  equipmentId: V2EquipmentId;
  equipmentIid: string;
  craftedAt: number;
};
```

- [x] **Step 7: Run both data tests and commit**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredState.test.ts`

Expected: both files PASS.

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredState.ts src/adventure/data/v2/unexploredState.test.ts
git commit -m "feat: define unexplored boss equipment recipes"
```

### Task 2: Pure equipment-craft service

**Files:**
- Create: `src/lib/server/unexploredBossEquipmentCraft.ts`
- Create: `src/lib/server/unexploredBossEquipmentCraft.test.ts`

**Interfaces:**
- Consumes: `unexploredBossEquipmentCraftRecipe`, `parseUnexploredSave`, `UNEXPLORED_BOSS_CORE_MATERIAL.id`.
- Produces: `applyUnexploredBossEquipmentCraft(character, equipmentId, requestId, craftedAt, mint)`.
- Success returns `{ ok: true, idempotent, character, receipt, equipment }`, where `equipment` is `null` on retry and a `V2EquipInstance` on first application.
- Failure returns `{ ok: false, error: "not_craftable" | "insufficient_boss_cores" | "insufficient_pool_material" | "request_conflict" }`.

- [x] **Step 1: Write failing service tests**

Use a ready character with 25 cores and 75 of both tracking materials and an injected mint function returning a fixed instance. Cover:

```ts
const mint = vi.fn((id: V2EquipmentId) => ({
  iid: "crafted-iid",
  id,
  enhance: 0,
}));
```

- 30% success deducts 8/25/25 and preserves unrelated fields/materials.
- 10% success deducts 25/75/75.
- core shortage and each linked-material shortage do not mutate input and do not call `mint`.
- an ultra-rare or unrelated equipment ID returns `not_craftable`.
- same request and equipment returns the original receipt with `equipment: null`, without minting or deducting again.
- same request with another equipment returns `request_conflict`.

- [x] **Step 2: Run the service test and verify RED**

Run: `npx vitest run src/lib/server/unexploredBossEquipmentCraft.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement minimal immutable validation and deduction**

Normalize positive material counts, check an existing receipt before cost validation, resolve the recipe, validate every cost, call `mint(recipe.equipmentId)` only after validation, remove zero balances, and return a parsed save with the appended receipt.

```ts
const receipt: UnexploredEquipmentCraftReceipt = {
  requestId,
  equipmentId: recipe.equipmentId,
  equipmentIid: equipment.iid,
  craftedAt: Math.max(0, Math.floor(craftedAt)),
};
```

- [x] **Step 4: Run the service test and commit**

Run: `npx vitest run src/lib/server/unexploredBossEquipmentCraft.test.ts`

Expected: PASS.

```bash
git add src/lib/server/unexploredBossEquipmentCraft.ts src/lib/server/unexploredBossEquipmentCraft.test.ts
git commit -m "feat: add boss core equipment craft service"
```

### Task 3: Authenticated transactional Route Handler

**Files:**
- Create: `src/app/api/v2/unexplored/equipment-craft/route.ts`
- Create: `src/app/api/v2/unexplored/equipment-craft/route.test.ts`

**Interfaces:**
- Consumes: `{ equipmentId, requestId }`, `applyUnexploredBossEquipmentCraft`, `appendEquipInstances`, `recordUniqueEquipmentAcquisitions`, and `recordCodexMasteryGameplayBatch`.
- Produces: status 200 `{ ok, idempotent, equipmentId, equipmentIid, materials }` or the documented JSON error.

- [x] **Step 1: Read the installed Next.js guides completely**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before creating the route or changing the client component. Apply the installed Next 16.2 conventions rather than remembered APIs.

- [x] **Step 2: Write failing route tests**

Hoist mocks for authentication, feature flag, transaction, save locks/writes, minting, equipment append, equipment-codex read, unique acquisition, and mastery recording. Assert:

- unauthenticated returns 401; disabled feature returns 404.
- malformed body, over-128-character request ID, and non-craftable ID return 400 without opening a transaction.
- successful first craft locks `character.v2`, appends one rolled instance, writes the deducted character, records unique acquisition, and records one `equipment.craft` mastery event.
- idempotent retry returns the same IID and does not mint, append, write, or record progress again.
- material errors and request conflicts return 409 with no writes.

```ts
expect(mocks.recordMastery).toHaveBeenCalledWith(
  expect.anything(),
  "crafter-1",
  [{
    category: "equipment",
    entryId: "v2_unexplored_tracking_blade_dagger",
    amount: 1,
    source: "equipment.craft",
  }],
  expect.any(Date),
);
```

- [x] **Step 3: Run the route test and verify RED**

Run: `npx vitest run src/app/api/v2/unexplored/equipment-craft/route.test.ts`

Expected: FAIL because the Route Handler does not exist.

- [x] **Step 4: Implement the Route Handler**

Follow the existing unexplored craft route: `ensureUser()`, `V2_UNEXPLORED`, JSON parsing, recipe/request validation, then `db.transaction`. Lock `character.v2` first. On first application, append the returned instance (which locks `equipment.v2`), save the character, read `equipment-codex.v2` as evidence, record unique acquisition, and record mastery. On retry, return receipt data without any secondary write.

Map `not_craftable`/invalid body to 400 and all resource/conflict errors to 409. Let thrown persistence errors abort the transaction.

- [x] **Step 5: Run route and related server tests, then commit**

Run: `npx vitest run src/app/api/v2/unexplored/equipment-craft/route.test.ts src/lib/server/unexploredBossEquipmentCraft.test.ts src/lib/server/uniqueEquipmentAchievement.test.ts src/lib/server/codexMasteryGameplay.test.ts`

Expected: all files PASS.

```bash
git add src/app/api/v2/unexplored/equipment-craft/route.ts src/app/api/v2/unexplored/equipment-craft/route.test.ts
git commit -m "feat: add unexplored equipment forge route"
```

### Task 4: Boss-core forge UI

**Files:**
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: recipe catalog, boss unique-drop display names, `V2UnexploredTreeView` snapshot materials, `confirmGameAction`.
- Sends: `POST /api/v2/unexplored/equipment-craft` with `{ equipmentId, requestId }`.
- Applies: returned `materials`; the equipment inventory is loaded through its own existing state path and is not duplicated in this snapshot.

- [x] **Step 1: Write failing render and interaction tests**

Mock `confirmGameAction` as a resolved boolean. Add tests that:

- the opaque `우두머리 핵 제작소` shows core ownership, six craftable item names, exact 8/25 and 25/75 costs, and three `0.5% · 토벌 드롭 전용` rows without craft buttons.
- a disabled craft button reflects insufficient core or either linked material.
- cancelling confirmation performs no fetch.
- confirming sends the correct equipment ID/request ID, displays all three costs in the confirmation message, applies returned materials, and shows a success toast.
- a network failure preserves the pending request ID for the next retry; a server rejection clears it.

```ts
expect(mocks.confirmGameAction).toHaveBeenCalledWith(expect.objectContaining({
  title: "추적날 단검 확정 제작",
  message: expect.stringContaining("우두머리 핵 8개"),
}));
expect(fetchMock).toHaveBeenCalledWith(
  "/api/v2/unexplored/equipment-craft",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({
      equipmentId: "v2_unexplored_tracking_blade_dagger",
      requestId: "equipment-craft-request-1",
    }),
  }),
);
```

- [x] **Step 2: Run the component test and verify RED**

Run: `npx vitest run src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL because the forge section and request handler are absent.

- [x] **Step 3: Implement the UI with existing surfaces/dialogs**

Add a separate `${SURFACE_CARD}` section below the trace vault. Render three boss groups using `${SURFACE_INSET}`, each with two recipe rows and one drop-only row. Track busy state by `V2EquipmentId` and pending IDs by equipment ID. Build the confirmation text from the recipe catalog, then apply `body.materials` to the local snapshot and toast the returned item name.

Use `confirmGameAction({ title, message, confirmLabel: "확정 제작", tone: "warning" })`; do not use `window.confirm` or add another modal implementation.

- [x] **Step 4: Run UI and unexplored regression tests, then commit**

Run: `npx vitest run src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/unexploredTreeModel.test.ts src/adventure/data/v2/unexploredBosses.test.ts`

Expected: all files PASS.

```bash
git add src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "feat: add unexplored boss core forge UI"
```

### Task 5: Full verification and handoff

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Produces: a clean, committed working tree containing the complete local feature with no deployment action.

- [x] **Step 1: Run focused feature tests**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredState.test.ts src/lib/server/unexploredBossEquipmentCraft.test.ts src/app/api/v2/unexplored/equipment-craft/route.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: all files PASS.

- [x] **Step 2: Run static checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredState.ts src/adventure/data/v2/unexploredState.test.ts src/lib/server/unexploredBossEquipmentCraft.ts src/lib/server/unexploredBossEquipmentCraft.test.ts src/app/api/v2/unexplored/equipment-craft/route.ts src/app/api/v2/unexplored/equipment-craft/route.test.ts src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: both commands exit 0.

- [x] **Step 3: Run the full test suite and production build**

Run: `npm test`

Run: `V2_UNEXPLORED=true npm run build`

Expected: the full suite and build exit 0; image optimization/check hooks report no missing references.

- [x] **Step 4: Inspect the final diff and commits**

Run: `git diff --check`

Run: `git status --short`

Run: `git log --oneline -6`

Expected: no whitespace errors, no unintended files, and all implementation changes committed. Do not deploy or alter the runtime feature flag.
