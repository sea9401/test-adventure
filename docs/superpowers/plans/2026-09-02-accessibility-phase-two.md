# Web Accessibility Phase Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend authenticated WCAG 2.2 AA regression coverage to character, life, guild, preferences, and chat surfaces while guaranteeing a keyboard user returns to the chat trigger after closing the panel.

**Architecture:** Reuse the phase-one axe helper and isolated authenticated account, but extract character setup within the existing accessibility suite so both audit groups start from the same deterministic state. Audit representative vertical surfaces and fix only reported violations at their narrowest shared owner. Keep desktop chat nonmodal, give the opened panel a useful initial focus target, and restore focus in `ChatButton`, which owns both the trigger and open state.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, Playwright 1.62, `@axe-core/playwright` 4.12, Testing Library, Vitest 4.1.

## Global Constraints

- Target axe tags remain exactly `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.
- Keep one page-owned `<main>` and one route-name `<h1>` on each audited screen.
- Do not disable axe rules or exclude failing elements from analysis.
- Preserve desktop chat as a nonmodal dock and mobile chat as a full-screen modal.
- Do not change character stats, items, recipes, guild permissions, chat messages, or API contracts.
- Keep scene and card surfaces opaque according to `src/components/ui/surfaces.ts`.
- Run authenticated coverage against the isolated PostgreSQL account with one worker.
- Actual NVDA and VoiceOver operation remains a manual test; automation must not claim screen-reader certification.
- Do not deploy, push, or create a PR.
- Do not create subagents; repository instructions require inline execution unless the user explicitly requests delegation.

---

### Task 1: Deterministic Phase-Two Surface Audit

**Files:**
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: `a11yViolationSummary(page)`, `authenticatedE2eConfig()`, `resetAuthenticatedE2eAccount()`, and `prepareLocalHttpBrowser(page, { authenticated: true })`.
- Produces: `createAuthenticatedCharacter(page: Page, name: string): Promise<void>` and regression coverage for `PHASE_TWO_SURFACES`.

- [ ] **Step 1: Extract authenticated character setup used by both audit groups**

Move the existing password login, character creation form, setup-response wait, URL assertion,
and visible-name assertion into:

```ts
async function createAuthenticatedCharacter(page: Page, name: string) {
  if (!account) throw new Error("Authenticated E2E configuration is missing");
  await loginWithPassword(page, account.loginId, account.password);
  await page.getByRole("link", { name: "캐릭터 만들고 시작하기" }).click();
  await expect(
    page.getByRole("heading", { name: "캐릭터 생성", level: 1 }),
  ).toBeVisible();
  await page.getByPlaceholder("이름 입력").fill(name);
  await expect(page.getByText("사용 가능한 이름이에요.")).toBeVisible();
  await page.getByRole("button", { name: "남성 1" }).click();
  await page.getByRole("checkbox", { name: /커뮤니티 운영정책/ }).check();
  const setupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile/setup") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "모험 시작" }).click();
  expect((await setupResponse).status()).toBe(200);
  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/`);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}
```

Keep the character-creation axe assertion immediately after its heading becomes visible by
allowing the existing phase-one test to perform that assertion before calling a smaller form-submit
helper, or by adding an `auditCreationPage` boolean parameter. Do not silently remove the existing
creation-page audit.

- [ ] **Step 2: Add the phase-two surface table and failing aggregate audit**

Add:

```ts
const PHASE_TWO_SURFACES = [
  { path: "/character/inventory", heading: "인벤토리" },
  { path: "/character/skills", heading: "스킬" },
  { path: "/town", heading: "마을" },
  { path: "/town/farm", heading: "모험가 농장" },
  { path: "/town/life-workshop", heading: "생활 조합 작업장" },
  { path: "/guild", heading: "길드" },
  { path: "/settings/preferences", heading: "환경 설정" },
] as const;
```

Create a second test that sets a 120-second timeout, creates `2차접근모험가`, then for
each entry calls `page.goto(surface.path)`, waits for a visible `main`, asserts exactly one level-one
heading with the expected name, runs `a11yViolationSummary(page)`, and aggregates failures as
`{ path, violations }`. Finish with `expect(surfaceViolations).toEqual([])` so every failing route is
reported in one run.

- [ ] **Step 3: Run the new audit to capture the red state**

Run:

```bash
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium --grep="2차"
```

Expected: FAIL if any target has a missing heading or axe violation. Record every route, rule ID,
target HTML, and failure summary before modifying production code. If it unexpectedly passes, keep
the test as characterization coverage and continue to Task 2.

- [ ] **Step 4: Commit the deterministic regression test**

```bash
git add e2e/authenticated-accessibility.spec.ts
git commit -m "test: audit secondary authenticated surfaces"
```

### Task 2: Phase-Two Surface Remediation

**Files:**
- Modify only the source files identified by Task 1 failures, expected candidates:
  - `src/adventure/v2/V2InventoryView.tsx`
  - `src/adventure/v2/V2SkillLearnView.tsx`
  - `src/adventure/v2/V2TownHome.tsx`
  - `src/adventure/v2/AdventurerFarmPanel.tsx`
  - `src/adventure/v2/LifeWorkshopView.tsx`
  - `src/adventure/v2/V2GuildHome.tsx`
  - `src/adventure/v2/V2PreferencesView.tsx`
  - a shared component named by the axe target
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: Task 1's exact route, rule, target HTML, and failure-summary output.
- Produces: zero axe violations and one route-name level-one heading for every `PHASE_TWO_SURFACES` entry.

- [ ] **Step 1: Group failures by owning component and rule**

Use these exact mappings:

- `color-contrast`: replace only the failing foreground utility with the nearest existing zinc,
  amber, rose, emerald, or violet shade that reaches AA in both themes.
- `button-name`, `link-name`, or `image-alt`: add a concise Korean accessible name at the control
  owner, or mark a decorative icon `aria-hidden="true"`.
- `heading-order`: use the structurally correct native heading level; do not simulate it with ARIA.
- `landmark-one-main` or `region`: keep the page-owned `main` and label the repeated region.
- invalid `aria-*`: correct or remove the invalid attribute at its rendering component.

Before each edit, identify whether the same class or markup appears on more than one failing route.
Use the shared owner only when the visual meaning and state are the same.

- [ ] **Step 2: Apply the smallest production fix for the first failure group**

Edit only the target markup or shared class reported for that group. Preserve opaque `SURFACE_CARD`,
`SURFACE_INSET`, and `SURFACE_ACCENT` usage and all domain callbacks.

- [ ] **Step 3: Rebuild and rerun the audit after the group**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium --grep="2차"
```

Expected: the edited rule/target disappears. Repeat Steps 1–3 for each remaining reported group;
the final aggregate is `[]`.

- [ ] **Step 4: Run focused component tests for every modified source owner**

Use `rg --files src | rg '<OwnerName>.*test'` to select existing tests, then run them together with:

```bash
npm test -- <each-selected-test-path>
```

Expected: all selected tests pass. If a modified owner has no focused test, the production-build and
Playwright route audit are its regression evidence.

- [ ] **Step 5: Commit the surface fixes**

```bash
git add src
git commit -m "fix: improve secondary surface accessibility"
```

### Task 3: Chat Initial Focus and Trigger Restoration

**Files:**
- Modify: `src/components/ChatButton.layout.test.ts`
- Modify: `src/components/ChatButton.tsx`
- Modify: `src/components/ChatPanel.tsx`
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Test: `src/components/ChatButton.layout.test.ts`
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: the existing floating `data-testid="floating-chat-toggle"`, named `role="dialog"`, and `onClose(): void` callback.
- Produces: `toggleRef: RefObject<HTMLButtonElement | null>`, `closeButtonRef: RefObject<HTMLButtonElement | null>`, opened-panel initial focus, and close-trigger focus restoration.

- [ ] **Step 1: Write the failing trigger-restoration unit test**

Make the mocked panel's close button receive focus before clicking it, close the floating panel, then
assert the remounted trigger is focused:

```ts
it("플로팅 채팅을 닫으면 열기 버튼으로 포커스를 복원한다", async () => {
  render(createElement(ChatButton, { ...props, variant: "floating" }));
  fireEvent.click(screen.getByTestId("floating-chat-toggle"));
  const closeButton = screen.getByRole("button", { name: "패널 닫기" });
  closeButton.focus();
  fireEvent.click(closeButton);
  await waitFor(() =>
    expect(screen.getByTestId("floating-chat-toggle")).toHaveFocus(),
  );
});
```

Import `waitFor` from Testing Library and `@testing-library/jest-dom/vitest` if the file does not
already receive the `toHaveFocus` matcher from global setup.

- [ ] **Step 2: Run the unit test to prove the red state**

Run:

```bash
npm test -- src/components/ChatButton.layout.test.ts
```

Expected: FAIL because the floating trigger remounts without focus.

- [ ] **Step 3: Restore focus from the component that owns the trigger**

In `ChatButton`, import `useRef`, create `const toggleRef = useRef<HTMLButtonElement>(null)`, and
track the previous open state. On a `true` to `false` transition, schedule
`toggleRef.current?.focus()` with `requestAnimationFrame`; cancel that frame on cleanup. Attach
`ref={toggleRef}` to the toggle button. Do not focus on initial render.

- [ ] **Step 4: Give the opened chat panel an initial internal focus**

In `ChatPanel`, create `const closeButtonRef = useRef<HTMLButtonElement>(null)`. When `open` becomes
true, schedule `closeButtonRef.current?.focus()` with `requestAnimationFrame` and cancel the frame on
effect cleanup. Attach the ref to the existing `aria-label="채팅 닫기"` button. This works for both
the nonmodal desktop dock and modal mobile panel without adding a desktop focus trap.

- [ ] **Step 5: Add the authenticated chat keyboard and axe flow**

Add a third test that creates `접근성채팅검증모험가`, navigates to `/`, focuses the floating toggle,
presses Enter, waits for `getByRole("dialog", { name: "채팅" })`, asserts the named close button is
focused, and calls `expectNoA11yViolations(page)`. Press Enter on the close button, assert the dialog
is removed, then assert the restored floating toggle is focused.

- [ ] **Step 6: Run focused unit and E2E tests**

Run:

```bash
npm test -- src/components/ChatButton.layout.test.ts src/components/ChatPanel.layout.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium --grep="채팅"
```

Expected: unit tests pass; the dialog has zero axe violations; focus starts at its close control and
returns to the floating trigger after closure.

- [ ] **Step 7: Commit the chat keyboard contract**

```bash
git add src/components/ChatButton.tsx src/components/ChatPanel.tsx src/components/ChatButton.layout.test.ts e2e/authenticated-accessibility.spec.ts
git commit -m "fix: preserve keyboard focus across chat"
```

### Task 4: Phase-Two Manual Review Coverage

**Files:**
- Modify: `docs/accessibility/manual-checklist.md`

**Interfaces:**
- Consumes: the phase-two target screens and chat focus contract.
- Produces: repeatable human checks for semantics axe cannot determine.

- [ ] **Step 1: Add the phase-two checklist**

Add a `## 2차 확장 흐름` section with checkboxes that explicitly cover:

- inventory item names, quantities, equipped state, and empty state;
- skill tabs, learn/enhance availability, ritual dialogs, and keyboard return;
- town navigation, farm plots, batch work, live success/error notices, and life-workshop quantities;
- no-guild creation/search/application states and later joined-guild management as follow-up;
- preferences controls, saved state, content-notification toggle, and reduced motion;
- floating chat accessible name, initial focus, room selection, message errors, Escape/back behavior,
  mobile focus containment, and trigger restoration;
- 200% zoom and 320px reflow on every phase-two screen;
- NVDA and VoiceOver reading order and Korean label clarity.

Retain the statement that automation and the checklist are not legal certification.

- [ ] **Step 2: Review the documentation diff**

Run:

```bash
git diff --check
rg -n "2차 확장 흐름|인벤토리|채팅|NVDA|VoiceOver" docs/accessibility/manual-checklist.md
```

Expected: no whitespace errors and all named manual-review areas are present.

- [ ] **Step 3: Commit the checklist**

```bash
git add docs/accessibility/manual-checklist.md
git commit -m "docs: expand accessibility review checklist"
```

### Task 5: Full Regression Verification

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: all phase-one and phase-two accessibility contracts.
- Produces: recorded evidence that unit, static, build, public, and authenticated checks pass.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

Expected: all non-skipped Vitest files and tests pass.

- [ ] **Step 2: Run lint and TypeScript checks**

Run:

```bash
npx eslint e2e/authenticated-accessibility.spec.ts src/components/ChatButton.tsx src/components/ChatPanel.tsx src/components/ChatButton.layout.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 3: Produce a fresh production build**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: image checks, Next.js compilation, type generation, and static generation all pass.

- [ ] **Step 4: Run public desktop accessibility coverage**

Run:

```bash
npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium
```

Expected: every public desktop test passes.

- [ ] **Step 5: Run all authenticated desktop accessibility coverage**

Run:

```bash
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
```

Expected: phase-one, phase-two, skip-link, and chat checks all pass serially.

- [ ] **Step 6: Attempt authenticated mobile WebKit coverage**

Run:

```bash
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-mobile-webkit
```

Expected in CI's official Playwright image: pass. If the local browser cannot launch because host
GTK/GStreamer libraries are absent, record that infrastructure limitation verbatim; do not report
the mobile project as passing and do not install host packages without approval.

- [ ] **Step 7: Inspect repository state and recent commits**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: only intentional committed changes, no generated reports, no deployment changes, and no
push or PR.
