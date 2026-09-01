# Unexplored Immortal Berserker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재생 군체와 붉은 광전대를 연결하고 세 생명·횟수 제한 재생·부활 광폭을 사용하는 개인 보스 `불멸의 광전왕`을 소환부터 보상까지 완성한다.

**Architecture:** 생명 경계·피해 차단·회복·정규화는 순수 `immortalBerserkerMechanic` 모듈에 둔다. 선택적 ATB 보스 문맥이 순수 상태를 전투 타임라인에 연결하고, 협동 공격 라우트는 공유 HP와 전용 상태의 시작 스냅샷을 행 잠금 뒤 재검증한 후 최종 HP·상태·순기여도를 원자 저장한다. 카탈로그 기반 소환·보상 경로와 기존 목록·상세 UI를 확장하고 다른 보스에는 새 분기를 적용하지 않는다.

**Tech Stack:** TypeScript 5, Next.js 16 App Router Route Handlers, React 19, Vitest 4, Drizzle ORM, 기존 ATB 전투 엔진, Sharp/WebP 이미지 파이프라인

## Global Constraints

- 기준 명세는 `docs/superpowers/specs/2026-09-01-unexplored-immortal-berserker-design.md`다.
- 코드 변경 전 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `05-server-and-client-components.md`, `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`를 읽는다.
- 공유 최대 HP `10,800,000`, 생명 배분 `33% · 33% · 34%`, 경계 `7,236,000`과 `3,672,000`은 고정한다.
- 같은 행동의 경계 초과 피해와 남은 후속타는 새 생명으로 넘기지 않는다.
- 첫 생명은 4행동마다 4%·최대 3회, 둘째는 4행동마다 3%·최대 2회, 셋째는 회복하지 않는다.
- 둘째 생명은 공격력 ×1.12·속도 ×1.06, 셋째는 공격력 ×1.25·속도 ×1.12를 적용한다.
- 기여도는 `max(0, 시작 HP - 최종 HP)`인 순공유 HP 감소량만 인정한다.
- 30%·10% 장비만 우두머리 핵 확정 제작을 지원하고 0.5% 장비는 드롭 전용이다.
- 기존 `CoopMechanicState`의 MP·추적·성채 상태를 보존하고 새 DB 컬럼을 만들지 않는다.
- 새 UI 표면은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`만 사용한다.
- 이미지 생성·편집은 `imagegen` skill을 사용하고 `docs/asset-rights.json`에 생성 기록을 남긴다.
- 테스트 서버와 운영 서버 배포, 기능 플래그 변경, 푸시와 PR 생성은 별도 명시적 요청 전에는 수행하지 않는다.

---

### Task 1: 세 생명 상태 전이 순수 모듈

**Files:**
- Create: `src/adventure/v2/combat/immortalBerserkerMechanic.ts`
- Create: `src/adventure/v2/combat/immortalBerserkerMechanic.test.ts`

**Interfaces:**
- Produces: `ImmortalBerserkerBattleState`, `initialImmortalBerserkerState(maxHp)`, `normalizeImmortalBerserkerState(value, maxHp, currentHp, options?)`, `settleImmortalBerserkerDamage(args)`, `advanceImmortalBerserkerEnemyAction(args)`, `immortalBerserkerMultipliers(lifeIndex)`, `immortalBerserkerDisplay(state, maxHp, currentHp)`.
- `settleImmortalBerserkerDamage` returns `{ state, hp, appliedDamage, blockedDamage, revived, cancelledRemainingActionDamage }`.
- `advanceImmortalBerserkerEnemyAction` returns `{ state, hp, healed, regenerationTriggered }`.

- [x] **Step 1: 경계·초과 피해·초기 상태 실패 테스트 작성**

```ts
const MAX_HP = 10_800_000;

expect(initialImmortalBerserkerState(MAX_HP)).toEqual({
  kind: "immortal_berserker",
  lifeIndex: 0,
  regenActionCount: 0,
  regenUsesRemaining: 3,
  revivalsCompleted: 0,
});

expect(settleImmortalBerserkerDamage({
  state: initialImmortalBerserkerState(MAX_HP),
  currentHp: 7_236_010,
  incomingDamage: 100,
  maxHp: MAX_HP,
})).toMatchObject({
  hp: 7_236_000,
  appliedDamage: 10,
  blockedDamage: 90,
  revived: true,
  cancelledRemainingActionDamage: true,
  state: { lifeIndex: 1, regenActionCount: 0, regenUsesRemaining: 2, revivalsCompleted: 1 },
});
```

- [x] **Step 2: 테스트가 모듈 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/combat/immortalBerserkerMechanic.test.ts`
Expected: FAIL because `immortalBerserkerMechanic` does not exist.

- [x] **Step 3: 상수·타입·초기화·피해 정산 구현**

```ts
export const IMMORTAL_BERSERKER_LIFE_FLOORS = [7_236_000, 3_672_000, 0] as const;
export const IMMORTAL_BERSERKER_LIFE_CEILINGS = [10_800_000, 7_236_000, 3_672_000] as const;

export type ImmortalBerserkerBattleState = {
  kind: "immortal_berserker";
  lifeIndex: 0 | 1 | 2;
  regenActionCount: number;
  regenUsesRemaining: 0 | 1 | 2 | 3;
  revivalsCompleted: 0 | 1 | 2;
};
```

피해는 `min(incomingDamage, currentHp - currentLifeFloor)`만 적용한다. 경계에 닿으면 다음 생명 상태를 만들고 `cancelledRemainingActionDamage: true`를 반환한다. 셋째 생명 0에서는 부활하지 않는다.

- [x] **Step 4: 회복·광폭·정규화 실패 테스트 작성**

```ts
expect(advanceImmortalBerserkerEnemyAction({
  state: { kind: "immortal_berserker", lifeIndex: 0, regenActionCount: 3, regenUsesRemaining: 3, revivalsCompleted: 0 },
  currentHp: 10_500_000,
  maxHp: MAX_HP,
})).toMatchObject({ hp: 10_642_560, healed: 142_560, regenerationTriggered: true });

expect(immortalBerserkerMultipliers(2)).toEqual({ atkMult: 1.25, spdMult: 1.12 });
expect(normalizeImmortalBerserkerState(undefined, MAX_HP, 5_000_000)).toMatchObject({
  lifeIndex: 1,
  regenUsesRemaining: 0,
  revivalsCompleted: 1,
});
```

- [x] **Step 5: 회복·광폭·정규화 구현 후 집중 테스트 통과**

회복은 첫 생명 `142,560`, 둘째 `106,920`으로 고정하고 현재 생명 위쪽 경계에서 제한한다. 상태 전체가 없을 때 `options?.newSession === true`인 경우만 생명별 초기 재생 횟수를 주고, 그 외 복구는 0회로 둔다.

Run: `npm test -- src/adventure/v2/combat/immortalBerserkerMechanic.test.ts`
Expected: PASS.

- [x] **Step 6: 순수 모듈 커밋**

```bash
git add src/adventure/v2/combat/immortalBerserkerMechanic.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts
git commit -m "feat: add immortal berserker state machine"
```

### Task 2: 보스·장비·칭호·업적 카탈로그

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.test.ts`
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.test.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.test.ts`
- Modify: `src/adventure/data/v2/unexploredState.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Consumes: `ImmortalBerserkerBattleState` and multipliers from Task 1.
- Produces: `UNEXPLORED_BOSSES.immortal_berserker`, summon material, three equipment IDs, `COOP_BOSSES.immortal_berserker`, title and achievement mappings.

- [x] **Step 1: 카탈로그 계약 실패 테스트 작성**

```ts
expect(UNEXPLORED_BOSS_IDS).toContain("immortal_berserker");
expect(UNEXPLORED_BOSSES.immortal_berserker).toMatchObject({
  pools: ["regenerating_swarm", "red_berserkers"],
  sharedMaxHp: 10_800_000,
  uniqueDrops: [
    { equipmentId: "v2_unexplored_immortal_king_greatsword", chancePct: 30 },
    { equipmentId: "v2_unexplored_pulsing_berserker_gauntlets", chancePct: 10 },
    { equipmentId: "v2_unexplored_eternal_life_core", chancePct: 0.5 },
  ],
});
```

장비 테스트는 명세의 슬롯·power·옵션·`tier: 16`·`rarity: "unique"`·`noDrop: true`를 정확히 검사한다. 제작식 테스트는 앞 두 장비만 생성되고 영겁의 생명핵은 제외되는지 확인한다.

- [x] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/unexploredProgression.test.ts`
Expected: FAIL on missing boss, equipment, title and achievement IDs.

- [x] **Step 3: 소환석·보스·장비 정의 구현**

`UnexploredBossDefinition["id"]`와 소환석 material union을 확장한다. 보스 기본값은 `hp 1200`, `atk 1.75`, `def 42`, `magicDef 38`, `spd 21`, `accuracy -205`, `evasionPct 10`, 물리 `광란 참격` 3행동·1.65배로 고정한다. 장비는 명세의 세 ID와 옵션을 그대로 등록한다.

- [x] **Step 4: 칭호·업적·협동 카탈로그 구현**

```ts
v2_unexplored_immortal_berserker: {
  id: "v2_unexplored_immortal_berserker",
  name: "죽음을 넘어선 자",
  description: "두 번의 죽음에서 되살아난 광전왕의 마지막 생명까지 끊어 낸 자.",
  condition: "미개척지 개인 보스 불멸의 광전왕 최초 처치",
  category: "battle",
}
```

`BOSS_ACHIEVEMENT_ID_BY_BOSS`에 `defeat_immortal_berserker`를 추가하고 정복 설명을 5종으로 바꾼다. 기존 저장 업적 파서는 새 ID를 허용하되 기존 정복 업적을 삭제하지 않는다. `COOP_BOSSES`에는 `unexploredPersonalBossKind("immortal_berserker")`를 등록한다.

- [x] **Step 5: 카탈로그 테스트 통과 및 커밋**

Run: `npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/data/v2/dungeonUniqueDrops.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/unexploredProgression.test.ts`
Expected: PASS.

```bash
git add src/adventure/data/titles.ts src/adventure/data/v2
git commit -m "feat: register immortal berserker rewards"
```

### Task 3: ATB 피해 경계·부활·재생 통합

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Create: `src/adventure/v2/combat/immortalBerserkerAtb.test.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: Task 1 state transitions.
- Produces: `BossMechanicContext` variant `{ kind: "immortal_berserker"; sharedMaxHp: number; initialState: ImmortalBerserkerBattleState }` and final battle state counters `immortalBodyDamage`, `immortalHealing`, `immortalRevivalCount`.

- [x] **Step 1: ATB 실패 테스트 작성**

경계 10 HP 위에서 100 피해를 주면 10만 적용되고 둘째 생명으로 전환되는 사례, 같은 다단 행동의 남은 타격이 무시되는 사례, 다음 플레이어 행동은 피해를 주는 사례를 작성한다. 넷째 적 행동 뒤 첫 생명 142,560 회복, 둘째 106,920 회복, 셋째 무회복을 검사한다.

```ts
expect(result.finalState.bossMechanic).toMatchObject({
  kind: "immortal_berserker",
  lifeIndex: 1,
  regenActionCount: 0,
  regenUsesRemaining: 2,
  revivalsCompleted: 1,
});
expect(result.finalState.enemyHp).toBe(7_236_000);
```

- [x] **Step 2: ATB 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/combat/immortalBerserkerAtb.test.ts`
Expected: FAIL on missing mechanic context and state.

- [x] **Step 3: 엔진 상태와 초기 문맥 구현**

`BossMechanicContext`와 `BossMechanicBattleState` union을 확장한다. 초기화에서 Task 1 정규화 함수를 사용하고 `bossSharedMaxHp`를 고정한다. 기본 적 스냅샷을 보존한 뒤 생명별 배율을 `atk`와 `spd`에만 적용한다.

- [x] **Step 4: 모든 플레이어 피해 경로 뒤 경계 정산 구현**

불괴의 성채 정산 훅 옆에 `settleImmortalBerserkerAfterPlayerDamage(before, after, tick)`을 둔다. 스킬 시전, 평타·다단, 추가타와 적 행동 시작 지속 피해 뒤에 호출한다. 부활이면 조기 승리 로그를 제거하고 같은 행동 묶음의 남은 공격을 종료하며 다음 플레이어 행동을 예약한다.

- [x] **Step 5: 적 행동 완료 후 재생과 광폭 구현**

일반 공격과 광란 참격이 끝난 뒤 한 번만 `advanceImmortalBerserkerEnemyAction`을 호출한다. 플레이어 사망 행동도 회복을 반영한 뒤 종료한다. 로그에는 `첫 번째 부활`, `두 번째 부활`, `재생 +142,560`, `광폭 · 공격력 +25% · 행동 속도 +12%`를 정형 effect와 함께 남긴다.

- [x] **Step 6: 리플레이 자원과 ATB 회귀 통과**

`boss_resource` 스냅샷에 생명, 현재 생명 HP, 남은 재생, 재생 행동 수, 광폭 배율을 넣고 `BattleLogList`가 기존 카드 그룹을 유지하는지 검사한다.

Run: `npm test -- src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts`
Expected: PASS.

- [x] **Step 7: ATB 통합 커밋**

```bash
git add src/adventure/v2/combat src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: integrate immortal berserker into atb combat"
```

### Task 4: 세션 저장과 공격 API 원자성

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/lib/server/v2Coop.ts`
- Modify: `src/lib/server/v2Coop.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`

**Interfaces:**
- Produces: `CoopMechanicState.immortalBerserker`, `coopImmortalBerserkerState`, `withCoopImmortalBerserkerState`, `coopImmortalBerserkerDisplay`.
- Attack response adds `immortalBodyDamage`, `immortalHealing`, `netProgress` and display fields.

- [x] **Step 1: 파서·병합·신규 세션 실패 테스트 작성**

```ts
expect(parseCoopMechanicState({
  bossMp: 7,
  trackingThreat: 9,
  immortalBerserker: { kind: "immortal_berserker", lifeIndex: 0, regenActionCount: 9, regenUsesRemaining: 99, revivalsCompleted: 0 },
})).toMatchObject({
  bossMp: 7,
  trackingThreat: 9,
  immortalBerserker: { regenActionCount: 3, regenUsesRemaining: 3 },
});
```

새 `immortal_berserker` 세션이 첫 생명·재생 3회 상태를 저장하는지 `v2Coop.test.ts`에서 검사한다.

- [x] **Step 2: 실패 확인 후 파서·표시 mapper·세션 생성 구현**

Run: `npm test -- src/adventure/data/v2/coopBosses.test.ts src/lib/server/v2Coop.test.ts`
Expected: FAIL before implementation, then PASS after adding helpers.

- [x] **Step 3: 공격 route 회복·기여도 실패 테스트 작성**

다음 네 사례를 route mock으로 고정한다.

1. 시작 8,000,000, 본체 피해 200,000, 회복 100,000이면 최종 HP 7,900,000과 기여 100,000.
2. 시작 8,000,000, 본체 피해 50,000, 회복 100,000이면 최종 HP 8,050,000과 기여 0.
3. 잠금 뒤 HP 또는 전용 상태가 바뀌면 `409 boss_state_changed`이고 모든 쓰기 없음.
4. 셋째 생명 0에서만 처치·보상 수령 가능 상태로 전환.

- [x] **Step 4: 공격 route 문맥 주입과 원자 저장 구현**

peek 단계에서 불멸 상태를 정규화해 엔진에 전달한다. 잠금 뒤 `s.hp`와 시작 상태를 JSON 구조 비교한다. 불멸 보스만 최종 HP를 `battleResult.finalState.enemyHp`에서 읽어 현재 생명·전체 상한으로 검증한 뒤 직접 저장한다. 기여와 critical contribution은 `netProgress`를 상한으로 제한한다. 다른 보스는 기존 `GREATEST(0, hp - appliedDamage)` 경로를 유지한다.

- [x] **Step 5: API 집중 테스트 통과 및 커밋**

Run: `npm test -- src/adventure/data/v2/coopBosses.test.ts src/lib/server/v2Coop.test.ts src/app/api/v2/coop/attack/route.test.ts`
Expected: PASS.

```bash
git add src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts src/lib/server/v2Coop.ts src/lib/server/v2Coop.test.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts
git commit -m "feat: persist immortal berserker sessions"
```

### Task 5: 목록·상세 API와 상태 UI

**Files:**
- Modify: `src/app/api/v2/coop/route.ts`
- Modify: `src/app/api/v2/coop/route.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.test.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Create: `src/adventure/v2/coop/ImmortalBerserkerStatus.tsx`
- Create: `src/adventure/v2/coop/ImmortalBerserkerStatus.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`

**Interfaces:**
- Consumes: `coopImmortalBerserkerDisplay` from Task 4.
- Produces: list/detail client fields for life, local HP, regen countdown/uses and multipliers.

- [x] **Step 1: route 응답 실패 테스트 작성**

목록과 상세 fixture에 둘째 생명 상태를 넣고 `immortalLifeIndex: 1`, `immortalLifeHp: 2_000_000`, `immortalLifeMaxHp: 3_564_000`, `immortalRegenActionsRemaining: 2`, `immortalRegenUsesRemaining: 1`, `immortalAtkMult: 1.12`, `immortalSpdMult: 1.06`을 기대한다.

- [x] **Step 2: route mapper와 클라이언트 타입 구현**

Run: `npm test -- src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts`
Expected: FAIL before mapper wiring, then PASS.

- [x] **Step 3: 불투명 상태 카드 실패 테스트 작성**

```tsx
expect(markup).toContain("생명 2 / 3");
expect(markup).toContain("현재 생명 2,000,000 / 3,564,000");
expect(markup).toContain("재생까지 2행동");
expect(markup).toContain("남은 재생 1회");
expect(markup).toContain("공격력 +12%");
```

- [x] **Step 4: `ImmortalBerserkerStatus`와 목록·상세 통합**

상태 카드는 `SURFACE_INSET`을 사용하고 생명 3칸은 색상으로 현재·완료·남음을 구분한다. 목록에는 생명과 광폭만 압축 표시하고 상세에는 재생 수치를 모두 표시한다. `kind === "immortal_berserker"`일 때만 렌더한다.

- [x] **Step 5: UI/API 테스트 통과 및 커밋**

Run: `npm test -- src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/ImmortalBerserkerStatus.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`
Expected: PASS.

```bash
git add src/app/api/v2/coop src/adventure/v2/coop
git commit -m "feat: show immortal berserker status"
```

### Task 6: 소환·보상·업적 파이프라인 회귀

**Files:**
- Modify: `src/app/api/v2/unexplored/craft/route.test.ts`
- Modify: `src/app/api/v2/unexplored/summon/route.test.ts`
- Modify: `src/adventure/data/v2/unexploredBossRewards.test.ts`
- Modify: `src/app/api/v2/coop/claim/route.test.ts`
- Modify: `src/app/api/v2/unexplored/equipment-craft/route.test.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`

**Interfaces:**
- Consumes: Task 2 catalogue IDs.
- Produces: end-to-end proof that existing generic routes support the fifth boss.

- [ ] **Step 1: 신규 보스 파이프라인 테스트 작성**

제작은 두 흔적 500, 두 재료 10, 소환서 30, 5,000,000G를 차감하고 같은 requestId 재시도에 추가 차감하지 않아야 한다. 소환은 소환석 1개로 `summoner_only` 세션을 만든다. 보상은 핵 확정과 세 독립 굴림, 칭호·업적을 지급한다. 장비 확정 제작은 30%·10%만 허용한다.

- [ ] **Step 2: 파이프라인 테스트 실행과 최소 매핑 보정**

Run: `npm test -- src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/unexplored/summon/route.test.ts src/adventure/data/v2/unexploredBossRewards.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/unexplored/equipment-craft/route.test.ts src/lib/server/marketplaceV2.test.ts`
Expected: PASS after generic catalogue totals and fixtures include the new IDs.

- [ ] **Step 3: 회귀 커밋**

```bash
git add src/app/api/v2/unexplored src/app/api/v2/coop/claim/route.test.ts src/adventure/data/v2/unexploredBossRewards.test.ts src/lib/server/marketplaceV2.test.ts
git commit -m "test: cover immortal berserker progression"
```

### Task 7: 고정 시드 밸런스 시뮬레이션

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Modify: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`

**Interfaces:**
- Produces: `--boss=immortal_berserker` 필터와 생명 소진·부활·재생·총 피해·총 회복·순진행량 중앙값.

- [ ] **Step 1: 보고서 필드 실패 테스트 작성**

`bossIds: ["immortal_berserker"]` 결과에 `medianRevivalCount`, `medianRegenerationCount`, `medianBodyDamage`, `medianHealing`, `medianNetProgress`가 유한한 수로 존재하고 생명 경계가 고정인지 검사한다.

- [ ] **Step 2: 시뮬레이션 수집 구현**

엔진에 새 보스 문맥과 초기 상태를 전달하고 최종 상태의 카운터를 trial row와 JSON·텍스트 집계에 추가한다. 기존 보스 행에는 0을 유지한다.

- [ ] **Step 3: 정해진 순서로 수치 보정**

Run: `npm run sim:coop-boss -- --trials=50 --seed=20260901 --boss=immortal_berserker --json`

먼저 기본 atk/spd, 다음 회복 비율·횟수, 다음 광폭 배율, 마지막 def/magicDef 순서로만 조정한다. 33/33/34, 두 부활과 초과 피해 차단은 바꾸지 않는다. 대표 생존형이 마지막 생명 첫 평타에 즉사하지 않고 모든 계보가 유한한 순진행량을 내야 한다.

- [ ] **Step 4: 장비·보스 균형 테스트 통과 및 커밋**

Run: `npm test -- src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/coopBossBalance.test.ts src/adventure/data/v2/v2Equipment.test.ts`
Expected: PASS.

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/coopBossBalance.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/v2EquipmentCatalog.ts
git commit -m "test: calibrate immortal berserker combat"
```

### Task 8: 이미지 자산과 권리 메타데이터

**Files:**
- Create: `public/images/monster/v2/unexplored-boss-immortal-berserker.webp`
- Create: `public/images/equipment/unexplored-immortal-king-greatsword.webp`
- Create: `public/images/equipment/unexplored-pulsing-berserker-gauntlets.webp`
- Create: `public/images/equipment/unexplored-eternal-life-core.webp`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Consumes: exact image paths from Task 2.
- Produces: optimized WebP files referenced by catalogue data.

- [x] **Step 1: `imagegen` skill 지침 확인 후 네 자산 생성**

보스는 붉은 중갑, 재생 조직과 증식핵을 한 실루엣으로 구성한다. 장비는 기존 미개척지 장비의 어두운 판타지 아이콘 구도·배경·여백을 맞추고 텍스트·워터마크를 넣지 않는다.

- [x] **Step 2: 저장·최적화·시각 검수**

생성 결과를 정확한 경로에 저장하고 `npm run optimize-images`를 실행한다. 보스 전신이 잘리지 않고 장비 세 종류가 작은 아이콘에서도 구분되는지 `view_image`로 확인한다.

- [x] **Step 3: 이미지와 권리 검사 후 커밋**

Run: `npm run check-images`
Expected: referenced files all exist; no new orphan warnings.

```bash
git add public/images/monster/v2/unexplored-boss-immortal-berserker.webp public/images/equipment/unexplored-immortal-king-greatsword.webp public/images/equipment/unexplored-pulsing-berserker-gauntlets.webp public/images/equipment/unexplored-eternal-life-core.webp docs/asset-rights.json
git commit -m "feat: add immortal berserker artwork"
```

### Task 9: 전체 검증과 전달 준비

**Files:**
- Modify only files required to correct verification failures caused by this feature.

**Interfaces:**
- Consumes: Tasks 1-8.
- Produces: clean implementation branch with no deployment side effects.

- [ ] **Step 1: 금지 요소와 diff 감사**

Run: `git diff origin/staging...HEAD --check && git status --short`
Expected: no whitespace errors; only intended files changed.

`rg -n "NEXT_PUBLIC_V2_UNEXPLORED|maintenance\.sh|deploy-staging|deploy-test"`를 변경 파일에 한정해 실행하고 기능 플래그·점검·배포 변경이 없음을 확인한다.

- [ ] **Step 2: 집중 회귀 실행**

Run: `npm test -- src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/ImmortalBerserkerStatus.test.tsx`
Expected: PASS.

- [ ] **Step 3: 정적·자산 검증**

Run: `npx tsc --noEmit && npx eslint src/adventure/v2/combat/immortalBerserkerMechanic.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts src/adventure/v2/coop/ImmortalBerserkerStatus.tsx src/adventure/v2/coop/ImmortalBerserkerStatus.test.tsx src/app/api/v2/coop/attack/route.ts && npm run check-images`
Expected: all commands exit 0.

- [ ] **Step 4: 전체 테스트·시뮬레이션·Next 빌드**

Run: `npm test`
Expected: all test files pass.

Run: `npm run sim:coop-boss -- --trials=50 --seed=20260901 --boss=immortal_berserker --json`
Expected: finite metrics and no strict balance failure.

Run: `V2_UNEXPLORED=true npm run build`
Expected: production build exits 0.

- [ ] **Step 5: 최종 상태 확인과 필요한 보정 커밋**

Run: `git status --short && git log --oneline origin/staging..HEAD`
Expected: clean worktree and only feature commits. 검증 보정이 생겼으면 관련 파일만 stage해 `fix: complete immortal berserker validation`으로 커밋한다. 푸시·PR·배포는 수행하지 않는다.
