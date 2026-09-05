# Chat item-link enchantment options implementation plan

**Goal:** Preserve a linked equipment item's magic-enchantment snapshot and show it in the chat item detail card.

## Tasks

- [x] Add regression coverage for snapshot creation, untrusted-payload parsing, and item-card rendering.
- [x] Extend `ChatEquipmentLink` with the validated enchantment state and pass it to `V2ItemCard`.
- [x] Run focused tests, type checking, linting, the full test suite, and a production build.
- [x] Review the diff and commit the completed fix without deploying it.
