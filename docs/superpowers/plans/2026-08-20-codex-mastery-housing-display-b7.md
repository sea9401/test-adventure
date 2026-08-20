# Codex Mastery Housing Display B7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players independently display one earned codex mastery trophy on the free record shelf and attach related mastery trophies to existing housing display furniture.

**Architecture:** Extend each `housing.v1` placement with an optional, additive `masteryTrophy` reference while leaving its existing artifact `display` untouched. Pure housing validation owns furniture/category rules; server helpers translate authoritative trophy history into options; private and public routes gate all trophy reads and visibility with `trophiesEnabled`. The client renders a second selector and an opaque tier medallion without adding image assets or economic rewards.

**Tech Stack:** TypeScript, React 19, Next.js 16.2 route handlers, Drizzle PostgreSQL repositories, Vitest, Tailwind CSS.

## Global Constraints

- Do not deploy, enable any codex mastery feature flag, push, merge, or run a real backfill.
- Keep `HOUSING_SAVE_KEY = "housing.v1"` and `HousingState.version = 1`; this additive field requires no migration.
- Keep profile showcase and housing trophy selection independent.
- Preserve the existing equipment, fish, and boss `display` while adding the trophy companion.
- Use only earned authoritative `codex_trophy_history` rows; never trust a client-provided ID or tier.
- When `trophiesEnabled=false`, do not read trophy history, do not expose trophy options, and preserve an already stored selection when its placement UID remains.
- Do not add SP, combat power, gold, item, or achievement-point rewards.
- Use opaque `Card`/`SURFACE_INSET` surfaces and opaque select backgrounds in both light and dark modes.
- Do not add or generate new image assets.

---

### Task 1: Add the housing mastery trophy companion model

**Files:**
- Modify: `src/adventure/data/v2/housing.ts`
- Modify: `src/adventure/data/v2/housing.test.ts`

**Interfaces:**
- Consumes: `codexMasteryTrophyDefinition(trophyId)` and `CodexMasteryTrophyId`, `CodexMasteryTrophyTier`.
- Produces: `HousingMasteryTrophyRef`, mastery-trophy `HousingDisplayOption`, `housingMasteryTrophyCategoriesFor()`, `housingMasteryTrophyIsEligible()`, strict entitlement validation, and hidden-feature preservation helpers.

- [ ] **Step 1: Write failing model tests**

Add cases that prove all of the following:

```ts
const shelfRoom = {
  version: 1,
  isPublic: true,
  layout: [{
    uid: "shelf",
    furnitureId: "record_shelf",
    x: 0,
    y: 0,
    rotated: false,
    masteryTrophy: { trophyId: "mastery:overall" },
  }],
};

expect(validateHousingState(shelfRoom, {
  masteryTrophyIds: new Set(["mastery:overall"]),
})).toMatchObject({ ok: true });
expect(validateHousingState({
  ...shelfRoom,
  layout: [{ ...shelfRoom.layout[0], furnitureId: "trophy_aquarium" }],
}, { masteryTrophyIds: new Set(["mastery:overall"]) })).toEqual({
  ok: false,
  error: "invalid_mastery_trophy",
});
expect(validateHousingState(shelfRoom, {
  masteryTrophyIds: new Set(),
})).toEqual({ ok: false, error: "mastery_trophy_not_owned" });
```

Also assert that `parseHousingState()` removes malformed or unknown IDs, allows fish only on the aquarium, allows monster only on the boss trophy, allows equipment on mannequin/rack, allows cooking on cookware, and keeps a valid trophy alongside an existing artifact `display`.

- [ ] **Step 2: Run the model tests and verify RED**

Run: `npx vitest run src/adventure/data/v2/housing.test.ts --maxWorkers=1`

Expected: FAIL because `masteryTrophy` is not parsed or validated and `masteryTrophyIds` does not exist.

- [ ] **Step 3: Implement the additive model**

Add these shapes and rules:

```ts
export type HousingMasteryTrophyRef = {
  trophyId: CodexMasteryTrophyId;
};

export type HousingPlacement = {
  uid: string;
  furnitureId: HousingFurnitureId;
  x: number;
  y: number;
  rotated: boolean;
  display?: HousingDisplayRef;
  masteryTrophy?: HousingMasteryTrophyRef;
};

export type HousingEntitlements = {
  ownedCounts?: Partial<Record<HousingFurnitureId, number>>;
  equipmentIids?: ReadonlySet<string>;
  fishIds?: ReadonlySet<string>;
  bossIds?: ReadonlySet<string>;
  masteryTrophyIds?: ReadonlySet<string>;
};
```

Extend `HousingDisplayOption` with:

```ts
{
  kind: "masteryTrophy";
  trophyId: CodexMasteryTrophyId;
  category: CodexMasteryCategory | "overall";
  currentTier: CodexMasteryTrophyTier;
  label: string;
  detail: string;
}
```

Implement a frozen furniture/category map matching the design table. Parse only IDs accepted by `codexMasteryTrophyDefinition()`. In `validateHousingState()`, distinguish a malformed/ineligible selection from an unowned selection. Extend `housingDisplayKey()` and `housingOptionKey()` with `masteryTrophy:<id>` keys. Add pure helpers that strip every mastery trophy from an API-visible copy and restore only same-UID selections from the saved room into a submitted room while the feature is hidden.

- [ ] **Step 4: Run the model tests and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/housing.test.ts --maxWorkers=1`

Expected: all housing model tests pass.

- [ ] **Step 5: Commit the model**

```bash
git add src/adventure/data/v2/housing.ts src/adventure/data/v2/housing.test.ts
git commit -m "feat: model mastery trophies in housing"
```

### Task 2: Build authoritative housing trophy options

**Files:**
- Modify: `src/lib/server/housing.ts`
- Create: `src/lib/server/housing.test.ts`

**Interfaces:**
- Consumes: `CodexMasteryTrophyHistory[]`, `codexMasteryTrophyDefinition()`, and housing option/key helpers.
- Produces: `housingMasteryTrophyContext(history)` returning `{ entitlements, displayOptions }`; public selection filtering and sanitization for both artifact and mastery options.

- [ ] **Step 1: Write failing server-helper tests**

Create earned fish and overall history fixtures and assert:

```ts
const context = housingMasteryTrophyContext(history);
expect(context.entitlements.masteryTrophyIds).toEqual(
  new Set(["mastery:fish", "mastery:overall"]),
);
expect(context.displayOptions).toEqual(expect.arrayContaining([
  expect.objectContaining({
    kind: "masteryTrophy",
    trophyId: "mastery:fish",
    label: "만경의 어탁",
    detail: "도감 숙련 · 백금",
  }),
]));
```

Build a room with an equipment artifact and a fish mastery trophy on the same placement. Assert `publicHousingOptions()` returns both selected options and `sanitizePublicHousingState()` removes only stale mastery references while preserving valid artifact references.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npx vitest run src/lib/server/housing.test.ts --maxWorkers=1`

Expected: FAIL because `housingMasteryTrophyContext()` does not exist and public helpers ignore companion refs.

- [ ] **Step 3: Implement the option adapter**

Add a six-tier Korean label map and map only valid earned history rows to `masteryTrophy` options. Merge trophy and existing entitlement sets at route boundaries rather than coupling trophy database reads into `housingContextFromSaves()`. Update public option selection and sanitization to consider `placement.display` and `placement.masteryTrophy` independently.

- [ ] **Step 4: Run helper and model tests**

Run: `npx vitest run src/lib/server/housing.test.ts src/adventure/data/v2/housing.test.ts --maxWorkers=1`

Expected: both files pass.

- [ ] **Step 5: Commit the server adapter**

```bash
git add src/lib/server/housing.ts src/lib/server/housing.test.ts
git commit -m "feat: build housing mastery trophy options"
```

### Task 3: Connect trophies to the private housing route

**Files:**
- Modify: `src/app/api/v2/me/housing/route.ts`
- Modify: `src/lib/server/housingRoute.test.ts`

**Interfaces:**
- Consumes: `readCodexMasteryFeatureSettings()`, `readCodexMasteryTrophyHistory()`, `housingMasteryTrophyContext()`, strip/restore helpers.
- Produces: private GET/POST responses with authoritative earned trophy options and strict persistence.

- [ ] **Step 1: Add failing private-route tests**

Mock settings and trophy history. Add cases proving:

1. disabled GET and POST never call `readCodexMasteryTrophyHistory()`;
2. enabled GET returns an earned fish option;
3. enabled POST saves `{ masteryTrophy: { trophyId: "mastery:fish" } }` on the record shelf;
4. enabled POST rejects an unowned or wrong-furniture trophy without changing the save;
5. disabled POST restores a previously saved same-UID trophy after the client edits only its position, but removes it when that placement UID is removed.

- [ ] **Step 2: Run private-route tests and verify RED**

Run: `npx vitest run src/lib/server/housingRoute.test.ts --maxWorkers=1`

Expected: FAIL because the route does not read settings/history or return trophy options.

- [ ] **Step 3: Implement gated private reads and writes**

Read settings alongside housing sources. When enabled, read history and merge its entitlements/options with the existing save-derived context. When disabled, strip trophy refs from GET/POST responses; before POST validation, restore same-UID stored refs and add only those restored IDs to validation entitlements. Continue locking and writing the single housing save inside the existing transaction.

- [ ] **Step 4: Run route and helper tests**

Run: `npx vitest run src/lib/server/housingRoute.test.ts src/lib/server/housing.test.ts src/adventure/data/v2/housing.test.ts --maxWorkers=1`

Expected: all selected files pass.

- [ ] **Step 5: Commit private route integration**

```bash
git add src/app/api/v2/me/housing/route.ts src/lib/server/housingRoute.test.ts
git commit -m "feat: save mastery trophies in housing"
```

### Task 4: Publish only valid selected housing trophies

**Files:**
- Modify: `src/app/api/v2/player/[name]/housing/route.ts`
- Modify: `src/lib/server/publicHousingRoute.test.ts`

**Interfaces:**
- Consumes: the same feature settings, history repository and public housing helpers as Task 3.
- Produces: public room responses containing only currently earned, selected, feature-visible trophy companions.

- [ ] **Step 1: Add failing public-route tests**

Add cases proving that an enabled public room returns only its selected earned trophy, removes stale/unowned trophy refs without deleting an adjacent valid equipment `display`, and that a disabled response hides all mastery refs/options without calling the history repository.

- [ ] **Step 2: Run public-route tests and verify RED**

Run: `npx vitest run src/lib/server/publicHousingRoute.test.ts --maxWorkers=1`

Expected: FAIL because the public route has no trophy feature context.

- [ ] **Step 3: Implement public trophy sanitization**

Read settings after the existing early housing gate. Read trophy history only when enabled, merge it with the existing save display context, filter to selections actually present in the room, and sanitize the response. When disabled, sanitize against only artifact options so trophy companions disappear from the response while the saved room remains unchanged.

- [ ] **Step 4: Run both route suites**

Run: `npx vitest run src/lib/server/publicHousingRoute.test.ts src/lib/server/housingRoute.test.ts --maxWorkers=1`

Expected: both route suites pass.

- [ ] **Step 5: Commit public route integration**

```bash
git add 'src/app/api/v2/player/[name]/housing/route.ts' src/lib/server/publicHousingRoute.test.ts
git commit -m "feat: publish housing mastery trophies"
```

### Task 5: Render and edit trophy companions in the room

**Files:**
- Modify: `src/adventure/v2/V2HousingView.tsx`
- Modify: `src/adventure/v2/V2HousingView.test.tsx`
- Modify: `src/app/dev/housing/HousingHarness.tsx`

**Interfaces:**
- Consumes: mastery `HousingDisplayOption`, placement refs, furniture eligibility, option-key helpers.
- Produces: second trophy selector, tier medallion overlay, and combined visitor display cards.

- [ ] **Step 1: Write failing UI expectations**

Construct preview data with a fish artifact and `mastery:fish` on the aquarium plus `mastery:overall` on the record shelf. Assert visitor static markup includes `만경의 어탁`, `모험왕의 대서`, `도감 숙련 · 백금`, both existing and trophy labels in the room accessibility names, opaque `bg-white`/dark surfaces, and no whole-card `opacity-40`.

Add direct `housingMasteryTrophyIsEligible()` expectations proving the record shelf accepts overall while the aquarium accepts only fish and the mannequin accepts only equipment.

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `npx vitest run src/adventure/v2/V2HousingView.test.tsx --maxWorkers=1`

Expected: FAIL because mastery trophy options and overlays are not rendered.

- [ ] **Step 3: Implement client editing and presentation**

Add `setSelectedMasteryTrophy(value)` that updates only `placement.masteryTrophy`. In `HousingSelectionPanel`, render an opaque `도감 숙련 트로피` select for eligible furniture independently of the existing artifact select. Use the six B6 tier colors in a small opaque top-corner badge in `RoomCanvas`, include artifact and trophy names in its accessible label, and flatten both option types in `VisitorDisplays`. Count each selected artifact/trophy as an exhibition record. Update the dev harness with representative earned trophy options.

- [ ] **Step 4: Run UI and all focused B7 tests**

Run: `npx vitest run src/adventure/v2/V2HousingView.test.tsx src/adventure/data/v2/housing.test.ts src/lib/server/housing.test.ts src/lib/server/housingRoute.test.ts src/lib/server/publicHousingRoute.test.ts --maxWorkers=1`

Expected: all selected files pass without React or accessibility warnings.

- [ ] **Step 5: Commit the UI**

```bash
git add src/adventure/v2/V2HousingView.tsx src/adventure/v2/V2HousingView.test.tsx src/app/dev/housing/HousingHarness.tsx
git commit -m "feat: display mastery trophies in rooms"
```

### Task 6: Final verification and isolation audit

**Files:**
- Review: all files changed since the B7 design commit.

**Interfaces:**
- Consumes: completed B7 implementation.
- Produces: fresh verification evidence and a clean isolated branch without deployment-side changes.

- [ ] **Step 1: Run static and focused verification**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/housing.ts src/adventure/data/v2/housing.test.ts src/lib/server/housing.ts src/lib/server/housing.test.ts src/app/api/v2/me/housing/route.ts 'src/app/api/v2/player/[name]/housing/route.ts' src/lib/server/housingRoute.test.ts src/lib/server/publicHousingRoute.test.ts src/adventure/v2/V2HousingView.tsx src/adventure/v2/V2HousingView.test.tsx src/app/dev/housing/HousingHarness.tsx
npx vitest run src/adventure/data/v2/housing.test.ts src/lib/server/housing.test.ts src/lib/server/housingRoute.test.ts src/lib/server/publicHousingRoute.test.ts src/adventure/v2/V2HousingView.test.tsx --maxWorkers=1
git diff --check 49504ba57..HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Run repository-wide verification**

Run:

```bash
npm test -- --run --maxWorkers=1
npm run check-migrations
npm run build
```

Expected: all non-skipped tests pass, migration journal is valid, image checks pass, and Next.js production build exits 0.

- [ ] **Step 3: Self-review requirements and diff**

Confirm each design requirement has a test or direct implementation, no new image or database migration exists, profile selection is untouched, and no economic reward path was added. Inspect the complete range with `git diff --stat 49504ba57..HEAD` and `git diff 49504ba57..HEAD -- src/adventure/data/v2/housing.ts src/lib/server/housing.ts src/app/api/v2/me/housing/route.ts 'src/app/api/v2/player/[name]/housing/route.ts' src/adventure/v2/V2HousingView.tsx`.

- [ ] **Step 4: Audit deployment isolation**

Verify `DEFAULT_CODEX_MASTERY_FEATURES.trophiesEnabled === false`, the deployment checkout `/home/sea9401/test-adventure` contains no B7 symbols, and no deploy, push, merge, flag activation or real rebuild command ran.

- [ ] **Step 5: Commit verified fixes separately if needed**

Use a focused commit message for any issue found during verification. Leave the clean branch in `/tmp/test-adventure-codex-mastery-gameplay` for the user's later unpublished-work squash.
