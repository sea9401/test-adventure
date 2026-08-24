# Refined Game UI Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Project instructions prohibit creating subagents unless the user explicitly requests them.

**Goal:** Apply the approved `A — 정돈된 현재형` visual system to shared UI primitives, the persistent game chrome, the widget-based adventure home, battle results, and inventory without changing gameplay behavior.

**Architecture:** Keep `src/components/ui/surfaces.ts` as the surface SSOT, make `Button`, `Card`, `Inset`, `TabBar`, and `StatusBanner` the small presentation primitives, and migrate core screens to compose those primitives. Preserve all existing data providers and mutations; this plan changes markup and classes only except for new presentation-only props and helpers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 utility classes, Vitest, Testing Library.

## Global Constraints

- Do not deploy to any environment.
- Do not create subagents unless the user explicitly requests them.
- Read the relevant Next.js 16 guides in `node_modules/next/dist/docs/` before writing code; do not rely on remembered Next.js conventions.
- Preserve the existing widget dashboard, `AdventureDashboardProvider`, preference API, battle reward logic, and inventory mutations.
- Existing background images, content icon colors, rarity colors, and feature-specific identity colors remain unchanged.
- Surfaces over scene backgrounds must be opaque. Use `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`, or the intentional frosted-header token; do not introduce arbitrary translucent card backgrounds.
- Never apply container-wide opacity to locked or inactive cards.
- Mobile supports 320px, 360px, and 390px widths without page-level horizontal overflow; interactive targets remain at least 44px high/wide on mobile.
- Light and dark modes must preserve a visible distinction between page, card, and inset.
- Preserve unrelated dirty and staged work. Stage each task with explicit file paths and review `git diff --cached --name-only` before committing.

---

## File Structure

### Shared UI foundation

- Modify `src/components/ui/surfaces.ts` — approved card, inset, accent, and frosted chrome surface classes.
- Modify `src/components/ui/Button.tsx` — shared button variants, sizes, and reusable `buttonClassName` helper for links.
- Modify `src/components/ui/Button.test.tsx` — variant, size, loading, and link-style contract tests.
- Modify `src/components/ui/Card.tsx` — approved card padding and surface composition.
- Create `src/components/ui/Inset.tsx` — generic opaque recessed container.
- Create `src/components/ui/Inset.test.tsx` — polymorphic rendering and surface contract tests.
- Modify `src/components/ui/TabBar.tsx` — violet active underline, scroll behavior, and badge semantics.
- Modify `src/components/ui/TabBar.test.tsx` — active, alert badge, and mobile overflow tests.
- Modify `src/components/ui/StatusBanner.tsx` — add explicit actionable/orange tone and common status semantics.
- Create `src/components/ui/StatusBanner.test.tsx` — tone and accessibility tests.
- Modify `src/components/ui/TextInput.tsx` — shared mobile height, focus ring, and opaque input surface.
- Create `src/components/ui/TextInput.test.tsx` — input surface and focus contract.
- Modify `src/components/ui/GameDialogHost.tsx` — shared card/inset/button composition and mobile safe area.
- Modify `src/components/ui/GameDialogHost.test.tsx` — dialog presentation and existing queue regressions.
- Modify `src/app/globals.css` — shallow card elevation and consistent button pressed/focus motion.
- Create `src/app/dev/ui-system/page.tsx` — server page for the manual component gallery.
- Create `src/app/dev/ui-system/UiSystemPreview.tsx` — representative light/dark component states.

### Shared game chrome

- Modify `src/adventure/v2/V2TopBar.tsx` — approved frosted top bar and shared link/button styling.
- Modify `src/adventure/v2/V2TopBar.test.tsx` — surface, touch target, and existing activity-link regression tests.
- Modify `src/adventure/v2/MainTabNav.tsx` — approved active underline, orange actionable dot, and compact opaque dropdown rows.
- Modify `src/adventure/v2/MainTabNav.test.tsx` — interactive active tab, dropdown, and activity notification tests.

### Widget adventure home

- Modify `src/adventure/v2/V2AdventureHome.tsx` — page shell, shared edit actions, and opaque hot-time inset.
- Modify `src/adventure/v2/AdventureHomeWidgetGrid.tsx` — consistent grid spacing and edit controls.
- Modify `src/adventure/v2/AdventureHomeWidgetGrid.test.tsx` — edit controls and responsive layout regression.
- Modify `src/adventure/v2/CompactCharacterSummary.tsx` — selected A-style profile summary and shared controls.
- Modify `src/adventure/v2/CompactCharacterSummary.test.tsx` — compact data and toggle behavior.
- Modify `src/adventure/v2/AdventureActivityChecklist.tsx` — three summary metrics, compact rows, and explicit states.
- Modify `src/adventure/v2/AdventureActivityChecklist.test.tsx` — daily/weekly/actionable summaries and failure state.
- Modify `src/adventure/v2/AdventureActivitySettings.tsx` — shared inset rows and controls.

### Battle and inventory adoption

- Modify `src/adventure/v2/DungeonContextSummary.tsx` — common card/inset hierarchy.
- Modify `src/adventure/v2/DungeonContextSummary.test.tsx` — context information and class contract.
- Modify `src/adventure/v2/CompactBattlePlayerStatus.tsx` — shared summary disclosure surface.
- Modify `src/adventure/v2/HuntResultSheet.tsx` — common buttons, opaque result sheet, and safe-area footer.
- Modify `src/adventure/v2/HuntResultSheet.test.tsx` — dialog, action hierarchy, and keyboard behavior.
- Modify `src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx` — shared inset slots and focus treatment.
- Modify `src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx` — 3×2/6×1, detail opening, and empty slots.
- Modify `src/adventure/v2/inventory/EquipmentCardGrid.tsx` — common card depth while preserving rarity/selection states.
- Modify `src/adventure/v2/inventory/EquipmentCardGrid.test.tsx` — sale, selected, equipped, locked, and density regression.
- Modify `src/adventure/v2/V2InventoryView.tsx` — section spacing and shared action buttons only; keep all mutations intact.

---

### Task 1: Establish the Shared Visual Primitives

**Files:**
- Modify: `src/components/ui/surfaces.ts`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Button.test.tsx`
- Modify: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Inset.tsx`
- Create: `src/components/ui/Inset.test.tsx`
- Modify: `src/components/ui/TabBar.tsx`
- Modify: `src/components/ui/TabBar.test.tsx`
- Modify: `src/components/ui/StatusBanner.tsx`
- Create: `src/components/ui/StatusBanner.test.tsx`
- Modify: `src/components/ui/TextInput.tsx`
- Create: `src/components/ui/TextInput.test.tsx`
- Modify: `src/components/ui/GameDialogHost.tsx`
- Modify: `src/components/ui/GameDialogHost.test.tsx`
- Modify: `src/app/globals.css`
- Create: `src/app/dev/ui-system/page.tsx`
- Create: `src/app/dev/ui-system/UiSystemPreview.tsx`

**Interfaces:**
- Produces: `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`, `SURFACE_FROSTED`, `SURFACE_FROSTED_BAR`, `Button`, `buttonClassName`, `Card`, `Inset`, `TabBar`, `StatusBanner`, `TextInput`, and the shared `GameDialogHost` presentation.
- `buttonClassName(options)` accepts `{ variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string }` and returns the same classes used by `Button`.
- `ButtonVariant` remains backward-compatible and adds `soft`; existing `primary`, `secondary`, `success`, `warning`, `danger`, `info`, and `ghost` remain valid.
- `ButtonSize` remains backward-compatible and adds `lg` and `icon`; existing `xs`, `sm`, and `md` remain valid.
- `Inset` is polymorphic like `Card` and accepts `as`, `padding: "none" | "sm" | "md"`, `className`, and `children`.
- `StatusBanner` adds `tone="actionable"`; existing tones remain valid.

- [ ] **Step 1: Read the local Next.js 16 guides before code changes**

Run:

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
sed -n '1,280p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/08-css.md
```

Expected: the page remains a server component and only the interactive preview component receives `"use client"`.

- [ ] **Step 2: Write failing primitive contract tests**

Extend `Button.test.tsx` with the approved classes and helper contract:

```tsx
it("soft·lg·icon 변형과 링크용 클래스 헬퍼를 같은 체계로 제공한다", () => {
  expect(renderToStaticMarkup(<Button variant="soft" size="lg">편집</Button>))
    .toContain("bg-violet-50");
  expect(renderToStaticMarkup(<Button size="icon" aria-label="메뉴">☰</Button>))
    .toContain("size-11");
  expect(buttonClassName({ variant: "primary", size: "md" }))
    .toContain("bg-violet-600");
});
```

Create `Inset.test.tsx`:

```tsx
it("불투명 인셋을 다형 요소로 렌더링한다", () => {
  const html = renderToStaticMarkup(<Inset as="section" padding="md">내용</Inset>);
  expect(html).toContain("<section");
  expect(html).toContain("bg-zinc-50");
  expect(html).toContain("dark:bg-zinc-950");
  expect(html).toContain("p-3");
});
```

Create `StatusBanner.test.tsx`:

```tsx
it("처리 가능 상태를 오류와 다른 주황색 의미로 표시한다", () => {
  const html = renderToStaticMarkup(
    <StatusBanner tone="actionable" role="status">수확 가능</StatusBanner>,
  );
  expect(html).toContain("border-orange-300");
  expect(html).toContain('role="status"');
});
```

Create `TextInput.test.tsx`:

```tsx
it("모바일 44px 높이와 보라색 포커스 링을 제공한다", () => {
  const html = renderToStaticMarkup(<TextInput aria-label="검색" />);
  expect(html).toContain("min-h-11");
  expect(html).toContain("rounded-lg");
  expect(html).toContain("focus-visible:ring-violet-500");
  expect(html).toContain("bg-white");
});
```

Extend `GameDialogHost.test.tsx` to open one alert and assert the dialog panel is opaque, its message uses the inset surface, and its mobile panel padding contains `env(safe-area-inset-bottom)`.

Extend `TabBar.test.tsx` to assert an active highlight tab has violet text and a 2px underline while a badge keeps its accessible label.

- [ ] **Step 3: Run the primitive tests and confirm RED**

Run:

```bash
npm test -- src/components/ui/Button.test.tsx src/components/ui/Inset.test.tsx src/components/ui/StatusBanner.test.tsx src/components/ui/TextInput.test.tsx src/components/ui/TabBar.test.tsx src/components/ui/GameDialogHost.test.tsx
```

Expected: FAIL because `soft`, `lg`, `icon`, `buttonClassName`, `Inset`, `actionable`, the input focus contract, and the dialog safe-area contract do not exist.

- [ ] **Step 4: Implement the approved surface constants**

Use these roles in `surfaces.ts`:

```ts
export const SURFACE_CARD =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900";
export const SURFACE_INSET =
  "rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950";
export const SURFACE_ACCENT =
  "rounded-xl border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900/70 dark:bg-amber-950";
export const SURFACE_FROSTED =
  "rounded-xl bg-white/90 shadow-sm backdrop-blur dark:bg-zinc-900/90";
export const SURFACE_FROSTED_BAR =
  "border-b border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90";
```

Keep the existing comments explaining the opacity rule. Do not add an alpha background to `CARD`, `INSET`, or `ACCENT`.

- [ ] **Step 5: Implement the button, inset, tab, and status contracts**

Refactor `Button.tsx` so `Button` calls the exported helper:

```ts
export function buttonClassName({
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}) {
  return [
    BASE,
    variant !== "ghost" ? "ui-game-button" : "",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className,
  ].filter(Boolean).join(" ");
}
```

Use violet for `primary`, violet-50/violet-950 for `soft`, and preserve the existing semantic tone variants. Implement `Inset.tsx` with the same `ElementType` pattern as `Card.tsx`. Add the active underline to `TabBar` without removing its scroll mask. Add the opaque orange `actionable` tone to `StatusBanner`.

Update `TextInput` to `min-h-11 sm:min-h-9`, `rounded-lg`, an opaque white/zinc-900 surface, and a `focus-visible:ring-2 focus-visible:ring-violet-500` state. In `GameDialogHost`, compose `Card`, `Inset`, and `Button`, keep the existing focus trap/Escape/backdrop/queue behavior, and add `pb-[max(1rem,env(safe-area-inset-bottom))]` to the mobile dialog panel.

- [ ] **Step 6: Add the manual component gallery**

`page.tsx`:

```tsx
import { UiSystemPreview } from "./UiSystemPreview";

export default function UiSystemPage() {
  return <UiSystemPreview />;
}
```

`UiSystemPreview.tsx` must show every button variant, card/inset nesting, tabs with an actionable badge, all banner tones, long Korean text, disabled controls, and a compact 3-column slot sample. Add a local dark preview wrapper using `className="dark"`; do not change global theme state.

- [ ] **Step 7: Apply the shallow interaction CSS**

Keep `.ui-game-card` and `.ui-game-button`, but reduce card shadow to one subtle elevation and make the pressed state remove the 2px button base. Preserve `prefers-reduced-motion` behavior already present in the stylesheet; add it if these selectors are not covered.

- [ ] **Step 8: Run focused tests and lint**

Run:

```bash
npm test -- src/components/ui/Button.test.tsx src/components/ui/Inset.test.tsx src/components/ui/StatusBanner.test.tsx src/components/ui/TextInput.test.tsx src/components/ui/TabBar.test.tsx src/components/ui/GameDialogHost.test.tsx
npx eslint src/components/ui/surfaces.ts src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/Card.tsx src/components/ui/Inset.tsx src/components/ui/Inset.test.tsx src/components/ui/TabBar.tsx src/components/ui/TabBar.test.tsx src/components/ui/StatusBanner.tsx src/components/ui/StatusBanner.test.tsx src/components/ui/TextInput.tsx src/components/ui/TextInput.test.tsx src/components/ui/GameDialogHost.tsx src/components/ui/GameDialogHost.test.tsx src/app/dev/ui-system/page.tsx src/app/dev/ui-system/UiSystemPreview.tsx
```

Expected: all focused tests pass and ESLint exits 0.

- [ ] **Step 9: Commit only the foundation files**

```bash
git add src/components/ui/surfaces.ts src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/components/ui/Card.tsx src/components/ui/Inset.tsx src/components/ui/Inset.test.tsx src/components/ui/TabBar.tsx src/components/ui/TabBar.test.tsx src/components/ui/StatusBanner.tsx src/components/ui/StatusBanner.test.tsx src/components/ui/TextInput.tsx src/components/ui/TextInput.test.tsx src/components/ui/GameDialogHost.tsx src/components/ui/GameDialogHost.test.tsx src/app/globals.css src/app/dev/ui-system/page.tsx src/app/dev/ui-system/UiSystemPreview.tsx
git diff --cached --name-only
git commit -m "feat: establish refined game ui primitives"
```

Expected staged list: exactly the 17 paths above.

---

### Task 2: Apply the System to Persistent Game Chrome

**Files:**
- Modify: `src/adventure/v2/V2TopBar.tsx`
- Modify: `src/adventure/v2/V2TopBar.test.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Modify: `src/adventure/v2/MainTabNav.test.tsx`

**Interfaces:**
- Consumes: `SURFACE_CARD`, `SURFACE_FROSTED_BAR`, `buttonClassName`.
- Preserves: `V2TopBar` props, `MainTabNav` props, menu arrays, route mapping, activity notification snapshot, and guild facility request behavior.

- [ ] **Step 1: Write failing chrome presentation tests**

Add to `V2TopBar.test.tsx`:

```tsx
it("프로스티드 공용 헤더와 44px 아이콘 조작 영역을 사용한다", () => {
  const html = renderToStaticMarkup(
    <V2TopBar autoGathering={null} fishingActive={false} />,
  );
  expect(html).toContain("backdrop-blur");
  expect(html).toContain("data-game-top-bar");
  expect(html).toContain("size-11");
});
```

Extend the jsdom `MainTabNav.test.tsx` suite to render the provider mock, assert the active tab contains violet text plus a bottom underline marker, open the life menu, and verify an actionable life activity renders both orange status text and the accessible `처리 가능한 항목 있음` label.

- [ ] **Step 2: Run the chrome tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx
```

Expected: at least the new 44px top action or active underline assertion fails before markup migration.

- [ ] **Step 3: Migrate `V2TopBar` to shared styles**

Apply `SURFACE_FROSTED_BAR` to the sticky header while preserving its z-index and safe-area padding. Use `buttonClassName({ variant: "ghost", size: "icon" })` for icon-sized link surfaces and `buttonClassName({ variant: "secondary", size: "sm" })` for gathering/fishing/rest status links. Keep the game icon, activity priority, timer, and URLs unchanged.

- [ ] **Step 4: Migrate `MainTabNav` without changing navigation behavior**

Use a `relative after:absolute after:bottom-0 after:h-0.5 after:bg-violet-600` active marker and neutral inactive text. Keep each main tab `min-h-11`, horizontal scrolling, active-tab `scrollIntoView`, dropdown roles, Escape close, outside click close, and guild facility loading. Keep actionable dots orange and preserve their screen-reader labels.

Use `SURFACE_CARD` for the dropdown and `SURFACE_INSET` for each menu row so the dropdown is opaque over scene backgrounds. Do not add an API call or compute readiness in the client.

- [ ] **Step 5: Run the chrome regression tests and lint**

Run:

```bash
npm test -- src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/gameTabForPath.test.ts
npx eslint src/adventure/v2/V2TopBar.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx
```

Expected: all tests pass; life URLs and six-tab activation remain unchanged.

- [ ] **Step 6: Commit the chrome migration**

```bash
git add src/adventure/v2/V2TopBar.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx
git diff --cached --name-only
git commit -m "feat: apply refined styling to game chrome"
```

---

### Task 3: Polish the Existing Widget Adventure Home

**Files:**
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Modify: `src/adventure/v2/AdventureHomeWidgetGrid.tsx`
- Modify: `src/adventure/v2/AdventureHomeWidgetGrid.test.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.test.tsx`
- Modify: `src/adventure/v2/AdventureActivityChecklist.tsx`
- Modify: `src/adventure/v2/AdventureActivityChecklist.test.tsx`
- Modify: `src/adventure/v2/AdventureActivitySettings.tsx`

**Interfaces:**
- Consumes: `Button`, `Card`, `Inset`, `StatusBanner`, surface tokens.
- Preserves: `AdventureHomePreferences`, widget IDs/order, hidden widgets, drag/drop, accessible move controls, character expansion, activity enablement, and preference rollback.

- [ ] **Step 1: Write failing home presentation tests**

Extend `AdventureActivityChecklist.test.tsx`:

```tsx
it("오늘·이번 주·지금 가능을 세 개의 조밀한 요약 칸으로 구분한다", () => {
  render(<AdventureActivityChecklist activities={activities} summary={{ completed: 1, total: 1, actionableCount: 1 }} onRetry={vi.fn()} />);
  expect(screen.getByTestId("daily-summary").textContent).toContain("1 / 1");
  expect(screen.getByTestId("weekly-summary").textContent).toContain("0 / 0");
  expect(screen.getByTestId("actionable-summary").textContent).toContain("1");
  expect(screen.getByRole("link", { name: /농장 수확/ }).textContent).toContain("확인하기");
});
```

Extend `CompactCharacterSummary.test.tsx` to assert the collapsed card keeps profile, name, job, level, guild, HP, MP, and exactly one expand button. Extend `AdventureHomeWidgetGrid.test.tsx` to assert the grid stays one column by default, becomes two columns at `sm`, and edit controls remain at least `h-11 w-11`.

- [ ] **Step 2: Run home tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/CompactCharacterSummary.test.tsx
```

Expected: the new summary test IDs and shared-control class assertions fail.

- [ ] **Step 3: Apply the selected A hierarchy to the home shell**

Use `PageShell spacing="tight"` in `V2AdventureHome`. Replace raw edit buttons with `Button variant="secondary"` for reset and `Button variant="soft"` for edit/complete. Render save errors through `StatusBanner tone="error" role="status"`. Keep the current calls to `updatePreferences` unchanged.

Replace the hot-time timer’s translucent nested background with an opaque `Inset`; `SURFACE_ACCENT` remains the outer feature-specific card.

- [ ] **Step 4: Apply the widget and character card grammar**

Use `Card` for the hidden-widget recovery area, `Inset` for edit rails, and `Button variant="ghost" size="icon"` for move/hide controls. Preserve `pointer-events-none` while editing and the current linear order algorithm.

In `CompactCharacterSummary`, keep the existing data but change the portrait inset to 48–56px, keep the two compact meter lines, and use a shared ghost icon button for expansion. The expanded view still renders the complete existing character card.

- [ ] **Step 5: Build the three-metric activity header and compact rows**

Derive daily and weekly counts from enabled activities whose state is not `unavailable`. Count `completed` within each group and do not include the repeatable `ready` group. Render a 3-column metric area with these stable test IDs:

```tsx
<Inset data-testid="daily-summary" padding="sm">오늘 {daily.completed} / {daily.total}</Inset>
<Inset data-testid="weekly-summary" padding="sm">이번 주 {weekly.completed} / {weekly.total}</Inset>
<StatusBanner data-testid="actionable-summary" tone="actionable">
  지금 가능 {summary.actionableCount}
</StatusBanner>
```

Keep `summary.actionableCount` as the server-confirmed actionable count and use client grouping only to present the already returned activity states. Keep the detailed grouping below. Each activity row remains a link to the server-provided `href`, and retry uses `Button variant="soft"`.

- [ ] **Step 6: Run all home regressions and lint**

Run:

```bash
npm test -- src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureDashboardProvider.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/adventureDashboard.test.ts
npx eslint src/adventure/v2/V2AdventureHome.tsx src/adventure/v2/AdventureHomeWidgetGrid.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureActivitySettings.tsx
```

Expected: behavior tests and presentation tests pass with no new request or preference-model changes.

- [ ] **Step 7: Commit the home polish**

```bash
git add src/adventure/v2/V2AdventureHome.tsx src/adventure/v2/AdventureHomeWidgetGrid.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureActivitySettings.tsx
git diff --cached --name-only
git commit -m "feat: polish widget adventure home"
```

---

### Task 4: Apply the System to Battle Context and Result Sheet

**Files:**
- Modify: `src/adventure/v2/DungeonContextSummary.tsx`
- Modify: `src/adventure/v2/DungeonContextSummary.test.tsx`
- Modify: `src/adventure/v2/CompactBattlePlayerStatus.tsx`
- Modify: `src/adventure/v2/HuntResultSheet.tsx`
- Modify: `src/adventure/v2/HuntResultSheet.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Card`, `Inset`, `StatusBanner`.
- Preserves: all props and event callbacks, portal behavior, 75dvh limit, focus trap, Escape/backdrop close, safe-area footer, reward children, repeat callback, and optional log callback.

- [ ] **Step 1: Write failing battle style tests**

Add assertions that `DungeonContextSummary` has one outer card and one inset metadata row without a second shadow. Add to `HuntResultSheet.test.tsx`:

```tsx
it("대표 행동과 보조 행동을 공용 버튼 계층으로 표시한다", () => {
  render(<HuntResultSheet open title="승리" onClose={vi.fn()} onRepeat={vi.fn()} onViewLog={vi.fn()}>결과</HuntResultSheet>);
  expect(screen.getByRole("button", { name: "다시 사냥" }).className).toContain("bg-violet-600");
  expect(screen.getByRole("button", { name: "닫기" }).className).toContain("bg-white");
});
```

- [ ] **Step 2: Run battle tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/DungeonContextSummary.test.tsx src/adventure/v2/HuntResultSheet.test.tsx
```

Expected: the result sheet still uses the old emerald/manual button classes, so the hierarchy test fails.

- [ ] **Step 3: Migrate battle context and player disclosure**

Use `Card padding="sm"` for `DungeonContextSummary` and `Inset padding="sm"` for the power/difficulty/readiness line. Keep `SubViewHeader`, labels, number formatting, challenge badge, growth label, and readiness tone unchanged.

Use `Card padding="none"` for `CompactBattlePlayerStatus`, preserve native `details/summary`, and use `Inset` for the expanded existing player card.

- [ ] **Step 4: Migrate the result sheet controls**

Use `Card padding="none"` for the opaque dialog panel. Preserve the square bottom corners on mobile and restore the card radius at `sm`. Use `Button variant="primary"` for `다시 사냥`, `Button variant="secondary"` for log and close, and `Button variant="ghost" size="icon"` for the X button. Do not change callback order, portal target, focus management, or result children.

- [ ] **Step 5: Run battle integration tests and lint**

Run:

```bash
npm test -- src/adventure/v2/DungeonContextSummary.test.tsx src/adventure/v2/HuntResultSheet.test.tsx src/adventure/v2/V2DungeonFloorView.resultSheet.test.tsx src/adventure/v2/HuntResultCard.test.tsx
npx eslint src/adventure/v2/DungeonContextSummary.tsx src/adventure/v2/DungeonContextSummary.test.tsx src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/HuntResultSheet.tsx src/adventure/v2/HuntResultSheet.test.tsx
```

Expected: the sheet opens once per existing hunt flow, buttons call the same handlers, and all tests pass.

- [ ] **Step 6: Commit the battle adoption**

```bash
git add src/adventure/v2/DungeonContextSummary.tsx src/adventure/v2/DungeonContextSummary.test.tsx src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/HuntResultSheet.tsx src/adventure/v2/HuntResultSheet.test.tsx
git diff --cached --name-only
git commit -m "feat: apply refined ui to battle results"
```

---

### Task 5: Apply the System to Compact Inventory

**Files:**
- Modify: `src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx`
- Modify: `src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentCardGrid.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentCardGrid.test.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`

**Interfaces:**
- Consumes: `Button`, `Card`, `Inset`, surface tokens.
- Preserves: `EquippedItemSummaryGrid` and `EquipmentCardGrid` props, item-card anchors, detail opening, equip/unequip, sale selection, lock rules, codex registration, rarity styling, progression locks, and all API mutations in `V2InventoryView`.

- [ ] **Step 1: Write failing inventory presentation regressions**

Extend `EquippedItemSummaryGrid.test.tsx` to assert six slots use opaque inset backgrounds, mobile 3 columns, `sm` 6 columns, and a minimum 44px target. Extend `EquipmentCardGrid.test.tsx`:

```tsx
it("기본 카드는 공용 깊이를 사용하면서 희귀도와 선택 상태를 보존한다", () => {
  const html = renderToStaticMarkup(
    <EquipmentCardGrid
      cards={[{
        inst: { iid: "starter", id: "v2_starter_staff" },
        isEquipped: false,
      }]}
      onOpenCard={() => undefined}
      saleSelection={{
        active: true,
        selectedIids: new Set(["starter"]),
        onToggle: () => undefined,
      }}
    />,
  );
  expect(html).toContain("ui-game-card");
  expect(html).toContain("ui-item-rarity-t1");
  expect(html).toContain('aria-pressed="true"');
});
```

Use the existing fixture helpers in the test file rather than creating IDs that are absent from `V2_EQUIPMENT`.

- [ ] **Step 2: Run inventory tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx
```

Expected: the `ui-game-card` depth assertion fails because owned equipment cards still compose their surface manually.

- [ ] **Step 3: Migrate equipped slots**

Use `Inset as="button" padding="none"` for occupied slots and `Inset padding="none"` for empty slots. Keep the `grid-cols-3 sm:grid-cols-6` layout, `min-h-16`, slot icon colors, name truncation, enhancement label, title, and `anchorOf` click handling. Add the shared focus ring without introducing an inline unequip button.

- [ ] **Step 4: Migrate owned equipment cards without flattening state colors**

Add the shared `ui-game-card` depth and approved 12px outer radius to the equipment card. Keep opaque state backgrounds:

- normal: zinc inset/card background
- equipped or selected: emerald opaque surface
- sale selected: rose opaque surface
- progression locked: normal opaque card plus amber badge

Do not add opacity to locked cards. Keep the absolute interaction button, item rarity class, focus ring, badges, single-line item name, and single-line stat summary.

- [ ] **Step 5: Replace only inventory section actions with shared buttons**

In `V2InventoryView.tsx`, replace presentation-only raw action button classes in the equipped and owned-equipment sections with `Button` variants. Do not edit fetch URLs, request bodies, state transitions, optimistic behavior, selection logic, or item detail rendering. Because this file may contain unrelated user changes, stage its patch interactively or with a temporary index patch that contains only these style hunks.

- [ ] **Step 6: Run inventory regressions and lint**

Run:

```bash
npm test -- src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx
npx eslint src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx src/adventure/v2/V2InventoryView.tsx
```

Expected: all equipment interactions remain unchanged and focused tests pass.

- [ ] **Step 7: Commit only the inventory presentation changes**

```bash
git add src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx
git add -p src/adventure/v2/V2InventoryView.tsx
git diff --cached --name-only
git diff --cached -- src/adventure/v2/V2InventoryView.tsx
git commit -m "feat: apply refined ui to inventory"
```

Expected: the cached `V2InventoryView` diff contains only imports, shared button usage, and spacing classes.

---

### Task 6: Run Cross-Screen Verification and Record the Migration Contract

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1–5.
- No deployment files.

**Interfaces:**
- Consumes: all shared primitives and migrated core screens.
- Produces: a verified local commit series with no deployment.

- [ ] **Step 1: Confirm no translucent content surfaces were introduced**

Run:

```bash
rg -n "bg-(white|zinc|amber|emerald|rose|sky)-[^ ]*/(20|30|40|50|60|70|80)" src/components/ui src/adventure/v2/V2TopBar.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/V2AdventureHome.tsx src/adventure/v2/AdventureHomeWidgetGrid.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/DungeonContextSummary.tsx src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/HuntResultSheet.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquipmentCardGrid.tsx
```

Expected: only intentional frosted header/backdrop entries or pre-existing transient effect classes remain. Replace any new card/inset alpha surface with a shared opaque token.

- [ ] **Step 2: Run the complete focused regression set**

Run:

```bash
npm test -- src/components/ui/Button.test.tsx src/components/ui/Inset.test.tsx src/components/ui/StatusBanner.test.tsx src/components/ui/TextInput.test.tsx src/components/ui/TabBar.test.tsx src/components/ui/GameDialogHost.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureDashboardProvider.test.tsx src/adventure/v2/adventureDashboard.test.ts src/adventure/v2/DungeonContextSummary.test.tsx src/adventure/v2/HuntResultSheet.test.tsx src/adventure/v2/V2DungeonFloorView.resultSheet.test.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 3: Run static verification**

Run:

```bash
npx eslint src/components/ui src/app/dev/ui-system src/adventure/v2/V2TopBar.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/V2AdventureHome.tsx src/adventure/v2/AdventureHomeWidgetGrid.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/AdventureActivitySettings.tsx src/adventure/v2/DungeonContextSummary.tsx src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/HuntResultSheet.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquipmentCardGrid.tsx src/adventure/v2/V2InventoryView.tsx
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the production build and image validation**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

Expected: `prebuild` image optimization is idempotent, `check-images` reports no missing references, Next.js build succeeds, and the component preview route is generated.

- [ ] **Step 5: Perform the responsive visual check**

Start the local server without deploying:

```bash
npm run dev
```

Check `/dev/ui-system`, `/`, `/battle/dungeon`, a dungeon floor, and `/character/inventory` at 320px, 360px, 390px, and desktop width in both light and dark mode. Verify:

- no page-level horizontal overflow;
- opaque card and inset surfaces over every scene background;
- at least 44px mobile touch targets;
- the widget order/editing behavior remains intact;
- the main active tab is visible and actionable dots are orange;
- the battle result sheet does not sit behind chat controls;
- six equipped slots and owned equipment are visible at the intended density.

Stop the dev server after the check. Do not deploy.

- [ ] **Step 6: Review commits and working-tree separation**

Run:

```bash
git log --oneline -6
git status --short
git diff --cached --name-only
```

Expected: Tasks 1–5 are separate commits, there are no task files accidentally left staged, and unrelated user changes remain preserved.
