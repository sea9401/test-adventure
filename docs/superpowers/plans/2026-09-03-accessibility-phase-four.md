# Web Accessibility Phase Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not create subagents for this project.

**Goal:** Add repeatable accessibility coverage for reflow, dark mode, live validation/results, and modal focus on representative stateful game workflows.

**Architecture:** Reuse the isolated authenticated Playwright fixture from phase three. Add small accessibility test helpers for document overflow and CSS zoom, exercise safe client-side validation plus isolated life processing, and fix semantic/flow problems at the owning marketplace, workshop, or guild component.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, PostgreSQL, Playwright 1.62, `@axe-core/playwright` 4.12, Vitest 4.1.

## Global Constraints

- Keep the existing WCAG axe tags and do not disable rules or exclude failures.
- Mutating E2E actions may consume only the isolated `adventure_e2e` account state.
- Do not register a market listing, place a bid, purchase, donate guild materials, upgrade facilities, or perform administrator writes.
- Preserve one page-owned `<main>` and `<h1>`, opaque surfaces, and existing game behavior.
- Treat 200% CSS zoom as an automated layout regression approximation; retain real browser zoom for manual review.
- Keep authenticated Chromium and mobile WebKit in the existing official Playwright CI container.
- Do not deploy, push, create a PR, or create subagents.

---

### Task 1: Semantic Contracts for Stateful Feedback

**Files:**
- Modify: `src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.test.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceMaterialTab.tsx`
- Modify: `src/adventure/v2/marketplace/marketplaceShared.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Test: `src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx`
- Test: `src/adventure/v2/LifeWorkshopView.test.tsx`

**Interfaces:**
- `PriceInput` accepts standard input naming props through its existing `NumberInput` surface.
- Each material price input exposes `<품목> 묶음 전체 시작 입찰가` as its accessible name.
- The workshop notice container exposes a polite status region.

- [ ] **Step 1: Write failing component tests**

Extend the material tab test to require an item-specific price input name, and extend the workshop test
to render `initialTab="process"` and require a `role="status"` region with `aria-live="polite"`.

- [ ] **Step 2: Prove the tests fail for the intended reason**

```bash
npm test -- src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx
```

Expected: FAIL because the price input is named only by placeholder and the workshop live region has no
explicit status role.

- [ ] **Step 3: Implement the smallest semantic changes**

Allow `PriceInput` to receive an `aria-label` without changing number formatting. Pass the item-specific
label from `MarketplaceMaterialTab`. Add `role="status"` to the existing fixed-height workshop notice
region while preserving `aria-live="polite"`, `aria-atomic`, and its surface classes.

- [ ] **Step 4: Rerun focused tests and commit**

```bash
npm test -- src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx
git add src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/marketplace/MarketplaceMaterialTab.tsx src/adventure/v2/marketplace/marketplaceShared.tsx src/adventure/v2/LifeWorkshopView.tsx
git commit -m "fix: clarify stateful workflow feedback"
```

### Task 2: Interaction and Reflow E2E Characterization

**Files:**
- Modify: `e2e/support/accessibility.ts`
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Add `documentViewportDimensions(page)` and `expectNoDocumentOverflow(page)` helpers.
- Produce deterministic tests for workshop results/dialog focus, marketplace validation, and 320px dark
  reflow across marketplace and guild donation states.

- [ ] **Step 1: Add the overflow helper and failing interaction tests**

The helper returns document `clientWidth` and `scrollWidth` and asserts content does not exceed the
viewport. Add an authenticated test that:

1. creates and seeds a character;
2. processes one batch in the life workshop and requires the completion text in a status region;
3. opens the maximum-processing dialog, cancels it, and requires focus to return to its trigger;
4. opens marketplace material selling, attempts registration without a price, and requires a named
   alert plus the item-specific price input.

- [ ] **Step 2: Add 320px dark-mode coverage**

Set viewport to 320×900 and emulate dark color scheme before navigation. Audit marketplace material
selling, then create a solo guild, open its facilities tab and one facility donation form. At each state
wait for the identifying controls, run axe, and call `expectNoDocumentOverflow`.

- [ ] **Step 3: Add 200% CSS zoom coverage**

Set a 1280px desktop viewport, apply `document.documentElement.style.zoom = "2"`, open marketplace
material selling, then require visible quantity/price/register controls, zero axe violations, and no
document overflow.

- [ ] **Step 4: Run the focused test against a fresh production build**

Start the isolated local PostgreSQL fixture if needed, then run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium --grep="4차"
```

Expected: tests expose the existing marketplace alert semantic and any real layout overflow without
performing market or guild writes.

### Task 3: Minimal Product Remediation

**Files:**
- Modify only the source owners identified by Task 2.
- Test the corresponding component files plus `e2e/authenticated-accessibility.spec.ts`.

- [ ] **Step 1: Classify each E2E failure**

Use the exact rule, target, HTML, overflow dimensions, or focus mismatch. Assign it to the narrowest
owner and distinguish product failures from fixture/timing errors.

- [ ] **Step 2: Write or extend a component regression before each product fix**

Expected likely contract: marketplace error feedback has `role="alert"`; successful inline feedback has
`role="status"`; compact material/guild rows wrap or stack at 320px; modal close restores its trigger.

- [ ] **Step 3: Apply one failure group at a time and rerun focused tests**

Do not suppress axe rules. Preserve surface constants, input values, callbacks, permissions, and write
guards.

- [ ] **Step 4: Rebuild and rerun the phase-four Chromium grep until green**

Commit only source and regression changes that were actually required:

```bash
git add e2e src
git commit -m "fix: improve interactive accessibility"
```

### Task 4: CI Boundary and Manual Review Documentation

**Files:**
- Modify: `docs/browser-e2e.md`
- Modify: `docs/accessibility/manual-checklist.md`

- [ ] **Step 1: Document WebKit execution boundary**

Record that authenticated accessibility runs in Chromium and mobile WebKit in the official pinned CI
image. Explain that local WebKit launch requires Playwright host libraries and that missing libraries are
an environment failure, not permission to skip the CI lane.

- [ ] **Step 2: Add a phase-four manual checklist**

Cover real 200% browser zoom, 320px dark/light reflow, marketplace validation, workshop result
announcement and maximum confirmation, guild donation sliders, modal focus restoration, NVDA, and
VoiceOver. Keep the non-certification statement.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/browser-e2e.md docs/accessibility/manual-checklist.md
git commit -m "docs: add phase four accessibility review"
```

### Task 5: Full Verification

- [ ] **Step 1: Run unit, lint, and type verification**

```bash
npm test
npx eslint e2e/authenticated-accessibility.spec.ts e2e/support/accessibility.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/marketplace/MarketplaceMaterialTab.tsx src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/marketplace/marketplaceShared.tsx
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

- [ ] **Step 2: Run production and browser verification**

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
```

- [ ] **Step 3: Attempt the local mobile WebKit lane**

Run the authenticated accessibility spec with `--project=authenticated-mobile-webkit`. If the host lacks
Playwright WebKit libraries, record the exact launch dependency error and rely only on the already-required
official-image CI lane for that environment; do not claim a local pass.

- [ ] **Step 4: Review scope and repository state**

Run `git diff --check`, review all phase-four commits and confirm no deployment, push, PR, production
configuration, or unrelated user change occurred.
