# Desktop Integrated Game Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current mobile five-tab header while replacing the PC layout with a taller, single-row header containing left-side life/stamina status and right-side navigation.

**Architecture:** Keep one `MainTabNav` instance so menu state, notifications, and guild facility fetching remain shared. On desktop, `GameChrome` becomes a three-column grid; `V2TopBar` uses `display: contents` to place its left status and right quick actions around the centered navigation, while the same DOM remains the existing stacked layout on mobile.

**Tech Stack:** Next.js App Router client components, React, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Mobile below `md` must retain the current five-column tab bar and full-width card dropdown.
- Desktop at `md` and above must show one taller integrated header row.
- Desktop ordering is home, life activity, stamina on the left; battle, town, life, character, guild, notifications, settings on the right.
- Gold remains available only in the existing mobile/tablet range and is hidden at `md` and above.
- Existing notification dots, activity details, Escape/outside-click closing, and dynamic guild facility fetching must remain functional.
- Header and dropdown surfaces continue using the existing opaque surface tokens.

---

### Task 1: Lock responsive header structure with regression tests

**Files:**
- Modify: `src/adventure/v2/MainTabNav.test.tsx`
- Modify: `src/adventure/v2/V2TopBar.test.tsx`
- Modify: `src/adventure/v2/GameChrome.layout.test.tsx`

**Interfaces:**
- Consumes: `MainTabNav`, `V2TopBar`, and `GameChrome` existing props.
- Produces: Regression assertions for mobile preservation and desktop integration classes/data hooks.

- [ ] **Step 1: Write failing navigation tests**

Add assertions that the main menu keeps `grid-cols-5` below `md`, switches to `md:flex`, gives each tab a desktop-relative wrapper, and anchors the open dropdown with desktop fixed-width/centered classes while retaining mobile `left-0 right-0` behavior.

```tsx
expect(nav.firstElementChild?.className).toContain("grid-cols-5");
expect(nav.firstElementChild?.className).toContain("md:flex");
expect(lifeTab.parentElement?.className).toContain("md:relative");
expect(screen.getByRole("menu").className).toContain("md:w-[22rem]");
```

- [ ] **Step 2: Write failing top-bar and chrome tests**

Assert desktop gold hiding, the stamina button's placement inside the left status group, and the desktop three-column header grid.

```tsx
expect(html).toMatch(/data-topbar-gold[^>]+class="[^"]*md:hidden/);
const leftStatus = container.querySelector("[data-topbar-left-status]");
expect(within(leftStatus as HTMLElement).getByRole("button", { name: /스태미나/ })).toBeTruthy();
expect(gameHeader?.firstElementChild?.className).toContain("md:grid-cols-[minmax(0,1fr)_auto_auto]");
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/GameChrome.layout.test.tsx --run`

Expected: FAIL because the desktop responsive classes and left-status hook do not exist yet.

- [ ] **Step 4: Commit the regression tests**

```bash
git add src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/GameChrome.layout.test.tsx
git commit -m "test: define desktop integrated game header"
```

### Task 2: Implement the desktop integrated header without mobile regressions

**Files:**
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/adventure/v2/V2TopBar.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx`

**Interfaces:**
- Consumes: Existing `MainTabNav` props and `V2TopBar` resource/status props.
- Produces: One responsive header DOM with a desktop grid and mobile stacked layout.

- [ ] **Step 1: Make `GameChrome` the responsive grid owner**

Give the header inner wrapper desktop columns and row placement while preserving mobile block flow.

```tsx
<div className="w-full md:grid md:min-h-16 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:border-b md:border-zinc-200 md:px-5 dark:md:border-zinc-800">
  <V2TopBar ... />
  <MainTabNav ... />
  <div data-game-ticker-slot className="overflow-hidden md:col-span-3 md:row-start-2">
```

- [ ] **Step 2: Reorder desktop resources in `V2TopBar`**

Add `data-topbar-left-status`, move the existing stamina button into that group after the life activity, use `max-md:ml-auto` to preserve its mobile right alignment, make the component wrappers `md:contents`, and add `md:hidden` to gold.

```tsx
<div data-game-top-bar className="... md:contents">
  <div className="... md:contents">
    <div data-topbar-left-status className="... md:col-start-1 md:row-start-1 md:h-16">
      {homeAndLifeStatus}
      {staminaButton}
    </div>
    <div className="... md:col-start-3 md:row-start-1">
      {mobileGoldAndQuickActions}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Give `MainTabNav` responsive inline tabs and anchored menus**

Wrap each tab in `contents md:relative`, switch the tab container from the unchanged mobile grid to desktop flex, and render the open panel inside its tab wrapper. On mobile the `contents` wrapper makes the existing nav the containing block; on desktop `md:relative` anchors the fixed-width panel below its own tab.

```tsx
<div className="grid grid-cols-5 ... md:flex md:border-0 md:px-0">
  <div className="contents md:relative">
    <button className="... md:min-h-16 md:px-4 md:text-[0.9375rem]">...</button>
    {isOpen ? (
      <div className="... absolute left-0 right-0 top-full ... md:left-1/2 md:right-auto md:w-[22rem] md:-translate-x-1/2 md:grid-cols-2">
        {menuItems}
      </div>
    ) : null}
  </div>
</div>
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/GameChrome.layout.test.tsx --run`

Expected: All focused tests pass.

- [ ] **Step 5: Run static verification**

Run: `npx tsc --noEmit`

Expected: Exit 0.

Run: `npx eslint src/adventure/v2/MainTabNav.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/GameChrome.layout.test.tsx`

Expected: Exit 0.

- [ ] **Step 6: Run the complete test suite**

Run: `npm test -- --run`

Expected: All existing suites pass with only documented skips.

- [ ] **Step 7: Commit implementation**

```bash
git add src/adventure/v2/MainTabNav.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/GameChrome.layout.test.tsx
git commit -m "feat: integrate desktop game navigation into header"
```

