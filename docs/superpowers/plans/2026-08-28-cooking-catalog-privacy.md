# Cooking Catalog Privacy Implementation Plan

**Goal:** Keep undiscovered cooking metadata out of API responses and browser JavaScript while preserving full personal recipes and minimal global discovery cards.

**Architecture:** Make the complete catalog server-only, shape explicit safe response DTOs at route boundaries, and give client screens only the records they can legitimately display. Split catalog-independent food helpers from server-side catalog lookups and add an artifact-level privacy check after production builds.

**Tech Stack:** Next.js 16 Route Handlers, React 19 Client Components, TypeScript, Vitest, Testing Library.

## Global constraints

- Undiscovered recipes expose only their anonymous count.
- Personally known recipes retain complete details, including ingredients.
- Global discoveries expose only recipe name/image, discoverer, and sort timestamp.
- Existing cooking, marketplace, inventory, inbox, feed, and ticker behavior remains usable without a client catalog.
- Preserve unrelated changes, commit task-owned files only, and do not deploy.

### Task 1: Lock the cooking API contract

**Files:**
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/adventure/v2/cooking/clientTypes.ts`
- Modify: `src/adventure/v2/cooking/publicDiscoveries.ts`

- [ ] Add failing tests proving an unknown sentinel recipe is absent from serialized API output.
- [ ] Add tests for full personally known recipes and field-limited public discovery records.
- [ ] Replace `recipes` and raw `firstDiscoveries` with `recipeTotal` and server-joined `publicDiscoveries`.
- [ ] Run the cooking route tests to green.

### Task 2: Convert cooking screens to safe DTOs

**Files:**
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.tsx`
- Modify: `src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx`
- Modify: `src/adventure/v2/cooking/CookingSpecialtyPanel.tsx`
- Modify affected component tests.

- [ ] Write failing component tests using `recipeTotal`, known recipes, and safe public discoveries.
- [ ] Build anonymous cards from count rather than the full catalog.
- [ ] Remove client-side joins and derive specialty counts from known recipes.
- [ ] Run the focused cooking UI tests to green.

### Task 3: Remove secondary client catalog imports

**Files:**
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Modify: `src/adventure/v2/CookingCodexPanel.tsx`
- Modify: `src/adventure/log/ServerFeedView.tsx`
- Modify: `src/adventure/v2/WarTicker.tsx`
- Modify cooking discovery feed producers/serializers and related tests.

- [ ] Test that the state API returns only personally known recipe summaries and total count.
- [ ] Hydrate public discovery event payloads server-side with the already-public recipe name.
- [ ] Make legacy codex, feed, and ticker render server-provided safe data.
- [ ] Verify no direct catalog import remains in these client entry paths.

### Task 4: Separate food display data from catalog lookups

**Files:**
- Split/modify: `src/adventure/v2/cooking/food.ts` and client-safe food types/helpers.
- Modify inventory, marketplace, inbox, delivery, character, and rare-map consumers and their API DTOs.
- Modify affected tests.

- [ ] Add contract tests for owned/listed food display DTOs.
- [ ] Keep catalog validation and definition lookup on the server.
- [ ] Make clients consume only definitions for foods actually present on their screen.
- [ ] Run focused food, inventory, marketplace, inbox, and delivery tests.

### Task 5: Enforce the server-only boundary

**Files:**
- Modify: `src/adventure/v2/cooking/catalog.ts`
- Move safe milestones/rank helpers out of catalog-dependent modules as needed.
- Modify any remaining client import path, including legacy surplus helpers.

- [ ] Add `server-only` to the complete catalog.
- [ ] Use import tracing and the Next.js build to find and remove all client transitive dependencies.
- [ ] Confirm server-only catalog consumers still compile and pass tests.

### Task 6: Add artifact-level privacy regression protection

**Files:**
- Create: `scripts/check-client-cooking-secrets.mjs`
- Create: corresponding script test.
- Modify: `package.json`

- [ ] Test the scanner with leaking and safe temporary chunk fixtures.
- [ ] Scan `.next/static/chunks` for sentinel undiscovered IDs and names after build.
- [ ] Integrate the scan into the build lifecycle without weakening existing postbuild work.

### Task 7: Verify, review, commit, and integrate

- [ ] Run all affected Vitest suites.
- [ ] Run ESLint on changed files and `npx tsc --noEmit`.
- [ ] Run a production build and the client-secret artifact scan.
- [ ] Self-review the diff against the approved information boundary.
- [ ] Commit task-owned changes, merge current root changes if needed, reverify, and integrate into the current branch without deploying.
