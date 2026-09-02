# Unexplored Boss Mechanic Hint Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add numeric, staged combat-log clues that let players infer the three unexplored boss mechanics without changing their behavior.

**Architecture:** Keep the existing per-change numeric logs and compare each mechanic's previous value with its newly displayed value inside `engine.atb.ts`. Append only the strongest newly reached narrative stage, while preserving all existing trigger, damage, recovery-lock, and HP-bar resource data.

**Tech Stack:** TypeScript, Vitest, Adventure V2 ATB combat engine

## Global Constraints

- Preserve exact tracking, toxic blood, and glacial chill numbers in the combat log and enemy resource snapshot.
- Do not change mechanic accumulation, thresholds, damage, action timing, recovery suppression, or status duration.
- Emit narrative hints only when entering a new stage; do not repeat them within the same stage.
- If one change crosses multiple stages, emit only the strongest newly reached hint.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Add staged numeric hints for all three unexplored bosses

**Files:**
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Test: `src/adventure/v2/combat/trackingWeaponAtb.test.ts`
- Test: `src/adventure/v2/combat/toxicBloodLordAtb.test.ts`
- Test: `src/adventure/v2/combat/glacialColossusAtb.test.ts`

**Interfaces:**
- Consumes: each boss mechanic's previous stored value, calculated `displayThreat` or `displayStacks`, existing `appendTrackingLog`, `appendToxicBloodLog`, and `appendGlacialLog` functions.
- Produces: one additional numeric narrative log on transitions to tracking 40/70/100, toxic blood 4/7/10, and glacial chill 4/7/10.

- [x] **Step 1: Write failing integration tests for threshold transitions**

Add assertions against real `resolveBattle` output for these literal behaviors:

```ts
expect(logs).toContain("[추적 40/100] 조준 장치가 공격 궤적을 따라 움직인다.");
expect(logs).toContain("[추적 70/100] 붉은 조준선이 더욱 선명하게 고정된다.");
expect(logs).toContain("[추적 100/100] 조준이 완료되어 추적 병기가 연속 공격을 개시한다.");

expect(logs).toContain("[독혈 4/10] 검붉은 독혈이 상처 깊숙이 스며든다.");
expect(logs).toContain("[독혈 8/10] 축적된 독혈이 불길하게 맥동한다. 폭발이 임박했다.");
expect(logs).toContain("[독혈 10/10] 축적된 독혈이 한꺼번에 파열된다.");

expect(logs).toContain("[한기 4/10] 냉기장이 짙어지며 움직임이 무거워진다.");
expect(logs).toContain("[한기 8/10] 온몸에 서리가 번져 움직임을 붙잡는다.");
expect(logs).toContain("[한기 10/10] 한기가 한계에 도달해 다음 행동이 봉쇄된다.");
```

For each mid/high stage, also assert the literal narrative line occurs exactly once even when another gain remains in the same stage. Keep existing numeric gain assertions so removal of exact values remains a regression.

- [x] **Step 2: Run the three focused test files and verify RED**

Run:

```bash
npx vitest run src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts
```

Expected: FAIL because the staged narrative lines do not exist yet, while the existing numeric gain assertions continue to pass.

- [x] **Step 3: Implement strongest-stage transition logging**

In each mechanic settlement block, keep the numeric gain append unchanged, then compare the previous value with the displayed value in descending stage order. Add the following branches at the existing warning/trigger sites:

```ts
// tracking weapon
if (resolution.triggered) {
  state = appendTrackingLog(
    state,
    `[추적 ${TRACKING_THREAT_MAX}/${TRACKING_THREAT_MAX}] 조준이 완료되어 추적 병기가 연속 공격을 개시한다.`,
    args.tick,
  );
} else if (mechanic.trackingThreat < 70 && displayThreat >= 70) {
  state = appendTrackingLog(
    state,
    `[추적 ${displayThreat}/${TRACKING_THREAT_MAX}] 붉은 조준선이 더욱 선명하게 고정된다.`,
    args.tick,
  );
} else if (mechanic.trackingThreat < 40 && displayThreat >= 40) {
  state = appendTrackingLog(
    state,
    `[추적 ${displayThreat}/${TRACKING_THREAT_MAX}] 조준 장치가 공격 궤적을 따라 움직인다.`,
    args.tick,
  );
}

// toxic blood lord
if (resolution.exploded) {
  state = appendToxicBloodLog(
    state,
    `[독혈 ${TOXIC_BLOOD_MAX_STACKS}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 한꺼번에 파열된다.`,
    "enemy",
    args.tick,
  );
} else if (mechanic.toxicBloodStacks < 7 && displayStacks >= 7) {
  state = appendToxicBloodLog(
    state,
    `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 불길하게 맥동한다. 폭발이 임박했다.`,
    "enemy",
    args.tick,
  );
} else if (mechanic.toxicBloodStacks < 4 && displayStacks >= 4) {
  state = appendToxicBloodLog(
    state,
    `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 검붉은 독혈이 상처 깊숙이 스며든다.`,
    "enemy",
    args.tick,
  );
}

// glacial colossus
if (resolution.triggered) {
  state = appendGlacialLog(
    state,
    `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
    "enemy",
    args.currentTick,
  );
} else if (mechanic.glacialChillStacks < 7 && displayStacks >= 7) {
  state = appendGlacialLog(
    state,
    `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 온몸에 서리가 번져 움직임을 붙잡는다.`,
    "enemy",
    args.currentTick,
  );
} else if (mechanic.glacialChillStacks < 4 && displayStacks >= 4) {
  state = appendGlacialLog(
    state,
    `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 냉기장이 짙어지며 움직임이 무거워진다.`,
    "enemy",
    args.currentTick,
  );
}
```

Use the existing mechanic values as `previous`, use the existing display values in the text, and do not alter any resolution or status logic. Replace the old terse tracking/toxic pre-warning lines with the approved numeric narrative text. Append the maximum-stage narrative line immediately before the existing tracking activation or glacial freeze-result line, and preserve actual damage, recovery lock, activation, freeze-result, and skipped-action logs.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts
```

Expected: 3 test files pass with all existing mechanic behavior tests and the new staged narrative assertions.

- [x] **Step 5: Run static and broader combat regression checks**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts
npx vitest run src/adventure/v2/combat
```

Expected: all commands exit 0 with no new diagnostics or failed tests.

- [x] **Step 6: Commit the verified implementation**

```bash
git add docs/superpowers/specs/2026-09-02-unexplored-boss-mechanic-hint-logs-design.md docs/superpowers/plans/2026-09-02-unexplored-boss-mechanic-hint-logs.md src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts
git commit -m "feat: add unexplored boss mechanic hint logs"
```
