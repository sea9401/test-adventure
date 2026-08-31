# Content Notification Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the exact actionable sub-content behind each main-tab notification dot and let players disable those dots in preferences.

**Architecture:** Extend the existing server-backed adventure home preferences with one display-only boolean. Derive tab/path notification dots from activities plus that preference, while `MainTabNav` independently formats the matching activity details for each dropdown route.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- Do not deploy.
- Preserve unrelated worktree changes.
- Use opaque `SURFACE_*` classes for content surfaces.
- Notification visibility must not disable or remove activities from the adventure dashboard.
- Existing saved preferences default to notifications enabled.

---

### Task 1: Notification preference and derivation

**Files:**
- Modify: `src/adventure/v2/adventureDashboard.ts`
- Test: `src/adventure/v2/adventureDashboard.test.ts`
- Modify: `src/adventure/v2/AdventureDashboardProvider.tsx`
- Test: `src/adventure/v2/AdventureDashboardProvider.test.tsx`
- Modify: `src/app/api/v2/adventure-dashboard/route.ts`
- Test: `src/app/api/v2/adventure-dashboard/route.test.ts`

**Interfaces:**
- Produces: `AdventureHomePreferences.activityNotificationsEnabled: boolean`
- Produces: `activityTabDots(activities, enabled?: boolean): { tabs; paths }`

- [ ] **Step 1: Write failing normalization and dot-suppression tests**

Add assertions that missing saved values normalize to `true`, explicit `false` survives normalization, and `activityTabDots(actionableActivities, false)` returns `{ tabs: {}, paths: {} }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/adventure/v2/adventureDashboard.test.ts`

Expected: FAIL because `activityNotificationsEnabled` and the second derivation argument do not exist.

- [ ] **Step 3: Implement the preference and thread it through derivation**

Add the boolean to the preference type/default/normalizer, pass it from the API GET route and provider `withPreferences`, and leave activity summary/application unchanged.

- [ ] **Step 4: Run focused data/provider/API tests**

Run: `npm test -- src/adventure/v2/adventureDashboard.test.ts src/adventure/v2/AdventureDashboardProvider.test.tsx src/app/api/v2/adventure-dashboard/route.test.ts`

Expected: PASS.

### Task 2: Exact dropdown notification origins

**Files:**
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Test: `src/adventure/v2/MainTabNav.test.tsx`

**Interfaces:**
- Produces: `menuActivityStateForHref(activities, href, menuLabel): { text; actionable } | null`
- Consumes: `snapshot.notifications.paths[href]` as the authority for dot visibility.

- [ ] **Step 1: Write failing navigation test**

Add an actionable battle activity fixture, open the battle tab, and assert the `숙련의 탑` menu item announces a processable item and renders `오늘 기록 보상 수령 가능`.

- [ ] **Step 2: Run the navigation test to verify it fails**

Run: `npm test -- src/adventure/v2/MainTabNav.test.tsx`

Expected: FAIL because only life menu rows currently receive activity status.

- [ ] **Step 3: Generalize route activity formatting**

Format all actionable activities for a route, including the activity title only when it differs from the menu label. Map automatic logging and mining activity paths to the `생활 지도` entry. Fall back to the existing ranked progress state for rows without an actionable notification. Render an orange dot only when the derived notification path exists.

- [ ] **Step 4: Run the navigation test**

Run: `npm test -- src/adventure/v2/MainTabNav.test.tsx`

Expected: PASS.

### Task 3: Environment setting control

**Files:**
- Modify: `src/adventure/v2/V2PreferencesView.tsx`
- Test: `src/adventure/v2/V2PreferencesView.test.tsx`

**Interfaces:**
- Consumes: `useAdventureDashboard().snapshot.preferences.activityNotificationsEnabled`
- Consumes: `useAdventureDashboard().updatePreferences({ activityNotificationsEnabled })`

- [ ] **Step 1: Write failing settings screen test**

Mock the dashboard provider with notifications enabled and assert the page contains `콘텐츠 알림 표시` and a pressed toggle.

- [ ] **Step 2: Run the settings test to verify it fails**

Run: `npm test -- src/adventure/v2/V2PreferencesView.test.tsx`

Expected: FAIL because the control is absent.

- [ ] **Step 3: Add the toggle and failure feedback**

Render an opaque inset row in the notification card. On click, save the inverted boolean using the provider and display a compact error status when the request fails.

- [ ] **Step 4: Run the settings test**

Run: `npm test -- src/adventure/v2/V2PreferencesView.test.tsx`

Expected: PASS.

### Task 4: Verification and commit

**Files:**
- Verify all files above plus the design and plan documents.

- [ ] **Step 1: Run focused tests together**

Run: `npm test -- src/adventure/v2/adventureDashboard.test.ts src/adventure/v2/AdventureDashboardProvider.test.tsx src/app/api/v2/adventure-dashboard/route.test.ts src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2PreferencesView.test.tsx`

- [ ] **Step 2: Run lint on changed source and test files**

Run: `npx eslint <changed TypeScript files>`

- [ ] **Step 3: Inspect the diff and verify no unrelated dirty files are staged**

Run: `git diff --check` and `git status --short`.

- [ ] **Step 4: Commit only this feature's files**

Run: `git add <feature files> && git commit -m "feat: clarify content notification sources"`.
