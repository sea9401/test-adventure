# Hunt Result Sheet Implementation Plan

> **For Codex:** Reuse the existing hunt result data and mutation flow; do not move or duplicate reward calculation.

**Goal:** Make every completed manual hunt immediately readable without page scrolling and reduce the pre-action dungeon header footprint.

**Architecture:** Add compact dungeon/player summaries and a portal-based accessible bottom sheet that renders the existing single and batch result views. `V2DungeonFloorView` retains ownership of hunt state and decides when to open the sheet: once per manual result, once after a batch, and only at stop/settlement for automatic hunting.

**Tech Stack:** React portals, TypeScript, existing modal accessibility hooks, Vitest, Testing Library, Tailwind utilities and UI surface constants.

---

### Task 1: Build an accessible result sheet shell

**Files:**
- Create: `src/adventure/v2/HuntResultSheet.tsx`
- Create: `src/adventure/v2/HuntResultSheet.test.tsx`

1. Write failing tests for dialog semantics, title focus, explicit close, backdrop close, Escape close, focus restoration, long internal scrolling, `75dvh`, safe-area padding, repeat, and combat-log callbacks.
2. Implement a portal dialog using the project's modal accessibility and Escape hooks.
3. Keep the sheet surface opaque with `SURFACE_CARD`, place it above the floating chat control, lock background scroll while open, and support reduced motion.

### Task 2: Normalize the compact dungeon context

**Files:**
- Create: `src/adventure/v2/DungeonContextSummary.tsx`
- Create: `src/adventure/v2/CompactBattlePlayerStatus.tsx`
- Create: `src/adventure/v2/DungeonContextSummary.test.tsx`

1. Test that the collapsed view shows dungeon/region, challenge state, player combat power, difficulty metric, stability, and compact HP/MP/experience.
2. Put attack, defense, healing, and other detailed player status inside an accessible disclosure that reuses the existing full status component.
3. Use opaque outer and inset surfaces so the region background never shows behind text.

### Task 3: Connect single, batch, and automatic hunt results

**Files:**
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Test: `src/adventure/v2/V2DungeonFloorView.test.tsx`

1. Add failing integration tests: one manual hunt opens once, a batch opens once after completion, automatic runs do not open between fights, and stop/settlement opens the latest result.
2. Move the existing `HuntResultCard` and `BatchSummaryCard` rendering into the sheet without altering their input values or reward code.
3. Keep the last confirmed result after close and render `최근 결과`; a new in-flight hunt must not erase it.
4. Wire `다시 사냥` through the existing hunt entry/check logic and `전투 기록 보기` through the existing replay/log state.
5. Close on route unmount and keep the newest completion if results arrive rapidly.

### Task 4: Verify and commit this slice

1. Run hunt hook, dungeon view, result card, batch, replay, and modal accessibility tests.
2. Verify reward persistence is invoked exactly as before and the sheet never performs a reward mutation.
3. Check mobile max-height/internal scrolling and desktop content-width behavior.
4. Stage only combat UX files and commit without deployment.
