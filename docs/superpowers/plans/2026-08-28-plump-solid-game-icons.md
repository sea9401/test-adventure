# Plump Solid Game Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 30 scoped user-facing Unicode pictographs with the approved original Plump Solid inline SVG icon set.

**Architecture:** Add an independent `PlumpGameIcon` component beside the existing outlined `CustomGameIcon`. Shared data stores typed icon identifiers instead of emoji strings, while React surfaces render the icon component next to plain text; string-only messages drop decorative emoji.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Vitest 4.1.10, `react-dom/server`.

## Global Constraints

- Use a `64 × 64` SVG view box for every icon.
- Use one fixed primary color plus white inset details per icon.
- Do not use outlines, filters, shadows, gradients, opacity-based shading, external assets, or new packages.
- Preserve the existing `CustomGameIcon` 12-icon set unchanged.
- Do not change unused finished-recipe emoji metadata or farm WebP fallbacks.
- Keep `✓`, `✗`, `★`, `→`, and other semantic text symbols outside this migration.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Add the typed Plump Solid SVG component

**Files:**
- Create: `src/components/icons/PlumpGameIcon.tsx`
- Create: `src/components/icons/PlumpGameIcon.test.tsx`

**Interfaces:**
- Produces: `PLUMP_GAME_ICON_NAMES`, `PlumpGameIconName`, `PLUMP_GAME_ICON_META`, `PlumpGameIcon(props)`.
- `PlumpGameIconProps` is `Omit<SVGProps<SVGSVGElement>, "name"> & { name: PlumpGameIconName; size?: number | string; mirrored?: boolean; title?: string }`.

- [ ] **Step 1: Write the failing component contract tests**

```tsx
expect(PLUMP_GAME_ICON_NAMES).toHaveLength(30);
for (const name of PLUMP_GAME_ICON_NAMES) {
  const html = renderToStaticMarkup(<PlumpGameIcon name={name} size={24} />);
  expect(html).toContain('viewBox="0 0 64 64"');
  expect(html).not.toMatch(/stroke="(?!#fff)/);
  expect(html).not.toMatch(/filter=|linearGradient|radialGradient/);
}
expect(renderToStaticMarkup(<PlumpGameIcon name="salt" title="소금" />))
  .toContain("<title>소금</title>");
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npm test -- src/components/icons/PlumpGameIcon.test.tsx`

Expected: FAIL because `PlumpGameIcon.tsx` does not exist.

- [ ] **Step 3: Implement the component and all 30 approved artworks**

Use this exact name list:

```ts
export const PLUMP_GAME_ICON_NAMES = [
  "adventure_support_ticket", "stamina_potion", "boss_summon_scroll",
  "mastery_token", "map_fragment", "currency_stack", "chroma_box",
  "chat_badge_box", "profile_frame_box", "cooking", "salt", "pepper",
  "cooking_oil", "vinegar", "spice", "yeast", "flour", "butter",
  "cheese", "broth", "sauce", "cream", "rank_gold", "rank_silver",
  "rank_bronze", "wood_resource", "ore_resource", "equipment_set",
  "celebration", "battle_node",
] as const;
```

Use the approved `plump-solid-full-set.html` symbol bodies as the artwork source, converting `class="cut"` to `fill="#fff"` and white inset lines to `stroke="#fff"`. Non-white strokes are forbidden. The outer component owns only the view box, size, accessibility behavior, mirroring, and prop forwarding:

```tsx
<svg viewBox="0 0 64 64" width={size} height={size} role={title ? "img" : undefined}
  aria-hidden={title ? undefined : props["aria-hidden"] ?? true} focusable="false">
  {title ? <title>{title}</title> : null}
  <PlumpGameIconArtwork name={name} />
</svg>
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/components/icons/PlumpGameIcon.test.tsx`

Expected: PASS with 30 names, valid view boxes, no forbidden SVG effects, and correct accessibility markup.

- [ ] **Step 5: Commit the component**

```bash
git add src/components/icons/PlumpGameIcon.tsx src/components/icons/PlumpGameIcon.test.tsx
git commit -m "feat: add plump solid game icons"
```

### Task 2: Replace attendance and cooking emoji

**Files:**
- Modify: `src/adventure/v2/V2AttendanceView.tsx`
- Modify: `src/adventure/v2/V2AttendanceView.test.tsx`
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Modify: `src/adventure/v2/cooking/CookingProcessingPanel.tsx`
- Modify: `src/adventure/v2/cooking/kitchen.ts`
- Test: `src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

**Interfaces:**
- Consumes: `PlumpGameIcon`, `PlumpGameIconName` from Task 1.
- Produces: `rewardIconName(reward): PlumpGameIconName` and typed `iconName` fields on `CookingPantryItem` and `CookingProcessingRecipe`.

- [ ] **Step 1: Add failing attendance and cooking rendering assertions**

Attendance must render an SVG for a September mastery-token reward without rendering `🏅`. Cooking processing must render the `salt` and `cheese` SVGs without rendering `🧂` or `🧀`.

```tsx
expect(container.querySelector('svg[data-plump-icon="mastery_token"]')).not.toBeNull();
expect(container.textContent).not.toContain("🏅");
expect(html).toContain('data-plump-icon="salt"');
expect(html).toContain('data-plump-icon="cheese"');
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/adventure/v2/V2AttendanceView.test.tsx src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: FAIL because the screens still render emoji strings.

- [ ] **Step 3: Replace attendance reward marks**

Change `rewardMark()` into a typed name mapping and render:

```tsx
<PlumpGameIcon name={rewardIconName(reward)} size={24} aria-hidden />
```

Keep reward labels and claim behavior unchanged.

- [ ] **Step 4: Replace cooking title and kitchen data fields**

Change the kitchen item types to:

```ts
iconName: Extract<PlumpGameIconName,
  "salt" | "pepper" | "cooking_oil" | "vinegar" | "spice" | "yeast" |
  "flour" | "butter" | "cheese" | "broth" | "sauce" | "cream">;
```

Render `cooking` beside the title and `item.iconName`/`recipe.iconName` beside row text at `20px`.

- [ ] **Step 5: Run attendance and cooking tests**

Run: `npm test -- src/adventure/v2/V2AttendanceView.test.tsx src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit attendance and cooking migration**

```bash
git add src/adventure/v2/V2AttendanceView.tsx src/adventure/v2/V2AttendanceView.test.tsx src/adventure/v2/CookingPanel.tsx src/adventure/v2/cooking/CookingProcessingPanel.tsx src/adventure/v2/cooking/CookingProcessingPanel.test.tsx src/adventure/v2/cooking/kitchen.ts
git commit -m "feat: replace attendance and cooking emoji"
```

### Task 3: Replace fishing medals and settlement resource emoji

**Files:**
- Modify: `src/adventure/v2/FishingLeaderboardView.tsx`
- Modify: `src/adventure/v2/FishingHallOfFameView.tsx`
- Create: `src/adventure/v2/FishingRankIcon.tsx`
- Create: `src/adventure/v2/FishingRankIcon.test.tsx`
- Modify: `src/adventure/data/v2/settlement.ts`
- Modify: `src/adventure/data/v2/settlement.test.ts`
- Modify: `src/adventure/v2/V2VillagePanel.tsx`
- Modify: `src/adventure/v2/guild/GuildFacilityUpgradeFund.tsx`
- Modify: `src/adventure/v2/association/AssociationFacilityFund.tsx`

**Interfaces:**
- Consumes: `PlumpGameIcon`, `PlumpGameIconName` from Task 1.
- Produces: `fishingRankIconName(rank): PlumpGameIconName | null` and `settlementResourceIconName(key): "wood_resource" | "ore_resource"`.

- [ ] **Step 1: Add failing mapping and markup tests**

```ts
expect(fishingRankIconName(1)).toBe("rank_gold");
expect(fishingRankIconName(4)).toBeNull();
expect(settlementResourceIconName("crop")).toBe("wood_resource");
expect(settlementResourceIconName("ore")).toBe("ore_resource");
expect(settlementBuildingUpgradeCostText({ crop: 3, ore: 4 }))
  .toBe("통나무 3 · 철광석 4");
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/adventure/data/v2/settlement.test.ts src/adventure/v2/FishingRankIcon.test.tsx`

Expected: FAIL because emoji strings and mapping functions are still present.

- [ ] **Step 3: Render typed medal icons**

Create `FishingRankIcon` so ranks 1–3 render the matching `PlumpGameIcon` at `18px`; other ranks retain the plain `${rank}위` text. Both ranking screens use this shared component.

- [ ] **Step 4: Separate settlement icons from text**

Replace `PRODUCTION_KIND_ICON` and `settlementResourceIcon()` with `settlementResourceIconName()`. Render icon components in JSX resource rows. Remove decorative emoji from `costLabel()` and `settlementBuildingUpgradeCostText()` because confirmation messages, API payloads, and manual text are string-only.

Extend the local `ProgressRow` in `AssociationFacilityFund.tsx` with `icon?: ReactNode` and render the icon before the existing label without changing numeric progress behavior.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/adventure/data/v2/settlement.test.ts src/adventure/v2/FishingRankIcon.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit ranking and resource migration**

```bash
git add src/adventure/data/v2/settlement.ts src/adventure/data/v2/settlement.test.ts src/adventure/v2/FishingRankIcon.tsx src/adventure/v2/FishingRankIcon.test.tsx src/adventure/v2/FishingLeaderboardView.tsx src/adventure/v2/FishingHallOfFameView.tsx src/adventure/v2/V2VillagePanel.tsx src/adventure/v2/guild/GuildFacilityUpgradeFund.tsx src/adventure/v2/association/AssociationFacilityFund.tsx
git commit -m "feat: replace ranking and resource emoji"
```

### Task 4: Replace remaining scoped pictographs

**Files:**
- Modify: `src/adventure/v2/item-card/V2ItemCompareCard.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCompareCard.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.test.tsx`
- Modify: `src/adventure/v2/V2QuestView.test.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.test.tsx`

**Interfaces:**
- Consumes: `equipment_set`, `celebration`, and `battle_node` icons from Task 1.

- [ ] **Step 1: Add failing focused assertions**

Verify set rows render `data-plump-icon="equipment_set"`, the first-level modal title contains `celebration`, the active-quest empty state renders `celebration`, and battle route nodes render `battle_node` while completed/branch symbols remain text.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/adventure/v2/item-card/V2ItemCompareCard.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2QuestView.test.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx`

Expected: FAIL on the new SVG assertions.

- [ ] **Step 3: Replace JSX pictographs**

Use inline-flex wrappers where icons sit beside text. Change string-only props to React nodes only when their declared API already supports `ReactNode`; otherwise remove the decorative emoji from the string and place the icon in the nearest JSX container.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/adventure/v2/item-card/V2ItemCompareCard.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2QuestView.test.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit remaining migrations**

```bash
git add src/adventure/v2/item-card/V2ItemCompareCard.tsx src/adventure/v2/item-card/V2ItemCompareCard.test.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/V2QuestView.tsx src/adventure/v2/V2QuestView.test.tsx src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx
git commit -m "feat: replace remaining gameplay emoji"
```

### Task 5: Audit and full verification

**Files:**
- No planned source changes; correct only verified migration regressions if found.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified local implementation; no deployment.

- [ ] **Step 1: Run the scoped Unicode audit**

Run:

```bash
rg -n '🎨|🏷️|🖼️|🎫|🧪|📜|🏅|🗺️|🪙|🍳|🧂|⚫|🫙|🍶|🌶️|🫧|🥣|🧈|🧀|🍲|🥫|🍦|🥇|🥈|🥉|🪵|🪨|🔗|🎉|⚔' \
  src/adventure/v2 src/adventure/data/v2 \
  --glob '*.{ts,tsx}' --glob '!*.test.*'
```

Expected: no matches in scoped rendering/data paths; matches in explicitly excluded recipe metadata are acceptable only after verifying they are not rendered.

- [ ] **Step 2: Run component and affected-domain tests**

Run:

```bash
npm test -- src/components/icons/PlumpGameIcon.test.tsx src/adventure/v2/V2AttendanceView.test.tsx src/adventure/data/v2/settlement.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript and lint checks**

Run:

```bash
npx tsc --noEmit
npx eslint src/components/icons/PlumpGameIcon.tsx src/components/icons/PlumpGameIcon.test.tsx src/adventure/v2/V2AttendanceView.tsx src/adventure/v2/CookingPanel.tsx src/adventure/v2/cooking/CookingProcessingPanel.tsx src/adventure/v2/cooking/kitchen.ts src/adventure/v2/FishingLeaderboardView.tsx src/adventure/v2/FishingHallOfFameView.tsx src/adventure/data/v2/settlement.ts src/adventure/v2/V2VillagePanel.tsx src/adventure/v2/guild/GuildFacilityUpgradeFund.tsx src/adventure/v2/association/AssociationFacilityFund.tsx src/adventure/v2/item-card/V2ItemCompareCard.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2QuestView.tsx src/adventure/v2/StormExpeditionRouteMap.tsx
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: the image checks, Next.js compile, type checks, static generation, and postbuild script all exit `0`.

- [ ] **Step 5: Review the final diff and confirm the branch is clean**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits `0`; `git status --short` has no uncommitted implementation files. If verification required a correction, rerun the affected task's focused test and amend that task with a dedicated `fix: complete plump icon migration` commit before repeating this step.
