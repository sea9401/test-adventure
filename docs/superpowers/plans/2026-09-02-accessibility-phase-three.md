# Web Accessibility Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WCAG 2.2 AA regression coverage for populated player surfaces, joined-guild management, and representative administrator workflows using only an isolated local E2E account and database.

**Architecture:** Extend the existing authenticated Playwright suite with a database helper guarded to the isolated E2E database and fixed account. Use the same account to create a solo guild through the UI and to access read-only administrator tabs. Aggregate axe reports per state and remediate failures at the narrowest shared component.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, PostgreSQL, Playwright 1.62, `@axe-core/playwright` 4.12, Vitest 4.1.

## Global Constraints

- Use exactly the existing WCAG tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.
- Never disable an axe rule or exclude a failing element.
- Seed only the loopback/GitHub Actions `adventure_e2e` database and the fixed E2E account.
- Set administrator capability only in Playwright's local server environment; keep staging-only development routes hidden.
- Do not perform administrator writes, guild upgrades, raid attacks, market listings, bids, or purchases.
- Preserve one page-owned `<main>` and one route-name `<h1>` on game screens; preserve one admin `<h1>`, one `<main>`, and a current-tab `<h2>`.
- Preserve opaque card and panel surfaces.
- Actual NVDA and VoiceOver operation remains manual review.
- Do not deploy, push, or create a PR.
- Do not create subagents.

---

### Task 1: Isolated Stateful Accessibility Fixture

**Files:**
- Modify: `playwright.config.ts`
- Modify: `e2e/support/authenticatedDatabase.ts`
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: the fixed E2E user, the loopback/GitHub Actions `adventure_e2e` database, and the existing authenticated browser session.
- Produces: `seedAuthenticatedE2ePhaseThreeState(): Promise<void>` and deterministic populated-state coverage.

- [ ] **Step 1: Write the failing populated-state E2E flow**

Add `seedAuthenticatedE2ePhaseThreeState` to update the fixed account's `character.v2` save with:

```ts
{
  setLevel: 30,
  gold: 20_000_000,
  materials: { v2_timber: 100, v2_iron_ore: 100 }
}
```

Call `assertIsolatedE2eDatabaseUrl` before connecting and require exactly one updated save row so a
missing fixture fails as a preparation error.

Create a test named `데이터가 채워진 성장·생활·거래 화면에 자동 탐지 접근성 위반이 없다`.
Create character `3차상태모험가`, call the seed helper, and audit these states after waiting for
their visible data:

```ts
await page.goto("/character/inventory");
await expect(page.getByText("소나무 원목", { exact: true }).first()).toBeVisible();

await page.goto("/town/life-workshop");
await expect(page.getByText("소나무 원목", { exact: false }).first()).toBeVisible();

await page.goto("/plaza/market");
await page.getByRole("button", { name: "판매 아이템 올리기" }).click();
await page.getByRole("tab", { name: "재료", exact: true }).click();
await expect(page.getByRole("spinbutton", { name: "소나무 원목 판매 수량" })).toBeVisible();
```

Run axe after each state and aggregate `{ state, violations }` before asserting `[]`.

- [ ] **Step 2: Run the test to prove the populated-state audit is red**

Run the authenticated Chromium test with the isolated database environment and `--grep="데이터가 채워진"`.

Expected: the fixture succeeds against the isolated database and the audit reports any real populated
surface violation.

- [ ] **Step 3: Enable administrator capability only inside the Playwright server**

In `playwright.config.ts` add these `webServer.env` defaults:

```ts
ADMIN_EMAILS:
  process.env.ADMIN_EMAILS ?? "browser-e2e@accounts.msmsge.invalid",
```

Do not enable staging flags; the public regression must continue to observe 404 from development routes.

- [ ] **Step 4: Make account reset remove a previous solo test guild**

Inside the existing database transaction, before deleting saves, remove outpost occupations for a solo
guild owned by the E2E account, delete that solo guild so cascades clear membership, then delete any
remaining E2E membership. Use parameterized `$1` queries and the existing advisory transaction lock.
This lets a guild-creating test run repeatedly without retaining membership.

- [ ] **Step 5: Build and rerun the populated-state test**

Run `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`, then rerun the Step 2 command.

Expected: the seed updates exactly one save. The test either reports exact axe violations from the
three populated surfaces or passes as characterization coverage.

- [ ] **Step 6: Commit the fixture and red/characterization coverage**

```bash
git add playwright.config.ts e2e/support/authenticatedDatabase.ts e2e/authenticated-accessibility.spec.ts
git commit -m "test: seed stateful accessibility flows"
```

### Task 2: Populated Player Surface Remediation

**Files:**
- Modify only source owners named by Task 1's axe output.
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: exact rule, HTML, selector, and failure-summary output from the populated-state test.
- Produces: zero axe violations for populated inventory, life-workshop processing, and marketplace selling.

- [ ] **Step 1: Group every failure by rule and shared owner**

Map contrast failures to the nearest AA color token, target-size failures to at least 27px before the
desktop game's 90% zoom, names to concise Korean control labels, headings to native levels, and ARIA
failures to the element that emits the attribute.

- [ ] **Step 2: Apply one failure group and run focused component tests**

Edit only the owning markup/classes, then locate its tests with `rg --files src | rg '<Owner>.*test'`
and run `npm test -- <selected paths>`.

- [ ] **Step 3: Rebuild and rerun the populated-state audit**

Run a fresh 4GB production build and the Step 1 E2E grep. Repeat Steps 1–3 until the aggregate equals
`[]`; do not suppress a rule.

- [ ] **Step 4: Commit populated-state fixes**

```bash
git add src
git commit -m "fix: improve populated surface accessibility"
```

If Task 1 passed without source changes, omit this empty commit.

### Task 3: Joined-Guild Accessibility Flow

**Files:**
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Modify only source owners named by the new test's axe output.
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: `seedAuthenticatedE2ePhaseThreeState`, the guild creation UI, and `a11yViolationSummary`.
- Produces: joined-guild coverage for `info`, `members`, `raid`, `facilities`, and `manage` tabs.

- [ ] **Step 1: Write the failing joined-guild test**

Create `3차길드모험가`, grant phase-three state, visit `/guild`, fill placeholder
`예: 새벽의 기사단` with `접근성길드`, click the enabled guild-create button, and wait for the
level-one heading `접근성길드`.

Audit these URLs after waiting for a visible `main` and network idle:

```ts
const JOINED_GUILD_SURFACES = [
  { tab: "info", heading: "길드 정보" },
  { tab: "members", heading: "길드원" },
  { tab: "raid", heading: "토벌전" },
  { tab: "facilities", heading: "시설" },
  { tab: "manage", heading: "관리" },
] as const;
```

Use `/guild?tab=${surface.tab}`, assert the named tab is selected with `aria-selected="true"`, then
aggregate axe results as `{ tab, violations }`.

- [ ] **Step 2: Run the test and capture its red state**

Run the authenticated Chromium suite with `--grep="가입 후 길드"`.

Expected: FAIL with exact accessibility violations if joined states are not already conformant.

- [ ] **Step 3: Fix reported guild violations minimally**

Use the same deterministic mappings as Task 2. Preserve guild permissions and callbacks; do not invoke
upgrade, raid, sanction, or membership mutation buttons.

- [ ] **Step 4: Rebuild and rerun until green**

Run a fresh production build and the joined-guild grep. Expected: all five tab states aggregate to `[]`.

- [ ] **Step 5: Commit the flow and fixes**

```bash
git add e2e/authenticated-accessibility.spec.ts src
git commit -m "test: cover joined guild accessibility"
```

### Task 4: Administrator Representative-Surface Audit

**Files:**
- Modify: `e2e/authenticated-accessibility.spec.ts`
- Modify only `src/admin/**` owners named by axe output.
- Test: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Consumes: Playwright's isolated `ADMIN_EMAILS` default and the existing password login helper.
- Produces: admin audits for `opsDashboard`, `users`, `broadcast`, `safetyReports`, `stats`, and `audit`.

- [ ] **Step 1: Write the failing admin aggregate audit**

After password login, iterate this table:

```ts
const ADMIN_SURFACES = [
  { tab: "opsDashboard", heading: "운영 홈" },
  { tab: "users", heading: "유저 관리" },
  { tab: "broadcast", heading: "공지·우편" },
  { tab: "safetyReports", heading: "신고 관리" },
  { tab: "stats", heading: "전체 통계" },
  { tab: "audit", heading: "관리자 기록" },
] as const;
```

Navigate to `/admin?tab=${tab}`, assert exactly one `관리자 도구` level-one heading, one `main`, and
the named level-two heading. Wait for network idle, aggregate axe output as `{ tab, violations }`, and
assert `[]`. Do not click editing or submission controls.

- [ ] **Step 2: Run and record the red state**

Run the authenticated Chromium suite with `--grep="관리자 대표"`.

Expected: FAIL with all current admin shell/tab violations, or pass as characterization if none exist.

- [ ] **Step 3: Remediate admin violations at shared owners**

Prefer `AdminShell` and shared admin form/card/table components when identical failures occur across
tabs. Replace insufficient `text-zinc-400`/semantic colors with AA shades in both themes, associate
labels with form fields, add table captions or region names only when the failure identifies that
structure, and preserve read-only behavior.

- [ ] **Step 4: Rebuild and rerun the admin audit**

Run a fresh production build and the admin grep. Expected: all six tab aggregates equal `[]`.

- [ ] **Step 5: Commit admin coverage and fixes**

```bash
git add e2e/authenticated-accessibility.spec.ts src/admin
git commit -m "test: cover administrator accessibility"
```

### Task 5: Phase-Three Manual Checklist and Full Verification

**Files:**
- Modify: `docs/accessibility/manual-checklist.md`

**Interfaces:**
- Consumes: all phase-three target states.
- Produces: manual keyboard, zoom, and screen-reader review coverage plus final verification evidence.

- [ ] **Step 1: Add the phase-three checklist section**

Add checks for populated inventory and sell forms, processing quantities and results, all five joined
guild tabs, admin navigation/search/forms/tables/read-only status, destructive-action confirmation,
200% zoom, 320px reflow, NVDA, and VoiceOver. Retain the non-certification statement.

- [ ] **Step 2: Run the full automated verification**

Run, in order:

```bash
npm test
npx eslint e2e/authenticated-accessibility.spec.ts e2e/support/authenticatedDatabase.ts playwright.config.ts <all modified source files>
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium
env DATABASE_URL=postgresql://browser_e2e@127.0.0.1:55438/adventure_e2e DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true E2E_TEST_LOGIN_ID=browser-e2e E2E_TEST_PASSWORD=browser-e2e-only-password npx playwright test e2e/authenticated-accessibility.spec.ts --project=authenticated-chromium
```

Expected: unit, lint, type, build, public desktop, and all authenticated Chromium checks pass.

- [ ] **Step 3: Attempt authenticated mobile WebKit**

Run the authenticated accessibility suite with `--project=authenticated-mobile-webkit`. If browser
launch fails because the host lacks GTK/GStreamer libraries, record the infrastructure error and do
not claim mobile success or install system packages without approval.

- [ ] **Step 4: Commit documentation and inspect final state**

```bash
git add docs/accessibility/manual-checklist.md
git commit -m "docs: add phase three accessibility review"
git status --short --branch
git log --oneline -10
```

Expected: a clean feature branch with no deployment, push, or PR changes.
