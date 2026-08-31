# Equipment Lock Filter Design

## Goal

Make a small set of marked equipment easy to find in the inventory by reusing the existing favorite-style equipment lock.

## Design

- Add `잠금 우선 · 잠금부터` to the inventory equipment sort selector. Locked equipment sorts before unlocked equipment, with the existing default equipment order inside each group.
- Add a `잠금만 보기 (n)` toggle beside the sort selector. The count is scoped to the current equipment slot.
- Keep the filter active while moving between equipment slot tabs. Changing the filter or sort resets pagination to page 1.
- Keep the controls visible when the filter has no matches so the user can turn it off. Show a specific empty state explaining how to lock equipment from its detail card.
- Reuse the existing server-backed `locked` field and lock toggle. Do not add a separate favorite save model or change sale protection behavior.

## Compatibility and verification

- Existing sort modes and their ordering remain unchanged.
- The new locked-first sort is non-mutating and deterministic.
- Filtering affects only the visible inventory list; bulk sale counts and server operations continue to use the complete slot inventory.
- Add focused tests for locked-first ordering, locked-only filtering, count/empty-state UI, and pagination reset inputs. Run focused Vitest, TypeScript, lint, and the production build. Do not deploy.
