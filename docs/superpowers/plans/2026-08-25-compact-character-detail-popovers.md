# Compact Character Detail Popovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make support, food, and equipped-item entries in the collapsed adventure-home character summary open readable detail cards that remain inside mobile viewport bounds.

**Architecture:** Keep selection state in `CompactCharacterSummary`, reuse the existing read-only `V2ItemCard` for equipment, and add one focused effect-detail popover for support and food. Both popover types use the established item-card anchor and positioning rules, so desktop anchoring and mobile width/height clamping remain consistent without API changes.

**Tech Stack:** Next.js App Router client components, React state/effects, TypeScript, Tailwind CSS, Testing Library, Vitest.

## Global Constraints

- Do not expose remaining time inline in the collapsed summary; details appear only after clicking the existing element.
- Support details include benefits, remaining time, and expiry.
- Food details include quality, effects, remaining time, and expiry.
- Equipped items use the existing read-only `V2ItemCard`; empty slots remain non-interactive.
- Only one detail card is open at a time and it closes on outside click, close button, Escape, scroll, or resize.
- Popovers must stay inside mobile viewport side margins and scroll internally when their content exceeds available height.
- No API, database, item behavior, support behavior, or food-effect calculation changes.

---

### Task 1: Support and food effect detail popover

**Files:**
- Create: `src/adventure/v2/CompactCharacterEffectCard.tsx`
- Create: `src/adventure/v2/CompactCharacterEffectCard.test.tsx`

**Interfaces:**
- Consumes: `ItemCardAnchor`, `itemCardPosition`, `ActiveCookingBuff`, support expiry helpers, cooking effect formatters, and existing UI surfaces.
- Produces: `CompactCharacterEffectCard({ detail, anchor, onClose })`, where `detail` is `{ kind: "support"; activeUntil: number; regenBonusPct: number } | { kind: "food"; buff: ActiveCookingBuff }`.

- [ ] **Step 1: Write failing rendering and mobile-boundary tests**

```tsx
render(
  <CompactCharacterEffectCard
    detail={{ kind: "food", buff: foodBuff }}
    anchor={{ top: 500, bottom: 530, left: 310 }}
    onClose={onClose}
  />,
);
expect(screen.getByRole("dialog", { name: "계란 프라이 음식 효과" })).toHaveTextContent("공격력");
expect(Number.parseFloat(screen.getByRole("dialog").style.width)).toBeLessThanOrEqual(304);
```

Add a support case asserting the benefit list, remaining label, expiry label, close button, and Escape close behavior. Set a 320px test viewport and assert the calculated `left + width` remains at most 312px.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/adventure/v2/CompactCharacterEffectCard.test.tsx`

Expected: FAIL because `CompactCharacterEffectCard` does not exist.

- [ ] **Step 3: Implement the anchored effect card**

```tsx
export type CompactCharacterEffectDetail =
  | { kind: "support"; activeUntil: number; regenBonusPct: number }
  | { kind: "food"; buff: ActiveCookingBuff };

export function CompactCharacterEffectCard({
  detail,
  anchor,
  onClose,
}: {
  detail: CompactCharacterEffectDetail;
  anchor: ItemCardAnchor;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const { width, left, pos } = itemCardPosition(anchor, visibleViewport());
  useEscapeKey(onClose);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={detail.kind === "support" ? "모험 지원권 정보" : `${detail.buff.recipeName} 음식 효과`}
        style={{ position: "fixed", width, left, ...pos }}
        className="z-50 overflow-y-auto rounded-lg border bg-white p-4 shadow-xl dark:bg-zinc-900"
      >
        {detail.kind === "support" ? (
          <>
            <h2>월간 모험 지원권</h2>
            <p>{formatAdventureSupportRemaining(detail.activeUntil, now)}</p>
          </>
        ) : (
          <>
            <h2>{detail.buff.recipeName}</h2>
            <p>{cookingQualityName(detail.buff.quality)}</p>
            <p>{cookingEffectText(detail.buff.effect)}</p>
          </>
        )}
      </section>
    </>
  );
}
```

Use `ADVENTURE_SUPPORT_PASS`, `MAX_STAMINA`, `formatAdventureSupportRemaining`, `cookingQualityName`, and `cookingEffectText` for the card content. Use an opaque surface, `overflow-y-auto`, and the `maxHeight` supplied by `itemCardPosition`.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/adventure/v2/CompactCharacterEffectCard.test.tsx`

Expected: all effect-card tests pass.

- [ ] **Step 5: Commit the effect-card unit**

```bash
git add src/adventure/v2/CompactCharacterEffectCard.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx
git commit -m "feat: add compact character effect cards"
```

### Task 2: Wire collapsed summary clicks to detail cards

**Files:**
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.test.tsx`

**Interfaces:**
- Consumes: `CompactCharacterEffectCard`, `V2ItemCard`, `anchorOf`, `V2EquipInstance`, and the summary's existing support, food, equipped, and owned props.
- Produces: Clickable support/food chips and occupied equipment slots, with a single discriminated-union selection state controlling the open detail card.

- [ ] **Step 1: Add failing interaction tests**

```tsx
fireEvent.click(screen.getByRole("button", { name: "모험 지원권 상세 보기" }));
expect(screen.getByRole("dialog", { name: "모험 지원권 정보" })).toHaveTextContent("남음");

fireEvent.click(screen.getByRole("button", { name: "계란 프라이 음식 효과 보기" }));
expect(screen.queryByRole("dialog", { name: "모험 지원권 정보" })).toBeNull();
expect(screen.getByRole("dialog", { name: "계란 프라이 음식 효과" })).toBeTruthy();

fireEvent.click(screen.getByRole("button", { name: "철검 아이템 옵션 보기" }));
expect(screen.getByRole("dialog", { name: "철검 정보" })).toBeTruthy();
expect(screen.queryByRole("button", { name: /비어 있음.*옵션/ })).toBeNull();
```

Also assert the item card includes individual roll/enhance information from the supplied `V2EquipInstance`, and that clicking the summary expand button closes any open detail selection.

- [ ] **Step 2: Run the summary test and confirm RED**

Run: `npx vitest run src/adventure/v2/CompactCharacterSummary.test.tsx`

Expected: FAIL because the chips and slots are not buttons and no detail card is rendered.

- [ ] **Step 3: Add one selection state and clickable controls**

```tsx
type CompactDetailSelection =
  | { kind: "support"; anchor: ItemCardAnchor }
  | { kind: "food"; anchor: ItemCardAnchor }
  | { kind: "equipment"; instance: V2EquipInstance; item: V2Equipment; anchor: ItemCardAnchor };

const [selectedDetail, setSelectedDetail] = useState<CompactDetailSelection | null>(null);
```

Render active support and food chips as `Inset as="button"` with descriptive accessible names and `anchorOf(event.currentTarget)`. Render occupied equipment slots as buttons and empty/unknown slots as non-interactive `Inset` elements. Clear selection before expanding the full card.

- [ ] **Step 4: Render the matching read-only card**

```tsx
{selectedDetail?.kind === "equipment" ? (
  <V2ItemCard
    item={selectedDetail.item}
    roll={selectedDetail.instance.roll}
    enhance={selectedDetail.instance.enhance}
    craftQuality={selectedDetail.instance.craftQuality}
    craftedBy={selectedDetail.instance.craftedBy}
    anchor={selectedDetail.anchor}
    equippedIds={equippedItemIds}
    onClose={() => setSelectedDetail(null)}
  />
) : selectedDetail?.kind === "support" && supportActiveUntil != null ? (
  <CompactCharacterEffectCard
    detail={{
      kind: "support",
      activeUntil: supportActiveUntil,
      regenBonusPct: adventureSupport?.regenBonusPct ?? 0,
    }}
    anchor={selectedDetail.anchor}
    onClose={() => setSelectedDetail(null)}
  />
) : selectedDetail?.kind === "food" && activeFoodBuff ? (
  <CompactCharacterEffectCard
    detail={{ kind: "food", buff: activeFoodBuff }}
    anchor={selectedDetail.anchor}
    onClose={() => setSelectedDetail(null)}
  />
) : null}
```

Do not pass equip, compare, or lock actions to `V2ItemCard`; the card remains read-only.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Run static and production verification**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterEffectCard.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx`

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: every command exits 0.

- [ ] **Step 7: Commit the integration**

```bash
git add src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterSummary.test.tsx
git commit -m "feat: open details from compact character summary"
```
