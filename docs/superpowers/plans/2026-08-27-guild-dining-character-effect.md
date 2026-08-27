# Guild Dining Character Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this repository.

**Goal:** Show the active guild dining effect and its remaining time in the compact character summary.

**Architecture:** The state route normalizes the existing weekly dining save and emits a small display DTO. The adventure home passes that DTO to the compact summary, whose existing effect popover is extended with a guild-dining variant and client-side expiry handling.

**Tech Stack:** Next.js route handlers, Drizzle `savesKv`, React 19, Vitest, Testing Library, existing opaque surface tokens.

## Global Constraints

- Reuse `parseGuildDiningUserState`; do not duplicate guild dining expiry rules.
- Do not change dining reward calculations or effect duration.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not introduce translucent content surfaces.
- Expired effects must be omitted and must disappear while the summary is open.
- Do not deploy.

---

### Task 1: Character-state dining summary

**Files:**
- Modify: `src/app/api/v2/me/state/route.ts`
- Modify: `src/app/api/v2/me/state/stateView.ts`
- Modify: `src/app/api/v2/me/state/stateView.test.ts`

**Interfaces:**
- Produces: `GuildDiningEffectSummary` with `menuId`, `name`, `kind`, `bonusPct`, optional `lifeBonusPct`, and `expiresAt`.
- Produces: `guildDiningEffectSummary(raw, { weekKey, guildId, now }): GuildDiningEffectSummary | null`.
- Produces: optional `activeGuildDiningEffect` in the full state response; core view may omit it.

- [ ] **Step 1: Write failing pure state-view tests**

Create an active weekly save and an expired save, then assert:

```ts
expect(guildDiningEffectSummary(activeRaw, {
  weekKey: "2026-08-24",
  guildId: 3,
  now: new Date("2026-08-27T03:00:00Z"),
})).toMatchObject({
  menuId: "guild_grand_feast",
  name: "길드 대연회",
  kind: "all_xp",
  bonusPct: expect.any(Number),
  lifeBonusPct: expect.any(Number),
});
expect(guildDiningEffectSummary(expiredRaw, args)).toBeNull();
```

- [ ] **Step 2: Run the state-view test and confirm failure**

Run: `npm test -- src/app/api/v2/me/state/stateView.test.ts`

Expected: FAIL because the summary helper does not exist.

- [ ] **Step 3: Implement the pure summary helper**

Normalize through `parseGuildDiningUserState`, resolve the menu through `guildDiningMenu`, and return `null` unless both menu and `activeEffect` exist:

```ts
export type GuildDiningEffectSummary = Omit<GuildDiningActiveEffect, "roundingRemainder"> & {
  name: string;
};
```

- [ ] **Step 4: Wire the save into the full state response**

Add `GUILD_DINING_USER_SAVE_KEY` to `STATE_SAVE_KEYS`, calculate `weekKey` with `kstWeekMondayKey(new Date(now))`, use `guildId ?? 0` so association-origin effects remain representable, and return `activeGuildDiningEffect`. Do not add the key to `CORE_STATE_SAVE_KEYS`.

- [ ] **Step 5: Run state tests**

Run: `npm test -- src/app/api/v2/me/state/stateView.test.ts src/app/api/v2/me/state/stateSections.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the state response unit**

```bash
git add src/app/api/v2/me/state/route.ts src/app/api/v2/me/state/stateView.ts src/app/api/v2/me/state/stateView.test.ts
git commit -m "feat: expose active guild dining effect"
```

### Task 2: Compact summary badge and detail card

**Files:**
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/CompactCharacterEffectCard.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.test.tsx`
- Modify: `src/adventure/v2/CompactCharacterEffectCard.test.tsx`

**Interfaces:**
- Consumes: `GuildDiningEffectSummary` from Task 1.
- Extends: `CompactCharacterEffectDetail` with `{ kind: "guildDining"; effect: GuildDiningEffectSummary }`.
- Produces: `onExpire?: () => void` on the effect card for timed effects.

- [ ] **Step 1: Write failing summary and detail tests**

Render an effect expiring in one hour and assert the badge opens a dialog containing:

```ts
expect(screen.getByText("길드 대연회")).toBeTruthy();
expect(dialog.textContent).toContain("사냥 경험치 +");
expect(dialog.textContent).toContain("생활 경험치 +");
expect(dialog.textContent).toContain("남음");
expect(dialog.textContent).toContain("까지");
```

With fake timers, advance beyond `expiresAt` and assert the badge and open dialog disappear.

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npm test -- src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx`

Expected: FAIL because the guild dining prop and detail variant do not exist.

- [ ] **Step 3: Add the display type and pass it from adventure home**

Extend `StateResponse`, `CompactCharacterSummary` props, and the character widget call with `activeGuildDiningEffect={state.activeGuildDiningEffect ?? null}`.

- [ ] **Step 4: Render the badge and detail variant**

Use a distinct dining icon and accessible labels such as `"길드 대연회 길드 음식 효과 보기"`. Format effect text from `kind`:

```ts
kind === "hunt_exp" ? `사냥 경험치 +${bonusPct}%`
  : kind === "life_xp" ? `생활 경험치 +${bonusPct}%`
  : `사냥 경험치 +${bonusPct}% · 생활 경험치 +${lifeBonusPct ?? 0}%`;
```

Reuse the existing food remaining-time and absolute-expiry formatting. Keep all wrappers opaque via the existing surface constants.

- [ ] **Step 5: Hide expired client state**

Track a lightweight clock in `CompactCharacterSummary`, derive `visibleGuildDiningEffect = expiresAt > now ? effect : null`, and clear `selectedDetail` if the selected effect expires. Use a 30-second interval and clean it up on unmount.

- [ ] **Step 6: Run focused UI tests**

Run: `npm test -- src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the UI unit**

```bash
git add src/adventure/v2/V2AdventureHome.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/CompactCharacterEffectCard.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterEffectCard.test.tsx
git commit -m "feat: show guild dining time in character summary"
```
