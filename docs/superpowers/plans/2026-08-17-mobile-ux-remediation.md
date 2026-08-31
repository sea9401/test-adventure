# Mobile UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shop, marketplace, skill loadout, housing editor, job codex, and battle log comfortable and width-safe on 320–430px mobile screens without changing game logic or desktop behavior.

**Architecture:** Keep the existing components and data flows, add mobile-first layout variants at the component boundary, and preserve current `sm`-and-up layouts. Add a dedicated Playwright development-fixture configuration with an isolated Next output directory for real viewport assertions, then protect shared touch sizing and each screen-specific behavior with focused Vitest tests.

**Tech Stack:** Next.js 16 App Router with Turbopack development fixtures, React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright Chromium mobile emulation

## Global Constraints

- Mobile portrait support starts at 320px and includes 390px.
- No target screen may make the document wider than the visual viewport.
- General mobile controls use a minimum 40px height; standalone icon controls use 44×44px.
- Desktop layouts at `sm` and above retain their current density and interaction model.
- Housing, job, battle, shop, marketplace, and loadout game rules and APIs do not change.
- Do not modify or stage the pre-existing `src/adventure/v2/combat/engine.pvpPhase.ts` worktree change.
- Do not deploy.

---

### Task 1: Reusable Mobile Viewport Regression Harness

**Files:**
- Create: `playwright.mobile-ui.config.ts`
- Create: `e2e/mobile-ui.spec.ts`
- Modify: `package.json`
- Modify: `next.config.ts`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing `/dev/shop`, `/dev/marketplace`, `/dev/skill-loadout`, `/dev/housing`, `/dev/job-codex`, and `/dev/battle-log` fixtures.
- Produces: `npm run test:e2e:mobile-ui`, running Chromium at 320×568 and 390×844 against a webpack development server.

- [ ] **Step 1: Add the viewport test and dedicated configuration**

Create two Chromium projects with `isMobile: true`, `hasTouch: true`, and the exact viewports. For each target route, navigate, wait for `main`, and evaluate this literal contract:

```ts
const layout = await page.evaluate(() => ({
  visualWidth: window.visualViewport?.width ?? window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
}));
expect(layout.documentWidth).toBeLessThanOrEqual(layout.visualWidth + 1);
```

Configure `webServer.command` with an isolated development output directory as:

```ts
"MOBILE_UI_NEXT_DIST_DIR=.next-mobile-ui npm run dev -- --hostname 127.0.0.1 --port 3297"
```

Set `nextConfig.distDir` from `MOBILE_UI_NEXT_DIST_DIR` with `.next` as the unchanged default, ignore `/.next-mobile-ui/`, include its generated type paths in `tsconfig.json`, and add `"test:e2e:mobile-ui": "playwright test --config playwright.mobile-ui.config.ts"` to `package.json`.

- [ ] **Step 2: Run the width test and verify RED**

Run: `npm run test:e2e:mobile-ui -- --grep "가로 넘침"`

Expected: FAIL for shop, marketplace, and skill loadout at one or both viewports, reporting widths above the visual viewport.

- [ ] **Step 3: Commit the failing regression harness**

```bash
git add .gitignore package.json next.config.ts tsconfig.json playwright.mobile-ui.config.ts e2e/mobile-ui.spec.ts docs/superpowers/plans/2026-08-17-mobile-ux-remediation.md
git commit -m "test: cover mobile game surface widths"
```

### Task 2: Shop, Marketplace, and Skill Loadout Width Safety

**Files:**
- Modify: `src/adventure/v2/V2ShopView.tsx`
- Modify: `src/adventure/v2/V2ShopView.test.ts`
- Create: `src/adventure/v2/V2ShopView.layout.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Create: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`

**Interfaces:**
- Consumes: existing shop catalog, marketplace listings, and loadout callbacks unchanged.
- Produces: mobile-first rows that stack metadata and actions, with the existing fixed table/action layout restored at `sm`.

- [ ] **Step 1: Add failing component layout tests**

For the shop, render `V2ShopView` inside its real `GameStateProvider` and assert that the buy header is hidden below `sm`, each row uses a mobile one-column/card layout, and `BUY_GRID_CLASS` applies only from `sm` upward. For the marketplace, render the real `MarketplaceHarness` preview and assert that its listing footer contains mobile `flex-col items-stretch` plus `sm:flex-row sm:items-end`, and that the action can become full width. Update the loadout test to expect:

```ts
expect(html).toContain("min-w-0 flex-1 sm:min-w-52");
expect(html).toContain("w-full sm:w-[6.25rem]");
expect(html).toContain("flex-col sm:flex-row");
```

The production change that makes these pass is the responsive structure; the current fixed mobile widths must make them fail first.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: FAIL on the missing responsive markup/classes.

- [ ] **Step 3: Implement the mobile shop layout**

- Change the non-embedded shop root from `p-6` to `p-4 sm:p-6`.
- Hide the sortable five-column header below `sm`.
- Make each `BuyEquipmentRow` a mobile card row with the item name on top, type/price/power metadata wrapping below, and a full-width purchase button; restore `BUY_GRID_CLASS` and the current cells at `sm`.
- Keep sorting available through the existing header on `sm` and above; do not add a second sorting UI in this pass.
- Raise decision-relevant mobile metadata from 10–11px to `text-xs`, with current dense sizes allowed at `sm`.

- [ ] **Step 4: Implement marketplace and loadout stacking**

- In `ListingList`, change the card footer to `flex-col items-stretch` below `sm`, add `w-full` to the action wrapper/button on mobile, and keep `sm:flex-row sm:items-end sm:justify-between`.
- Ensure long bid/expiry text wraps and every flex child that owns text has `min-w-0`.
- In `V2LoadoutPanel`, make the search label `min-w-0 flex-1 sm:min-w-52`, allow the search/options row to stack, make each skill row stack its content and action area below `sm`, and change `w-[6.25rem]` to `w-full sm:w-[6.25rem]`.
- Preserve drag ordering, equip/unequip, favorite, filtering, and desktop widths.

- [ ] **Step 5: Run focused unit tests and verify GREEN**

Run: `npm test -- --run src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run the viewport regression and verify GREEN for the three routes**

Run: `npm run test:e2e:mobile-ui -- --grep "상점|거래소|스킬"`

Expected: PASS at both 320×568 and 390×844 with no horizontal overflow.

- [ ] **Step 7: Commit width fixes**

```bash
git add src/adventure/v2/V2ShopView.tsx src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx
git commit -m "fix: make dense commerce and loadout views mobile safe"
```

### Task 3: Shared Mobile Touch Targets

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Button.test.tsx`
- Modify: `src/components/ui/BackButton.tsx`
- Modify: `src/components/ui/TabBar.tsx`
- Create: `src/components/ui/TabBar.test.tsx`
- Modify: `src/adventure/v2/NotificationBell.tsx`
- Create: `src/adventure/v2/NotificationBell.layout.test.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2JobCodexView.tsx`
- Create: `src/adventure/v2/V2JobCodexView.test.tsx`

**Interfaces:**
- Consumes: unchanged `ButtonProps`, `TabBarProps`, and notification behavior.
- Produces: 40px mobile button/tab minimums and 44×44px standalone icon/drag targets, while restoring current compact heights at `sm`.

- [ ] **Step 1: Add failing touch-size tests**

Render `Button` for every size and assert mobile classes `min-h-10`, `min-h-10`, and `min-h-11`, paired with `sm:min-h-7`, `sm:min-h-8`, and `sm:min-h-10`. Render `TabBar` sizes and require `min-h-10` on mobile. Render `NotificationBell` and require `min-h-11 min-w-11`. Extend the loadout/codex assertions for 44px drag, clear, favorite, and goal buttons.

- [ ] **Step 2: Run touch-size tests and verify RED**

Run: `npm test -- --run src/components/ui/Button.test.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2JobCodexView.test.tsx`

Expected: FAIL because current shared controls are 20–36px.

- [ ] **Step 3: Apply shared and standalone target sizing**

- Update `Button.SIZE` to mobile-first minimum heights with `sm` restoration.
- Add `min-h-10 sm:min-h-0` to TabBar size variants without changing labels or scroll behavior.
- Give BackButton and NotificationBell explicit 44px mobile hit areas.
- Expand loadout reorder/favorite controls and codex search-clear/goal controls to 44px on mobile, retaining current desktop dimensions with `sm:` classes.
- Use padding/minimum size only; keep icon glyph sizes unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run src/components/ui/Button.test.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2JobCodexView.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit touch targets**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/BackButton.tsx src/components/ui/TabBar.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/NotificationBell.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2JobCodexView.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2JobCodexView.test.tsx
git commit -m "fix: enlarge mobile touch targets"
```

### Task 4: Mobile Housing Canvas Zoom

**Files:**
- Modify: `src/adventure/v2/V2HousingView.tsx`
- Create: `src/adventure/v2/V2HousingView.test.tsx`
- Modify: `e2e/mobile-ui.spec.ts`

**Interfaces:**
- Consumes: existing room state and `RoomCanvas` placement callbacks.
- Produces: an editable-only `방 확대`/`전체 보기` toggle and a horizontally/vertically scrollable 200%-width canvas on mobile.

- [ ] **Step 1: Add failing housing behavior tests**

Render `V2HousingView` with `previewData` and assert the editable view includes a button named `방 확대`, while a visitor view does not. In Playwright, click `방 확대`, assert the button changes to `전체 보기`, the scroll surface has overflow enabled, and its inner canvas is wider than its client width.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/adventure/v2/V2HousingView.test.tsx`

Run: `npm run test:e2e:mobile-ui -- --grep "숙소 확대"`

Expected: both FAIL because the zoom control does not exist.

- [ ] **Step 3: Implement the zoomable editing surface**

- Add `roomZoomed` state to editable housing.
- Add a 44px toggle above the canvas, using unchanged icon glyph size and `aria-pressed`.
- Wrap the editable canvas in a `max-sm:-mx-4` full-viewport surface. At normal scale use `w-full overflow-hidden`; at zoom use `w-[200%] max-w-none` inside `overflow-auto overscroll-contain touch-pan-x touch-pan-y`.
- Keep visitor rendering unchanged.
- Raise selected furniture/cell guidance from 7–10px to at least 12px on mobile.

- [ ] **Step 4: Run unit and browser tests and verify GREEN**

Run: `npm test -- --run src/adventure/v2/V2HousingView.test.tsx`

Run: `npm run test:e2e:mobile-ui -- --grep "숙소"`

Expected: PASS at both mobile widths; the document itself remains width-safe while only the inner housing surface scrolls.

- [ ] **Step 5: Commit housing controls**

```bash
git add src/adventure/v2/V2HousingView.tsx src/adventure/v2/V2HousingView.test.tsx e2e/mobile-ui.spec.ts
git commit -m "feat: add mobile housing canvas zoom"
```

### Task 5: Collapsible Job Codex Sections

**Files:**
- Modify: `src/adventure/v2/V2JobCodexView.tsx`
- Modify: `src/adventure/v2/V2JobCodexView.test.tsx`
- Modify: `e2e/mobile-ui.spec.ts`

**Interfaces:**
- Consumes: existing filtered goal/current/unlocked/locked arrays.
- Produces: section keys `goal`, `current`, `unlocked`, and `locked`; goal/current default open, unlocked/locked default closed, with filters forcing matching sections open.

- [ ] **Step 1: Add failing section-policy and rendering tests**

Export and test a pure policy:

```ts
expect(jobCodexSectionExpanded("goal", false, new Set())).toBe(true);
expect(jobCodexSectionExpanded("locked", false, new Set())).toBe(false);
expect(jobCodexSectionExpanded("locked", true, new Set(["locked"]))).toBe(true);
```

Render sample codex data and require buttons named `해금된 직업 펼치기` and `조건 부족 펼치기` with `aria-expanded="false"`.

- [ ] **Step 2: Run the codex test and verify RED**

Run: `npm test -- --run src/adventure/v2/V2JobCodexView.test.tsx`

Expected: FAIL because sections are always expanded and the policy does not exist.

- [ ] **Step 3: Implement section disclosure**

- Track manually collapsed section keys in `JobCodexList`.
- Pass a stable section key and expanded state into `JobSection`.
- Replace the passive heading row with a full-width, minimum-40px button showing title, count, and caret; set `aria-expanded` and an action-specific accessible name.
- Do not render the list while collapsed.
- Treat non-empty query or active tags as filtering and force every non-empty matching section open.
- Raise section counts/filter chips and job decision metadata to 12px on mobile.

- [ ] **Step 4: Run unit and browser tests and verify GREEN**

Run: `npm test -- --run src/adventure/v2/V2JobCodexView.test.tsx`

Run: `npm run test:e2e:mobile-ui -- --grep "직업 도감"`

Expected: PASS; initial document height is materially shorter, clicking `조건 부족 펼치기` reveals its rows, and width remains within the viewport.

- [ ] **Step 5: Commit codex navigation**

```bash
git add src/adventure/v2/V2JobCodexView.tsx src/adventure/v2/V2JobCodexView.test.tsx e2e/mobile-ui.spec.ts
git commit -m "feat: collapse long job codex sections"
```

### Task 6: Mobile Battle Log Readability

**Files:**
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `e2e/mobile-ui.spec.ts`

**Interfaces:**
- Consumes: unchanged battle log grouping and entries.
- Produces: mobile size tokens with 12px minimum for action info, labels, and HP; current compact desktop sizes restored at `sm`.

- [ ] **Step 1: Add failing size-token tests**

Render normal and compact logs and require mobile `text-xs` on label, action info, action label, turn marker, and HP text, paired with the current `sm:text-[Npx]` compact desktop values. Assert existing action grouping and labels remain unchanged.

- [ ] **Step 2: Run the battle log test and verify RED**

Run: `npm test -- --run src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because current mobile tokens include 9–11px.

- [ ] **Step 3: Raise mobile log text sizes**

Update `SIZES.normal` and `SIZES.compact` so mobile action metadata, labels, turn markers, and HP use `text-xs`; add `sm:` values where the existing desktop density should remain. Do not alter grouping, damage totals, effect ordering, or colors.

- [ ] **Step 4: Run unit and browser tests and verify GREEN**

Run: `npm test -- --run src/adventure/battle/BattleLogList.test.tsx`

Run: `npm run test:e2e:mobile-ui -- --grep "전투 로그"`

Expected: PASS with no horizontal overflow and computed font sizes of at least 12px for sampled metadata.

- [ ] **Step 5: Commit readability changes**

```bash
git add src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx e2e/mobile-ui.spec.ts
git commit -m "fix: improve mobile battle log readability"
```

### Task 7: Full Verification

**Files:**
- Verify all files changed in Tasks 1–6.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: fresh evidence that mobile, unit, type, lint, image, and production build checks pass.

- [ ] **Step 1: Run all mobile browser tests**

Run: `npm run test:e2e:mobile-ui`

Expected: PASS in both 320×568 and 390×844 Chromium projects.

- [ ] **Step 2: Run focused and full unit tests**

Run: `npm test -- --run src/components/ui/Button.test.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2HousingView.test.tsx src/adventure/v2/V2JobCodexView.test.tsx src/adventure/battle/BattleLogList.test.tsx`

Run: `npm test`

Expected: both exit 0 with zero failed tests.

- [ ] **Step 3: Run static checks**

Run: `npx eslint playwright.mobile-ui.config.ts e2e/mobile-ui.spec.ts src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/BackButton.tsx src/components/ui/TabBar.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/NotificationBell.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2ShopView.tsx src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2HousingView.tsx src/adventure/v2/V2HousingView.test.tsx src/adventure/v2/V2JobCodexView.tsx src/adventure/v2/V2JobCodexView.test.tsx src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx`

Run: `npx tsc --noEmit`

Run: `npm run check-images`

Expected: all commands exit 0.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: exit 0. This is a local build only; do not run deployment scripts.

- [ ] **Step 5: Inspect final scope and commit any verification-only adjustments**

Run: `git status --short` and `git diff --check HEAD~6..HEAD`.

Expected: only the pre-existing `src/adventure/v2/combat/engine.pvpPhase.ts` change remains unstaged, and no whitespace errors exist.
