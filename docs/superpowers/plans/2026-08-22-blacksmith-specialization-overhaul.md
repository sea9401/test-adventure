# Blacksmith Specialization Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 길드 제작소의 기존 경제 구조를 유지하면서 Lv.13 영구 전문화, 제작별 옵션·구조 제어, 촉매, 대표작, Lv.30 최종 검수를 구현한다.

**Architecture:** 순수 성장·저장 파싱과 장비 굴림 재배분을 `blacksmithSpecialization.ts`에 모으고, 기존 제작 라우트는 서버 권위 검증과 자원 소비를 담당한다. 전문화 선택·대표작·최종 검수 확정은 작은 별도 Route Handler로 분리하며, UI는 기존 길드 제작소 상태 응답을 단일 소스로 사용한다.

**Tech Stack:** TypeScript, Next.js App Router Route Handlers, React Client Components, Vitest, saves-kv 트랜잭션 저장

## Global Constraints

- 기존 제작법 75종, 시설, 거래, 해체, 납품, 랭킹과 기존 제작품을 보존한다.
- 전문 분야만 영구 고정하고 옵션 성향·구조 제작술·촉매는 제작마다 선택한다.
- 새 옵션 키와 무게 효과를 추가하지 않는다.
- 옵션·구조 제어는 기존 굴림의 가중 총 품질 예산과 별 등급을 늘리지 않는다.
- Lv.18까지 경험치 기준은 유지하고 Lv.30 누적 경험치는 `307,500`으로 한다.
- Lv.31 이상은 기능 없는 명예 레벨이다.
- 최종 검수는 비용·XP·기록을 한 번만 반영하고 재접속·중복 확정으로 재굴림 또는 복제할 수 없다.
- 장면 배경 위의 모든 새 패널은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다.
- 배포와 점검 모드 변경은 하지 않는다.

---

### Task 1: 성장 곡선과 전문화 저장 모델

**Files:**
- Modify: `src/adventure/data/v2/artisan.ts`
- Modify: `src/adventure/data/v2/artisan.test.ts`
- Create: `src/adventure/data/v2/blacksmithSpecialization.ts`
- Create: `src/adventure/data/v2/blacksmithSpecialization.test.ts`

**Interfaces:**
- Produces: `BlacksmithSpecialtyId`, `BlacksmithOptionFocusId`, `BlacksmithStructureId`, `BlacksmithProgressionState`, `parseBlacksmithProgressionState()`, `blacksmithSpecialtyForSlot()`, `blacksmithTechniqueView()`.
- Consumes: `V2EquipSlot`, `V2EquipRoll`, `V2CraftQualityState`, `V2CraftedBy`.

- [ ] **Step 1: Write failing XP boundary tests**

```ts
expect(artisanLevel({ xp: 52_499, crafts: 0 })).toBe(17);
expect(artisanLevel({ xp: 52_500, crafts: 0 })).toBe(18);
expect(artisanLevel({ xp: 307_499, crafts: 0 })).toBe(29);
expect(artisanLevel({ xp: 307_500, crafts: 0 })).toBe(30);
expect(artisanXpForLevel(31)).toBe(345_000);
```

- [ ] **Step 2: Run the XP test and verify RED**

Run: `npm test -- src/adventure/data/v2/artisan.test.ts`

Expected: FAIL because the post-Lv.10 fixed `5,000` step still yields different levels.

- [ ] **Step 3: Implement the cumulative curve and Lv.31+ honor formula**

Replace the fixed post-table step with the approved cumulative thresholds through Lv.30 and compute Lv.31+ increments as `37_500 + 2_500 × (level - 31)`.

- [ ] **Step 4: Add failing progression parsing and slot tests**

```ts
expect(parseBlacksmithProgressionState({ specialty: "weapon" })).toMatchObject({ specialty: "weapon" });
expect(parseBlacksmithProgressionState({ specialty: "bad" })).toEqual({});
expect(blacksmithSpecialtyForSlot("gloves")).toBe("armor");
expect(blacksmithSpecialtyForSlot("necklace")).toBe("jewelry");
expect(blacksmithTechniqueView({ level: 24, specialty: "weapon", slot: "weapon" })).toMatchObject({
  eligible: true,
  focusChancePct: 75,
  catalystFocusChancePct: 90,
  catalystPreserveChancePct: 20,
});
```

- [ ] **Step 5: Run the progression test and verify RED**

Run: `npm test -- src/adventure/data/v2/blacksmithSpecialization.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement types, defensive parser, unlock table and recipe-aware option groups**

Use specialty IDs `weapon | armor | jewelry`, structure IDs `balanced | primary | option | extreme | stable`, and the nine Korean-facing focus definitions from the design. `blacksmithTechniqueView()` must return no choices for a non-specialty slot and must remove focus choices when the item lacks both matching and non-matching secondary options.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- src/adventure/data/v2/artisan.test.ts src/adventure/data/v2/blacksmithSpecialization.test.ts`

```bash
git add src/adventure/data/v2/artisan.ts src/adventure/data/v2/artisan.test.ts src/adventure/data/v2/blacksmithSpecialization.ts src/adventure/data/v2/blacksmithSpecialization.test.ts
git commit -m "feat: add blacksmith specialization progression"
```

### Task 2: 품질 예산 보존 장비 굴림

**Files:**
- Modify: `src/adventure/data/v2/v2EquipVariance.ts`
- Modify: `src/adventure/data/v2/v2EquipVariance.test.ts`
- Modify: `src/adventure/data/v2/blacksmithSpecialization.ts`
- Modify: `src/adventure/data/v2/blacksmithSpecialization.test.ts`

**Interfaces:**
- Produces: `equipRollPercentiles()`, `equipRollFromPercentiles()`, `rollBlacksmithCraft()`, `rollBlacksmithInspectionCandidates()`.
- Consumes: Task 1 focus/structure IDs and recipe-aware technique view.

- [ ] **Step 1: Write failing percentile round-trip tests**

```ts
const roll = rollItemStats(item, sequenceRng([0.1, 0.9, 0.4]));
expect(equipRollFromPercentiles(item, equipRollPercentiles(item, roll))).toEqual(roll);
```

Include floor-clamped small stats and tier-16 `powerScaleVersion` cases.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/adventure/data/v2/v2EquipVariance.test.ts`

Expected: FAIL because percentile conversion helpers are absent.

- [ ] **Step 3: Implement public percentile conversion helpers**

Represent power with weight `2` and each existing option with weight `1`. Never create a key absent from `item.options`; return `weight: 0` and preserve tier-16 scale metadata.

- [ ] **Step 4: Write failing focus, catalyst and structure tests**

Test deterministic RNG boundaries for 74.999%/75%, 89.999%/90% and 19.999%/20%. Assert:

```ts
expect(weightedPercentileBudget(after)).toBeCloseTo(weightedPercentileBudget(before), 8);
expect(Object.keys(after.options ?? {}).sort()).toEqual(Object.keys(before.options ?? {}).sort());
expect(focusedPercentile).toBeGreaterThanOrEqual(unfocusedPercentile);
```

For `stable`, assert both extremes move toward `0.5`; for `extreme`, assert they move away; for `primary` and `option`, assert the direction reverses without increasing total budget.

- [ ] **Step 5: Run and verify RED**

Run: `npm test -- src/adventure/data/v2/blacksmithSpecialization.test.ts`

Expected: FAIL because controlled rolling is absent.

- [ ] **Step 6: Implement controlled rolling**

Roll the original percentile vector once. On focus success, assign the highest existing secondary percentiles to matching keys. Apply catalyst floor movement and structure transforms in percentile space, clamp to `[0, 1]`, then rebalance against the untouched weighted budget. Convert to integer stats only at the end; permit only unavoidable one-point rounding drift.

- [ ] **Step 7: Implement same-budget final inspection candidates**

Generate one base percentile vector and two independently shuffled/rebalanced allocations. Both candidates share equipment ID, craft quality and exact weighted percentile budget; if both allocations are identical, deterministically swap the two most separated eligible percentiles once.

- [ ] **Step 8: Run focused tests and commit**

Run: `npm test -- src/adventure/data/v2/v2EquipVariance.test.ts src/adventure/data/v2/blacksmithSpecialization.test.ts`

```bash
git add src/adventure/data/v2/v2EquipVariance.ts src/adventure/data/v2/v2EquipVariance.test.ts src/adventure/data/v2/blacksmithSpecialization.ts src/adventure/data/v2/blacksmithSpecialization.test.ts
git commit -m "feat: add controlled blacksmith stat rolls"
```

### Task 3: 제작자 전문 각인과 기존 시스템 호환

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/v2EquipMint.test.ts`
- Modify: `src/adventure/data/v2/marketplacePriceKeys.test.ts`

**Interfaces:**
- Produces: optional `V2CraftedBy.specialty` persisted through equipment parsing and marketplace round trips.
- Consumes: `BlacksmithSpecialtyId` as a type-only import.

- [ ] **Step 1: Write failing craftedBy parser compatibility tests**

```ts
expect(parseCraftedBy({ ...validCrafter, specialty: "armor" })).toMatchObject({ specialty: "armor" });
expect(parseCraftedBy({ ...validCrafter, specialty: "invalid" })).not.toHaveProperty("specialty");
```

Also round-trip a traded masterwork with `specialty: "jewelry"` and verify the existing marketplace price key remains `#masterwork`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts src/adventure/data/v2/marketplacePriceKeys.test.ts`

Expected: FAIL because specialty is discarded.

- [ ] **Step 3: Implement optional specialty parsing and preservation**

Do not change price buckets, delivery values, dismantle rewards or old crafted item parsing. Only Lv.28+ new specialty crafts receive the field from the server route.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts src/adventure/data/v2/marketplacePriceKeys.test.ts`

```bash
git add src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts src/adventure/data/v2/marketplacePriceKeys.test.ts
git commit -m "feat: preserve blacksmith specialty marks"
```

### Task 4: 전문화 선택과 대표작 API

**Files:**
- Create: `src/app/api/v2/guild/workshop/specialization/route.ts`
- Create: `src/app/api/v2/guild/workshop/specialization/route.test.ts`
- Create: `src/app/api/v2/guild/workshop/signature/route.ts`
- Create: `src/app/api/v2/guild/workshop/signature/route.test.ts`

**Interfaces:**
- Produces: `PATCH specialization { specialty }`, `PATCH signature { iid }`.
- Consumes: Task 1 progression parser and existing `lockSaveForUpdate`, `upsertSave`, `parseEquipmentSave`.

- [ ] **Step 1: Write failing specialization route tests**

Cover unauthorized, Lv.12 rejection, Lv.13 first selection, same-value idempotent retry, and different-value `specialty_locked` conflict. Assert only `crafting.v2.blacksmithProgression` changes.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/app/api/v2/guild/workshop/specialization/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement transactional permanent selection**

Lock `crafting.v2`, derive level from stored artisan XP, validate the enum server-side, and return the parsed progression view. A retry with the same specialty returns `200`; any other replacement returns `409` without a write.

- [ ] **Step 4: Write failing signature route tests**

Cover Lv.27 rejection, non-owned/equipped-neutral rejection, another maker's item rejection, wrong specialty slot rejection, successful Lv.28 designation, and replacement without mutating either item.

- [ ] **Step 5: Run and verify RED**

Run: `npm test -- src/app/api/v2/guild/workshop/signature/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 6: Implement representative-work designation**

Lock both `crafting.v2` and `equipment.v2`. Require an owned item made by the current user whose slot matches the permanent specialty. Store only `signatureIid`; do not add stats or mutate `craftedBy`.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- src/app/api/v2/guild/workshop/specialization/route.test.ts src/app/api/v2/guild/workshop/signature/route.test.ts`

```bash
git add src/app/api/v2/guild/workshop/specialization src/app/api/v2/guild/workshop/signature
git commit -m "feat: add permanent blacksmith specialty APIs"
```

### Task 5: 제작 라우트와 최종 검수 트랜잭션

**Files:**
- Modify: `src/app/api/v2/guild/workshop/route.ts`
- Modify: `src/lib/server/guildWorkshopCodexMasteryRoute.test.ts`
- Create: `src/lib/server/guildWorkshopSpecializationRoute.test.ts`
- Create: `src/app/api/v2/guild/workshop/inspection/route.ts`
- Create: `src/app/api/v2/guild/workshop/inspection/route.test.ts`

**Interfaces:**
- Consumes: request fields `optionFocus`, `structure`, `useCatalyst`; Task 2 controlled rolls; Task 1 persisted progression.
- Produces: workshop GET progression/technique views, craft response `pendingInspection`, and inspection `POST { inspectionId, candidateIndex }`.

- [ ] **Step 1: Write failing craft validation tests**

Cover non-specialty recipe fallback, locked technique level, invalid focus for item, insufficient catalyst, 75%/90% roll selection, Lv.24 catalyst preservation, Lv.26 masterwork technique gate, and `pending_inspection` rejection before any cost is consumed.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/lib/server/guildWorkshopSpecializationRoute.test.ts`

Expected: FAIL because the request fields and progression checks are absent.

- [ ] **Step 3: Integrate techniques into the existing craft transaction**

Validate all choices after locking saves and before base equipment, materials, fee or weekly-source mutation. Deduct the catalyst from `character.v2.materials`, run the controlled roll only for an eligible specialty craft, and retain `mintRolledEquipInstance()` for every unaffected craft. Add the Lv.28 specialty field to `craftedBy` without changing existing bonus logic.

- [ ] **Step 4: Write failing Lv.30 pending inspection tests**

For specialty masterwork at Lv.30, assert resources, XP, craft count, weekly stats and codex gameplay are applied once; `equipment.v2.owned` receives no item; `crafting.v2.blacksmithProgression.pendingInspection` contains two same-grade/same-budget candidates; another craft returns `409` without spending.

- [ ] **Step 5: Run and verify RED**

Run: `npm test -- src/lib/server/guildWorkshopSpecializationRoute.test.ts`

Expected: FAIL because the route mints immediately.

- [ ] **Step 6: Implement pending inspection creation**

Trigger only for `mode: "masterwork"`, matching specialty and Lv.30+. Store an opaque inspection ID, recipe/equipment IDs, one quality result, both rolls, the crafter snapshot and timestamp. Delay unique-acquisition recording until confirmation, while keeping craft mastery/weekly accounting at creation.

- [ ] **Step 7: Write failing confirmation and retry tests**

Cover unauthorized, invalid candidate index, stale inspection ID, successful candidate `0` and `1`, unique acquisition on confirmation, exact one owned instance, and a duplicate identical request returning the stored resolved IID without another grant.

- [ ] **Step 8: Run and verify RED**

Run: `npm test -- src/app/api/v2/guild/workshop/inspection/route.test.ts`

Expected: FAIL because the confirmation route does not exist.

- [ ] **Step 9: Implement idempotent confirmation**

Lock crafting and equipment saves. If pending ID matches, mint from the stored roll, append once, clear pending, and store `lastInspectionResolution { inspectionId, candidateIndex, iid }`. If the same request repeats, return that resolution without writing. The route requires login but not current guild/smithy access because costs were already paid.

- [ ] **Step 10: Run route regression tests and commit**

Run: `npm test -- src/lib/server/guildWorkshopCodexMasteryRoute.test.ts src/lib/server/guildWorkshopSpecializationRoute.test.ts src/app/api/v2/guild/workshop/inspection/route.test.ts`

```bash
git add src/app/api/v2/guild/workshop/route.ts src/app/api/v2/guild/workshop/inspection src/lib/server/guildWorkshopCodexMasteryRoute.test.ts src/lib/server/guildWorkshopSpecializationRoute.test.ts
git commit -m "feat: integrate blacksmith specialization crafting"
```

### Task 6: 길드 제작소 전문화 UI

**Files:**
- Modify: `src/adventure/v2/guild/guildWorkshopPanelModel.ts`
- Modify: `src/adventure/v2/guild/guildWorkshopPanelModel.test.ts`
- Modify: `src/adventure/v2/guild/GuildWorkshopPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`
- Modify: `src/adventure/v2/guild/WorkshopGrowthPanel.tsx`
- Create: `src/adventure/v2/guild/WorkshopSpecializationPanel.tsx`
- Create: `src/adventure/v2/guild/WorkshopSpecializationPanel.test.tsx`
- Create: `src/adventure/v2/guild/WorkshopInspectionPanel.tsx`
- Create: `src/adventure/v2/guild/WorkshopInspectionPanel.test.tsx`

**Interfaces:**
- Consumes: Task 5 workshop state, per-recipe technique view and mutation responses.
- Produces: permanent choice interaction, per-craft controls, pending inspection comparison/confirmation and representative-work action.

- [ ] **Step 1: Extend client model with failing parser/label tests**

Add exact Korean labels for all specialties, focuses, structures and errors `specialty_locked`, `technique_locked`, `invalid_option_focus`, `insufficient_catalyst`, `pending_inspection`, `inspection_not_found`. Test that an unknown server value is displayed as unavailable rather than trusted.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/adventure/v2/guild/guildWorkshopPanelModel.test.ts`

Expected: FAIL because the model has no specialization fields.

- [ ] **Step 3: Implement typed workshop response views and labels**

Add `blacksmithProgression`, `techniques`, `pendingInspection` and candidate stat rows to `WorkshopState`; include them in `CraftServerSync` so mutation responses refresh without a page reload.

- [ ] **Step 4: Write failing specialization and inspection rendering tests**

Assert Lv.12 shows the locked milestone, Lv.13 unselected shows all three permanent choices and warning text, selected specialty shows no reset action, Lv.30 pending state shows exactly two candidate buttons and disables unrelated crafting.

- [ ] **Step 5: Run and verify RED**

Run: `npm test -- src/adventure/v2/guild/WorkshopSpecializationPanel.test.tsx src/adventure/v2/guild/WorkshopInspectionPanel.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 6: Implement the two focused Client Components**

Use `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`; require a second confirmation click for permanent selection; show power and every existing option side-by-side in inspection; call the dedicated endpoints and refresh parent state on success.

- [ ] **Step 7: Write failing per-recipe control tests**

Assert only server-provided focus choices render, stable is absent before Lv.22, catalyst cost/owned count and 90% text appear, the craft request includes the chosen values, and the whole craft action is disabled while an inspection is pending.

- [ ] **Step 8: Run and verify RED**

Run: `npm test -- src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

Expected: FAIL because controls and request fields are absent.

- [ ] **Step 9: Implement controls and parent state synchronization**

Keep selections local per recipe, reset an invalid selection when recipe state changes, pass the values in the existing POST, and render the inspection panel above filters. Add the specialization panel to growth and the Lv.13–30 milestone rows to `WorkshopGrowthPanel`.

- [ ] **Step 10: Run UI tests and commit**

Run: `npm test -- src/adventure/v2/guild/guildWorkshopPanelModel.test.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx src/adventure/v2/guild/WorkshopSpecializationPanel.test.tsx src/adventure/v2/guild/WorkshopInspectionPanel.test.tsx`

```bash
git add src/adventure/v2/guild/guildWorkshopPanelModel.ts src/adventure/v2/guild/guildWorkshopPanelModel.test.ts src/adventure/v2/guild/GuildWorkshopPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.test.tsx src/adventure/v2/guild/WorkshopGrowthPanel.tsx src/adventure/v2/guild/WorkshopSpecializationPanel.tsx src/adventure/v2/guild/WorkshopSpecializationPanel.test.tsx src/adventure/v2/guild/WorkshopInspectionPanel.tsx src/adventure/v2/guild/WorkshopInspectionPanel.test.tsx
git commit -m "feat: add blacksmith specialization workshop UI"
```

### Task 7: 회귀 검증과 문서 동기화

**Files:**
- Modify: `src/app/manual/content/guild.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: all prior task behavior.
- Produces: player-facing permanent-choice and Lv.30 recovery guidance.

- [ ] **Step 1: Write the failing manual assertion**

Add a `GuildContent` rendering test to `current-content.test.tsx` asserting `Lv.13 영구 전문 분야`, `촉매`, and `Lv.30 최종 검수`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/app/manual/current-content.test.tsx`

Expected: FAIL because the guidance is absent.

- [ ] **Step 3: Add concise manual guidance and run GREEN**

Explain that only the specialty is permanent, other gear remains craftable, techniques redistribute existing stats, and a pending final inspection must be resolved before another craft.

- [ ] **Step 4: Run all affected tests**

Run:

```bash
npm test -- src/adventure/data/v2/artisan.test.ts src/adventure/data/v2/blacksmithSpecialization.test.ts src/adventure/data/v2/v2EquipVariance.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts src/adventure/data/v2/marketplacePriceKeys.test.ts src/adventure/data/v2/guildWorkshop.test.ts src/adventure/data/v2/guildWorkshopDelivery.test.ts src/lib/server/guildWorkshopCodexMasteryRoute.test.ts src/lib/server/guildWorkshopSpecializationRoute.test.ts src/app/api/v2/guild/workshop/specialization/route.test.ts src/app/api/v2/guild/workshop/signature/route.test.ts src/app/api/v2/guild/workshop/inspection/route.test.ts src/adventure/v2/guild/guildWorkshopPanelModel.test.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx src/adventure/v2/guild/WorkshopSpecializationPanel.test.tsx src/adventure/v2/guild/WorkshopInspectionPanel.test.tsx
```

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm test
NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/data/v2/artisan.ts src/adventure/data/v2/blacksmithSpecialization.ts src/adventure/data/v2/v2EquipVariance.ts src/adventure/data/v2/v2Equipment.ts src/app/api/v2/guild/workshop/route.ts src/app/api/v2/guild/workshop/specialization/route.ts src/app/api/v2/guild/workshop/signature/route.ts src/app/api/v2/guild/workshop/inspection/route.ts src/adventure/v2/guild/GuildWorkshopPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopGrowthPanel.tsx src/adventure/v2/guild/WorkshopSpecializationPanel.tsx src/adventure/v2/guild/WorkshopInspectionPanel.tsx
npm run check-images
npm run build
```

- [ ] **Step 6: Commit documentation and any verification-only correction**

```bash
git add src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain blacksmith specialization"
```

- [ ] **Step 7: Review scope**

Run `git diff f868598ad..HEAD --stat`, `git status --short`, and confirm no deployment scripts, maintenance scripts, unrelated combat files or user-owned files were changed.
