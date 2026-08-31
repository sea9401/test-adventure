# Adventure Dashboard and Life Navigation Implementation Plan

> **For Codex:** Implement each task in order, keeping existing game URLs and save data compatible.

**Goal:** Turn the existing adventure home into a configurable status dashboard and split life content from town navigation while sharing one server-confirmed activity snapshot.

**Architecture:** Add a normalized `adventure-home.v1` preference model and an authenticated dashboard API that resolves existing save data into a small activity view. Mount one client provider in the persistent game chrome so the home and six-tab navigation consume the same snapshot. Keep every current feature screen and URL unchanged.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma-backed `saves_kv`, Vitest, Testing Library, Tailwind utilities, existing surface constants.

---

### Task 1: Lock the preference and aggregation rules with tests

**Files:**
- Create: `src/adventure/v2/adventureDashboard.ts`
- Test: `src/adventure/v2/adventureDashboard.test.ts`

1. Write failing tests for unknown/duplicate widget removal, default-widget completion, hidden precedence, activity enablement, completion counts, ready-action counts, activity ordering, and tab/path notification derivation.
2. Run `npm test -- src/adventure/v2/adventureDashboard.test.ts` and confirm the tests fail because the model does not exist.
3. Implement immutable types, defaults, normalization, sorting, and summary helpers without React or database dependencies.
4. Re-run the focused test and keep the public helpers small enough for the API, provider, home, and navigation to share.

### Task 2: Serve one authenticated dashboard snapshot

**Files:**
- Create: `src/app/api/v2/adventure-dashboard/route.ts`
- Create: `src/app/api/v2/adventure-dashboard/preferences/route.ts`
- Create: `src/lib/server/adventureDashboard.ts`
- Test: `src/app/api/v2/adventure-dashboard/route.test.ts`

1. Write route-level tests for authentication, normalized preferences, disabled activities, partial resolver failure, and invalid preference input.
2. Read the needed `saves_kv` entries in one batch and adapt farm, fishing, gathering, expedition, tower, arena, attendance, repeat-quest, and available guild signals where their current domain parsers provide authoritative state.
3. Return `serverNow`, normalized preferences, the full unlocked activity catalog, enabled-only summaries, tab dots, and per-path life menu status. Resolver failure must produce `unavailable` for only that activity.
4. Validate PATCH payloads against the known widget and activity catalog before saving `adventure-home.v1`; never accept arbitrary URLs or another user's state.

### Task 3: Share the snapshot through persistent game chrome

**Files:**
- Create: `src/adventure/v2/AdventureDashboardProvider.tsx`
- Modify: `src/adventure/v2/GameClientBoundary.tsx`
- Test: `src/adventure/v2/AdventureDashboardProvider.test.tsx`

1. Test initial fetch, refresh, optimistic preference mutation, save-failure rollback, and a failed dashboard load that leaves children usable.
2. Implement a context with `snapshot`, `loading`, `error`, `refresh`, and `updatePreferences`.
3. Refresh after meaningful route changes and window focus, while coalescing simultaneous requests and preference writes.
4. Mount it inside the existing game state boundary so `MainTabNav` and `V2AdventureHome` share one request.

### Task 4: Split town and life navigation

**Files:**
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`
- Test: `src/adventure/v2/MainTabNav.test.ts`
- Test: `src/adventure/v2/MainTabNav.test.tsx`

1. Add failing tests for exact town/life item membership, retained URLs, life-path active-tab mapping, enabled actionable dots, disabled-item exclusion, and status text fallback.
2. Add `life` to `TabId`, the main tab list, route mapping, and background mapping as appropriate.
3. Keep facilities in `TOWN_MENU_ITEMS`; export `LIFE_MENU_ITEMS` for map, workshop, farm, fishing, logging, mining, and kitchen.
4. Render a small accessible amber dot only for server-confirmed `actionable` activities and show the highest-priority concise status inside the life dropdown.

### Task 5: Convert the existing home into configurable widgets

**Files:**
- Create: `src/adventure/v2/AdventureHomeWidgetGrid.tsx`
- Create: `src/adventure/v2/AdventureActivityChecklist.tsx`
- Create: `src/adventure/v2/AdventureActivitySettings.tsx`
- Create: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Test: `src/adventure/v2/AdventureHomeWidgetGrid.test.tsx`
- Test: `src/adventure/v2/AdventureActivityChecklist.test.tsx`

1. Test saved widget order, hidden widgets, keyboard/button reordering, restore/reset, activity grouping, enabled-only summaries, action links, and compact character expansion.
2. Reuse the existing character card, hot-time, guide quest, announcement, bulletin/feed, and ranking components inside opaque widget surfaces.
3. Default the character widget to the compact name/job/guild/HP/MP view; expansion exposes the unchanged full character card and persists the choice.
4. Allow drag handles in edit mode plus 44px up/down controls, hide/restore controls, and default reset. Prevent widget links from firing during a drag.
5. Keep the existing content visible when the activity request fails and show retry UI only in the checklist widget.

### Task 6: Verify and commit this slice

1. Run focused dashboard, provider, home, and navigation tests.
2. Run `npx tsc --noEmit`, relevant lint, and `npm run build` after all three UX slices are integrated.
3. Inspect mobile-width classes and both theme surface constants for transparent content leaks.
4. Stage only dashboard/navigation files and commit without deployment.
