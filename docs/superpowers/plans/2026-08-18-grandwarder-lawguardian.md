# Grandwarder and Lawguardian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 봉마사 계보에 대결계사·만법수호자와 삼중 결계 전투 메커니즘을 PvE/PvP·전투 로그·리플레이 UI까지 완성한다.

**Architecture:** `tripleWard.ts`가 결계의 초기화·갱신·피해/상태 소모·영역 안정 피해 감소를 순수 함수로 책임진다. 직업·스킬 데이터는 기존 카탈로그에 추가하고, PvE/PvP 엔진은 결계 상태를 전투 스택에 보관해 직접 피해와 신규 상태이상 적용 지점에서만 순수 함수를 호출한다. HP 스냅샷의 전투 자원 객체에 결계 상태를 병합해 실시간 전투와 리플레이가 같은 UI를 사용한다.

**Tech Stack:** TypeScript, Next.js 애플리케이션, Vitest, React Testing Library

## Global Constraints

- 계보는 `결계사 → 진법사 → 봉마사 → 대결계사 → 만법수호자`다.
- 금강결계는 직접 물리 피해, 봉마결계는 직접 마법 피해, 정화결계는 새로 부여되는 적대 상태이상만 막는다.
- 장비의 전투당 1회 상태 방어를 정화결계보다 먼저 소비한다.
- 대결계사는 각 결계 1회와 PvE 45%/PvP 30% 감소, 만법수호자는 각 결계 3회와 PvE 60%/PvP 40% 감소를 사용한다.
- 만법수호자는 결계 소모마다 영역 안정 1중첩(최대 3), 중첩당 받는 피해 4% 감소를 전투 종료까지 얻는다.
- 팔문금쇄진은 최대 HP 18% 보호막과 3행동 14% 받는 피해 감소, 만법불침은 전투당 1회 최대 HP 24% 보호막과 3행동 18% 받는 피해 감소 및 삼중 결계 갱신을 제공한다.
- 지속 피해·반사·자해는 결계를 소비하지 않고, 빗나감·완전 회피·피해 무효는 결계를 소비하지 않는다.
- 기존 봉마진·봉마대법과 중첩 가능하며 보호막은 기존 상한 규칙을 따른다.
- 운영 배포는 수행하지 않는다.

---

### Task 1: Job and skill catalogs

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Produces: `grandwarder`, `lawguardian`, `v2c_grandwarder_eightgate`, `v2c_grandwarder_tripleward`, `v2c_lawguardian_inviolable`, `v2c_lawguardian_domain`.
- Produces: `V2PassiveSkillEffect.tripleWardRank` and `V2SkillDefinition.refreshTripleWards`.

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(JOB_CATALOG.grandwarder.unlock.prereqs).toEqual({ spellsealer: 18_000 });
expect(JOB_CATALOG.lawguardian.unlock.prereqs).toEqual({ grandwarder: 35_000 });
expect(skillsForJob("grandwarder")).toEqual([
  "v2c_grandwarder_eightgate",
  "v2c_grandwarder_tripleward",
]);
expect(V2_SKILLS.v2c_lawguardian_domain.passive?.tripleWardRank).toBe(2);
```

- [ ] **Step 2: Run catalog tests and confirm the new identifiers fail**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts`

- [ ] **Step 3: Add the two jobs, four skills, passive rank, refresh marker, descriptions, costs, effects, and exclusive ranks**

```ts
passive: { tripleWardRank: 2 },
exclusiveGroup: "triple_ward",
exclusiveRank: 2,
oncePerBattle: true,
refreshTripleWards: true,
effects: [
  { kind: "shield", pctMaxHp: 24, turns: 3 },
  { kind: "selfBuffPct", target: "damageReduction", pct: 18, turns: 3 },
],
```

- [ ] **Step 4: Run the focused catalog tests until they pass**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts`

- [ ] **Step 5: Commit catalog support**

```bash
git add src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "feat: add grandwarder and lawguardian catalogs"
```

### Task 2: Triple ward state machine

**Files:**
- Create: `src/adventure/v2/combat/tripleWard.ts`
- Create: `src/adventure/v2/combat/tripleWard.test.ts`

**Interfaces:**
- Consumes: passive rank `0 | 1 | 2`.
- Produces: `TripleWardState`, `initialTripleWardState`, `refreshTripleWardState`, `consumeTripleWardDamage`, `consumePurificationWard`, `tripleWardResourceSnapshot`.

- [ ] **Step 1: Write failing pure behavior tests**

```ts
expect(initialTripleWardState(1)).toMatchObject({ physical: 1, magic: 1, purification: 1 });
expect(consumeTripleWardDamage(initialTripleWardState(2), "magic", "pvp").damageMultiplier).toBe(0.6);
expect(consumePurificationWard(initialTripleWardState(2)).state.stabilityStacks).toBe(1);
expect(refreshTripleWardState({ ...initialTripleWardState(2), physical: 0 }, 2).physical).toBe(3);
```

- [ ] **Step 2: Run the test and confirm missing-module failure**

Run: `npm test -- src/adventure/v2/combat/tripleWard.test.ts`

- [ ] **Step 3: Implement immutable rank, consumption, stability, and snapshot helpers**

```ts
export function consumeTripleWardDamage(
  state: TripleWardState,
  kind: "physical" | "magic",
  mode: "pve" | "pvp",
): { state: TripleWardState; damageMultiplier: number; consumed: boolean };
```

- [ ] **Step 4: Run the pure tests until they pass**

Run: `npm test -- src/adventure/v2/combat/tripleWard.test.ts`

- [ ] **Step 5: Commit the state machine**

```bash
git add src/adventure/v2/combat/tripleWard.ts src/adventure/v2/combat/tripleWard.test.ts
git commit -m "feat: add triple ward combat state"
```

### Task 3: PvE engine integration

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Test: `src/adventure/v2/combat/tripleWardPve.test.ts`

**Interfaces:**
- Consumes: Task 1 rank/refresh metadata and Task 2 state transitions.
- Produces: `BattleStacks.tripleWard`, PvE damage/status consumption logs, and HP-bar ward snapshots.

- [ ] **Step 1: Write failing PvE tests for physical, magic, equipment-first status block, active refresh, and miss/non-direct exclusions**

```ts
expect(afterPhysical.stacks.tripleWard.physical).toBe(before.physical - 1);
expect(afterMagic.log.some((entry) => entry.text.includes("[봉마결계]"))).toBe(true);
expect(afterEquipmentBlock.stacks.tripleWard.purification).toBe(before.purification);
expect(afterRefresh.stacks.tripleWard).toMatchObject({ physical: 3, magic: 3, purification: 3 });
```

- [ ] **Step 2: Run the PvE test and confirm missing integration failures**

Run: `npm test -- src/adventure/v2/combat/tripleWardPve.test.ts`

- [ ] **Step 3: Initialize ward state, carry refresh through cast results, apply direct reductions before shields, and consume purification after equipment status defense**

```ts
tripleWard: initialTripleWardState(
  aggregateEquippedPassives(v2Skills.equipped).tripleWardRank,
),
```

- [ ] **Step 4: Add exact combat logs and merge ward resource snapshots into legacy and ATB HP-bar entries**

```ts
text: `[금강결계] 직접 물리 피해 ${reductionPct}% 감소 (${remaining}회 남음)`,
```

- [ ] **Step 5: Run PvE ward and nearby engine tests until they pass**

Run: `npm test -- src/adventure/v2/combat/tripleWardPve.test.ts src/adventure/v2/combat/engine.test.ts src/adventure/v2/combat/engine.atb.test.ts`

- [ ] **Step 6: Commit PvE integration**

```bash
git add src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/tripleWardPve.test.ts
git commit -m "feat: apply triple wards in pve combat"
```

### Task 4: PvP engine integration

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Test: `src/adventure/v2/combat/tripleWardPvp.test.ts`

**Interfaces:**
- Consumes: Task 2 state transitions and Task 3 cast-result refresh marker.
- Produces: mirrored `PvPSideStacks.tripleWard`, direct-damage/status integration, and both-side resource snapshots.

- [ ] **Step 1: Write failing mirrored PvP tests**

```ts
expect(afterHit.p2.stacks.tripleWard.physical).toBe(2);
expect(afterHit.p2.hp).toBe(beforeHp - Math.floor(rawDamage * 0.6));
expect(afterStatus.p2.stacks.tripleWard.purification).toBe(2);
expect(afterRefresh.p1.stacks.tripleWard.magic).toBe(3);
```

- [ ] **Step 2: Run the PvP test and confirm failures**

Run: `npm test -- src/adventure/v2/combat/tripleWardPvp.test.ts`

- [ ] **Step 3: Initialize each side and apply ward transitions at basic attack, skill damage, and hostile status sites**

```ts
const ward = consumeTripleWardDamage(defender.stacks.tripleWard, damageKind, "pvp");
```

- [ ] **Step 4: Merge both ward snapshots into legacy/ATB PvP HP bars and add actor-qualified logs**

```ts
text: `[봉마결계] ${defender.name} 직접 마법 피해 40% 감소 (${remaining}회 남음)`,
```

- [ ] **Step 5: Run PvP ward and nearby engine tests until they pass**

Run: `npm test -- src/adventure/v2/combat/tripleWardPvp.test.ts src/adventure/v2/combat/engine-pvp.test.ts src/adventure/v2/combat/engine.pvp-atb.test.ts`

- [ ] **Step 6: Commit PvP integration**

```bash
git add src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/tripleWardPvp.test.ts
git commit -m "feat: apply triple wards in pvp combat"
```

### Task 5: Ward UI, replay compatibility, and verification

**Files:**
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/data/v2/replayPayload.test.ts`

**Interfaces:**
- Consumes: Task 2 resource keys `physicalWard`, `magicWard`, `purificationWard`, `domainStability`.
- Produces: accessible bright/consumed ward chips in the existing HP/MP metadata panel.

- [ ] **Step 1: Write a failing UI test for active and consumed ward chips**

```tsx
expect(screen.getByLabelText("금강결계 1")).toHaveAttribute("data-active", "true");
expect(screen.getByLabelText("정화결계 0")).toHaveAttribute("data-active", "false");
expect(screen.getByText("영역 안정 3")).toBeInTheDocument();
```

- [ ] **Step 2: Run the UI test and confirm the new labels/attributes fail**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts`

- [ ] **Step 3: Add labels and dimmed consumed styles without applying container opacity**

```tsx
data-active={isWard ? Number(value) > 0 : undefined}
className={isConsumedWard ? "... text-zinc-500 dark:text-zinc-400" : "... text-violet-800 dark:text-violet-200"}
```

- [ ] **Step 4: Run focused tests, typecheck, lint touched files, and combat regression suites**

Run: `npm test -- src/adventure/v2/combat/tripleWard.test.ts src/adventure/v2/combat/tripleWardPve.test.ts src/adventure/v2/combat/tripleWardPvp.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2Skills.ts src/adventure/v2/combat/tripleWard.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/battle/BattleLogList.tsx`

- [ ] **Step 5: Check the full working tree and commit only feature files**

```bash
git status --short
git diff --check
git add src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/replayPayload.test.ts
git commit -m "feat: show triple wards in battle logs"
```
