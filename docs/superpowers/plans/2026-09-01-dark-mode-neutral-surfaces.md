# Dark Mode Neutral Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broad, muddy dark-mode color fills across gameplay UI with neutral opaque surfaces while preserving semantic color in borders, text, icons, compact badges, meters, and action controls.

**Architecture:** Change the shared accent and status primitives first so their consumers improve together. Then use a source-level regression helper to audit direct colored dark backgrounds in three gameplay feature groups and migrate only large containers; compact semantic elements remain colored. Keep all light-mode classes and all behavior unchanged.

**Tech Stack:** Next.js 16.2.11, React 19.2, TypeScript 5, Tailwind CSS 4, Vitest 4, React server rendering tests

## Global Constraints

- Scope is the actual game UI under `src/adventure` and game-facing shared components under `src/components`; exclude admin, dev tools, manuals, login, and character creation.
- Dark-mode large cards, panels, selected rows, and multi-line notices use opaque `zinc` surfaces.
- Semantic color remains on borders, icons, key values, focus/selection rings, primary/danger buttons, compact badges, meters, rarity, attributes, and battle-state indicators.
- Light-mode colors and all interaction behavior remain unchanged.
- Do not introduce translucent body/card surfaces; only the existing intentional frosted header may use transparency.
- Do not deploy any environment unless the user separately requests deployment.

---

### Task 1: Neutralize shared accent and status primitives

**Files:**
- Create: `src/components/ui/surfaces.test.ts`
- Modify: `src/components/ui/surfaces.ts`
- Modify: `src/components/ui/StatusBanner.test.tsx`
- Modify: `src/components/ui/StatusBanner.tsx`
- Modify: `src/app/dev/ui-system/UiSystemPreview.tsx`

**Interfaces:**
- Consumes: existing `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`, and `StatusBanner` public APIs.
- Produces: unchanged exports whose dark-mode backgrounds are neutral and whose light-mode/semantic classes remain intact.

- [ ] **Step 1: Add failing shared-surface tests**

Create `src/components/ui/surfaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SURFACE_ACCENT } from "./surfaces";

describe("shared surface tokens", () => {
  it("keeps the light accent but uses a neutral opaque dark surface", () => {
    expect(SURFACE_ACCENT).toContain("bg-amber-50");
    expect(SURFACE_ACCENT).toContain("dark:bg-zinc-800");
    expect(SURFACE_ACCENT).not.toMatch(/dark:bg-amber-/);
  });
});
```

Extend `StatusBanner.test.tsx` to render all five tones and assert every rendered banner contains `dark:bg-zinc-950`, retains its tone-specific border/text class, and contains no `dark:bg-(emerald|rose|amber|sky|orange)-` class.

- [ ] **Step 2: Run the focused tests and verify red**

Run:

```bash
npx vitest run src/components/ui/surfaces.test.ts src/components/ui/StatusBanner.test.tsx
```

Expected: FAIL because `SURFACE_ACCENT` still uses `dark:bg-amber-950` and status tones still use colored `*-950` backgrounds.

- [ ] **Step 3: Implement the neutral shared primitives**

Change `SURFACE_ACCENT` to retain `bg-amber-50` and amber borders in light mode while using `dark:bg-zinc-800` and an amber dark border. In `TONE_CLASS`, replace only each dark background with `dark:bg-zinc-950`; retain the existing light background, semantic border, and semantic text colors.

Add a `SURFACE_ACCENT` example to `UiSystemPreview` beside the existing card/inset/status examples so the neutral dark surface is visible in the design-system route.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
npx vitest run src/components/ui/surfaces.test.ts src/components/ui/StatusBanner.test.tsx
npx eslint src/components/ui/surfaces.ts src/components/ui/surfaces.test.ts src/components/ui/StatusBanner.tsx src/components/ui/StatusBanner.test.tsx src/app/dev/ui-system/UiSystemPreview.tsx
```

Expected: all tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the shared primitive change**

```bash
git add src/components/ui/surfaces.ts src/components/ui/surfaces.test.ts src/components/ui/StatusBanner.tsx src/components/ui/StatusBanner.test.tsx src/app/dev/ui-system/UiSystemPreview.tsx
git commit -m "style: neutralize shared dark surfaces"
```

---

### Task 2: Audit character, equipment, combat, and progression surfaces

**Files:**
- Create: `src/components/ui/darkSurfaceAudit.test.ts`
- Modify: `src/components/ui/LoadErrorBanner.tsx`
- Modify: `src/components/ChatPanel.tsx`
- Modify: `src/components/chat/ChatRoomManager.tsx`
- Modify: `src/adventure/character/GrowthShrineView.tsx`
- Modify: `src/adventure/v2/StormExpeditionAutoPlanDialog.tsx`
- Modify: `src/adventure/v2/MasteryCertificateUseModal.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.tsx`
- Modify: `src/adventure/v2/V2LoadoutPresetsPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Modify: `src/adventure/v2/EquipmentCodexBulkDialog.tsx`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/V2ArenaView.tsx`
- Modify: `src/adventure/v2/ActivityVerificationGate.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2MasteryTowerView.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCompareCard.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx`
- Modify: `src/adventure/v2/PlayerSanctionGate.tsx`
- Modify: `src/adventure/v2/CodexEquipmentPanel.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

**Interfaces:**
- Consumes: neutral `SURFACE_ACCENT`, existing `SURFACE_CARD`/`SURFACE_INSET`, and unchanged component props.
- Produces: `assertNoBroadColoredDarkSurface(paths: string[]): void` inside the test file, used by later audit groups.

- [ ] **Step 1: Add the failing source-audit helper and core group**

Create `darkSurfaceAudit.test.ts` with a helper that reads each listed source file, examines source lines containing a colored dark background, and reports lines that also contain broad-container padding (`p-3`, `p-4`, `px-3 py-1.5`, `px-3 py-2`, `px-4 py-3`, or `px-4 py-4`). Use this color pattern:

```ts
const COLORED_DARK_FILL =
  /dark:bg-(amber|orange|yellow|red|rose|violet|purple|indigo|blue|sky|cyan|teal|emerald|green|lime)-(900|950)(?:\/\d+)?/;
```

The assertion error must include `relative/path.tsx:lineNumber: source line`. Add one test named `character, equipment, combat, and progression broad surfaces are neutral` containing every Task 2 source path except the test files.

Extend `EquipmentLiberationPanel.test.tsx` with a source/render assertion that the target-equipment and current-option containers receive the neutral dark class through `SURFACE_ACCENT`, while their violet border/text accents remain present.

- [ ] **Step 2: Run the audit and representative component test and verify red**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
```

Expected: the audit prints the current broad colored surface lines and fails.

- [ ] **Step 3: Migrate only broad surfaces in the Task 2 files**

For each reported broad container:

- Use `dark:bg-zinc-800` for selected/active/raised cards.
- Use `dark:bg-zinc-950` for notices, warnings, errors, and nested recessed sections.
- Use `dark:bg-zinc-900` for standalone neutral panels.
- Preserve every light `bg-*`, semantic dark border/text/icon class, hover/focus ring, disabled state, and event handler.
- Leave compact badges, icon tiles, progress bars, battle indicators, selected tabs, and action buttons untouched even when they use `*-900/950`.
- Where a broad container already matches the shared roles cleanly, replace its duplicated radius/border/background classes with `SURFACE_ACCENT` or `SURFACE_INSET`; do not force a token onto gameplay canvases or controls.

- [ ] **Step 4: Run the Task 2 audit and related tests**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/V2QuestView.test.tsx
npx eslint src/components/ui/darkSurfaceAudit.test.ts src/components/ui/LoadErrorBanner.tsx src/components/ChatPanel.tsx src/components/chat/ChatRoomManager.tsx src/adventure/character/GrowthShrineView.tsx src/adventure/v2/StormExpeditionAutoPlanDialog.tsx src/adventure/v2/MasteryCertificateUseModal.tsx src/adventure/v2/V2EnhanceView.tsx src/adventure/v2/V2LoadoutPresetsPanel.tsx src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2DungeonList.tsx src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/V2SkillLearnView.tsx src/adventure/v2/EquipmentCodexBulkDialog.tsx src/adventure/v2/V2CharacterScreen.tsx src/adventure/v2/V2QuestView.tsx src/adventure/v2/V2ArenaView.tsx src/adventure/v2/ActivityVerificationGate.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2MasteryTowerView.tsx src/adventure/v2/inventory/RareMapsTab.tsx src/adventure/v2/item-card/V2ItemCompareCard.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/PlayerSanctionGate.tsx src/adventure/v2/CodexEquipmentPanel.tsx
```

Expected: focused tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the core gameplay audit**

```bash
git add src/components/ui/darkSurfaceAudit.test.ts src/components/ui/LoadErrorBanner.tsx src/components/ChatPanel.tsx src/components/chat/ChatRoomManager.tsx src/adventure/character/GrowthShrineView.tsx src/adventure/v2 src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
git commit -m "style: neutralize core gameplay dark surfaces"
```

Before committing, inspect `git diff --cached --name-only` and unstage any `src/adventure/v2` file not listed in Task 2; the broad directory argument is only for collecting the exact listed modifications.

---

### Task 3: Audit life, economy, reward, and marketplace surfaces

**Files:**
- Modify: `src/components/ui/darkSurfaceAudit.test.ts`
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/marketplace/EquipmentBuyOrderDialog.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/LifeRequestBoard.tsx`
- Modify: `src/adventure/v2/FishingView.tsx`
- Modify: `src/adventure/v2/LifeFieldPanels.tsx`
- Modify: `src/adventure/v2/WoodcuttingView.tsx`
- Modify: `src/adventure/v2/MiningView.tsx`
- Modify: `src/adventure/v2/EquipmentCodexBulkDialog.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Modify: `src/adventure/v2/cooking/CookingResearchPanel.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.test.tsx`

**Interfaces:**
- Consumes: Task 2 `assertNoBroadColoredDarkSurface` helper and shared neutral tokens.
- Produces: a passing `life, economy, reward, and marketplace broad surfaces are neutral` audit test.

- [ ] **Step 1: Add the Task 3 file group to the audit test**

Add one `it` block that calls the same helper with every Task 3 source path except test files. Add representative render/source expectations to `LifeWorkshopView.test.tsx` and `RareMapsTab.test.tsx` for a neutral dark notice/selected-card background and preserved amber/violet border or text accents.

- [ ] **Step 2: Run the Task 3 audit and verify red**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx
```

Expected: the new feature-group test reports broad colored dark surfaces.

- [ ] **Step 3: Migrate the reported Task 3 containers**

Apply the same three neutral dark elevations from Task 2. Keep colored fishing bite targets, fishing rarity badges, farm progress meters, market price badges, crafting result flashes, and primary purchase/action buttons because their color is compact or conveys gameplay state. Neutralize only multi-line information blocks, selected cards/rows, warning panels, and broad detail sections.

- [ ] **Step 4: Run focused life/economy tests and lint**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2MarketplaceView.equipmentBuyOrderSearch.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx
npx eslint src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/marketplace/EquipmentBuyOrderDialog.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/LifeRequestBoard.tsx src/adventure/v2/FishingView.tsx src/adventure/v2/LifeFieldPanels.tsx src/adventure/v2/WoodcuttingView.tsx src/adventure/v2/MiningView.tsx src/adventure/v2/EquipmentCodexBulkDialog.tsx src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/v2/cooking/CookingResearchPanel.tsx
```

Expected: focused tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the life/economy audit**

```bash
git add src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/marketplace/EquipmentBuyOrderDialog.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/LifeRequestBoard.tsx src/adventure/v2/FishingView.tsx src/adventure/v2/LifeFieldPanels.tsx src/adventure/v2/WoodcuttingView.tsx src/adventure/v2/MiningView.tsx src/adventure/v2/EquipmentCodexBulkDialog.tsx src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/v2/cooking/CookingResearchPanel.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx
git commit -m "style: neutralize life and economy dark surfaces"
```

---

### Task 4: Audit guild and social gameplay surfaces

**Files:**
- Modify: `src/components/ui/darkSurfaceAudit.test.ts`
- Modify: `src/adventure/v2/guild/GuildExplorationPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopDismantlePanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopGrowthPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildTrainingGroundPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildDiningHallPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildMembersPanel.tsx`
- Modify: `src/adventure/v2/guild/ArtisanLeaderboardPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildManagePanel.tsx`
- Modify: `src/adventure/v2/guild/GuildExplorationPanel.test.ts`
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 audit helper and the same dark elevation rules.
- Produces: a passing `guild and social broad surfaces are neutral` audit test.

- [ ] **Step 1: Add the Task 4 file group and representative assertions**

Add the exact Task 4 source paths to a third audit `it` block. Extend the guild exploration and trade-post tests to assert a representative information panel uses `dark:bg-zinc-950` while retaining its cyan/amber border or text accent.

- [ ] **Step 2: Run the guild audit and verify red**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/guild/GuildExplorationPanel.test.ts src/adventure/v2/guild/GuildTradePostPanel.test.tsx
```

Expected: the guild audit reports current broad colored dark backgrounds.

- [ ] **Step 3: Migrate the reported guild/social containers**

Neutralize multi-line notices, warnings, leaderboard summary cards, member-management danger sections, workshop detail blocks, and selected facility cards. Preserve role/rank badges, resource counters, compact specialization chips, progress bars, and action buttons.

- [ ] **Step 4: Run guild tests and lint**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/guild/GuildExplorationPanel.test.ts src/adventure/v2/guild/GuildTradePostPanel.test.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx src/adventure/v2/guild/GuildFacilitiesPanel.test.tsx
npx eslint src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/guild/GuildExplorationPanel.tsx src/adventure/v2/guild/WorkshopDismantlePanel.tsx src/adventure/v2/guild/WorkshopGrowthPanel.tsx src/adventure/v2/guild/GuildTrainingGroundPanel.tsx src/adventure/v2/guild/GuildDiningHallPanel.tsx src/adventure/v2/guild/GuildTradePostPanel.tsx src/adventure/v2/guild/GuildMembersPanel.tsx src/adventure/v2/guild/ArtisanLeaderboardPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/GuildManagePanel.tsx
```

Expected: focused tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the guild/social audit**

```bash
git add src/components/ui/darkSurfaceAudit.test.ts src/adventure/v2/guild
git commit -m "style: neutralize guild dark surfaces"
```

Before committing, inspect the staged file list and unstage any guild file not listed in Task 4.

---

### Task 5: Complete repository audit and visual verification

**Files:**
- Modify if the final audit finds missed broad surfaces: exact gameplay source file reported by `darkSurfaceAudit.test.ts`
- Modify: `src/components/ui/darkSurfaceAudit.test.ts`
- Modify: `docs/superpowers/specs/2026-09-01-dark-mode-neutral-surfaces-design.md` only if implementation revealed a necessary clarification

**Interfaces:**
- Consumes: all neutral shared primitives and the three passing feature-group audit tests.
- Produces: a repository-wide no-growth audit for broad colored dark surfaces in `src/adventure` and game-facing `src/components`.

- [ ] **Step 1: Extend the audit to repository discovery**

Add recursive discovery for `.tsx` files under `src/adventure` plus `src/components/ChatPanel.tsx`, `src/components/chat`, and `src/components/ui`. Run the same broad-container rule over every discovered file. Exclude test files and explicitly exclude only visual/gameplay canvases whose large fill is itself the game state; each exclusion must be an exact path with a Korean reason string in the test source. Do not exclude generic notices, cards, rows, or panels.

- [ ] **Step 2: Run the repository audit and fix every newly reported gameplay surface**

```bash
npx vitest run src/components/ui/darkSurfaceAudit.test.ts
```

Expected before the last fixes: any file missed by Tasks 2–4 is printed with path and line. Apply the same neutral elevation rules, rerun until the repository audit passes, and keep compact semantic fills unchanged.

- [ ] **Step 3: Run complete static and unit verification**

```bash
npx tsc --noEmit
npm run lint
npx vitest run --exclude src/adventure/data/v2/levelDesignSim.test.ts
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Visually inspect the shared system and representative gameplay routes**

Run the local application and inspect light/dark at 320px, 390px, and desktop widths. Check `/dev/ui-system`, enchantment, a reward-heavy home/attendance view, dungeon/combat, fishing/life, marketplace, and guild. Confirm:

- broad dark surfaces are neutral;
- borders/icons/text still communicate amber, violet, emerald, sky, and danger meanings;
- compact rarity/status elements and meters retain color;
- light mode is unchanged;
- no scene background leaks through content cards;
- selection, focus, disabled, and hover states remain visible.

- [ ] **Step 5: Review the final diff and commit audit completion**

```bash
git diff --check
git status --short
git add src/components/ui/darkSurfaceAudit.test.ts src/adventure src/components docs/superpowers/specs/2026-09-01-dark-mode-neutral-surfaces-design.md
git diff --cached --check
git commit -m "test: guard neutral dark gameplay surfaces"
```

Inspect the staged file list before committing and remove unrelated paths. Do not push, merge, open a PR, or deploy without a separate user request.
