# Coin Shop Icon Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all eleven Museun Coin Shop products dedicated SVG icons with the same restrained 2.5D depth as the premium adventure support pass.

**Architecture:** Keep the existing `CASH_ITEM_ART_PATHS` rendering path and add assets rather than introducing runtime effects. Existing SVG motifs remain recognizable; shared gradients, highlights, shaded faces, and short cast shadows create the common visual language.

**Tech Stack:** React 19, Next.js 16 `Image`, TypeScript, SVG, Vitest

## Global Constraints

- Limit changes to Museun Coin Shop icon assets, their path mapping, and the mapping regression test.
- Keep every icon at `viewBox="0 0 256 256"` with accessible `title` and `desc` elements.
- Preserve each product's existing motif and identifying color.
- Do not change product behavior, pricing, copy, order, or layout.
- Do not deploy.

---

### Task 1: Require dedicated art for every shop product

**Files:**
- Modify: `src/adventure/v2/MuseunCoinShopView.test.ts`
- Modify: `src/adventure/v2/MuseunCoinShopView.tsx`

**Interfaces:**
- Consumes: `SHOP_ITEM_GROUPS` and `CASH_ITEM_ART_PATHS`
- Produces: A complete `Partial<Record<MuseunCashItemId, string>>` mapping for every listed shop item

- [ ] **Step 1: Write the failing test**

Replace the exclusion-based assertion with a loop over all `shopItemIds`:

```ts
for (const itemId of shopItemIds) {
  expect(CASH_ITEM_ART_PATHS[itemId]).toBe(
    `/images/items/cash/${itemId}.svg`,
  );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/MuseunCoinShopView.test.ts`

Expected: FAIL for `profile_badge_display_stand`, `monthly_stamina_potion_bundle`, and `growth_leap_package` because their paths are absent.

- [ ] **Step 3: Add the three missing mappings**

Add literal paths for the three IDs to `CASH_ITEM_ART_PATHS`, following the existing filename convention.

- [ ] **Step 4: Add the three SVG files described in Task 2 and rerun the test**

Run: `npm test -- src/adventure/v2/MuseunCoinShopView.test.ts`

Expected: PASS.

### Task 2: Apply the shared 2.5D SVG language

**Files:**
- Modify: `public/images/items/cash/adventure_support_30d.svg`
- Modify: `public/images/items/cash/rename_permit.svg`
- Modify: `public/images/items/cash/profile_image_permit.svg`
- Modify: `public/images/items/cash/chroma_name_box.svg`
- Modify: `public/images/items/cash/profile_border_box.svg`
- Modify: `public/images/items/cash/chat_badge_box.svg`
- Modify: `public/images/items/cash/cosmetic_extension_30d.svg`
- Create: `public/images/items/cash/profile_badge_display_stand.svg`
- Create: `public/images/items/cash/monthly_stamina_potion_bundle.svg`
- Create: `public/images/items/cash/growth_leap_package.svg`

**Interfaces:**
- Consumes: The literal public paths in `CASH_ITEM_ART_PATHS`
- Produces: Ten standalone, accessible `256×256` SVG assets

- [ ] **Step 1: Upgrade the seven existing SVGs**

For each asset, retain its current central motif and palette. Add a unique background `linearGradient`, a translucent top-left highlight, a darker bottom/right face or short shadow, and a brighter edge highlight. Use asset-prefixed gradient IDs to avoid collisions when SVGs are embedded.

- [ ] **Step 2: Create the three missing SVGs**

Use these literal motifs:

- `profile_badge_display_stand.svg`: amber display plinth holding three jewel-like badges.
- `monthly_stamina_potion_bundle.svg`: blue supply crate containing three glowing red stamina potions and a small calendar seal.
- `growth_leap_package.svg`: violet gift chest with an upward golden arrow and celebratory sparkles.

Each asset must use the same upper-left light and lower-right shade as the reference icon.

- [ ] **Step 3: Render a contact sheet**

Render all eleven SVGs to equal-size tiles in shop order and inspect them together. Confirm that no motif clips the rounded tile, outlines remain readable at card size, and the premium icon is still the richest without looking like a different art family.

- [ ] **Step 4: Run asset and code checks**

Run:

```bash
npm run check-images
npm test -- src/adventure/v2/MuseunCoinShopView.test.ts
npx eslint src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.ts
npx tsc --noEmit
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add public/images/items/cash src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.ts docs/superpowers/specs/2026-09-01-coin-shop-icon-depth-design.md docs/superpowers/plans/2026-09-01-coin-shop-icon-depth.md
git commit -m "style: unify coin shop icon depth"
```
