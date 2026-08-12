# Inventory Tier Sort Implementation Plan

**Goal:** Add a high-to-low displayed-tier sort to the existing equipment inventory sort cycle without changing the default ordering.

**Architecture:** Extend the shared equipment-list sort mode so inventory and marketplace seller views keep one source of truth. Compare displayed tiers first, then reuse the existing default comparator for deterministic ties.

**Tech Stack:** TypeScript, React, Vitest

### Task 1: Protect tier sorting behavior

- [x] Add focused tests for displayed-tier descending order, deterministic same-tier order, and non-mutating input.
- [x] Run the focused test and confirm it fails for the missing mode.

### Task 2: Implement the sort option

- [x] Add `tier` to the shared sort mode and cycle.
- [x] Implement displayed-tier comparison with the default comparator as a tie-breaker.
- [x] Update sort-button guidance text on both shared consumer screens.
- [x] Re-run focused tests and type checking.

### Task 3: Verify and commit

- [x] Run the relevant test suite, lint, and TypeScript checks.
- [x] Review the final diff and whitespace checks.
- [x] Commit the verified local change without deploying.
