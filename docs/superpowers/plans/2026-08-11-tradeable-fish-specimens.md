# Tradeable Fish Specimens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to extract a fish codex registration into a stackable marketplace specimen, transfer it, and register it on another account without transferring personal catch records.

**Architecture:** Split fish codex registration ownership from immutable catch history, model specimens as a dedicated stack inventory derived from the fish catalog, and expose atomic extract/use routes. Reuse the existing stackable consumable marketplace and inbox fulfillment paths, then add specimen sections to the codex, consumables inventory, and marketplace seller UI.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React, Drizzle/PostgreSQL transactions, Vitest, Testing Library, existing `saves_kv` storage and marketplace tables.

## Global Constraints

- Do not deploy to any environment.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before changing route handlers; this repository's Next.js APIs may differ from prior knowledge.
- Preserve personal best size, total caught, first-catch time, best-catch time, fishing score, rankings, quests, achievements, and mastery when a registration is extracted or a specimen is used.
- Fish codex SP remains the seven milestones `5, 10, 20, 30, 40, 46, 50`.
- Extraction is free; only existing marketplace fees apply.
- A successful extraction must never leave the current equipped skill loadout over its new SP budget.
- Purchased registrations are re-extractable; specimen provenance is not stored.
- Use opaque surfaces from `src/components/ui/surfaces.ts` for any new codex or inventory panels.
- Do not create subagents; the user did not request delegation.

---

### Task 1: Split codex registration from catch history and add the specimen domain

**Files:**
- Create: `src/adventure/v2/fishSpecimens.ts`
- Create: `src/adventure/v2/fishSpecimens.test.ts`
- Modify: `src/adventure/v2/fishingCodex.ts`
- Modify: `src/adventure/v2/fishingCodex.test.ts`
- Modify: `src/lib/server/codexSpBonus.test.ts`

**Interfaces:**
- Produces `registeredFishIds(codex): FishId[]` and `caughtFishIds(codex): FishId[]`.
- Produces `extractFishRegistration(codex, fishId): { codex: FishCodex; extracted: boolean }`.
- Produces `registerFishSpecimen(codex, fishId): { codex: FishCodex; registered: boolean }`.
- Produces `FISH_SPECIMEN_SAVE_KEY`, `FishSpecimenInventory`, `parseFishSpecimenInventory`, `fishSpecimenItemId`, `fishIdFromSpecimenItemId`, `addFishSpecimen`, and `removeFishSpecimen`.
- Keeps `discoveredFishIds` as a compatibility alias for registered IDs until all callers are migrated.

- [ ] **Step 1: Add failing codex migration and state-transition tests**

Add tests that parse a legacy entry and expect both new axes, then exercise extraction, purchased registration, and direct reacquisition:

```ts
const legacy = parseFishCodex({
  fish: {
    carp: {
      discovered: true,
      bestSize: 42,
      totalCaught: 7,
      firstCaughtAt: 10,
      bestCaughtAt: 20,
    },
  },
});
expect(legacy.fish.carp).toMatchObject({
  registered: true,
  caughtEver: true,
  bestSize: 42,
  totalCaught: 7,
});

const extracted = extractFishRegistration(legacy, "carp");
expect(extracted.codex.fish.carp).toMatchObject({
  registered: false,
  caughtEver: true,
  bestSize: 42,
  totalCaught: 7,
});
expect(fishCodexSpBonus(extracted.codex)).toBe(0);

const purchased = registerFishSpecimen(emptyFishCodex(), "carp");
expect(purchased.codex.fish.carp).toMatchObject({
  registered: true,
  caughtEver: false,
  totalCaught: 0,
});
expect(fishCodexScore(purchased.codex)).toBe(0);
```

- [ ] **Step 2: Run the focused codex tests and confirm they fail**

Run: `npm test -- --run src/adventure/v2/fishingCodex.test.ts src/lib/server/codexSpBonus.test.ts`

Expected: FAIL because `registered`, `caughtEver`, and transition helpers do not exist.

- [ ] **Step 3: Implement the normalized codex model**

Change the normalized entry shape to:

```ts
export type FishCodexEntry = {
  registered: boolean;
  caughtEver: boolean;
  bestSize: number;
  totalCaught: number;
  firstCaughtAt: number;
  bestCaughtAt: number;
};
```

Parse old `discovered: true` entries as both booleans true. Make `recordCatch` set both booleans true, increment history from the preserved entry, and make SP/tier completion count only `registered`. Make score and personal-record functions require `caughtEver` and actual catch data.

- [ ] **Step 4: Add failing specimen inventory tests**

Cover catalog-derived IDs, malformed save normalization, add/remove, insufficient quantity, and underscore-containing fish IDs:

```ts
expect(fishSpecimenItemId("platinum_carp")).toBe("fish_specimen_platinum_carp");
expect(fishIdFromSpecimenItemId("fish_specimen_platinum_carp")).toBe("platinum_carp");
expect(parseFishSpecimenInventory({ items: { carp: 2, fake: 9, tuna: -1 } }))
  .toEqual({ version: 1, items: { carp: 2 } });
expect(removeFishSpecimen({ version: 1, items: { carp: 1 } }, "carp", 2))
  .toBeNull();
```

- [ ] **Step 5: Run the specimen tests and confirm they fail**

Run: `npm test -- --run src/adventure/v2/fishSpecimens.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement the specimen catalog and inventory functions**

Use `FISH`/`FISH_IDS` as authority, store counts under `fishing-specimens.v1`, clamp stored values to nonnegative safe integers, reject unknown IDs, and keep add/remove functions immutable.

- [ ] **Step 7: Run the domain tests**

Run: `npm test -- --run src/adventure/v2/fishingCodex.test.ts src/adventure/v2/fishSpecimens.test.ts src/lib/server/codexSpBonus.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the domain model**

```bash
git add src/adventure/v2/fishingCodex.ts src/adventure/v2/fishingCodex.test.ts src/adventure/v2/fishSpecimens.ts src/adventure/v2/fishSpecimens.test.ts src/lib/server/codexSpBonus.test.ts
git commit -m "feat: split fish registrations from catch records"
```

### Task 2: Add server-authoritative extraction and registration routes

**Files:**
- Create: `src/lib/server/fishSpecimenSp.ts`
- Create: `src/lib/server/fishSpecimenSp.test.ts`
- Create: `src/app/api/v2/me/fishing-specimens/route.ts`
- Create: `src/app/api/v2/me/fishing-specimens/route.test.ts`
- Create: `src/app/api/v2/me/fishing-specimens/extract/route.ts`
- Create: `src/app/api/v2/me/fishing-specimens/extract/route.test.ts`
- Create: `src/app/api/v2/me/fishing-specimens/use/route.ts`
- Create: `src/app/api/v2/me/fishing-specimens/use/route.test.ts`

**Interfaces:**
- Produces `fishSpecimenExtractionProjection({ codex, fishId, totalSpBefore, equippedSpUsed })` returning before/after fish SP, before/after total SP, `spLoss`, and `overBudget`.
- `GET /api/v2/me/fishing-specimens` returns `{ ok, specimens, registeredIds }`.
- `POST /api/v2/me/fishing-specimens/extract` accepts `{ fishId, confirmed?: { fishSpBefore, fishSpAfter, totalSpBefore, totalSpAfter } }`.
- `POST /api/v2/me/fishing-specimens/use` accepts `{ fishId }`.

- [ ] **Step 1: Write failing projection tests**

```ts
let fiveRegistered = emptyFishCodex();
for (const id of FISH_IDS.slice(0, 5)) {
  fiveRegistered = registerFishSpecimen(fiveRegistered, id).codex;
}
expect(fishSpecimenExtractionProjection({
  codex: fiveRegistered,
  fishId: FISH_IDS[0],
  totalSpBefore: 30,
  equippedSpUsed: 29,
})).toMatchObject({
  fishSpBefore: 1,
  fishSpAfter: 0,
  totalSpAfter: 29,
  spLoss: 1,
  overBudget: false,
});
```

Add a second case with `equippedSpUsed: 30` and expect `overBudget: true`, plus a non-milestone extraction with no SP loss.

- [ ] **Step 2: Run projection tests and confirm failure**

Run: `npm test -- --run src/lib/server/fishSpecimenSp.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement the pure SP projection helper**

Derive the after-codex through `extractFishRegistration`, calculate the fish bonus delta through existing milestone helpers, subtract only that delta from the already-authoritative total budget, and compare against equipped SP use.

- [ ] **Step 4: Write failing route tests for read, extract, and use**

Test these exact outcomes with mocked authenticated transactions:

```ts
const preview = await POST_EXTRACT(new Request("https://game.test/api/v2/me/fishing-specimens/extract", {
  method: "POST",
  body: JSON.stringify({ fishId: "carp" }),
}));
expect(preview.status).toBe(409);
expect(await preview.json()).toMatchObject({
  error: "sp_confirmation_required",
  fishSpBefore: 1,
  fishSpAfter: 0,
});

const useResponse = await POST_USE(new Request("https://game.test/api/v2/me/fishing-specimens/use", {
  method: "POST",
  body: JSON.stringify({ fishId: "carp" }),
}));
expect(useResponse.status).toBe(200);
expect(await useResponse.json()).toMatchObject({
  ok: true,
  specimenBalance: 0,
  registered: true,
});
```

Also assert `loadout_over_budget`, `stale_confirmation`, `not_registered`, `already_registered`, `not_owned`, invalid fish ID, and duplicate concurrent requests leave codex/specimen quantities unchanged on failure.

- [ ] **Step 5: Run the route tests and confirm failure**

Run: `npm test -- --run src/app/api/v2/me/fishing-specimens/route.test.ts src/app/api/v2/me/fishing-specimens/extract/route.test.ts src/app/api/v2/me/fishing-specimens/use/route.test.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 6: Implement the GET and transaction routes**

Follow the repository's canonical lock order used by `reconcileV2EquippedSkills`: character, skills, proficiency, codex inputs, then specimen inventory. Calculate total SP with `calcSpBudget`, `spCapBonusFromRaw`, `codexSpBonusFromRaw`, and `jobUnlockSpBonus`; calculate equipped use with `validateLoadout`.

For SP-loss extraction, return `sp_confirmation_required` unless the client confirms the exact current before/after tuple. If the tuple changed, return `stale_confirmation` with the new projection. Reject over-budget extraction before mutating either save. On success, update codex and specimen inventory in the same transaction and record an economy event.

- [ ] **Step 7: Run server route tests**

Run: `npm test -- --run src/lib/server/fishSpecimenSp.test.ts src/app/api/v2/me/fishing-specimens/route.test.ts src/app/api/v2/me/fishing-specimens/extract/route.test.ts src/app/api/v2/me/fishing-specimens/use/route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the specimen routes**

```bash
git add src/lib/server/fishSpecimenSp.ts src/lib/server/fishSpecimenSp.test.ts src/app/api/v2/me/fishing-specimens
git commit -m "feat: add fish specimen extract and use routes"
```

### Task 3: Integrate registration state with fishing, state responses, and rankings

**Files:**
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Modify: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/adventure/v2/fishingCodex.test.ts`
- Modify: `src/lib/server/codexSpBonus.ts`
- Modify: `src/app/api/rankings/route.ts` only if it directly assumes `discovered`.
- Modify: `src/app/api/rankings/route.test.ts`

**Interfaces:**
- State response adds `registeredIds`, `caughtIds`, and caught-only `best`; it may retain `discoveredIds` as a temporary alias of `registeredIds` for compatibility.
- `recordCatch` is the only fishing route transition: it restores registration when blank and always preserves/increments catch history.

- [ ] **Step 1: Add failing state and recatch tests**

Assert that a purchased-only registration appears in `registeredIds` but not `caughtIds` or `best`, while an extracted caught fish remains in `caughtIds` and `best` but not `registeredIds`. Assert a direct catch after extraction restores registration and increments the old total rather than resetting it.

- [ ] **Step 2: Run focused integration tests and confirm failure**

Run: `npm test -- --run src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/fishingCodex.test.ts`

Expected: FAIL because the state section still conflates discovery with catch history.

- [ ] **Step 3: Update state serialization and direct-catch integration**

Build registration metadata from `registeredFishIds`, record metadata from `caughtFishIds`, and return best sizes only for caught entries. Keep `reel` using `recordCatch`; update `isNewSpecies` semantics to mean newly caught (`caughtEver` was false), while separately returning `registrationRestored` if useful for UI messaging.

- [ ] **Step 4: Verify ranking isolation**

Add or extend a ranking/score test showing a specimen-only registration has score zero and no catch count, while extracted caught records retain the same score.

- [ ] **Step 5: Run state, fishing, codex, and ranking tests**

Run: `npm test -- --run src/adventure/v2/fishingCodex.test.ts src/app/api/v2/me/state/stateSections.test.ts src/lib/server/codexSpBonus.test.ts src/app/api/rankings/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the catch/state integration**

```bash
git add src/app/api/v2/fishing/reel/route.ts src/app/api/v2/me/state/stateSections.ts src/app/api/v2/me/state/stateSections.test.ts src/adventure/v2/fishingCodex.test.ts src/lib/server/codexSpBonus.ts src/app/api/rankings/route.ts src/app/api/rankings/route.test.ts
git commit -m "feat: preserve fish records across specimen transfers"
```

### Task 4: Reuse the stackable consumable marketplace for specimens

**Files:**
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/lib/server/marketplaceV2Fulfillment.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.ts`
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: `src/app/api/v2/marketplace/cancel/route.ts`
- Modify: `src/app/api/v2/marketplace/buy/route.ts`
- Modify: `src/app/api/v2/cron/marketplace-expire/route.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/lib/server/marketplace.test.ts`

**Interfaces:**
- `isStackableMarketplaceItem("consumable", specimenId)` returns true.
- `itemDisplayName("consumable", specimenId)` returns `<fish name> 표본`.
- Marketplace escrow, fulfillment, cancel, expiry, legacy inbox claim, and buy-order category helpers recognize specimen IDs through `fishIdFromSpecimenItemId`.

- [ ] **Step 1: Write failing marketplace classification tests**

```ts
expect(isStackableMarketplaceItem("consumable", "fish_specimen_carp")).toBe(true);
expect(itemDisplayName("consumable", "fish_specimen_carp")).toBe("잉어 표본");
expect(itemDisplayName("consumable", "fish_specimen_fake")).toBeNull();
```

Add tests that list two specimens, fulfill one to a buyer, return one on cancellation/expiry, and reject listing more than owned.

- [ ] **Step 2: Run marketplace tests and confirm failure**

Run: `npm test -- --run src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplace.test.ts`

Expected: FAIL because specimen consumables are not whitelisted or fulfilled.

- [ ] **Step 3: Implement common specimen marketplace helpers**

Extend classification, stackability, display name, current name, and buy-order category logic through the specimen domain helpers. Keep unknown specimen IDs invalid and do not fall through to rare-map restoration.

- [ ] **Step 4: Implement every quantity movement path**

In listing, remove from `fishing-specimens.v1` before inserting the listing. In fulfillment, cancel, expiry, and legacy inbox claim, add the exact quantity back/to the recipient. Ensure `buy` rare-map cap and rare-map validation conditions exclude recognized specimens exactly as they already exclude cooking food.

- [ ] **Step 5: Add partial purchase and buy-order regression tests**

Verify a quantity-three listing partially purchased by one leaves two escrowed and delivers one, and that an immediate buy-order match preserves `seller remaining + listing remaining + buyer delivered = original quantity`.

- [ ] **Step 6: Run the full marketplace-focused suite**

Run: `npm test -- --run src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplace.test.ts src/adventure/v2/marketplace/equipmentBuyOrders.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit marketplace support**

```bash
git add src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceV2Fulfillment.ts src/lib/server/marketplaceBuyOrdersV2.ts src/app/api/v2/marketplace src/app/api/v2/cron/marketplace-expire/route.ts src/app/api/marketplace/inbox/claim/route.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplace.test.ts
git commit -m "feat: trade fish specimens as consumables"
```

### Task 5: Add specimen inventory and marketplace seller UI

**Files:**
- Create: `src/adventure/v2/inventory/FishSpecimenSection.tsx`
- Create: `src/adventure/v2/inventory/FishSpecimenSection.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.test.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify: `src/adventure/v2/V2InventoryView.test.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceRareMapTab.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceRareMapTab.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`

**Interfaces:**
- `FishSpecimenSection` accepts `{ specimens, registeredIds, busyFishId, onUse }`.
- `MarketplaceRareMapTab` accepts specimen inventory and `onListFishSpecimen(fishId)` in addition to existing consumables.

- [ ] **Step 1: Write failing specimen card tests**

Render one unregistered and one registered specimen. Expect name, tier, quantity, an enabled `도감 등록` button only for the unregistered fish, and an explanatory disabled state for the registered fish. Assert the section uses `SURFACE_INSET`/existing `Card` rather than a translucent custom background.

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npm test -- --run src/adventure/v2/inventory/FishSpecimenSection.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2InventoryView.test.tsx`

Expected: FAIL because the specimen section does not exist.

- [ ] **Step 3: Implement inventory loading and specimen use**

Fetch `GET /api/v2/me/fishing-specimens` only when the consumables tab opens. On use, call the use route, update the returned specimen balance/registered IDs, refresh the game state SP summary, show milestone gains, and preserve the button state during failure for retry.

- [ ] **Step 4: Add failing marketplace seller tests**

Render a specimen balance of three and expect a quantity input capped at three, unit price input, reference price line, and a listing callback carrying the specimen item ID and quantity.

- [ ] **Step 5: Implement marketplace seller wiring**

Load specimen inventory alongside rare maps/cash items/foods, render a specimen subsection in the consumables seller tab, and call the existing list endpoint with `{ kind: "consumable", itemId: fishSpecimenItemId(fishId), quantity, price }`.

- [ ] **Step 6: Run inventory and marketplace UI tests**

Run: `npm test -- --run src/adventure/v2/inventory/FishSpecimenSection.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/marketplace/MarketplaceRareMapTab.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit specimen inventory UI**

```bash
git add src/adventure/v2/inventory src/adventure/v2/V2InventoryView.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/marketplace/MarketplaceRareMapTab.tsx src/adventure/v2/marketplace/MarketplaceRareMapTab.test.tsx src/adventure/v2/V2MarketplaceView.tsx
git commit -m "feat: show fish specimens in inventory and market"
```

### Task 6: Add codex extraction controls and SP warning modal

**Files:**
- Create: `src/adventure/v2/FishSpecimenExtractModal.tsx`
- Create: `src/adventure/v2/FishSpecimenExtractModal.test.tsx`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/V2CodexView.test.ts`

**Interfaces:**
- Modal accepts the selected fish, current projection returned by the server, `onConfirm`, and `onClose`.
- Codex fish cards distinguish `registered`, `caughtEver`, and `bestSize`, retaining personal records on unregistered caught entries.

- [ ] **Step 1: Write failing codex presentation tests**

Test these states:

```ts
// registered + caught: full card, record, extract button
// registered + not caught: full card, "표본 등록 · 직접 어획 기록 없음", extract button
// not registered + caught: visible record, "미등록", no extract button
// neither: hidden/unknown card
```

Add modal tests for ordinary extraction, `도감 SP +7 → +6`/`전체 SP 34 → 33`, and blocked extraction showing `장착 스킬 34 / 새 한도 33` without a confirm action.

- [ ] **Step 2: Run codex UI tests and confirm failure**

Run: `npm test -- --run src/adventure/v2/V2CodexView.test.ts src/adventure/v2/FishSpecimenExtractModal.test.tsx`

Expected: FAIL because the codex has no separate registration state or modal.

- [ ] **Step 3: Implement extraction preview/confirmation flow**

On `표본 추출`, call the extract endpoint without confirmation. If it returns `sp_confirmation_required`, open the warning modal with the exact tuple; if it reports `loadout_over_budget`, open the blocked form. For no-SP-loss extraction, show a normal confirmation and then submit. Submit the exact confirmed tuple and handle `stale_confirmation` by replacing the modal values and requiring another confirmation.

- [ ] **Step 4: Refresh codex and SP state after success**

Remove the fish from registered IDs, preserve caught IDs/best records, update milestone metadata and specimen balance, and refetch `/api/v2/me/state` so global loadout/SP panels agree.

- [ ] **Step 5: Run codex UI tests**

Run: `npm test -- --run src/adventure/v2/V2CodexView.test.ts src/adventure/v2/FishSpecimenExtractModal.test.tsx src/app/api/v2/me/state/stateSections.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit codex extraction UI**

```bash
git add src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts src/adventure/v2/FishSpecimenExtractModal.tsx src/adventure/v2/FishSpecimenExtractModal.test.tsx
git commit -m "feat: extract fish registrations from the codex"
```

### Task 7: Update the manual and run complete verification

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/content/plaza.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `docs/superpowers/plans/2026-08-11-tradeable-fish-specimens.md` only to mark completed checkboxes during execution.

**Interfaces:**
- Manual explains registration rights, record preservation, SP-loss warning, over-budget block, and marketplace transfer.

- [ ] **Step 1: Add failing manual content assertions**

Assert rendered manual content contains `어종 표본`, `등록 권리`, `어획 기록은 유지`, and a marketplace statement.

- [ ] **Step 2: Run the manual test and confirm failure**

Run: `npm test -- --run src/app/manual/current-content.test.tsx`

Expected: FAIL because the manual does not mention specimens.

- [ ] **Step 3: Update the manual**

Explain that extraction removes registration/SP but not catch records, over-budget loadouts must be adjusted first, and purchased specimens register only empty species without granting catch credit.

- [ ] **Step 4: Run all focused tests**

Run:

```bash
npm test -- --run \
  src/adventure/v2/fishingCodex.test.ts \
  src/adventure/v2/fishSpecimens.test.ts \
  src/lib/server/codexSpBonus.test.ts \
  src/lib/server/fishSpecimenSp.test.ts \
  src/app/api/v2/me/fishing-specimens/route.test.ts \
  src/app/api/v2/me/fishing-specimens/extract/route.test.ts \
  src/app/api/v2/me/fishing-specimens/use/route.test.ts \
  src/app/api/v2/me/state/stateSections.test.ts \
  src/lib/server/marketplaceV2.test.ts \
  src/lib/server/marketplaceListRoute.test.ts \
  src/lib/server/marketplace.test.ts \
  src/adventure/v2/inventory/FishSpecimenSection.test.tsx \
  src/adventure/v2/inventory/RareMapsTab.test.tsx \
  src/adventure/v2/V2InventoryView.test.tsx \
  src/adventure/v2/marketplace/MarketplaceRareMapTab.test.tsx \
  src/adventure/v2/V2CodexView.test.ts \
  src/adventure/v2/FishSpecimenExtractModal.test.tsx \
  src/app/manual/current-content.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 5: Run type, lint, and formatting checks**

Run:

```bash
npx tsc --noEmit
npx eslint \
  src/adventure/v2/fishingCodex.ts \
  src/adventure/v2/fishSpecimens.ts \
  src/lib/server/fishSpecimenSp.ts \
  src/app/api/v2/me/fishing-specimens \
  src/adventure/v2/FishSpecimenExtractModal.tsx \
  src/adventure/v2/inventory/FishSpecimenSection.tsx \
  src/adventure/v2/V2CodexView.tsx \
  src/adventure/v2/V2InventoryView.tsx \
  src/adventure/v2/V2MarketplaceView.tsx
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Run the production build**

Run: `npm run build`

Expected: exit 0. The prebuild image optimizer/checker must also pass; do not deploy afterward.

- [ ] **Step 7: Review the final diff against the design**

Verify registration/history separation, all marketplace quantity paths, SP confirmation/blocking, direct recatch, UI states, manual copy, and absence of unrelated changes. Confirm no maintenance or deployment script ran.

- [ ] **Step 8: Commit documentation and any final test-only adjustments**

```bash
git add src/app/manual/content/pastimes.tsx src/app/manual/content/plaza.tsx src/app/manual/current-content.test.tsx docs/superpowers/plans/2026-08-11-tradeable-fish-specimens.md
git commit -m "docs: explain tradeable fish specimens"
```
