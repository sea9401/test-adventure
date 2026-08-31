# Integrated Combat Loadout Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five general-combat preset slots that save and atomically apply equipped skills, the active combat pattern, and equipped item instances.

**Architecture:** Store a fixed five-slot nullable array in a new `combat-loadout-presets.v1` save key. Keep parsing and snapshot comparison in a pure domain module, perform save/apply/delete in one authenticated transactional route, and expose the feature on a dedicated character subpage without changing skill-only presets or arena templates.

**Tech Stack:** Next.js 16.2 route handlers and App Router, React 19, TypeScript, Drizzle saves KV transactions, Vitest, Tailwind surfaces from `src/components/ui/surfaces.ts`.

## Global Constraints

- The preset count is exactly five free fixed slots.
- Each preset contains equipped skills in priority order, the active combat pattern, and all six equipment-slot iid values.
- Existing ten-slot skill presets and the arena template remain unchanged and independent.
- Save and apply update the three configuration areas together; an exception rolls the transaction back.
- Applying an old preset removes unavailable skills and equipment and reports what was excluded; unavailable equipment slots become empty.
- Do not add deployment, schema migration, slot purchase, sharing, reordering, class, title, stat-allocation, or arena behavior.
- Use opaque `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` surfaces for content and nested cards.
- Read relevant Next.js guidance from `node_modules/next/dist/docs/` before creating the App Router page or route handler.

---

### Task 1: Pure combat preset domain model

**Files:**
- Create: `src/adventure/data/v2/combatLoadoutPresets.ts`
- Create: `src/adventure/data/v2/combatLoadoutPresets.test.ts`

**Interfaces:**
- Consumes: `V2SkillId`, `V2CombatPattern`, `V2EquipInstance`, `V2EquipSlot`, `V2_EQUIPMENT`, and `parseCombatPattern`.
- Produces: `COMBAT_LOADOUT_PRESET_SLOTS`, `COMBAT_LOADOUT_PRESET_NAME_MAX`, `CombatLoadoutPreset`, `CombatLoadoutPresetSlots`, `parseCombatLoadoutPresets(value)`, `combatLoadoutPresetMatches(preset, current)`, `eligiblePresetSkills(preset, learned)`, and `eligiblePresetEquipment(preset, owned)`.

- [ ] **Step 1: Write parser and fixed-slot failing tests**

```ts
it("손상된 값은 비우고 슬롯 위치를 유지하며 다섯 칸을 넘기지 않는다", () => {
  const parsed = parseCombatLoadoutPresets([
    null,
    { name: "  사냥  ", savedAt: "2026-08-12T00:00:00.000Z", skills: ["v2c_warrior_strike", "v2c_warrior_strike", 7], pattern: { blocks: [] }, equipment: { weapon: "w-1", bogus: "x" } },
    "broken",
    null,
    null,
    { name: "sixth", skills: [] },
  ]);
  expect(parsed).toHaveLength(5);
  expect(parsed[0]).toBeNull();
  expect(parsed[1]).toMatchObject({ name: "사냥", skills: ["v2c_warrior_strike"], equipment: { weapon: "w-1" } });
  expect(parsed[2]).toBeNull();
});

it("배열이 아닌 저장값은 빈 다섯 칸으로 복구한다", () => {
  expect(parseCombatLoadoutPresets({ bad: true })).toEqual([null, null, null, null, null]);
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- src/adventure/data/v2/combatLoadoutPresets.test.ts`

Expected: FAIL because `./combatLoadoutPresets` does not exist.

- [ ] **Step 3: Implement the fixed-slot parser**

```ts
export const COMBAT_LOADOUT_PRESET_SLOTS = 5;
export const COMBAT_LOADOUT_PRESET_NAME_MAX = 24;

export type CombatLoadoutPreset = {
  name: string;
  savedAt: string;
  skills: V2SkillId[];
  pattern: V2CombatPattern | null;
  equipment: Partial<Record<V2EquipSlot, string>>;
};
export type CombatLoadoutPresetSlots = Array<CombatLoadoutPreset | null>;

export function parseCombatLoadoutPresets(value: unknown): CombatLoadoutPresetSlots {
  return Array.from({ length: COMBAT_LOADOUT_PRESET_SLOTS }, (_, slot) =>
    parseOne(Array.isArray(value) ? value[slot] : null),
  );
}
```

`parseOne` must trim and cap names, default an empty valid name to `프리셋 ${slot + 1}`, deduplicate string skill IDs while preserving order, accept only the six `V2EquipSlot` keys with non-empty iid strings, normalize `pattern` with `parseCombatPattern`, and return `null` for non-object entries.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/combatLoadoutPresets.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing match and eligibility tests**

```ts
it("스킬 순서·패턴·여섯 장비 슬롯이 모두 같을 때만 현재 프리셋이다", () => {
  expect(combatLoadoutPresetMatches(preset, {
    skills: ["v2c_warrior_strike"], pattern: { blocks: [] }, equipment: { weapon: "w-1" },
  })).toBe(true);
  expect(combatLoadoutPresetMatches(preset, {
    skills: ["v2c_warrior_strike"], pattern: null, equipment: { weapon: "w-1" },
  })).toBe(false);
});

it("현재 없는 스킬과 판매했거나 슬롯이 다른 장비를 적용 목록에서 제외한다", () => {
  expect(eligiblePresetSkills(preset, [])).toEqual({ skills: [], unavailableSkillIds: ["v2c_warrior_strike"] });
  expect(eligiblePresetEquipment(preset, [{ iid: "w-1", id: "v2_iron_armor" }])).toEqual({
    equipment: {}, unavailableEquipmentIids: ["w-1"],
  });
});
```

- [ ] **Step 6: Run helper tests and verify RED**

Run: `npm test -- src/adventure/data/v2/combatLoadoutPresets.test.ts`

Expected: FAIL because the match and eligibility exports are missing.

- [ ] **Step 7: Implement match and eligibility helpers**

Use ordered array equality for skills, stable JSON equality for the already-normalized pattern, and all six slots for equipment comparison. `eligiblePresetEquipment` must build an owned iid map and accept an iid only when `V2_EQUIPMENT[instance.id]?.slot` equals the saved slot.

- [ ] **Step 8: Run domain tests and commit**

Run: `npm test -- src/adventure/data/v2/combatLoadoutPresets.test.ts`

Expected: PASS.

```bash
git add src/adventure/data/v2/combatLoadoutPresets.ts src/adventure/data/v2/combatLoadoutPresets.test.ts
git commit -m "feat: add combat loadout preset domain"
```

### Task 2: Transactional preset API

**Files:**
- Create: `src/app/api/v2/me/combat-loadout-presets/route.ts`
- Create: `src/app/api/v2/me/combat-loadout-presets/route.test.ts`
- Modify: `src/lib/storage-keys.ts`

**Interfaces:**
- Consumes: all Task 1 domain exports, `ensureUser`, `lockSaveForUpdate`, `readSave`, `upsertSave`, `sanitizeLoadout`, `includeLearnedLifestyleSkills`, and current SP-budget helpers from `/api/v2/me/loadout`.
- Produces: `COMBAT_LOADOUT_PRESETS_KEY`, `GET()`, and `POST(req)` returning `{ ok, presets, activeSlot, current?, excluded? }`.

- [ ] **Step 1: Read Next.js route-handler guidance**

Run: `rg -n "Route Handlers|route.ts|Request" node_modules/next/dist/docs/01-app/03-building-your-application/01-routing -g '*.md*' | head -40`

Open and read the matching route-handler document before adding `route.ts`.

- [ ] **Step 2: Write failing authentication and input tests**

Use the repository's hoisted Map-backed saves mock. Mock only authentication and DB persistence; keep the real domain parser and SP/equipment validation.

```ts
it("잘못된 슬롯과 빈 슬롯 적용을 거부한다", async () => {
  expect((await POST(request({ action: "save", slot: 5 }))).status).toBe(400);
  const empty = await POST(request({ action: "apply", slot: 0 }));
  expect(empty.status).toBe(404);
  expect(await empty.json()).toMatchObject({ ok: false, error: "empty_slot" });
});
```

Also set `ensureUser` to `null` once and assert both GET and POST return 401 without adding any save key.

- [ ] **Step 3: Run route tests and verify RED**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts`

Expected: FAIL because the route module does not exist.

- [ ] **Step 4: Implement the route skeleton and validation**

Add `export const COMBAT_LOADOUT_PRESETS_KEY = "combat-loadout-presets.v1"` to `storage-keys.ts`. Implement integer `slot` validation for `0..4`, JSON error handling, `401 unauthorized`, `400 invalid_json|bad_action|bad_slot`, and `404 empty_slot`.

- [ ] **Step 5: Run route validation tests and verify GREEN**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts`

Expected: PASS for authentication/input tests.

- [ ] **Step 6: Write failing save, overwrite, delete, and GET tests**

```ts
it("현재 스킬·패턴·장비를 지정 슬롯 하나에 함께 저장하고 덮어쓴다", async () => {
  saves.set("skills.v2", { learned: [STRIKE], equipped: [STRIKE], pattern: { blocks: [] }, loadoutPresets: [{ name: "기존", skills: [STRIKE] }] });
  saves.set("equipment.v2", { owned: [weapon], equipped: { weapon: weapon.iid } });
  const saved = await POST(request({ action: "save", slot: 2, name: " 사냥 " }));
  expect((await saved.json()).presets[2]).toMatchObject({ name: "사냥", skills: [STRIKE], equipment: { weapon: weapon.iid } });
  expect((await GET()).status).toBe(200);
  expect((await (await GET()).json()).activeSlot).toBe(2);
});

it("삭제는 해당 슬롯만 null로 만들고 다른 슬롯 번호를 보존한다", async () => {
  await POST(request({ action: "delete", slot: 2 }));
  const stored = saves.get(COMBAT_LOADOUT_PRESETS_KEY) as unknown[];
  expect(stored).toHaveLength(5);
  expect(stored[2]).toBeNull();
});
```

- [ ] **Step 7: Run state-management tests and verify RED**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts`

Expected: FAIL because save/delete/GET behavior is not implemented.

- [ ] **Step 8: Implement save, overwrite, delete, and GET**

For every POST action lock the preset key first and parse it. Save then locks `equipment.v2` followed by `skills.v2` to create a consistent current snapshot and replaces exactly one array index. Delete writes `null` at exactly one array index. GET reads preset, skills, and equipment values and returns the first exact `combatLoadoutPresetMatches` index or `null`.

- [ ] **Step 9: Run state-management tests and verify GREEN**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts`

Expected: PASS.

- [ ] **Step 10: Write the failing atomic apply test**

Seed a preset containing one learned valid skill, one unlearned skill, one owned matching weapon, and one missing ring. Seed `skills.v2` with skill-only presets and combat-pattern presets that must survive.

```ts
expect(json.excluded).toEqual({
  skillIds: [UNLEARNED],
  equipmentIids: ["missing-ring"],
});
expect(saves.get("skills.v2")).toMatchObject({
  equipped: [STRIKE],
  pattern: preset.pattern,
  loadoutPresets: originalSkillPresets,
  presets: originalPatternPresets,
});
expect(saves.get("equipment.v2")).toMatchObject({
  owned: [weapon],
  equipped: { weapon: weapon.iid },
});
```

Assert the recorded lock order is `combat-loadout-presets.v1`, `character.v2`, `equipment.v2`, `skills.v2`, `proficiency.v2`. Make the mocked transaction throw after the first staged write in a separate rollback-capable fake and assert neither `skills.v2` nor `equipment.v2` changes.

- [ ] **Step 11: Run apply tests and verify RED**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts`

Expected: FAIL because apply is missing.

- [ ] **Step 12: Implement atomic apply**

Inside the existing transaction: lock preset key, then character, equipment, skills, and proficiency in that order; calculate SP budget using the same helpers and inputs as `/api/v2/me/loadout`; filter learned skills, include learned lifestyle skills, and call `sanitizeLoadout`; filter equipment through `eligiblePresetEquipment`; write `{ ...skills, equipped, pattern: preset.pattern }` and `{ ...equipmentSave, owned, equipped }`; set the manual skill/equipment quest flags on character when applicable; return final current state and exclusions.

- [ ] **Step 13: Run route and adjacent tests and commit**

Run: `npm test -- src/app/api/v2/me/combat-loadout-presets/route.test.ts src/adventure/data/v2/combatLoadoutPresets.test.ts src/adventure/data/v2/v2LoadoutPresets.test.ts src/lib/server/v2Skills.test.ts`

Expected: PASS.

```bash
git add src/lib/storage-keys.ts src/app/api/v2/me/combat-loadout-presets/route.ts src/app/api/v2/me/combat-loadout-presets/route.test.ts
git commit -m "feat: add combat loadout preset API"
```

### Task 3: Five-slot preset screen

**Files:**
- Create: `src/adventure/v2/V2CombatLoadoutPresetsView.tsx`
- Create: `src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

**Interfaces:**
- Consumes: the Task 2 GET/POST JSON shape, `SubViewHeader`, `LoadErrorBanner`, `useSystemMessageState`, and opaque surface constants.
- Produces: `V2CombatLoadoutPresetsView({ onBack })`.

- [ ] **Step 1: Write failing static-render tests**

Extract and export a pure `CombatLoadoutPresetSlots` presentation component that accepts `presets`, `activeSlot`, `busySlot`, `onSave`, `onApply`, `onDelete`, and `onOverwrite` so server-independent rendering exercises the real UI.

```tsx
const html = renderToStaticMarkup(
  <CombatLoadoutPresetSlots presets={[null, saved, null, null, null]} activeSlot={1} busySlot={null} onSave={noop} onApply={noop} onDelete={noop} onOverwrite={noop} />,
);
expect(html.match(/프리셋 [1-5]/g)).toHaveLength(5);
expect(html).toContain("적용 중");
expect(html).toContain("스킬 2");
expect(html).toContain("전투패턴 3");
expect(html).toContain("장비 6/6");
```

Add assertions for empty-slot save action, filled-slot apply/overwrite/delete actions, and the presence of the concrete `SURFACE_CARD`/`SURFACE_INSET` class strings rather than translucent `bg-*/40` or container opacity.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the presentational five-slot grid**

Render all five indices, `프리셋 N` slot labels, optional custom name, KST saved time, counts, an active badge, and buttons with accessible labels. Use `SURFACE_CARD` on every slot and `SURFACE_INSET` on its summary. Keep disabled opacity only on buttons.

- [ ] **Step 4: Run render tests and verify GREEN**

Run: `npm test -- src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing request-state tests for exported response reducers**

Keep fetch orchestration thin and export pure `applyResultMessage(name, excluded)` plus `replacePresetResponse(previous, response)` helpers. Test that zero exclusions says all three areas changed and nonzero exclusions names both counts.

```ts
expect(applyResultMessage("사냥", { skillIds: ["old"], equipmentIids: ["gone"] })).toBe(
  "'사냥' 프리셋을 적용했어요. 사용할 수 없는 스킬 1개와 장비 1개는 제외했어요.",
);
```

- [ ] **Step 6: Run helper tests and verify RED**

Run: `npm test -- src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

Expected: FAIL because response helpers are missing.

- [ ] **Step 7: Implement fetch orchestration and feedback**

On mount GET the route; retry through `LoadErrorBanner`; POST save/apply/delete actions; disable all mutation actions while one slot is busy; update presets and active slot from the authoritative response; use the shared system message for success/error; render an inline `SURFACE_ACCENT` warning when exclusions are returned. Prompt for a name with a compact controlled input in each empty slot and preserve the existing name on overwrite.

- [ ] **Step 8: Run UI tests and commit**

Run: `npm test -- src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

Expected: PASS.

```bash
git add src/adventure/v2/V2CombatLoadoutPresetsView.tsx src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx
git commit -m "feat: add combat loadout preset screen"
```

### Task 4: Character navigation and App Router page

**Files:**
- Create: `src/app/(game)/character/presets/page.tsx`
- Modify: `src/adventure/v2/V2CharacterMenu.tsx`
- Modify: `src/app/(game)/character/page.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Create or modify: `src/adventure/v2/V2CharacterMenu.test.tsx`
- Create: `src/adventure/v2/MainTabNav.test.tsx`

**Interfaces:**
- Consumes: `V2CombatLoadoutPresetsView` from Task 3.
- Produces: `/character/presets`, `CharacterAction { kind: "open-presets" }`, and character menu/dropdown entries labelled `전투 프리셋`.

- [ ] **Step 1: Read Next.js page guidance**

Run: `rg -n "page\.tsx|Pages|useRouter" node_modules/next/dist/docs/01-app/03-building-your-application/01-routing -g '*.md*' | head -40`

Open and read the matching pages/layouts and navigation documents before creating the route.

- [ ] **Step 2: Write failing navigation tests**

```tsx
const menu = renderToStaticMarkup(<V2CharacterMenu onAction={() => undefined} />);
expect(menu).toContain("전투 프리셋");
expect(characterSubItems).toEqual(expect.arrayContaining([
  expect.objectContaining({ label: "전투 프리셋", href: "/character/presets" }),
]));
```

The test catches removal of either discoverability path, not framework routing internals.

- [ ] **Step 3: Run navigation tests and verify RED**

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx`

Expected: FAIL because no preset entries exist.

- [ ] **Step 4: Add menu, dropdown, page, and back navigation**

Add a `SlidersHorizontal` or `FloppyDisk` icon entry after `스킬`; handle `open-presets` with `router.push("/character/presets")`; export the character submenu constant for direct behavior testing; create a client page that renders `V2CombatLoadoutPresetsView` and returns to `/character`.

- [ ] **Step 5: Run navigation and screen tests and verify GREEN**

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run TypeScript and ESLint on changed source**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src/adventure/data/v2/combatLoadoutPresets.ts src/adventure/data/v2/combatLoadoutPresets.test.ts src/app/api/v2/me/combat-loadout-presets/route.ts src/app/api/v2/me/combat-loadout-presets/route.test.ts src/adventure/v2/V2CombatLoadoutPresetsView.tsx src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx src/adventure/v2/V2CharacterMenu.tsx src/adventure/v2/MainTabNav.tsx 'src/app/(game)/character/page.tsx' 'src/app/(game)/character/presets/page.tsx'`

Expected: exit 0 with no warnings.

- [ ] **Step 7: Commit navigation integration**

```bash
git add src/adventure/v2/V2CharacterMenu.tsx src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.tsx 'src/app/(game)/character/page.tsx' 'src/app/(game)/character/presets/page.tsx'
git commit -m "feat: expose combat loadout presets"
```

### Task 5: Full verification and documentation consistency

**Files:**
- Modify only files required to correct failures caused by Tasks 1-4.

**Interfaces:**
- Consumes: completed domain, API, UI, and navigation work.
- Produces: fresh verification evidence and a clean feature branch.

- [ ] **Step 1: Re-read the design requirements against the diff**

Run: `git diff 6b2ae5325^ --stat && git diff 6b2ae5325^ --check`

Confirm five fixed slots, all three saved areas, independent legacy presets, atomic apply, exclusion feedback, and opaque surfaces are each represented in code or tests.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all test files pass with only the repository's existing intentional skips.

- [ ] **Step 3: Run image reference validation**

Run: `npm run check-images`

Expected: exit 0; this feature adds no image references.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js build and postbuild complete with exit 0.

- [ ] **Step 5: Inspect final branch state**

Run: `git status --short && git log -6 --oneline`

Expected: no uncommitted files and separate design/domain/API/UI/navigation commits. Do not deploy, push, merge, or disable maintenance mode.
