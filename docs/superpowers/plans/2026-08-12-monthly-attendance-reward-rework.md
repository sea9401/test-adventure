# Monthly Attendance Reward Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every monthly attendance enhancement-stone reward with approved exploration rewards, grant seven support-pass days on day 14, and grant 500 mastery certificates on day 28.

**Architecture:** Keep `MONTHLY_ATTENDANCE_REWARDS` as the single authoritative 28-day table. Add two explicit reward kinds for torn map fragments and coop coins so the client catalog stays lightweight, then extend the existing transactional route and economy logging switches. Preserve `monthly-attendance.v1` and cumulative claim semantics.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router route handlers, Vitest

## Global Constraints

- Do not grant enhancement stones, SP fruit, gold, or reforge stones from attendance.
- Keep the board at 28 cumulative claim days and do not retroactively replace claimed rewards.
- Monthly totals must be support pass 22 days, stamina potions 29, mastery certificates 800, summon scrolls 7, torn map fragments 10, and coop coins 120.
- Preserve the cosmetic boxes on days 7, 14, and 28.
- Do not deploy.

---

### Task 1: Reward catalog and labels

**Files:**
- Modify: `src/adventure/data/v2/monthlyAttendance.test.ts`
- Modify: `src/adventure/data/v2/monthlyAttendance.ts`

**Interfaces:**
- Produces: reward variants `{ kind: "torn_map_fragment"; count: number }` and `{ kind: "coop_coin"; count: number }`.
- Produces: the approved 28-entry table and Korean labels.

- [ ] **Step 1: Write failing catalog tests**

Assert the exact milestone entries and independently summed monthly totals:

```ts
expect(MONTHLY_ATTENDANCE_REWARDS[13]).toEqual({
  kind: "adventure_support",
  days: 7,
  cosmeticBox: "chat_badge_box",
});
expect(MONTHLY_ATTENDANCE_REWARDS[27]).toEqual({
  kind: "mastery_certificate",
  count: 500,
  cosmeticBox: "profile_border_box",
});
expect(kindTotals).toEqual({
  adventureSupportDays: 22,
  staminaPotions: 29,
  masteryCertificates: 800,
  bossSummonScrolls: 7,
  tornMapFragments: 10,
  coopCoins: 120,
});
```

- [ ] **Step 2: Run the catalog test and confirm the expected failure**

Run: `npm test -- src/adventure/data/v2/monthlyAttendance.test.ts`

Expected: failures show the old day-14 summon scroll, old day-28 stone bundle, and missing new totals.

- [ ] **Step 3: Implement the approved table and labels**

Replace all stone entries with the exact approved schedule. Add label cases:

```ts
case "torn_map_fragment":
  return `찢어진 지도 조각 ${reward.count}개`;
case "coop_coin":
  return `협동 주화 ${reward.count}개`;
```

- [ ] **Step 4: Run the catalog test and confirm it passes**

Run: `npm test -- src/adventure/data/v2/monthlyAttendance.test.ts`

Expected: all monthly attendance data tests pass.

---

### Task 2: Transactional grants and economy logs

**Files:**
- Modify: `src/app/api/v2/me/attendance/route.test.ts`
- Modify: `src/app/api/v2/me/attendance/route.ts`

**Interfaces:**
- Consumes: the new reward kinds from Task 1.
- Consumes: `TORN_MAP_FRAGMENT_MATERIAL_ID` and `COOP_COIN_MATERIAL_ID`.
- Produces: atomic material grants and `reward.monthly_attendance` events.

- [ ] **Step 1: Write failing route tests**

Cover map fragments, coop coins, day 14, and day 28:

```ts
expect(day2.reward).toEqual({ kind: "torn_map_fragment", count: 2 });
expect(day2.grantedMaterials).toEqual({ v2_torn_map_fragment: 2 });
expect(day6.reward).toEqual({ kind: "coop_coin", count: 20 });
expect(day14.reward).toEqual({
  kind: "adventure_support",
  days: 7,
  cosmeticBox: "chat_badge_box",
});
expect(day28.reward).toEqual({
  kind: "mastery_certificate",
  count: 500,
  cosmeticBox: "profile_border_box",
});
```

Also assert material economy events use the canonical IDs and quantities.

- [ ] **Step 2: Run the route test and confirm the expected failures**

Run: `npm test -- src/app/api/v2/me/attendance/route.test.ts`

Expected: failures show old stone grants and unsupported new kinds.

- [ ] **Step 3: Implement grants and logging**

Import the two material IDs and map the material reward branch:

```ts
if (reward.kind === "boss_summon_scroll") {
  grantMaterial(SUMMON_SCROLL_MATERIAL_ID, reward.count);
} else if (reward.kind === "torn_map_fragment") {
  grantMaterial(TORN_MAP_FRAGMENT_MATERIAL_ID, reward.count);
} else {
  grantMaterial(COOP_COIN_MATERIAL_ID, reward.count);
}
```

Remove stone imports and branches. Mirror the mapping in `recordAttendanceReward`.

- [ ] **Step 4: Run the route test and confirm it passes**

Run: `npm test -- src/app/api/v2/me/attendance/route.test.ts`

Expected: all route tests pass, including duplicate-claim protection.

---

### Task 3: Attendance UI and manual copy

**Files:**
- Modify: `src/adventure/v2/V2AttendanceView.tsx`
- Create: `src/adventure/v2/V2AttendanceView.test.tsx`
- Modify: `src/app/manual/content/controls.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: `MonthlyAttendanceReward` from Task 1.
- Produces: distinct map/coin marks and day-14 support guidance.

- [ ] **Step 1: Write failing UI and manual tests**

Export the pure mark helper as `attendanceRewardMark` and assert:

```ts
expect(attendanceRewardMark({ kind: "torn_map_fragment", count: 2 })).toBe("🗺️");
expect(attendanceRewardMark({ kind: "coop_coin", count: 20 })).toBe("🪙");
expect(renderToStaticMarkup(<ControlsContent />)).toContain("14일차");
```

- [ ] **Step 2: Run the UI/manual tests and confirm the expected failures**

Run: `npm test -- src/adventure/v2/V2AttendanceView.test.tsx src/app/manual/current-content.test.tsx`

Expected: the new kinds lack marks and the manual lacks day-14 support guidance.

- [ ] **Step 3: Implement icons and guidance**

Return `🗺️` for map fragments and `🪙` for coop coins. Remove stone icon branches. Update the attendance banner and manual to state that day 14 grants a seven-day support pass while retaining the cosmetic-box explanation.

- [ ] **Step 4: Run the UI/manual tests and confirm they pass**

Run: `npm test -- src/adventure/v2/V2AttendanceView.test.tsx src/app/manual/current-content.test.tsx`

Expected: both files pass.

---

### Task 4: Integrated verification and commit

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: a tested local commit without deployment.

- [ ] **Step 1: Run focused regression tests**

```bash
npm test -- src/adventure/data/v2/monthlyAttendance.test.ts src/app/api/v2/me/attendance/route.test.ts src/adventure/v2/V2AttendanceView.test.tsx src/app/manual/current-content.test.tsx
```

- [ ] **Step 2: Run static verification**

```bash
npx eslint src/adventure/data/v2/monthlyAttendance.ts src/adventure/data/v2/monthlyAttendance.test.ts src/app/api/v2/me/attendance/route.ts src/app/api/v2/me/attendance/route.test.ts src/adventure/v2/V2AttendanceView.tsx src/adventure/v2/V2AttendanceView.test.tsx src/app/manual/content/controls.tsx src/app/manual/current-content.test.tsx
npx tsc --noEmit
git diff --check
```

- [ ] **Step 3: Commit only attendance-related files**

```bash
git add docs/superpowers/plans/2026-08-12-monthly-attendance-reward-rework.md src/adventure/data/v2/monthlyAttendance.ts src/adventure/data/v2/monthlyAttendance.test.ts src/app/api/v2/me/attendance/route.ts src/app/api/v2/me/attendance/route.test.ts src/adventure/v2/V2AttendanceView.tsx src/adventure/v2/V2AttendanceView.test.tsx src/app/manual/content/controls.tsx src/app/manual/current-content.test.tsx
git commit -m "feat: rework monthly attendance rewards"
```
