# 불괴의 성채 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 철갑 군단과 마력 방벽체를 연결하는 네 번째 미개척지 개인 보스 `불괴의 성채`를 추가하고, 100/75/50/25% 체력에서 400 ATB 틱 동안 받은 순간 피해에 따라 해당 구간의 광폭이 정해지는 전투를 완성한다.

**Architecture:** 기믹 계산은 순수 함수 모듈 `invincibleFortressMechanic.ts`에 격리하고, ATB 엔진은 플레이어의 각 피해 행동과 적 행동 시작 DoT 피해를 고정 공유 최대 HP와 함께 이 모듈에 전달한다. 협동 세션의 `mechanic_state`가 방벽 진행과 구간별 결과를 서버 권위로 저장하며, API 응답·전투 리플레이·목록/상세 UI는 같은 직렬화 상태를 표시한다. 보스·장비·칭호·업적은 기존 미개척지 카탈로그에 추가하고 고정 시드 시뮬레이션으로 폭딜/균형/지속 빌드의 광폭 분포를 검증한다.

**Tech Stack:** TypeScript, Next.js App Router Route Handlers, React 19, Vitest/Testing Library, Drizzle/PostgreSQL JSON mechanic state, Tailwind surface tokens, repository image optimization/check scripts.

## Global Constraints

- 보스 ID는 `invincible_fortress`, 표시 이름은 `불괴의 성채`, 연결 풀은 `iron_legion`과 `mana_barrier`다.
- 공유 최대 HP는 `10_800_000`, 스케일 앵커는 `120`, 초기 몬스터 수치는 `hp 1250 / atk 1.9 / def 50 / magicDef 50 / spd 20 / accuracy -205 / evasionPct 8`이다.
- 방벽은 공유 HP `100%`, `75%`, `50%`, `25%`에서 순서대로 시작하고 각 시험은 정확히 `400` ATB 틱을 유지한다.
- 방벽 목표 피해는 공유 최대 HP의 `0.3%`, 즉 `32_400`이며 점수는 목표치에서 상한 처리한다.
- 경계를 넘는 한 타는 본체 HP를 경계에 고정하고 초과 피해와 같은 행동 묶음의 후속 피해를 즉시 새 방벽으로 넘긴다. 단계를 건너뛰지 않는다.
- 방벽 중 보스는 공격·스킬·회복·상태이상 행동을 하지 않는다. 플레이어 행동·MP·쿨다운은 정상 진행하고, 적 행동 시계에 묶인 적 대상 DoT는 멈춘다.
- 구간 등급은 `>=100% → 0`, `>=75% → 1`, `>=50% → 2`, `>=25% → 3`, `<25% → 4`이며 광폭은 누적이 아니라 현재 구간 등급으로 교체한다.
- 광폭 배율은 0단계 `ATK×1.00/SPD×1.00`, 1단계 `×1.08/×1.04`, 2단계 `×1.16/×1.08`, 3단계 `×1.28/×1.12`, 4단계 `×1.40/×1.16`이다.
- 광폭은 공격력과 행동 속도만 바꾼다. 방어·마법 방어·회피·관통·상태이상은 바꾸지 않는다.
- 소환 비용은 각 연결 풀 흔적 `500`, 각 풀 재료 `10`, 보스 소환서 `30`, 골드 `5_000_000`인 기존 계약을 그대로 사용한다.
- 보상은 우두머리 핵 1개 보장, `마철 수호완갑` 30%, `봉인 결계환` 10%, `불괴의 성채갑` 0.5% 독립 확률이다. 30%/10% 장비만 기존 핵 8/25 제작식에 포함하고 0.5% 장비는 드롭 전용이며 천장·연민 시스템을 추가하지 않는다.
- 장면 배경 위 UI는 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한 불투명 표면으로 만들고 컨테이너 전체 opacity를 사용하지 않는다.
- 새 이미지는 코드 ID와 일치하는 WebP 경로를 사용하고 `optimize-images`, `check-images`, `check-asset-rights` 검증을 통과한다.
- 구현·검증·커밋은 격리 워크트리에서 수행한다. 운영 환경이나 `main`에는 배포하지 않고, 승인된 배포 범위는 테스트 서버뿐이다.

---

## File Map

- `src/adventure/v2/combat/invincibleFortressMechanic.ts`: 방벽 상태 정규화, 경계 계산, 피해 분배, 시간 경과, 광폭 등급/표시를 담당하는 순수 함수.
- `src/adventure/v2/combat/invincibleFortressMechanic.test.ts`: 순수 상태 전이와 손상된 저장 상태 복구의 단위 테스트.
- `src/adventure/v2/combat/engineState.ts`: 보스 기믹 context/state union에 불괴의 성채 타입 추가.
- `src/adventure/v2/combat/engine.atb.ts`: 방벽 시작·플레이어 피해 정산·400틱 만료·보스 행동 생략·리플레이 자원 스냅샷 통합.
- `src/adventure/v2/combat/invincibleFortressAtb.test.ts`: 실제 ATB 전투에서 방벽, 초과 피해, DoT 정지, 구간 광폭을 검증.
- `src/adventure/data/v2/unexploredBosses.ts`: 소환석, 보스, 보상 드롭, 수치, 특성 정의.
- `src/adventure/data/v2/unexploredBosses.test.ts`: 네 번째 보스와 자동 제작식 계약 검증.
- `src/adventure/data/v2/v2EquipmentCatalog.ts`: 신규 장갑·반지·갑옷 카탈로그.
- `src/adventure/data/v2/v2Equipment.test.ts`: 장비 슬롯·16티어·옵션·이미지 경로 검증.
- `src/adventure/data/titles.ts`: `v2_unexplored_invincible_fortress` 칭호.
- `src/adventure/data/v2/unexploredState.ts`: `defeat_invincible_fortress` 저장 가능 업적 ID.
- `src/adventure/data/v2/unexploredProgression.ts`: 보스별 업적 매핑과 4종 정복 문구.
- `src/adventure/data/v2/unexploredProgression.test.ts`: 신규 업적과 기존 정복 업적 보존/신규 획득 조건 검증.
- `src/adventure/data/v2/coopBosses.ts`: 불괴의 성채 세션 mechanic state 파싱·병합과 전투 몬스터 광폭 교체 적용.
- `src/adventure/data/v2/coopBosses.test.ts`: JSON 정규화·state merge·구간 광폭 수치 검증.
- `src/app/api/v2/coop/summon/route.ts`: 신규 개인 보스 세션의 100% 방벽 초기 상태 저장.
- `src/app/api/v2/coop/summon/route.test.ts`: 소환 시 mechanic state 초기화 검증.
- `src/app/api/v2/coop/attack/route.ts`: 저장 상태를 전투에 주입하고 결과를 잠금 트랜잭션에서 HP와 함께 저장.
- `src/app/api/v2/coop/attack/route.test.ts`: 기믹 주입·응답·원자적 병합 회귀 테스트.
- `src/app/api/v2/coop/[sessionId]/route.ts`: 상세 세션에 방벽/광폭 표시 상태 노출.
- `src/app/api/v2/coop/[sessionId]/route.test.ts`: 상세 응답 직렬화 검증.
- `src/app/api/v2/coop/route.ts`: 목록 세션에 방벽/광폭 표시 상태 노출.
- `src/app/api/v2/coop/route.test.ts`: 목록 응답 직렬화 검증.
- `src/adventure/v2/coop/useCoopBossState.ts`: 서버 응답과 공격 결과의 불괴의 성채 필드 타입/매핑.
- `src/adventure/v2/coop/useCoopBossState.test.ts`: 기본값과 신규 필드 매핑 검증.
- `src/adventure/v2/coop/InvincibleFortressStatus.tsx`: 목록·상세에서 재사용하는 불투명 방벽/광폭 상태 카드.
- `src/adventure/v2/coop/InvincibleFortressStatus.test.tsx`: 방벽 진행, 예상 광폭, 일반 구간 배율 렌더 테스트.
- `src/adventure/v2/coop/V2CoopBossListView.tsx`: 개인 보스 목록 카드에 상태 컴포넌트 배치.
- `src/adventure/v2/coop/V2CoopBossListView.test.tsx`: 목록 통합 렌더 테스트.
- `src/adventure/v2/coop/V2CoopBossDetailView.tsx`: 상세 체력 아래 상태 컴포넌트 배치, 기존 누적 발악 트래커 제외.
- `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`: 상세 통합 렌더/공격 후 상태 테스트.
- `src/adventure/battle/BattleLogList.tsx`: 리플레이 자원 키의 한글 라벨 추가.
- `src/adventure/battle/BattleLogList.test.tsx`: 방벽 자원 칩 렌더 테스트.
- `scripts/sim-v2-coop-boss.ts`: 광폭 등급 통계를 고정 시드 보고서에 추가.
- `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`: 폭딜/균형/지속 빌드의 중앙 광폭 구간과 생존 안전성 고정.
- `public/images/monster/v2/unexplored-boss-invincible-fortress.webp`: 보스 이미지.
- `public/images/equipment/unexplored-magisteel-guard-gauntlets.webp`: 장갑 이미지.
- `public/images/equipment/unexplored-sealing-barrier-ring.webp`: 반지 이미지.
- `public/images/equipment/unexplored-invincible-fortress-armor.webp`: 갑옷 이미지.

---

### Task 1: 방벽 상태 전이 순수 모듈

**Files:**
- Create: `src/adventure/v2/combat/invincibleFortressMechanic.ts`
- Create: `src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

**Interfaces:**
- Consumes: 공유 최대 HP와 저장된 `unknown` mechanic state.
- Produces: `InvincibleFortressBattleState`, `initialInvincibleFortressState(maxHp)`, `normalizeInvincibleFortressState(raw, maxHp, currentHp)`, `invincibleFortressTierForDamage(damage, maxHp)`, `settleInvincibleFortressDamage(args)`, `advanceInvincibleFortressBarrier(args)`, `invincibleFortressEnrageMultipliers(tier)`, `invincibleFortressResourceSnapshot(state, maxHp)`.

- [ ] **Step 1: 상태·등급·경계에 대한 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  INVINCIBLE_FORTRESS_BARRIER_TICKS,
  initialInvincibleFortressState,
  invincibleFortressTierForDamage,
  normalizeInvincibleFortressState,
  settleInvincibleFortressDamage,
} from "./invincibleFortressMechanic";

const MAX_HP = 10_800_000;

it("starts the 100% barrier for 400 ticks", () => {
  expect(initialInvincibleFortressState(MAX_HP)).toMatchObject({
    kind: "invincible_fortress",
    completedBarrierCount: 0,
    activeBarrierIndex: 0,
    barrierTicksRemaining: INVINCIBLE_FORTRESS_BARRIER_TICKS,
    barrierDamage: 0,
    enrageTier: 0,
    barrierResults: [],
  });
});

it.each([[32_400, 0], [24_300, 1], [16_200, 2], [8_100, 3], [8_099, 4]])(
  "grades %i barrier damage as tier %i",
  (damage, tier) => expect(invincibleFortressTierForDamage(damage, MAX_HP)).toBe(tier),
);

it("clamps body HP at 75% and sends overflow into the next barrier", () => {
  const state = { ...initialInvincibleFortressState(MAX_HP), activeBarrierIndex: null, completedBarrierCount: 1 as const, enrageTier: 3 as const };
  const result = settleInvincibleFortressDamage({ state, currentHp: 8_200_000, incomingDamage: 250_000, maxHp: MAX_HP });
  expect(result).toMatchObject({ bodyHp: 8_100_000, bodyDamage: 100_000, barrierDamageApplied: 32_400 });
  expect(result.state).toMatchObject({ activeBarrierIndex: 1, barrierDamage: 32_400, enrageTier: 0 });
});
```

- [ ] **Step 2: 단위 테스트가 정의 누락으로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

Expected: FAIL because `invincibleFortressMechanic.ts` does not exist.

- [ ] **Step 3: 상수·타입·순수 전이 함수 구현**

```ts
export const INVINCIBLE_FORTRESS_BARRIER_TICKS = 400;
export const INVINCIBLE_FORTRESS_TARGET_FRACTION = 0.003;
export const INVINCIBLE_FORTRESS_HP_FRACTIONS = [1, 0.75, 0.5, 0.25] as const;
export type InvincibleFortressEnrageTier = 0 | 1 | 2 | 3 | 4;
export type InvincibleFortressBarrierIndex = 0 | 1 | 2 | 3;
export type InvincibleFortressBattleState = {
  kind: "invincible_fortress";
  completedBarrierCount: 0 | 1 | 2 | 3 | 4;
  activeBarrierIndex: InvincibleFortressBarrierIndex | null;
  barrierTicksRemaining: number;
  barrierDamage: number;
  enrageTier: InvincibleFortressEnrageTier;
  barrierResults: readonly InvincibleFortressEnrageTier[];
};

export const INVINCIBLE_FORTRESS_ENRAGE = [
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.08, spdMult: 1.04 },
  { atkMult: 1.16, spdMult: 1.08 },
  { atkMult: 1.28, spdMult: 1.12 },
  { atkMult: 1.4, spdMult: 1.16 },
] as const;
```

Implement damage settlement with these invariants: active barrier absorbs and scores all incoming damage without reducing body HP; inactive body damage stops at only the next uncompleted threshold; overflow starts that barrier and is scored immediately; `barrierDamage` is clamped to `Math.floor(maxHp * 0.003)`; zero/negative/non-finite values become zero.

- [ ] **Step 4: 만료·손상 상태 정규화 테스트 추가**

```ts
it("finishes exactly at zero ticks and replaces the enrage tier", () => {
  const initial = { ...initialInvincibleFortressState(MAX_HP), barrierDamage: 20_000 };
  const result = advanceInvincibleFortressBarrier({ state: initial, elapsedTicks: 400, maxHp: MAX_HP });
  expect(result.state).toMatchObject({ activeBarrierIndex: null, completedBarrierCount: 1, enrageTier: 2, barrierResults: [2] });
});

it("normalizes corrupt state without skipping the HP-implied stage", () => {
  expect(normalizeInvincibleFortressState({ completedBarrierCount: 99, activeBarrierIndex: 3, barrierDamage: -1 }, MAX_HP, MAX_HP)).toEqual(initialInvincibleFortressState(MAX_HP));
});
```

- [ ] **Step 5: 만료·정규화·UI 스냅샷 구현 후 테스트 통과**

`invincibleFortressResourceSnapshot`은 방벽 중 다음 값을 반환한다.

```ts
{
  fortressTrial: `${400 - state.barrierTicksRemaining} / 400틱`,
  fortressDamage: `${state.barrierDamage.toLocaleString("ko-KR")} / ${target.toLocaleString("ko-KR")}`,
  fortressEnrage: tierLabel(invincibleFortressTierForDamage(state.barrierDamage, maxHp)),
}
```

일반 구간에서는 `fortressEnrage: "2단계 · 공격 +16% · 속도 +8%"` 형식만 반환한다.

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

Expected: PASS.

- [ ] **Step 6: 순수 모듈 커밋**

```bash
git add src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts
git commit -m "feat: add invincible fortress state machine"
```

---

### Task 2: 보스·장비·칭호·업적 카탈로그

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify: `src/adventure/data/v2/unexploredState.ts`
- Modify: `src/adventure/data/v2/unexploredState.test.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.test.ts`

**Interfaces:**
- Consumes: 기존 `UnexploredBossDefinition`, `V2EquipmentDefinition`, 업적 저장 파서.
- Produces: `UnexploredBossId`/`CoopBossKindId`에 포함되는 `invincible_fortress`, 신규 장비 ID 3개, 신규 칭호와 업적.

- [ ] **Step 1: 보스·제작식 계약 실패 테스트 작성**

```ts
it("defines the invincible fortress and only crafts its 30% and 10% drops", () => {
  const boss = UNEXPLORED_BOSSES.invincible_fortress;
  expect(boss.pools).toEqual(["iron_legion", "mana_barrier"]);
  expect(boss.sharedMaxHp).toBe(10_800_000);
  expect(boss.monster).toMatchObject({ hp: 1250, atk: 1.9, def: 50, magicDef: 50, spd: 20, accuracy: -205, evasionPct: 8 });
  expect(boss.uniqueDrops.map((drop) => drop.chancePct)).toEqual([30, 10, 0.5]);
  expect(UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES.filter((recipe) => recipe.bossId === boss.id).map((recipe) => [recipe.equipmentId, recipe.bossCoreCost])).toEqual([
    ["v2_unexplored_magisteel_guard_gauntlets", 8],
    ["v2_unexplored_sealing_barrier_ring", 25],
  ]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/unexploredProgression.test.ts`

Expected: FAIL because new IDs are absent.

- [ ] **Step 3: 소환석·보스 정의 추가**

Add `v2_unexplored_invincible_fortress_summon_stone` to `UNEXPLORED_SUMMON_STONE_MATERIALS`, extend `UnexploredBossDefinition["id"]`, and add this catalog entry:

```ts
invincible_fortress: {
  id: "invincible_fortress",
  name: "불괴의 성채",
  pools: ["iron_legion", "mana_barrier"],
  summonMaterialId: "v2_unexplored_invincible_fortress_summon_stone",
  uniqueDrops: [
    { equipmentId: "v2_unexplored_magisteel_guard_gauntlets", equipmentName: "마철 수호완갑", chancePct: 30 },
    { equipmentId: "v2_unexplored_sealing_barrier_ring", equipmentName: "봉인 결계환", chancePct: 10 },
    { equipmentId: "v2_unexplored_invincible_fortress_armor", equipmentName: "불괴의 성채갑", chancePct: 0.5 },
  ],
  titleId: "v2_unexplored_invincible_fortress",
  sharedMaxHp: 10_800_000,
  anchorDepth: 120,
  monster: {
    name: "불괴의 성채", tags: ["golem"],
    image: "/images/monster/v2/unexplored-boss-invincible-fortress.webp",
    hp: 1_250, atk: 1.9, def: 50, magicDef: 50, spd: 20,
    accuracy: -205, evasionPct: 8, exp: 0,
    armorVulnerable: 0.35, playerDefVulnerable: 0.35,
    dropQualityBias: 4, v2MaxMp: 0,
  },
  traits: ["네 번의 400틱 방벽 시험", "방벽 피해가 높을수록 다음 광폭 약화", "방벽 중 행동 정지"],
},
```

- [ ] **Step 4: 16티어 장비 3종과 장비 테스트 추가**

Use the same object shape as adjacent unexplored boss uniques and these exact stats:

```ts
v2_unexplored_magisteel_guard_gauntlets: {
  id: "v2_unexplored_magisteel_guard_gauntlets", slot: "gloves", concept: "heavy", tier: 16,
  name: "마철 수호완갑", description: "철갑 군단의 장갑판과 마력 방벽 결정을 겹쳐 양쪽 충격을 받아 내는 완갑.",
  image: "/images/equipment/unexplored-magisteel-guard-gauntlets.webp",
  power: 87, weight: 0,
  options: { hp: 450, def: 70, magicDef: 70, critResist: 8 },
  rarity: "unique", noDrop: true,
},
v2_unexplored_sealing_barrier_ring: {
  id: "v2_unexplored_sealing_barrier_ring", slot: "ring", concept: "mana", tier: 16,
  name: "봉인 결계환", description: "성채의 결계식을 작은 고리에 봉인해 생명과 마력을 함께 지키는 반지.",
  image: "/images/equipment/unexplored-sealing-barrier-ring.webp",
  power: 137, weight: 0,
  options: { hp: 380, mp: 280, def: 45, magicDef: 75, statusDamageReductionPct: 12 },
  rarity: "unique", noDrop: true,
},
v2_unexplored_invincible_fortress_armor: {
  id: "v2_unexplored_invincible_fortress_armor", slot: "armor", concept: "heavy", tier: 16,
  name: "불괴의 성채갑", description: "무너진 성채의 핵심 장갑과 결계로 빚어 물리와 마법 충격을 함께 봉쇄하는 중갑.",
  image: "/images/equipment/unexplored-invincible-fortress-armor.webp",
  power: 288, weight: 0,
  options: { hp: 1_400, def: 150, magicDef: 150, critResist: 15, statusDamageReductionPct: 20 },
  rarity: "unique", noDrop: true,
},
```

Assert all three omit `setTags` and `signature`. The starting `power` values follow adjacent tier-16 slot baselines; Task 7 may lower them if the repository's derived-budget test shows that the stated drop tier dominates adjacent personal-boss uniques.

- [ ] **Step 5: 칭호와 업적 마이그레이션 호환 테스트 작성**

```ts
it("grants the new boss achievement and requires all four for new conquest grants", () => {
  expect(unexploredAchievementCandidates({ defeatedBossIds: ["invincible_fortress"] })).toContain("defeat_invincible_fortress");
  expect(unexploredAchievementCandidates({ defeatedBossIds: ["tracking_weapon", "toxic_blood_lord", "glacial_colossus"] })).not.toContain("defeat_all_personal_bosses");
  expect(unexploredAchievementCandidates({ defeatedBossIds: UNEXPLORED_BOSS_IDS })).toContain("defeat_all_personal_bosses");
});

it("retains a previously saved conquest achievement", () => {
  expect(parseUnexploredSave({ achievementIds: ["defeat_all_personal_bosses"] }).achievementIds).toEqual(["defeat_all_personal_bosses"]);
});
```

- [ ] **Step 6: 칭호·업적 정의 구현**

Add `defeat_invincible_fortress` to the stable achievement ID array and boss mapping. Add achievement copy `불괴의 성채 처치 / 불괴의 성채를 처치하세요.` and change the conquest description to `미개척지 개인 보스 4종을 모두 처치하세요.` Add title `v2_unexplored_invincible_fortress` with condition `미개척지 개인 보스 불괴의 성채 최초 처치`.

- [ ] **Step 7: 카탈로그 테스트 통과 및 커밋**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/unexploredState.test.ts src/adventure/data/v2/unexploredProgression.test.ts`

Expected: PASS.

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/titles.ts src/adventure/data/v2/unexploredState.ts src/adventure/data/v2/unexploredState.test.ts src/adventure/data/v2/unexploredProgression.ts src/adventure/data/v2/unexploredProgression.test.ts
git commit -m "feat: register invincible fortress rewards"
```

---

### Task 3: ATB 전투 엔진 통합

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Create: `src/adventure/v2/combat/invincibleFortressAtb.test.ts`

**Interfaces:**
- Consumes: Task 1의 `InvincibleFortressBattleState`, 피해 정산·시간 경과·배율·스냅샷 함수.
- Produces: `BossMechanicContext`와 `BossMechanicBattleState`의 `invincible_fortress` variant, 모든 ATB 공격 결과에 직렬화 가능한 최종 상태.

- [ ] **Step 1: 실제 ATB 실패 테스트 작성**

Build fixtures from `trackingWeaponAtb.test.ts` and assert:

```ts
it("keeps the boss idle for the opening 400 ticks while the player acts", () => {
  const result = resolveBattleAtb(player, boss, "테스터", {
    ...context,
    bossMechanic: {
      kind: "invincible_fortress",
      sharedMaxHp: 10_800_000,
      initialState: initialInvincibleFortressState(10_800_000),
    },
  });
  const openingEnemyAttacks = result.finalState.log.filter((entry) => entry.kind === "enemy_attack" && (entry.t ?? 0) < 400);
  expect(openingEnemyAttacks).toHaveLength(0);
  expect(result.finalState.log.some((entry) => entry.text.includes("방벽 시험 시작"))).toBe(true);
});

it("moves threshold overflow and same-tick follow-up damage into the barrier", () => {
  const result = runFortressFixture({ initialEnemyHp: 8_100_100, forcedMultiHitDamage: [200, 300] });
  expect(result.finalState.enemyHp).toBe(8_100_000);
  expect(result.finalState.bossMechanic).toMatchObject({ activeBarrierIndex: 1, barrierDamage: 400 });
});

it("does not tick enemy-target dots while the barrier suppresses enemy actions", () => {
  const result = runFortressFixture({ enemyDot: makeBleedDot({ stacks: 1, turns: 2, sourceAtk: 100 }) });
  expect(result.snapshotAtTick399.enemyV2Dots[0]?.turns).toBe(2);
});
```

- [ ] **Step 2: ATB 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressAtb.test.ts`

Expected: FAIL because the context variant and integration are absent.

- [ ] **Step 3: 엔진 타입과 초기 상태 주입 구현**

```ts
export type BossMechanicContext =
  | { kind: "tracking_weapon"; initialThreat: number }
  | { kind: "toxic_blood_lord" }
  | { kind: "glacial_colossus" }
  | {
      kind: "invincible_fortress";
      sharedMaxHp: number;
      initialState: InvincibleFortressBattleState;
    };

export type BossMechanicBattleState =
  | TrackingWeaponBattleState
  | ToxicBloodBattleState
  | GlacialColossusBattleState
  | InvincibleFortressBattleState;
```

In `resolveBattleAtb`, normalize the supplied state against `ctx.bossMechanic.sharedMaxHp` and `initialEnemyHp`. Never derive thresholds or the 32,400 target from `enemy.hp`: `coopBossForBattle` intentionally replaces that field with the attempt's starting residual HP. Stamp an opening info log for an active trial.

- [ ] **Step 4: 플레이어 행동 피해를 방벽 상태로 재정산**

Wrap each player-owned damage-producing engine call—`applyPlayerV2SkillCast` and each `applyPlayerAttack`/bonus-attack call—with `settleFortressAfterPlayerDamage(beforeState, afterState)`. The wrapper computes the attempted damage from the structured HP delta, calls `settleInvincibleFortressDamage`, restores/clamps body HP, replaces `bossMechanic`, and clears a premature `phase: "ended"`/`outcome: "win"` when a boundary or active barrier absorbed the apparent killing damage. Calling the wrapper after every hit means the next hit in the same ATB tick sees the newly active barrier.

Do not parse damage text. At the final 25% boundary, a single hit can be HP-clamped by the underlying engine, but the remaining structured delta is still far above the 32,400 score cap; scoring therefore remains exact at its only observable upper bound. In `tickEnemyDotsOnAction`, pass `eTick.totalDmg` through the same settlement before the normal death branch so a DoT crossing a body boundary opens the next barrier and only its overflow is scored.

- [ ] **Step 5: 방벽 시계와 적 행동 생략 구현**

Before choosing the next actor, if an active barrier exists, advance it by `nextTick - lastTick`. If it expires before the scheduled actor, move the timeline to the exact expiry tick, finalize the tier, append completion/tier logs and an HP/resource snapshot, then continue actor selection. While a barrier remains active, never enter `tickEnemyDotsOnAction`, `tickEnemyBundleEntry`, enemy skill/basic attack, healing, status application, or enemy debuff-duration consumption; move `enemyNextTick` to at least the barrier expiry tick and keep scheduling player actions normally.

- [ ] **Step 6: 구간 광폭을 실제 공격력·행동 간격에 적용**

Use `invincibleFortressEnrageMultipliers(state.enrageTier)` in the two points that matter:

```ts
const fortressAtk = Math.round(baseEnemyAtk * multipliers.atkMult);
const fortressInterval = actionInterval(Math.round(baseEnemySpd * multipliers.spdMult));
```

Do not mutate DEF, magic DEF, evasion, skill, armor pierce, or status fields. Ensure a newly finalized tier changes the next enemy interval and replaces the previous tier.

- [ ] **Step 7: HP 바 리플레이 자원과 로그 추가**

Merge `invincibleFortressResourceSnapshot` into `enemySignatureResources`. Logs must contain `방벽 시험 시작`, `방벽 누적 피해`, `방벽 시험 종료`, and the chosen `광폭 N단계` with tick stamps. Add `fortressTrial`, `fortressDamage`, `fortressEnrage` labels to `SIGNATURE_RESOURCE_LABELS` in `BattleLogList.tsx` and a focused render assertion in `BattleLogList.test.tsx`.

- [ ] **Step 8: ATB 회귀 테스트 통과 및 커밋**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/combat/combatAtb.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

```bash
git add src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: integrate fortress barriers into atb combat"
```

---

### Task 4: 세션 mechanic state와 공격 API 원자성

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/app/api/v2/coop/summon/route.ts`
- Modify: `src/app/api/v2/coop/summon/route.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`

**Interfaces:**
- Consumes: Task 1/3 state types, `parseCoopMechanicState`, `withCoopBossMp`, `coopBossForBattle`.
- Produces: `fortress?: InvincibleFortressBattleState` in `CoopMechanicState`, `withCoopInvincibleFortressState`, battle context injection, locked update preserving boss MP and other mechanic keys.

- [ ] **Step 1: JSON 정규화·병합 실패 테스트 작성**

```ts
it("normalizes and merges fortress state without dropping boss MP", () => {
  const merged = withCoopInvincibleFortressState(
    UNEXPLORED_BOSSES.invincible_fortress,
    { bossMp: 7, unknownKey: true },
    { ...initialInvincibleFortressState(10_800_000), barrierDamage: 1_000 },
    10_800_000,
  );
  expect(merged).toMatchObject({ bossMp: 7, fortress: { activeBarrierIndex: 0, barrierDamage: 1_000 } });
  expect(merged).not.toHaveProperty("unknownKey");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/summon/route.test.ts src/app/api/v2/coop/attack/route.test.ts`

Expected: FAIL because fortress mechanic state is absent.

- [ ] **Step 3: 파서·병합·전투 몬스터 구현**

Extend `CoopMechanicState` with `fortress?: InvincibleFortressBattleState`. Parse only known finite fields through `normalizeInvincibleFortressState`. Add:

```ts
export function withCoopInvincibleFortressState(
  kind: CoopBossKind,
  stateRaw: unknown,
  fortress: InvincibleFortressBattleState,
  currentHp: number,
): CoopMechanicState;
```

Add `coopInvincibleFortressState(kind, stateRaw, currentHp)`. When `fortress` is missing from a legacy session, it marks HP thresholds strictly above `currentHp / sharedMaxHp` as completed with no results and tier 0, then activates only the next threshold when body HP reaches it; it never retroactively awards an enrage. Add cases for missing state at 90%, 60%, 40%, and 20% HP.

Extend `coopBossForBattle` options with `fortressEnrageTier?: InvincibleFortressEnrageTier`. For `invincible_fortress`, apply that phase-local attack/speed multiplier once. It must not use the cumulative `enrageStages` path.

- [ ] **Step 4: 소환 시 100% 방벽 저장 테스트와 구현**

In the summon route test, inspect the inserted session and assert:

```ts
expect(inserted.mechanicState).toEqual({
  fortress: initialInvincibleFortressState(UNEXPLORED_BOSSES.invincible_fortress.sharedMaxHp),
});
```

Initialize only the new boss this way; existing summons preserve their current initial mechanic state.

- [ ] **Step 5: 공격 route 주입·잠금 저장 테스트 작성**

Mock `resolveBattle` to return a changed fortress state, then assert `bossMechanic` input has `kind: "invincible_fortress"`, the response exposes the changed tier/results, and the update under `FOR UPDATE` writes one merged `mechanicState` containing both the current boss MP and fortress state.

Add two transaction regressions: a cooldown/expiry rejection performs no session update, and a forced update exception rolls back both `hp` and `mechanicState`. On a committed defeat or expiry, assert the route writes the terminal HP/status and omits `fortress` from the stored mechanic object.

- [ ] **Step 6: 공격 route 구현**

Build the new context branch beside tracking/toxic/glacial:

```ts
const bossMechanic = kind.id === "invincible_fortress"
  ? {
      kind: "invincible_fortress" as const,
      sharedMaxHp: kind.sharedMaxHp,
      initialState: coopInvincibleFortressState(kind, sessionPeek.mechanicState, bossStartHp),
    }
  : existingMechanic;
```

After combat, extract the final fortress state by discriminated union. Inside the existing row lock, re-read/parse current mechanic state, merge MP, then merge fortress and update `hp` plus `mechanicState` in the same database update. Derive `damageDealt` from the route’s authoritative HP transition, not barrier-scored damage.

- [ ] **Step 7: API 테스트 통과 및 커밋**

Run: `npx vitest run src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/summon/route.test.ts src/app/api/v2/coop/attack/route.test.ts`

Expected: PASS.

```bash
git add src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/summon/route.ts src/app/api/v2/coop/summon/route.test.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts
git commit -m "feat: persist fortress barrier sessions"
```

---

### Task 5: 목록·상세 API와 클라이언트 상태 표시

**Files:**
- Modify: `src/app/api/v2/coop/route.ts`
- Modify: `src/app/api/v2/coop/route.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.test.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.test.ts`
- Create: `src/adventure/v2/coop/InvincibleFortressStatus.tsx`
- Create: `src/adventure/v2/coop/InvincibleFortressStatus.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`

**Interfaces:**
- Consumes: serialized fortress state and Task 1 display helpers.
- Produces: `CoopFortressStatus` fields on session/attack result and reusable opaque status card.

```ts
export type CoopFortressStatus = {
  active: boolean;
  ticksRemaining: number;
  damage: number;
  target: number;
  enrageTier: InvincibleFortressEnrageTier;
  projectedEnrageTier: InvincibleFortressEnrageTier;
  completedBarrierCount: number;
  nextBarrierHpFraction: 0.75 | 0.5 | 0.25 | null;
  lastResultTier: InvincibleFortressEnrageTier | null;
};

export function InvincibleFortressStatus(props: {
  status: CoopFortressStatus;
}): React.ReactElement;
```

- [ ] **Step 1: route 응답 실패 테스트 작성**

For list and detail fixtures with an active barrier, assert the response includes:

```ts
{
  fortressBarrierActive: true,
  fortressBarrierTicksRemaining: 240,
  fortressBarrierDamage: 18_200,
  fortressBarrierTarget: 32_400,
  fortressEnrageTier: 2,
  fortressProjectedEnrageTier: 1,
  fortressCompletedBarrierCount: 1,
  fortressNextBarrierHpFraction: 0.5,
  fortressLastResultTier: 2,
}
```

- [ ] **Step 2: route 테스트 실패 확인**

Run: `npx vitest run src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts`

Expected: FAIL because the response mapper omits fortress fields.

- [ ] **Step 3: 공용 서버 표시 mapper와 route 응답 구현**

Add a pure `coopInvincibleFortressDisplay(kind, stateRaw, currentHp)` helper in `coopBosses.ts`, returning zero/default fields for other bosses. Use it in list, detail, and attack response construction so the three APIs cannot drift.

- [ ] **Step 4: 클라이언트 타입·매핑 테스트와 구현**

Add the nine fields above to `CoopSessionSummary` and the relevant result fields plus `fortressCompletedResults` to `CoopAttackResult`. In response normalizers, clamp ticks/damage/tier with Task 1 helpers and default missing legacy payloads to inactive/tier 0.

Run: `npx vitest run src/adventure/v2/coop/useCoopBossState.test.ts`

Expected: PASS after implementation.

- [ ] **Step 5: 상태 카드 실패 테스트 작성**

```tsx
render(<InvincibleFortressStatus status={{
  active: true, ticksRemaining: 160, damage: 18_200, target: 32_400,
  enrageTier: 2, projectedEnrageTier: 1, completedBarrierCount: 1,
}} />);
expect(screen.getByText("방벽 시험 240 / 400틱")).toBeInTheDocument();
expect(screen.getByText("누적 피해 18,200 / 32,400")).toBeInTheDocument();
expect(screen.getByText("예상 광폭: 약함")).toBeInTheDocument();
```

Also render inactive tier 3 and assert `현재 광폭: 강함 (3단계)`, `공격 +28%`, `속도 +12%`.

- [ ] **Step 6: 불투명 상태 카드 구현**

Use `SURFACE_INSET` for the outer container, semantic text/border colors for status, and an opaque progress track. Do not add alpha background utility classes. Include `방벽 2/4` progress and explain that higher damage weakens the next enrage.

- [ ] **Step 7: 목록·상세 통합 및 기존 발악 UI 분리**

Render `InvincibleFortressStatus` only for `invincible_fortress`. In detail view, do not render the generic cumulative `enrageStages` tracker for this boss because its tier is phase-local. Add list/detail tests for active and normal states, including the attack-result update.

- [ ] **Step 8: UI/API 테스트 통과 및 커밋**

Run: `npx vitest run src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/useCoopBossState.test.ts src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`

Expected: PASS.

```bash
git add src/app/api/v2/coop/route.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/useCoopBossState.ts src/adventure/v2/coop/useCoopBossState.test.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx
git commit -m "feat: show fortress barrier status"
```

---

### Task 6: 보상·소환·업적 API 회귀 범위

**Files:**
- Modify: `src/app/api/v2/unexplored/craft/route.test.ts`
- Modify: `src/app/api/v2/coop/claim/route.test.ts`
- Modify: `src/app/api/v2/unexplored/route.test.ts`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: Task 2의 동적 보스 배열, 제작식, 드롭, 업적 정의.
- Produces: 네 번째 보스가 기존 자동 파이프라인에서 정확한 비용·보상·UI를 갖는 회귀 증거.

- [ ] **Step 1: 신규 보스 파이프라인 테스트 작성**

Assert summon-stone crafting consumes both pool traces/materials and the unchanged scroll/gold constants; personal-boss claim always grants one core, independently rolls all three new IDs, grants the new title and boss achievement; unexplored snapshot/tree exposes the new summon card when both pools are active.

Use deterministic random values `0.29`, `0.09`, and `0.004` in the claim test to prove the 30/10/0.5% boundaries, plus `0.31` to prove no unique drop. Assert no field representing pity count or guaranteed-drop progress appears.

- [ ] **Step 2: 테스트 실행과 필요한 최소 매핑 보정**

Run: `npx vitest run src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/unexplored/route.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: PASS after explicitly extending every three-boss expectation in these four test files to include `invincible_fortress`; production routes continue to derive the new entry from `UNEXPLORED_BOSS_IDS` and `UNEXPLORED_BOSSES` rather than adding a parallel hard-coded list.

- [ ] **Step 3: 회귀 테스트 커밋**

```bash
git add src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/unexplored/route.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "test: cover invincible fortress progression"
```

---

### Task 7: 고정 시드 밸런스 시뮬레이션

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Create: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`

**Interfaces:**
- Consumes: 실제 `resolveBattleAtb`, 라이브 대표 빌드 fixture, 최종 `InvincibleFortressBattleState`.
- Produces: 빌드별 barrier result 중앙값, 기여도·생존 틱, 최대 광폭 첫 일반타 안전성 보고서.

- [ ] **Step 1: 시뮬레이션 결과 필드 실패 테스트 작성**

Extend the report type with:

```ts
medianFortressEnrageTier: number;
medianFortressBarrierDamageRatio: number;
maxFortressFirstNormalHitRatio: number;
```

Add a test using fixed seed `20260901`, enough deterministic trials for stable medians, and these acceptance bands:

```ts
expect(burst.medianFortressEnrageTier).toBeGreaterThanOrEqual(0);
expect(burst.medianFortressEnrageTier).toBeLessThanOrEqual(1);
expect(balanced.medianFortressEnrageTier).toBeGreaterThanOrEqual(1);
expect(balanced.medianFortressEnrageTier).toBeLessThanOrEqual(3);
expect(sustain.medianFortressEnrageTier).toBeGreaterThanOrEqual(3);
expect(sustain.medianFortressEnrageTier).toBeLessThanOrEqual(4);
expect(maxTier.maxFortressFirstNormalHitRatio).toBeLessThan(1);
```

Classify the existing seven representative archetypes without inventing new loadouts: burst is `STR`, `DEX`, `INT`; balanced is `LUK`, `BAL`; sustain is `VIT`, `SPI`. The report still prints every archetype separately, and the assertions use the median of each named group.

- [ ] **Step 2: 시뮬레이션 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`

Expected: FAIL because fortress metrics are not emitted.

- [ ] **Step 3: 보고서 수집 구현**

Collect all completed `barrierResults`, barrier damage divided by target, and the first enemy basic hit after a tier-4 barrier divided by player max HP. Print one compact row per archetype containing tier median, target ratio, contribution, survival ticks, and first-hit ratio.

- [ ] **Step 4: 정해진 순서로만 수치 조정**

If bands fail, tune in this order and rerun after each single change: target fraction near `0.003`; base `atk`/`spd`; tier multipliers; base `def`/`magicDef`. Do not change 400 ticks, four HP thresholds, phase-local replacement, reward probabilities, or add a pity mechanism.

- [ ] **Step 5: 장비 예산 회귀 검증**

Extend the tier-16 equipment expectation table with the exact three stat blocks. Compare their derived budget to adjacent 30%, 10%, and 0.5% personal-boss uniques and assert finite values/no invalid slot or option.

- [ ] **Step 6: 시뮬레이션 통과 및 커밋**

Run: `npx vitest run src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Run: `npm run sim:coop-boss -- --boss invincible_fortress --seed 20260901`

Expected: all acceptance bands pass and report values are finite.

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/v2/combat/invincibleFortressMechanic.ts
git commit -m "test: calibrate invincible fortress combat"
```

---

### Task 8: 이미지 자산 생성과 권리 메타데이터

**Files:**
- Create: `public/images/monster/v2/unexplored-boss-invincible-fortress.webp`
- Create: `public/images/equipment/unexplored-magisteel-guard-gauntlets.webp`
- Create: `public/images/equipment/unexplored-sealing-barrier-ring.webp`
- Create: `public/images/equipment/unexplored-invincible-fortress-armor.webp`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Consumes: Task 2 catalog image paths and existing monster/equipment visual framing.
- Produces: optimized referenced WebP assets and matching generated-asset rights records.

- [ ] **Step 1: imagegen skill 지침 확인 및 자산 생성**

Generate one boss portrait and three isolated equipment icons. The boss should read as a colossal iron-magitech fortress with a luminous mana barrier, centered at the same framing/aspect ratio as adjacent unexplored boss images. Equipment icons must have transparent or clean neutral backgrounds, no text, no watermark, and distinct silhouettes matching gauntlets/ring/heavy armor.

- [ ] **Step 2: 저장·최적화 후 시각 검수**

Save outputs at the four exact catalog paths, run the existing optimizer once, and inspect the resulting WebP files for clipping, illegible silhouettes, text artifacts, and incorrect aspect ratio.

Run: `npm run optimize-images`

Expected: optimizer completes and retains four referenced WebP files.

- [ ] **Step 3: 이미지 참조·권리 검사**

Run: `npm run check-images`

Run: `npm run update-asset-rights`

Run: `npm run check-asset-rights`

After the write, add `docs/superpowers/plans/2026-09-01-unexplored-invincible-fortress.md` to the `operator-cleared-game-art.evidence` array and extend its rights-basis sentence to record four repository-specific assets generated in the operator-controlled Codex/OpenAI session on 2026-09-01. Expected: no missing reference, no orphan among the four new files, and rights validation passes.

- [ ] **Step 4: 이미지 커밋**

```bash
git add public/images/monster/v2/unexplored-boss-invincible-fortress.webp public/images/equipment/unexplored-magisteel-guard-gauntlets.webp public/images/equipment/unexplored-sealing-barrier-ring.webp public/images/equipment/unexplored-invincible-fortress-armor.webp docs/asset-rights.json
git commit -m "assets: add invincible fortress artwork"
```

---

### Task 9: 전체 검증과 테스트 서버 전달 준비

**Files:**
- Verify: all files listed in Tasks 1–8.
- Modify: only already tracked Task 1–8 files when a verification command exposes a feature-caused defect.

**Interfaces:**
- Consumes: Tasks 1–8 complete branch.
- Produces: clean commit history with passing focused tests, full tests, lint, image checks, and production-mode Next build artifact suitable for the existing test deployment workflow.

- [ ] **Step 1: 변경 범위와 금지 요소 감사**

Run: `git diff --check origin/staging...HEAD`

Run: `rg -n "pity|ceiling|천장|연민" src/adventure/data/v2/unexploredBosses.ts src/app/api/v2/coop/claim/route.ts src/adventure/v2/coop`

Expected: no whitespace errors and no newly added pity/ceiling implementation.

- [ ] **Step 2: 집중 회귀 테스트 실행**

Run: `npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/summon/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

- [ ] **Step 3: 정적·자산 검증 실행**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/engine.atb.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.ts src/app/api/v2/coop/attack/route.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx`

Run: `npm run check-images`

Run: `npm run check-asset-rights`

Expected: all commands exit 0.

- [ ] **Step 4: 전체 테스트와 Next 빌드 실행**

Run: `npm test`

Run: `NEXT_PUBLIC_V2_UNEXPLORED=true npm run build`

Expected: full Vitest suite and Next production build pass. The build’s prebuild hook also repeats image optimization/reference validation.

- [ ] **Step 5: 최종 diff·브랜치 상태 확인**

Run: `git status --short`

Run: `git log --oneline --decorate origin/staging..HEAD`

Expected: no uncommitted files and only design/plan/feature commits for 불괴의 성채.

- [ ] **Step 6: 검증 보정 커밋이 필요한 경우 생성**

```bash
git add -u
git commit -m "fix: complete invincible fortress verification"
```

Skip this commit when Step 5 is already clean. Do not merge to `main`, switch production runtime, or enable production maintenance mode. Test-server deployment begins only through the repository’s existing staging/test workflow after this local branch is fully verified.

---

### Task 10: staging 병합과 테스트 서버 전용 배포

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: clean verified feature branch and GitHub staging workflow.
- Produces: one squash commit on `staging`, successful staging CI/deploy runs, and `test.msmsge.com` serving that exact SHA. It does not touch `main`, the production deployment workflow, production maintenance mode, or the production service.

- [ ] **Step 1: 최신 staging 재기준화와 로컬 검증 보존**

Run: `git fetch origin staging`

Run: `git rebase origin/staging`

Run: `npm test`

Run: `NEXT_PUBLIC_V2_UNEXPLORED=true npm run build`

Expected: rebase completes, full tests/build still pass, and `git status --short` is empty.

- [ ] **Step 2: 기능 브랜치 푸시와 staging 대상 PR 생성**

Run: `git push -u origin feat/unexplored-invincible-fortress-20260901`

Run:

```bash
gh pr create \
  --base staging \
  --head feat/unexplored-invincible-fortress-20260901 \
  --title "feat: add invincible fortress unexplored boss" \
  --body "불괴의 성채 개인 보스, 네 구간 방벽 시험, 구간별 광폭, 세션 저장/UI/보상/업적/이미지와 고정 시드 검증을 추가합니다. 배포 대상은 staging 테스트 서버뿐입니다."
```

Expected: PR base is exactly `staging`.

- [ ] **Step 3: PR CI 확인 후 squash merge**

Run: `gh pr checks --watch`

Expected: required CI check succeeds.

Run: `gh pr merge --squash --delete-branch`

Expected: PR is merged into `staging` as one squash commit. Do not create a `staging → main` PR.

- [ ] **Step 4: staging SHA의 CI와 자동 배포 확인**

Run: `git fetch origin staging`

Run: `git rev-parse origin/staging`

Record the full 40-character result as the expected staging SHA, then run:

```bash
FORTRESS_STAGING_SHA="$(git rev-parse origin/staging)"
FORTRESS_CI_RUN_ID="$(gh run list --commit "$FORTRESS_STAGING_SHA" --workflow CI --json databaseId --jq '.[0].databaseId')"
gh run watch "$FORTRESS_CI_RUN_ID" --exit-status
FORTRESS_DEPLOY_RUN_ID="$(gh run list --commit "$FORTRESS_STAGING_SHA" --workflow deploy-staging.yml --json databaseId --jq '.[0].databaseId')"
gh run watch "$FORTRESS_DEPLOY_RUN_ID" --exit-status
```

Expected: both runs conclude `success`; the deploy workflow has environment `test.msmsge.com` and never invokes `.github/workflows/deploy.yml`.

- [ ] **Step 5: 공개 테스트 서버의 정확한 빌드 확인**

Run: `curl -fsS https://test.msmsge.com/api/health`

Expected: JSON field `ok` is `true`.

Run:

```bash
FORTRESS_STAGING_SHA="$(git rev-parse origin/staging)"
FORTRESS_DEPLOYED_SHA="$(curl -fsS https://test.msmsge.com/api/version | node -e 'let body=""; process.stdin.on("data", chunk => body += chunk); process.stdin.on("end", () => console.log(JSON.parse(body).buildId));')"
test "$FORTRESS_DEPLOYED_SHA" = "$FORTRESS_STAGING_SHA"
```

Expected: JSON field `buildId` exactly equals the recorded `origin/staging` 40-character SHA. Report that SHA and the test URL. Do not run production health/deploy/maintenance commands.
