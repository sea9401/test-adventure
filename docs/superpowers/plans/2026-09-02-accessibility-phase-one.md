# Web Accessibility Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WCAG 2.2 AA regression coverage and keyboard access for sign-in, character creation, the game home, dungeon list, marketplace, and inbox.

**Architecture:** Reuse one Playwright axe helper across public and authenticated suites, then exercise authenticated pages through the existing isolated database account. Put skip navigation in the persistent game chrome, keep each page's existing `<main>` landmark, and fix violations at the shared-component layer whenever multiple surfaces have the same cause.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, Playwright 1.62, `@axe-core/playwright` 4.12, Vitest 4.1.

## Global Constraints

- Target axe tags are exactly `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.
- Do not change game rewards, combat outcomes, marketplace behavior, or API contracts.
- Preserve one page-owned `<main>` landmark; do not wrap pages in another `<main>`.
- Accessibility failures must report rule ID, impact, help text, and target selectors.
- Run authenticated coverage in the existing isolated PostgreSQL project with one worker.
- Do not deploy. Deployment requires a separate explicit user request.
- Do not create subagents; the repository instructions require inline execution unless the user explicitly asks for delegation.

---

### Task 1: Shared Axe Audit Helper

**Files:**
- Create: `e2e/support/accessibility.ts`
- Modify: `e2e/public-surface.spec.ts`

**Interfaces:**
- Produces: `WCAG_AA_TAGS`, `violationSummary(violations)`, and `expectNoA11yViolations(page)`.
- Consumes: Playwright `Page`, axe `Result`, and Playwright `expect`.

- [ ] **Step 1: Extract the existing violation formatting and tags**

Create a helper that keeps the public suite's current rules and returns actionable output:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { Result } from "axe-core";

export const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

export function violationSummary(violations: Result[]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target),
  }));
}

export async function expectNoA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags([...WCAG_AA_TAGS])
    .analyze();
  expect(violationSummary(result.violations)).toEqual([]);
}
```

- [ ] **Step 2: Refactor the public suite to call the helper**

Remove its local `AxeBuilder`, tag list, and summary implementation. Import
`expectNoA11yViolations` and replace the inline analysis with:

```ts
await expectNoA11yViolations(page);
```

- [ ] **Step 3: Run the public accessibility regression**

Run: `npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium`

Expected: all public-surface desktop tests pass with the same WCAG coverage.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/accessibility.ts e2e/public-surface.spec.ts
git commit -m "test: share axe accessibility audit helper"
```

### Task 2: Game Skip Navigation and Route Heading

**Files:**
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/adventure/v2/GameChrome.layout.test.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Test: `src/adventure/v2/GameChrome.layout.test.tsx`

**Interfaces:**
- Produces: link target ID `game-main-content` and a focusable route-content wrapper.
- Consumes: page-owned `<main>` elements rendered inside `GameChrome`.

- [ ] **Step 1: Write the failing skip-navigation test**

Render `GameChrome` with `<main>게임 콘텐츠</main>` and assert:

```ts
const skipLink = within(container).getByRole("link", {
  name: "본문으로 바로가기",
});
expect(skipLink.getAttribute("href")).toBe("#game-main-content");
expect(skipLink.className).toContain("focus:not-sr-only");
const target = container.querySelector("#game-main-content");
expect(target?.getAttribute("tabindex")).toBe("-1");
expect(target?.querySelectorAll("main")).toHaveLength(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/adventure/v2/GameChrome.layout.test.tsx`

Expected: FAIL because the named link and `#game-main-content` do not exist.

- [ ] **Step 3: Implement the skip link and stable target**

Place this link as the first interactive child of the game chrome:

```tsx
<a
  href="#game-main-content"
  className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-violet-700 px-4 py-2 font-semibold text-white shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2"
>
  본문으로 바로가기
</a>
```

Wrap only the existing transition/content region, without adding a second landmark:

```tsx
<div id="game-main-content" tabIndex={-1}>
  <GameContentTransition>{/* existing content */}</GameContentTransition>
</div>
```

Add a visually hidden `<h1>모험</h1>` as the first child of `V2AdventureHome`'s
`PageShell`, because the home route currently lacks a route-specific level-one heading.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/adventure/v2/GameChrome.layout.test.tsx`

Expected: PASS, with one nested page-owned `<main>` and a working skip target.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/GameChrome.tsx src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2AdventureHome.tsx
git commit -m "feat: add game skip navigation"
```

### Task 3: Authenticated Critical-Surface Axe Suite

**Files:**
- Create: `e2e/authenticated-accessibility.spec.ts`
- Modify: `playwright.config.ts`
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: `expectNoA11yViolations`, `authenticatedE2eConfig`,
  `resetAuthenticatedE2eAccount`, and `prepareLocalHttpBrowser`.
- Produces: authenticated desktop Chromium and mobile WebKit WCAG regression coverage.

- [ ] **Step 1: Include the new suite in authenticated projects**

Replace the single-file regular expression with:

```ts
const AUTHENTICATED_SPEC = /authenticated-(?:flow|accessibility)\.spec\.ts/;
```

Keep the existing one-worker setting and mobile dependency so both authenticated files
share the isolated account safely.

- [ ] **Step 2: Add the authenticated setup and login helper**

The new suite must skip without E2E credentials, call
`prepareLocalHttpBrowser(page, { authenticated: true })` and
`resetAuthenticatedE2eAccount()` in `beforeEach`, and use the same password-login
controls as `authenticated-flow.spec.ts`.

- [ ] **Step 3: Add the character-creation audit**

After login, open "캐릭터 만들고 시작하기", wait for the level-one "캐릭터 생성"
heading, and run `expectNoA11yViolations(page)` before submitting. Complete the form
with the unique name `접근성검증모험가`, select "남성 1", accept the community policy,
submit, and wait for `/` plus the character name.

- [ ] **Step 4: Audit each authenticated critical surface**

For each route below, navigate, wait for a visible `<main>`, assert exactly one visible
`<h1>`, and run `expectNoA11yViolations(page)`:

```ts
const CRITICAL_SURFACES = [
  { path: "/", heading: "모험" },
  { path: "/battle/dungeon", heading: "사냥터" },
  { path: "/plaza/market", heading: "거래소" },
  { path: "/plaza/inbox", heading: "알림" },
] as const;
```

Run: `npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium`

Expected before remediation: the suite reports any existing rule ID and exact target;
environment or authentication failures remain separate from axe output.

- [ ] **Step 5: Remediate reported violations at the narrowest shared owner**

Apply these deterministic mappings for every report, then rerun Step 4 after each group:

- `button-name`, `link-name`, `image-alt`: add a Korean accessible name at the component
  that renders the unnamed control or mark decorative SVGs `aria-hidden="true"`.
- `color-contrast`: replace only the failing foreground utility with the nearest existing
  zinc/rose/amber shade that reaches AA in both themes; keep surfaces opaque.
- `heading-order`: change the structural heading level without using ARIA to fake levels.
- `landmark-one-main`, `region`: keep the page-owned `<main>` and label repeated regions.
- invalid `aria-*`: correct or remove the invalid attribute at its owning component rather
  than disabling the axe rule.

Do not exclude elements, disable axe rules, or add `aria-label` text that duplicates useful
visible text.

- [ ] **Step 6: Run desktop and mobile authenticated audits**

Run:

```bash
npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-mobile-webkit
```

Expected: both projects pass with zero violations on all five audited states.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e/authenticated-accessibility.spec.ts src
git commit -m "test: cover authenticated accessibility flows"
```

### Task 4: Keyboard Skip-Link and Focus Contract

**Files:**
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Create: `src/lib/useFocusTrap.test.tsx`
- Test: both files above

**Interfaces:**
- Consumes: `#game-main-content` and the existing `useFocusTrap(ref, enabled)` hook.
- Produces: regression proof for keyboard entry, focus containment, and focus restoration.

- [ ] **Step 1: Add the authenticated skip-link keyboard test**

After creating the test character, reload `/`, press `Tab`, and assert the named skip link
is focused and visible. Press `Enter`, then assert `#game-main-content` is
`document.activeElement` and the page-owned `<main>` remains inside it.

- [ ] **Step 2: Add focus-trap hook tests**

Render a trigger plus a conditional dialog harness that calls `useFocusTrap`. Verify:

1. opening focuses the first enabled button;
2. `Tab` on the last button wraps to the first;
3. `Shift+Tab` on the first wraps to the last;
4. closing restores focus to the trigger.

Stub each focusable element's `offsetParent` to a non-null element because jsdom has no
layout engine.

- [ ] **Step 3: Run focused keyboard tests**

Run:

```bash
npm test -- src/lib/useFocusTrap.test.tsx src/adventure/v2/GameChrome.layout.test.tsx
npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
```

Expected: all unit tests and the Chromium authenticated suite pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/authenticated-accessibility.spec.ts src/lib/useFocusTrap.test.tsx
git commit -m "test: protect keyboard focus accessibility"
```

### Task 5: Manual Accessibility Checklist and Final Verification

**Files:**
- Create: `docs/accessibility/manual-checklist.md`

**Interfaces:**
- Produces: a repeatable manual review record for issues axe cannot determine.

- [ ] **Step 1: Write the manual checklist**

Include checkboxes for desktop keyboard-only use, 200% zoom and reflow, light/dark focus
visibility, Korean control-name clarity, error association, live status announcements,
reduced motion, NVDA with Firefox/Chrome, VoiceOver with Safari, and the five critical
flows. State that passing axe is not legal certification or complete conformance.

- [ ] **Step 2: Run static and focused verification**

Run:

```bash
npm test -- src/lib/useFocusTrap.test.tsx src/adventure/v2/GameChrome.layout.test.tsx
npx eslint e2e/support/accessibility.ts e2e/public-surface.spec.ts e2e/authenticated-accessibility.spec.ts playwright.config.ts src/adventure/v2/GameChrome.tsx src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2AdventureHome.tsx src/lib/useFocusTrap.test.tsx
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

Expected: every command exits 0.

- [ ] **Step 3: Run browser regressions**

Run:

```bash
npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium
npx playwright test e2e/public-surface.spec.ts --project=mobile-webkit
npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-mobile-webkit
```

Expected: all public and authenticated accessibility tests pass.

- [ ] **Step 4: Run production build**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: image checks and the Next.js production build exit 0.

- [ ] **Step 5: Commit documentation and final adjustments**

```bash
git add docs/accessibility/manual-checklist.md
git commit -m "docs: add accessibility review checklist"
```
