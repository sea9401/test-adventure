# Hunting Ground Backgrounds Implementation Plan

> **For agentic workers:** Implement inline in this workspace; repository instructions prohibit subagents unless the user explicitly requests them.

**Goal:** Give every six-depth hunting-ground theme a distinct background and replace Star Grave with an illustration matching the game's watercolor style.

**Architecture:** Keep scene selection in the existing pure pathname helper. Add an ordered fourteen-entry asset table and derive its index from validated depths 1–84. Reuse thirteen existing UI assets, replace only `star_grave.webp`, and preserve `hunt.webp` as the safe fallback.

**Tech Stack:** TypeScript, Vitest, Next.js 16.2 public assets, Sharp/WebP pipeline, built-in image generation.

## Constraints

- Preserve existing battle behavior, scene crossfade, overlay opacity, and UI surfaces.
- Keep non-numeric, list, and out-of-range dungeon paths on `hunt.webp`.
- Do not modify or remove unrelated worktree files.
- Do not deploy or change maintenance mode.

### Task 1: Lock the pathname mapping with tests

**Files:**
- Modify: `src/adventure/v2/GameSceneBackground.test.tsx`

- [ ] Replace the Star-Grave-only expectation with all fourteen theme start/end boundaries.
- [ ] Add list, malformed, zero, and depth-85 fallback assertions.
- [ ] Run the focused test and confirm it fails because the old helper only special-cases Star Grave.

### Task 2: Implement theme-specific scene selection

**Files:**
- Modify: `src/adventure/v2/gameSceneBackgroundForPath.ts`

- [ ] Add the ordered background asset table.
- [ ] Validate the parsed depth before indexing the table.
- [ ] Select the theme by six-depth band and preserve the generic fallback.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Replace the Star Grave illustration

**Files:**
- Modify: `public/images/ui/star_grave.webp`
- Modify: `docs/asset-rights.json`

- [ ] Generate a wide watercolor/pencil celestial ruin using current game backgrounds as style references.
- [ ] Inspect the generated result and copy it to `public/images/ui/star_grave.png`.
- [ ] Run the existing image optimizer to overwrite the WebP and remove the PNG source.
- [ ] Refresh and verify the asset-rights ledger.

### Task 4: Verify and commit

**Files:**
- Verify all files changed above plus this spec and plan.

- [ ] Run `git diff --check` and inspect the scoped diff.
- [ ] Run the focused scene-background test.
- [ ] Run `npm run check-images`, `npm run check-asset-rights`, ESLint, TypeScript, and `npm run build`.
- [ ] Stage only scoped files and create local commits; leave `NUL` and `_workspace/` untouched.
- [ ] Report that no deployment was performed.
