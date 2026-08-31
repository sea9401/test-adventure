# 미개척지 본 구현 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캐릭터별 160노드 탐사망, 난이도 95~120 전용 사냥터, 12개 특화 몬스터 풀, 전용 보상·흔적 제작과 개인 보스 3종을 기존 게임 UI와 사냥·협동 보스 기반 위에 서버 권위 기능으로 구현한다.

**Architecture:** `character.v2.unexplored`를 단일 영속 원천으로 사용해 기존 사냥 트랜잭션 안에서 노드·탐사 경험치·흔적을 원자적으로 갱신한다. 순수 데이터/파서는 `src/adventure/data/v2/`에, 서버 조합 로직은 `src/lib/server/`에 두고, 기존 `/api/v2/dungeon/hunt`는 `mode: "unexplored"` 분기만 얇게 받아 공통 전투·스태미나·HP/MP 흐름을 재사용한다. 개인 보스는 기존 `coop_boss_sessions` 전투를 재사용하되 `rewardMode: "unexplored_personal"`인 보스는 공개 범위 변경과 일반 협동 보상을 차단한다. 전체 기능은 기본값이 꺼진 `NEXT_PUBLIC_V2_UNEXPLORED` 플래그 뒤에서 완성하며 이 계획에는 배포나 플래그 전환을 포함하지 않는다.

**Tech Stack:** Next.js App Router Route Handlers, React 19 client components, TypeScript, Drizzle/PostgreSQL, Vitest, 기존 ATB 전투 엔진, `saves_kv`, SVG 탐사망, Tailwind와 공용 불투명 surface 토큰.

## Resume Audit — 2026-08-29

- 최신 통합 상태와 명시적 후속 후보는 [`미개척지 작업 완료 상태`](../unexplored-completion-status.md)를 기준으로 한다.
- Task 1~14 구현 커밋과 Task 15 최종 검증 기록을 대조해 전체 계획 완료를 확인했다.
- 현재 기준 집중 회귀는 미개척지 16개 파일 102개 테스트와 사냥·협동·거래소 경계 24개 파일 87개 테스트가 모두 통과했다.
- 고정 시드 보상 시뮬레이션은 난이도별 목표 범위를 유지했고 최대 보상 구성은 179.6%였다.
- TypeScript 검사, 이미지 참조 검사, Next.js 16.2.11 프로덕션 빌드(451개 정적 페이지)가 통과했다.
- 운영 기능 플래그 전환, 운영 경제 스냅샷 조회, 배포는 이 감사에서 수행하지 않았다.

## Global Constraints

- 배포하지 않는다. `NEXT_PUBLIC_V2_UNEXPLORED` 기본값은 `false`이며 마지막 검증 뒤에도 자동으로 켜지 않는다.
- 저장소 지침에 따라 서브에이전트를 만들지 않는다. 실행은 `superpowers:executing-plans`를 사용해 현재 세션에서 순차적으로 진행한다.
- 운영 DB를 읽거나 쓰는 시뮬레이션은 사용자가 별도로 허용하지 않는 한 실행하지 않는다. 모든 자동 테스트는 고정 fixture와 고정 RNG를 사용한다.
- Next.js 페이지는 기본 Server Component로 유지하고 상호작용이 필요한 최소 컴포넌트만 `"use client"` 경계로 만든다. Route Handler는 Web `Request`/`Response` 계약을 사용한다.
- 장면 배경 위의 최상위 래퍼와 모든 카드에는 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다. 비활성 카드 전체에 `opacity-*`를 적용하지 않는다.
- 모든 노드는 1포인트다. 최대 포인트는 경험치 30 + 업적 10 = 40이며 `탐사 시작`도 1포인트를 소비한다.
- 100레벨 미만에서는 탐사망 진행도와 흔적을 보존하되 노드 변경, 미개척지 입장, 미개척지 효과 적용을 모두 막는다.
- 출시 특화 몬스터는 풀당 기본형 1종, 총 12종이다. 기존 후보 데이터의 공격형·변칙형은 확장 후보로 남기고 조우 풀과 이미지 범위에 포함하지 않는다.
- 일반 사냥은 한 판에 몬스터 1마리, 기존 스태미나 비용·HP/MP 충전·패배 세금을 그대로 사용한다. 별도 위험도나 난이도 슬라이더를 만들지 않는다.
- 락 순서는 항상 `character.v2` → `equipment.v2` → `inventory.v2` → `adventure-log.v2` → 협동 세션/기여 행 순서를 따른다. 기존 라우트의 더 엄격한 순서가 있으면 기존 순서를 우선한다.
- `character.v2`는 여러 기능이 공유하므로 항상 `{ ...charSave, unexplored: nextUnexplored }` 방식으로 알 수 없는 키를 보존한다.
- 노드 구매·환불·초기화·소환석 제작·사용은 서버가 재검증한다. 클라이언트 계산은 표시 전용이다.
- 신규 장비와 몬스터 이미지는 코드 식별자와 파일명이 일치해야 한다. PNG를 추가할 때 기존 최적화 훅이 WebP로 변환하도록 하고 `npm run check-images`를 통과한다.

---

## Phase 1 — 탐사망과 포인트 기반

### Task 1: 미개척지 기능 플래그와 저장 계약

**Files:**
- Modify: `src/adventure/data/v2/coreLoopConfig.ts`
- Create: `src/adventure/data/v2/unexploredState.ts`
- Create: `src/adventure/data/v2/unexploredState.test.ts`

- [x] **Step 1: 저장 파서와 게이트의 실패 테스트를 먼저 작성한다.**

다음을 단언한다.

- 손상된 값은 `{ explorationXp: 0, xpPoints: 0, achievementIds: [], selectedNodeIds: [], traces: {}, craftReceipts: [] }`로 정규화한다.
- 현재 레벨이 100이면 저장 전에도 첫 경험치 포인트 1개가 보이고, 획득 포인트는 `min(30, max(xpPoints, level >= 100 ? 1 : 0)) + min(10, achievementIds.length)`다.
- 레벨 99는 입장·노드 변경 불가, 레벨 100은 가능하다.
- 시작 노드가 선택되지 않았으면 사냥 입장은 불가하다.
- 재전직으로 100 미만이 되어도 선택 노드와 흔적은 파서에서 삭제되지 않는다.
- 제작 멱등 영수증은 최근 50개만 보존한다.

```ts
export type UnexploredSave = {
  explorationXp: number;
  xpPoints: number;
  achievementIds: UnexploredAchievementId[];
  selectedNodeIds: UnexploredNodeId[];
  traces: UnexploredTraceState;
  craftReceipts: Array<{
    requestId: string;
    bossId: string;
    craftedAt: number;
  }>;
};

export function canUseUnexplored(level: number, save: UnexploredSave): boolean {
  return level >= 100 && save.selectedNodeIds.includes("start");
}
```

Run: `npm test -- src/adventure/data/v2/unexploredState.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 2: 플래그와 방어적 파서를 구현한다.**

`coreLoopConfig.ts`에 다음을 추가한다.

```ts
export const V2_UNEXPLORED =
  process.env.NEXT_PUBLIC_V2_UNEXPLORED === "true";
```

파서는 알 수 없는 노드/업적 ID를 제거하고 숫자는 음이 아닌 정수로 제한한다. 흔적은 기존 `parseUnexploredTraces`를 사용해 풀당 2,500으로 제한한다. 플래그가 꺼졌을 때 기존 사냥·캐릭터 메뉴 응답은 바뀌지 않아야 한다.

- [x] **Step 3: 단위 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredState.test.ts`

Expected: PASS.

- [x] **Step 4: 기반 계약을 커밋한다.**

```bash
git add src/adventure/data/v2/coreLoopConfig.ts src/adventure/data/v2/unexploredState.ts src/adventure/data/v2/unexploredState.test.ts
git commit -m "feat: add unexplored save contract"
```

### Task 2: 160노드 정적 카탈로그와 파생 효과

**Files:**
- Create: `src/adventure/data/v2/unexploredTree.ts`
- Create: `src/adventure/data/v2/unexploredTree.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Reference: `docs/superpowers/unexplored-region-160-node-mockup.html`

- [x] **Step 1: 구조·선택 규칙·효과 합산 실패 테스트를 작성한다.**

카탈로그 타입은 다음 계약을 사용한다.

```ts
type UnexploredNodeEffect =
  | { kind: "start" }
  | { kind: "reward"; reward: "gold" | "base_material" | "equipment" | "quality" | "special_material"; pct: number }
  | { kind: "difficulty_reward"; difficulty: 1 | 2 | 3 | 4; reward: "gold" | "base" | "special" | "trace" | "rare_copy"; amount: number }
  | { kind: "pool_core"; poolId: UnexploredPoolId; requestSharePct: 20 }
  | { kind: "pool_frequency"; poolId: UnexploredPoolId; requestSharePct: 10 }
  | { kind: "pool_material"; poolId: UnexploredPoolId; pct: 20 }
  | { kind: "pool_loot"; poolId: FrontPoolId; pct: 20 }
  | { kind: "pool_trace"; poolId: BossPoolId; extraChancePct: 20 }
  | { kind: "pool_focus"; poolId: UnexploredPoolId }
  | { kind: "deep"; effect: "gold" | "collector" | "armory" | "contract" | "tracking" | "boss" };
```

테스트는 다음을 고정한다.

- 총 160개와 종류별 `1/72/21/12/48/6`.
- 모든 노드는 시작점에서 도달 가능하다.
- 첫 풀 6~8, 첫 강화 9 이상, 중간 12 이상, 심부 18 이상, 보스 24 이상.
- 앞 6풀의 세 번째 강화는 `pool_loot`, 뒤 6풀은 `pool_trace`다.
- 14개 난이도·보상 노드의 난이도 합은 35이고 효과는 최신 보상 설계 표와 정확히 같다.
- `gold/collector/armory`는 상호 배타이며 최종 난이도 120 초과 선택을 거부한다.
- 시작점을 제외한 구매 노드는 선택된 이웃이 있어야 하고, 환불 뒤 남은 활성 노드가 시작점과 모두 연결되어야 한다.
- 선택 노드 수는 획득 포인트를 넘지 않는다.

작은 노드는 경로 자체에도 작은 성장이 있도록 다음 72개를 정확히 배치한다.

| 효과 | 개수 | 노드당 값 |
| --- | ---: | ---: |
| 골드 | 18 | +0.5% |
| 일반 재료 | 18 | +1% |
| 일반 장비 | 14 | +1% |
| 장비 품질 기대확률 | 10 | +1% |
| 특화 전용 재료 | 12 | +1% |

21개 중형 노드는 최신 14개 난이도·보상 노드와 순수 이득 7개로 구성한다. 순수 이득 7개는 골드 +5%, 일반 재료 +8%, 장비 +8%, 품질 +8%, 특화 재료 +8%, 일반 재료·장비 각 +5%, 골드·특화 재료 각 +5%다.

Run: `npm test -- src/adventure/data/v2/unexploredTree.test.ts src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: FAIL.

- [x] **Step 2: 목업의 좌표와 단순화된 연결을 타입스크립트 정적 카탈로그로 옮긴다.**

런타임에 난수로 배치하지 않는다. `nodes`, `edges`, `UNEXPLORED_NODE_BY_ID`를 모듈 로드 시 결정적으로 만들고 `deriveUnexploredEffects(selectedNodeIds)`가 아래 값을 한 번에 반환하게 한다.

```ts
export type UnexploredEffects = {
  difficulty: number;
  encounterSelections: UnexploredPoolSelection[];
  baseMinShare: 25 | 30;
  rewardPct: {
    gold: number;
    baseMaterial: number;
    equipment: number;
    quality: number;
    specialMaterial: number;
    rareCopyChance: number;
  };
  traceEnabled: boolean;
  traceExtraChancePct: number;
  focusedPoolIds: UnexploredPoolId[];
  conversion: null | "gold" | "collector" | "armory";
};
```

양수·음수 보정은 원래 기대값 기준 합연산하고 최종 배율만 0 이상으로 제한한다. `위험한 계약`의 +5 난이도도 120 상한 검사에 포함한다. `집중 추적`이 있으면 `unexploredEncounterShares`에 기본 최소 25를 전달하고 없으면 30을 사용하도록 기존 고정 상수를 매개변수로 바꾼다.

- [x] **Step 3: 카탈로그와 파생 효과 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredTree.test.ts src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: PASS.

- [x] **Step 4: 카탈로그를 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredTree.ts src/adventure/data/v2/unexploredTree.test.ts src/adventure/data/v2/unexploredEncounters.ts src/adventure/data/v2/unexploredEncounters.test.ts
git commit -m "feat: define unexplored exploration network"
```

### Task 3: 탐사 경험치 30포인트와 업적 10포인트

**Files:**
- Create: `src/adventure/data/v2/unexploredProgression.ts`
- Create: `src/adventure/data/v2/unexploredProgression.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Create: `src/app/api/v2/dungeon/hunt/route.test.ts`
- Modify: `src/app/api/v2/coop/claim/route.ts`
- Create: `src/app/api/v2/coop/claim/route.test.ts`
- Modify: `src/app/api/v2/me/advance-class/route.ts`
- Create: `src/app/api/v2/me/advance-class/route.test.ts`

- [x] **Step 1: 탐사 포인트 진척 테스트를 작성한다.**

경험치 포인트는 100레벨 최초 도달 시 1점을 얻고, 이후 만렙 사냥에서 `applyExpGain(...).overflowExp`를 탐사 경험치로 보낸다. 2~30번째 포인트 비용은 선형 증가하며 30포인트 누적 비용은 현재 1→100 총 필요 경험치의 정확히 5배다. 재전직 API는 레벨을 1로 내리기 전에 `xpPoints >= 1`을 같은 `character.v2` 저장에 남겨, 탐사망을 한 번도 열지 않고 바로 재전직해도 첫 포인트를 잃지 않게 한다.

```ts
const XP_WEIGHT_TOTAL = 29 * 30 / 2;
const totalLoopXp = getLevelTable().at(-1)?.cumulative ?? 0;

export function explorationPointCost(point: number): number {
  if (point <= 1 || point > 30) return 0;
  const weight = point - 1;
  return Math.max(1, Math.round((totalLoopXp * 5 * weight) / XP_WEIGHT_TOTAL));
}
```

각 비용을 개별 반올림해 생기는 오차는 30번째 비용에서 보정해 누적 합이 정확히 `totalLoopXp * 5`가 되게 한다. 레벨 100이 아닌 사냥, 패배, 보스 공격에는 탐사 경험치를 주지 않는다. 일반 사냥과 미개척지 사냥 모두 만렙 승리 EXP가 탐사 경험치로 들어가며, XP 포인트 30에서 초과치는 버린다.

업적 10개는 다음 ID로 고정하고 `adventure-log.v2`의 서버 권위 기록에서 파생한다.

- `boss_kinds_1`, `boss_kinds_3`, `boss_kinds_6`, `boss_kinds_9`, `boss_kinds_12`: 서로 다른 협동/개인 보스 처치 종류 수.
- `first_unexplored_hunt`: 미개척지 첫 승리.
- `first_special_kill`: 특화 몬스터 첫 처치.
- `first_summon_stone_craft`: 미개척지 소환석 첫 제작.
- `activate_two_pools`: 동시에 특화 풀 2개 활성.
- `activate_three_pools`: 동시에 특화 풀 3개 활성.

업적은 조건이 한 번 충족되면 노드 환불이나 재전직 뒤에도 유지한다.

Run: `npm test -- src/adventure/data/v2/unexploredProgression.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/me/advance-class/route.test.ts`

Expected: FAIL.

- [x] **Step 2: 순수 진척 함수와 사냥 overflow 배선을 구현한다.**

일반 사냥 저장 직전에 `expResult.overflowExp`를 `grantExplorationXp`에 전달한다. 기존 `level`, `exp`, 보상 응답은 그대로 두고 `exploration` 응답 조각만 플래그가 켜진 경우 추가한다. 자동/압축 사냥은 판별 가능한 실제 승리별 overflow 합계를 같은 함수에 한 번 전달한다.

- [x] **Step 3: 업적 평가를 이벤트별로 연결한다.**

사냥은 첫 미개척지 승리와 첫 특화 처치만 기록한다. 노드 API는 2·3풀 동시 활성 업적을 기록한다. 제작 API는 첫 제작을 기록한다. 보스 수 업적은 보상 claim의 기존 `coopBossKinds` 갱신 뒤 고유 종류 수로 평가한다.

- [x] **Step 4: 진행 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredProgression.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/me/advance-class/route.test.ts`

Expected: PASS.

- [x] **Step 5: 진행도를 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredProgression.ts src/adventure/data/v2/unexploredProgression.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/coop/claim/route.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/me/advance-class/route.ts src/app/api/v2/me/advance-class/route.test.ts
git commit -m "feat: earn unexplored exploration points"
```

### Task 4: 탐사망 조회·선택·환불 API

**Files:**
- Create: `src/lib/server/unexploredService.ts`
- Create: `src/lib/server/unexploredService.test.ts`
- Create: `src/app/api/v2/unexplored/route.ts`
- Create: `src/app/api/v2/unexplored/route.test.ts`

- [x] **Step 1: Route Handler 실패 테스트를 작성한다.**

`GET`은 `level`, `eligible`, `earnedPoints`, `spentPoints`, `explorationXp`, 다음 포인트 비용, 선택 ID, 현재 난이도, 풀 비중, 보상 요약과 흔적을 반환한다. `POST` 계약은 다음 하나로 통일한다.

```ts
type UnexploredMutation =
  | { action: "activate"; nodeId: string }
  | { action: "refund"; nodeId: string }
  | { action: "reset" };
```

다음을 검증한다: 비로그인 401, 플래그 off 404, 100 미만 409, 잘못된 노드 400, 비인접 구매 409, 포인트 부족 409, 난이도 초과 409, 보상 전환 충돌 409, 연결을 끊는 환불 409, 골드 부족 409, 성공 시 원자 저장.

환불은 노드당 50,000G다. 전체 초기화는 `탐사 시작`을 남기고 반환하는 노드 수 × 50,000G를 한 번 결제한다. 시작 노드는 개별 반환할 수 없다.

Run: `npm test -- src/lib/server/unexploredService.test.ts src/app/api/v2/unexplored/route.test.ts`

Expected: FAIL.

- [x] **Step 2: 서버 서비스와 GET/POST를 구현한다.**

`POST`는 `character.v2`를 먼저 잠그고 레벨·포인트·그래프·상호 배타·난이도·골드를 전부 검증한 뒤 한 번 저장한다. 골드 차감은 기존 `spendGold`를 사용한다. 응답은 저장 후 `unexploredSnapshot`을 반환해 클라이언트가 낙관적 계산 없이 교체한다.

- [x] **Step 3: API 테스트를 통과시킨다.**

Run: `npm test -- src/lib/server/unexploredService.test.ts src/app/api/v2/unexplored/route.test.ts`

Expected: PASS.

- [x] **Step 4: API를 커밋한다.**

```bash
git add src/lib/server/unexploredService.ts src/lib/server/unexploredService.test.ts src/app/api/v2/unexplored/route.ts src/app/api/v2/unexplored/route.test.ts
git commit -m "feat: manage unexplored nodes"
```

### Task 5: 캐릭터 메뉴와 160노드 탐사망 UI

**Files:**
- Modify: `src/adventure/v2/V2CharacterMenu.tsx`
- Modify: `src/adventure/v2/V2CharacterMenu.test.tsx`
- Modify: `src/app/(game)/character/page.tsx`
- Create: `src/app/(game)/character/unexplored/page.tsx`
- Create: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Create: `src/adventure/v2/V2UnexploredTreeView.test.tsx`
- Create: `src/adventure/v2/unexploredTreeModel.ts`
- Create: `src/adventure/v2/unexploredTreeModel.test.ts`

- [x] **Step 1: 메뉴·모델·SSR 가독성 테스트를 작성한다.**

플래그 on일 때만 캐릭터 메뉴에 `미개척지` 카드와 `open-unexplored` 액션이 나타나고 `/character/unexplored`로 이동해야 한다. 탐사망은 160노드, 활성/구매 가능/잠김 상태, 현재→선택 후 난이도, 풀 2~3개 요약, 보상 전환 노드, 포인트/XP를 표시해야 한다.

렌더 문자열에 임의 `bg-*/40`, `bg-*/70`, 컨테이너 `opacity-*`가 없고 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`가 사용되는지 검사한다.

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL.

- [x] **Step 2: SVG 그래프와 우측 상세 패널을 구현한다.**

목업의 단순화된 동심원 배치와 비교 경로를 사용한다. 작은 노드는 아이콘만, 중형·풀·심부는 이름을 표시한다. 비활성 선은 낮은 대비, 선택 경로는 보라색, 실제 활성 연결은 주황색으로 구분한다. PC는 그래프+고정 상세 패널, 모바일은 그래프 아래 상세 패널로 바꾸되 페이지 가로 넘침이 없어야 한다.

선택/환불 후에는 POST 응답 스냅샷으로 전체 상태를 교체하고 실패 메시지를 시스템 토스트로 보여준다. 레벨 100 미만은 진행도 요약을 보여주되 조작 버튼을 막고 `100레벨 달성 후 다시 입장할 수 있습니다`를 표시한다.

- [x] **Step 3: UI 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: PASS.

- [x] **Step 4: 탐사망 UI를 커밋한다.**

```bash
git add src/adventure/v2/V2CharacterMenu.tsx src/adventure/v2/V2CharacterMenu.test.tsx src/app/\(game\)/character/page.tsx src/app/\(game\)/character/unexplored/page.tsx src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/unexploredTreeModel.ts src/adventure/v2/unexploredTreeModel.test.ts
git commit -m "feat: add unexplored exploration screen"
```

---

## Phase 2 — 전용 사냥터와 보상

### Task 6: 출시 몬스터 12종과 난이도 95~120 런타임 카탈로그

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Create: `src/adventure/data/v2/unexploredMonsters.ts`
- Create: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Add: `public/images/monster/v2/unexplored-*.png` (prebuild converts these to `.webp` and removes PNG originals)

- [x] **Step 1: 12종 출시 범위와 연속 난이도 테스트를 작성한다.**

각 풀은 `launchMonster` 하나와 `expansionCandidates` 둘을 가진다. `pickUnexploredMonster`는 출시 런타임에서 `launchMonster`만 반환한다. 기본 풀은 시뮬레이션에서 검증한 별의 무덤 기반 역할 5종을 독립 ID·이름·이미지로 등록한다.

난이도 95~120의 모든 정수에서 HP/ATK/DEF/MDEF/SPD가 유효하고, 100→101과 각 인접 단계가 연속 증가하며, 110부터 자원 성장 보정이 정확히 1이어야 한다. 기존 95·100·105·110·115·120 고정값은 바뀌지 않아야 한다.

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL.

- [x] **Step 2: 시뮬레이션 수치를 런타임 몬스터 팩토리로 승격한다.**

`unexploredMonsters.ts`가 `unexploredMonsterAtDifficulty({ source, poolId, focused, difficulty })`를 제공한다. 기본형 12종은 기존 후보의 첫 정의만 사용한다. 집중 강화는 숨은 공통 배율을 넣지 않고 풀별 `focusDescription`에 해당하는 기존 능력만 강화하며, 변경 전·후 몬스터를 같은 시뮬레이션 테스트에 넣어 확정 즉사나 면역이 생기지 않게 한다.

집중 강화 패치는 다음 후보값으로 시작하고 특화 시뮬레이션이 기존보다 약해지는 변경은 허용하지 않는다.

- 철갑: 물리 방어 +15%.
- 마력 방벽: 마법 방어 +15%, 상태 피해 감소 +10%p.
- 재생: HP +15%, 회복용 최대 MP ×2.
- 붉은 광전: 공격 +10%, 치명타 +10%p.
- 수정 포격: 공격 +10%, 공격 스킬용 최대 MP ×2.
- 정밀 사냥: 적중 +15, 치명타 +8%p, 관통 +5.
- 폭주 기계: 원시 속도 +10%, 추가 공격 확률 +15%p.
- 그림자 추적: 원시 속도 +10%, 회피 +10%p.
- 맹독: `poison_1`을 `poison_2`로 교체.
- 혈흔 망자: 원시 속도 +10%, 직접 공격 +10%.
- 혹한: `slow`를 `strong_slow_arcane`으로 교체.
- 파쇄 거수: 공격 +10%, 관통 +8.

`unexploredSimulationMonsters.ts`는 같은 팩토리를 호출해 라이브와 분석의 수치 이중화를 없앤다. `exp`는 보상 계산용 기준값을 넣되 일반 사냥 경험치와 동일한 방식으로 지급한다.

- [x] **Step 3: 몬스터 이미지 17개를 추가한다.**

기본 5종과 특화 12종을 기존 v2 몬스터 카드 비율에 맞춰 생성한다. 파일명은 `Monster.image`의 영문 short-name과 일치시킨다. 새로운 카테고리 폴더는 만들지 않고 `public/images/monster/v2/`를 사용한다.

- [x] **Step 4: 데이터와 이미지 검증을 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: PASS.

Run: `npm run check-images`

Expected: missing reference 0, unexplored orphan 0.

- [x] **Step 5: 몬스터 런타임을 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredMonsters.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts public/images/monster/v2
git commit -m "feat: add unexplored hunt monsters"
```

### Task 7: 드롭 분류와 미개척지 보상 해석기

**Files:**
- Modify: `src/adventure/data/v2/unexploredRewards.ts`
- Modify: `src/adventure/data/v2/unexploredRewards.test.ts`
- Create: `src/adventure/data/v2/unexploredHuntRewards.ts`
- Create: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.test.ts`

- [x] **Step 1: 고정 RNG 보상 테스트를 작성한다.**

각 드롭은 정확히 하나의 태그를 가진다.

```ts
export type UnexploredDropTag = "base" | "special" | "rare" | "trace" | "gold";
```

테스트는 기본 몬스터 주 재료 3%, 희귀 0.1%, 특화 재료 1%/집중 1.5%, 글로벌 특화 +115%에서 2.15%/3.225%, 희귀 추가 복사 20+35=55%, 흔적 추가 확률 최대 95%와 풀당 2,500 상한을 경계값 바로 아래/위 RNG로 검증한다. 개인 보스 드롭에는 이 해석기를 호출하지 않는다.

기본 풀 5종의 출시 고유 드롭은 아래처럼 각각 주 재료 1종과 희귀 재료 1종으로 고정한다. 모두 `V2_MATERIALS`에 거래 가능 재료로 등재하고 NPC 판매가는 두지 않는다.

| 기본 몬스터 | 3% 주 재료 | 0.1% 희귀 재료 |
| --- | --- | --- |
| 성해의 파수꾼 | 성해 갑각 | 성해의 핵 |
| 혜성꼬리 추적자 | 혜성 깃털 | 빛바랜 별침 |
| 적색거성의 사제 | 적색 성진 | 적색거성의 제의구 |
| 공허를 먹는 짐승 | 공허 이빨 | 압축 공허낭 |
| 죽은 별의 관측자 | 관측 렌즈 | 죽은 별의 눈 |

`황금 탐사대`, `수집가의 길`, `무구 발굴단`, `위험한 계약`, `집중 추적`, 앞 6풀 `전리품 탐색 +20%`의 합연산도 별도 표 테스트로 고정한다. 보너스로 얻은 항목에는 `source: "unexplored_node_bonus"`가 붙어야 한다.

Run: `npm test -- src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts`

Expected: FAIL.

- [x] **Step 2: 보상 계획과 실제 굴림을 분리해 구현한다.**

`buildUnexploredRewardPlan(monster, effects)`는 확률·수량·태그만 만들고 `rollUnexploredHuntRewards(plan, rng)`가 원본 굴림 뒤 추가 굴림을 수행한다. 특화 재료가 희귀해 보여도 `special` 하나만 붙여 희귀 복사와 중복 적용하지 않는다. 기본 사냥 공용 장비·골드는 기존 `rollHuntDropsRepeated` 결과를 입력으로 받아 조절하고, 미개척지 전용 굴림은 `V2_MATERIALS_ENABLED`와 무관하게 작동한다.

- [x] **Step 3: 보상 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts`

Expected: PASS.

- [x] **Step 4: 보상 해석기를 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredRewards.ts src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/unexploredHuntRewards.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts
git commit -m "feat: resolve unexplored hunt rewards"
```

### Task 8: 기존 사냥 흐름에 미개척지 모드 연결

**Files:**
- Create: `src/lib/server/unexploredHunt.ts`
- Create: `src/lib/server/unexploredHunt.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.test.ts`
- Modify: `src/adventure/v2/useDungeonHunt.ts`
- Create: `src/adventure/v2/useDungeonHunt.test.ts`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.test.tsx`

- [x] **Step 1: 서버 권위 모드 테스트를 작성한다.**

요청은 기존 body에 `mode?: "normal" | "unexplored"`만 추가한다. 미개척지 모드에서 클라이언트가 보내는 depth는 무시하고 서버가 선택 노드로 난이도를 계산한다.

다음을 단언한다: 플래그 off 404, 100 미만 409, 시작 노드 미활성 409, 서버 선택 풀 비중, 한 판 한 몬스터, 기존 스태미나 소모, 패배 시 미보상, HP/MP 충전과 손실세 유지, 승리 시 재료·흔적·탐사 XP 원자 저장, 일반/희귀 지도 사냥 결과 무변경.

Run: `npm test -- src/lib/server/unexploredHunt.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/adventure/v2/useDungeonHunt.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx`

Expected: FAIL.

- [x] **Step 2: 기존 라우트의 세 지점만 모드화한다.**

1. 적 선택: normal은 `enemiesForDepth`, unexplored는 서버가 파싱한 노드→비중→몬스터 팩토리.
2. 보상 선택: normal은 기존 `rollHuntDropsRepeated`, unexplored는 기존 공용 드롭을 입력으로 `rollUnexploredHuntRewards` 적용.
3. 저장/응답: `character.v2.unexplored`의 XP·업적·흔적과 `unexploredSummary`를 추가.

전투 해결, 스태미나, 인벤토리 충전, 장비 저장, 패배 세금 코드는 분기 밖에 둔다. 미개척지에서는 프론티어 해금, 레어맵 발견/소모, 거점 추적, 오프라인 사냥 목적지를 갱신하지 않는다.

- [x] **Step 3: 클라이언트 훅과 전투 화면을 모드 prop으로 일반화한다.**

`V2DungeonFloorView`에 `huntMode?: "normal" | "unexplored"`와 `unexploredSummary?`를 추가한다. 미개척지 측면 패널은 난이도, 풀 비중, 보상 효과, 흔적 활성 여부만 표시하며 조작 방식과 주 사냥 버튼은 일반 사냥과 동일하게 유지한다. 레어맵·오프라인 버튼은 미개척지에서 숨긴다.

- [x] **Step 4: 회귀 테스트를 통과시킨다.**

Run: `npm test -- src/lib/server/unexploredHunt.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/adventure/v2/useDungeonHunt.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx`

Expected: PASS.

- [x] **Step 5: 사냥 배선을 커밋한다.**

```bash
git add src/lib/server/unexploredHunt.ts src/lib/server/unexploredHunt.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt/route.test.ts src/adventure/v2/useDungeonHunt.ts src/adventure/v2/useDungeonHunt.test.ts src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonFloorView.test.tsx
git commit -m "feat: connect unexplored hunting"
```

### Task 9: 사냥터 목록과 미개척지 전투 페이지

**Files:**
- Modify: `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/V2DungeonList.test.ts`
- Modify: `src/adventure/v2/V2DungeonList.render.test.tsx`
- Modify: `src/app/(game)/battle/dungeon/page.tsx`
- Create: `src/app/(game)/battle/dungeon/unexplored/page.tsx`
- Create: `src/adventure/v2/V2UnexploredHuntPage.tsx`
- Create: `src/adventure/v2/V2UnexploredHuntPage.test.tsx`

- [x] **Step 1: 목록·페이지 테스트를 작성한다.**

플래그 on이면 사냥터 목록 상단에 `미개척지 · 난이도 N` 카드가 나타나고 활성 풀 2~3개만 요약한다. 100 미만은 카드가 잠기며 진입해도 서버 상태를 확인한 뒤 안내만 표시한다. 카드 선택은 숫자 `[floorId]`가 아닌 `/battle/dungeon/unexplored`로 이동한다.

Run: `npm test -- src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/V2UnexploredHuntPage.test.tsx`

Expected: FAIL.

- [x] **Step 2: 목록 카드와 전용 페이지를 구현한다.**

페이지는 `/api/v2/unexplored`을 읽고 기존 `V2DungeonFloorView`에 `huntMode="unexplored"`를 전달한다. 로딩·실패·잠김 카드도 불투명 surface를 사용한다. 탐사망 편집 링크는 캐릭터의 `/character/unexplored`로 연결한다.

- [x] **Step 3: UI 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/V2UnexploredHuntPage.test.tsx`

Expected: PASS.

- [x] **Step 4: 사냥터 UI를 커밋한다.**

```bash
git add src/adventure/v2/V2DungeonList.tsx src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonList.render.test.tsx src/app/\(game\)/battle/dungeon/page.tsx src/app/\(game\)/battle/dungeon/unexplored/page.tsx src/adventure/v2/V2UnexploredHuntPage.tsx src/adventure/v2/V2UnexploredHuntPage.test.tsx
git commit -m "feat: add unexplored hunting screen"
```

---

## Phase 3 — 흔적 제작과 개인 보스

### Task 10: 보스·소환석·핵·고유 장비 카탈로그

**Files:**
- Create: `src/adventure/data/v2/unexploredBosses.ts`
- Create: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/unexploredRewards.ts`
- Modify: `src/adventure/data/v2/unexploredRewards.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Add: `public/images/monster/v2/unexplored-boss-*.png`
- Add: `public/images/equipment/unexplored-*.png`

- [x] **Step 1: 카탈로그 불변 테스트를 작성한다.**

보스는 정확히 3종이다.

```ts
const UNEXPLORED_BOSSES = {
  tracking_weapon: { pools: ["runaway_machines", "shadow_stalkers"] },
  toxic_blood_lord: { pools: ["venom_colony", "bloodstained_dead"] },
  glacial_colossus: { pools: ["frozen_legion", "crushing_colossi"] },
} as const;
```

각 보스는 거래 가능 소환석 1종, 일반 고유 2종, 초희귀 고유 1종을 가진다. 공용 거래 재료 `v2_unexplored_boss_core`를 등록한다. 소환석과 핵은 `V2_MATERIALS`에 등재되어 거래소 material 흐름을 자동 사용하고 NPC 판매가는 등록하지 않는다. 고유 9종은 기존 장비 슬롯·능력치 타입을 사용하며 장비 이미지 참조가 존재해야 한다.

협동 보스 데이터에는 다음 표식을 추가한다.

```ts
rewardMode: "coop" | "unexplored_personal";
visibilityLocked: boolean;
summonMaterialId?: string;
```

Run: `npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/coopBosses.test.ts`

Expected: FAIL.

- [x] **Step 2: 세 보스와 거래 가능 보상을 구현한다.**

개인 보스의 공격 스태미나, 쿨다운, 제한시간은 기존 협동 보스 상수를 그대로 사용한다. `visibilityLocked` 보스는 생성 시 `summoner_only`이며 끝까지 변경할 수 없다. 일반 협동 소환서 목록에서는 제외한다.

고유 장비는 아래 역할로 고정한다. 일반 고유 두 개는 현행 6T 장비와 같은 총 옵션 예산 안에서 한 축을 교환하는 사이드그레이드로 만들고, 초희귀는 같은 슬롯 현행 6T 최고 장비 대비 유효 옵션 예산을 20% 높인다. 새 signature 트리거나 신규 효과 엔진은 만들지 않는다.

| 보스 | 30% | 10% | 0.5% 초희귀 |
| --- | --- | --- | --- |
| 추적 병기 | `추적날 단검` · 단검 · 속도/적중 | `허상 가속화` · 경갑 신발 · 회피/속도 | `무한궤도 심장` · 목걸이 · HP/MP/속도 |
| 독혈 군주 | `독혈 발톱` · 단검 · 치명/상태 공격 | `응고독 반지` · 반지 · 치명/적중 | `부패하지 않는 심장` · 경갑 갑옷 · HP/회피/상태 저항 |
| 빙하 거수 | `빙하 파쇄망치` · 대검 · 위력/방어 | `얼어붙은 거갑` · 중갑 갑옷 · HP/물마방 | `절대영도의 핵` · 목걸이 · HP/MP/물마방 |

- [x] **Step 3: 이미지와 카탈로그 검증을 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/coopBosses.test.ts`

Expected: PASS.

Run: `npm run check-images`

Expected: missing reference 0, new unexplored orphan 0.

- [x] **Step 4: 카탈로그를 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/unexploredRewards.ts src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/dungeonDrops.ts src/adventure/data/v2/dungeonDrops.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts public/images/monster/v2 public/images/equipment
git commit -m "feat: define unexplored personal bosses"
```

### Task 11: 원자적 소환석 제작과 개인 소환

**Files:**
- Create: `src/lib/server/unexploredBossCraft.ts`
- Create: `src/lib/server/unexploredBossCraft.test.ts`
- Create: `src/app/api/v2/unexplored/craft/route.ts`
- Create: `src/app/api/v2/unexplored/craft/route.test.ts`
- Create: `src/app/api/v2/unexplored/summon/route.ts`
- Create: `src/app/api/v2/unexplored/summon/route.test.ts`

- [x] **Step 1: 제작·소환 트랜잭션 실패 테스트를 작성한다.**

제작 body는 `{ bossId, requestId }`, 소환 body는 `{ bossId }`다. 제작식은 풀 A 흔적 500, 풀 B 흔적 500, 각 전용 재료 10, `v2_boss_summon_scroll` 30, 고정 골드다. 고정 골드는 출시 스냅샷과 운영 결정을 반영한 상수 `UNEXPLORED_SUMMON_STONE_GOLD_COST` 하나로만 읽으며 런타임 시세를 조회하지 않는다.

테스트는 각 재료 하나씩 부족, 골드 부족, 흔적 노드 비활성, 같은 requestId 재시도, 동시 두 요청에서 한 요청만 성공, 성공 시 전부 차감·소환석 1개 추가를 검증한다. 중복 requestId는 `craftReceipts`에서 보스 ID와 제작 시각을 찾아 추가 차감 없이 최초 성공 스냅샷을 반환한다. 같은 requestId를 다른 bossId로 재사용하면 409 `request_conflict`를 반환한다.

소환은 소환석 1개를 소비해 기존 `coop_boss_sessions`에 `summoner_only` 세션을 만들고, 관련 풀/보스 노드가 현재 비활성이어도 허용한다. 같은 종류 활성 세션 상한은 기존 안전캡을 사용한다.

Run: `npm test -- src/lib/server/unexploredBossCraft.test.ts src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/unexplored/summon/route.test.ts`

Expected: FAIL.

- [x] **Step 2: character.v2 한 행 잠금으로 제작을 구현한다.**

흔적·재료·골드·멱등 키가 모두 같은 저장 행에 있으므로 별도 저장 키를 만들지 않는다. `spendGold`로 결제하고 검증이 모두 끝난 뒤 한 번 `upsertSave`한다. 제작 성공 시 `first_summon_stone_craft` 업적을 함께 기록한다.

- [x] **Step 3: 기존 세션 생성 헬퍼로 개인 소환을 구현한다.**

`v2Coop.ts`에 공개/개인 공통 세션 생성 헬퍼를 추출하고 기존 `/coop/summon`과 새 라우트가 함께 사용하게 한다. 새 라우트는 소환서가 아니라 보스별 소환석만 소비한다.

- [x] **Step 4: 제작·소환 테스트를 통과시킨다.**

Run: `npm test -- src/lib/server/unexploredBossCraft.test.ts src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/unexplored/summon/route.test.ts src/app/api/v2/coop/summon/route.test.ts`

Expected: PASS.

- [x] **Step 5: 제작과 소환을 커밋한다.**

```bash
git add src/lib/server/unexploredBossCraft.ts src/lib/server/unexploredBossCraft.test.ts src/lib/server/v2Coop.ts src/app/api/v2/unexplored/craft/route.ts src/app/api/v2/unexplored/craft/route.test.ts src/app/api/v2/unexplored/summon/route.ts src/app/api/v2/unexplored/summon/route.test.ts src/app/api/v2/coop/summon/route.ts src/app/api/v2/coop/summon/route.test.ts
git commit -m "feat: craft and summon unexplored bosses"
```

### Task 12: 개인 보스 접근 권한과 독립 보상 굴림

**Files:**
- Create: `src/adventure/data/v2/unexploredBossRewards.ts`
- Create: `src/adventure/data/v2/unexploredBossRewards.test.ts`
- Modify: `src/app/api/v2/coop/route.ts`
- Create: `src/app/api/v2/coop/route.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Create: `src/app/api/v2/coop/attack/route.test.ts`
- Modify: `src/app/api/v2/coop/claim/route.ts`
- Modify: `src/app/api/v2/coop/claim/route.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/visibility/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/visibility/route.test.ts`

- [x] **Step 1: 개인 접근·보상 실패 테스트를 작성한다.**

개인 보스는 소환자만 목록 조회·상세 조회·공격·claim할 수 있다. 전체/길드 전환은 `visibility_locked` 409를 반환한다. 공격 비용·쿨다운·전투 방식은 기존 협동 보스와 동일해야 한다.

처치 보상은 공용 핵 1, 연결 재료 무작위 1개, 골드 0을 확정 지급한다. 세 고유는 `30%`, `10%`, `0.5%` 순서로 서로 다른 RNG 호출을 사용한다.

```ts
export type UnexploredBossReward = {
  bossCore: 1;
  poolMaterialId: string;
  poolMaterialCount: 1;
  uniqueIds: V2EquipmentId[];
};
```

고정 RNG `[0.29, 0.09, 0.004]`는 세 개 모두, `[0.31, 0.11, 0.006]`은 하나도 지급하지 않아야 한다. 일반 고유 성공이 초희귀 RNG 호출 수나 결과를 바꾸지 않아야 한다. claim 재시도는 contributor의 저장된 snapshot을 그대로 반환하고 재지급하지 않는다.

Run: `npm test -- src/adventure/data/v2/unexploredBossRewards.test.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/coop/\[sessionId\]/visibility/route.test.ts`

Expected: FAIL.

- [x] **Step 2: 보스 rewardMode 분기를 구현한다.**

일반 협동 보스는 기존 티어/SP열매/추가 보상을 그대로 사용한다. `unexplored_personal`만 기여 티어를 사용하지 않고 소환자 처치 claim에서 전용 스냅샷을 만든다. 장비 지급은 기존 `mintRolledEquipInstance`, `appendEquipInstances`, 고유 장비 업적/도감 기록을 재사용한다. 최초 처치 기록과 칭호만 귀속한다.

- [x] **Step 3: 접근과 보상 회귀 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredBossRewards.test.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/coop/\[sessionId\]/visibility/route.test.ts`

Expected: PASS.

- [x] **Step 4: 개인 보스 런타임을 커밋한다.**

```bash
git add src/adventure/data/v2/unexploredBossRewards.ts src/adventure/data/v2/unexploredBossRewards.test.ts src/app/api/v2/coop/route.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/coop/claim/route.ts src/app/api/v2/coop/claim/route.test.ts src/app/api/v2/coop/\[sessionId\]/visibility/route.ts src/app/api/v2/coop/\[sessionId\]/visibility/route.test.ts
git commit -m "feat: reward unexplored personal bosses"
```

### Task 13: 흔적 보관함·제작·개인 보스 UI

**Files:**
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Create: `src/adventure/v2/coop/useCoopBossState.test.ts`

- [x] **Step 1: 정보 공개와 개인 세션 UI 테스트를 작성한다.**

흔적 보관함은 보스별 A/B 흔적 `현재/500`, A/B 전용 재료 `현재/10`, 소환서 `현재/30`, 고정 골드를 한 카드에 표시한다. 제작 버튼은 `우두머리의 흔적` 활성 중에만 켜고 제작된 소환석 사용은 노드 비활성 상태에서도 가능하게 한다.

개인 보스 카드에는 고유 3종의 정확한 `30%`, `10%`, `0.5%`와 `각각 독립적으로 등장` 문구를 표시한다. 개인 카드에는 전체/길드 공개 컨트롤이 없어야 하고 `나만 전투`를 표시한다.

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/useCoopBossState.test.ts`

Expected: FAIL.

- [x] **Step 2: 제작과 소환 UI를 구현한다.**

제작 클릭마다 `crypto.randomUUID()` requestId를 만들고 네트워크 재시도 동안 같은 ID를 유지한다. 성공 응답으로 재료·골드·흔적 스냅샷을 교체한다. 소환 성공 뒤 기존 협동 보스 상세 화면으로 이동한다.

- [x] **Step 3: UI 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/useCoopBossState.test.ts`

Expected: PASS.

- [x] **Step 4: 보스 UI를 커밋한다.**

```bash
git add src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/useCoopBossState.ts src/adventure/v2/coop/useCoopBossState.test.ts
git commit -m "feat: add unexplored boss crafting ui"
```

---

## Phase 4 — 경제 캘리브레이션과 완성 검증

### Task 14: 스태미나당·시간당 보상 시뮬레이터

**Files:**
- Create: `scripts/sim-v2-unexplored-rewards.ts`
- Create: `src/adventure/data/v2/unexploredRewardSimulation.ts`
- Create: `src/adventure/data/v2/unexploredRewardSimulation.test.ts`
- Modify: `package.json`

- [x] **Step 1: 계산 기준 테스트를 작성한다.**

fixture 캐릭터별 승률, 평균 전투시간, 실패 스태미나, HP/MP 충전, 손실세를 받아 `per100StaminaNet`과 `perHourNet`을 계산한다. 승률 70% 미만은 안정 파밍 집계에서 제외한다. 골드는 액면, 장비는 NPC 처분가, 재료는 입력된 중앙값을 쓰고 0.5% 초희귀 고유와 미사용 우두머리 핵 가치는 제외한다.

Run: `npm test -- src/adventure/data/v2/unexploredRewardSimulation.test.ts`

Expected: FAIL.

- [x] **Step 2: 고정 fixture 시뮬레이터를 구현한다.**

명령은 `npm run sim:v2:unexplored-rewards -- --seed 20260828 --runs 10000`으로 실행한다. 기본 95와 보상 집중 95/100/105/110/115/120, 2풀 집중, 3풀 혼합, 세 보상 전환형, 집중 추적 구성을 모두 출력한다.

허용 범위는 각 목표 `110/122/136/150/165/180`의 ±5%p, 최대 보상 구성 170~185%다. 벗어나면 테스트가 실패하도록 하되 골드보다 일반·특화 재료의 낮은 공급을 먼저 보존한다.

- [x] **Step 3: 테스트와 시뮬레이션을 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/unexploredRewardSimulation.test.ts`

Expected: PASS.

Run: `npm run sim:v2:unexplored-rewards -- --seed 20260828 --runs 10000`

Expected: 모든 목표 행이 허용 범위, 최대 보상 170~185%, 초희귀 가치 제외가 출력된다.

- [x] **Step 4: 캘리브레이션 도구를 커밋한다.**

```bash
git add scripts/sim-v2-unexplored-rewards.ts src/adventure/data/v2/unexploredRewardSimulation.ts src/adventure/data/v2/unexploredRewardSimulation.test.ts package.json
git commit -m "test: simulate unexplored reward economy"
```

### Task 15: 전체 회귀·정적·브라우저 검증

**Files:**
- Modify only if a verification failure reveals an in-scope defect.

- [x] **Step 1: 미개척지 집중 테스트를 실행한다.**

Run:

```bash
npm test -- \
  src/adventure/data/v2/unexploredState.test.ts \
  src/adventure/data/v2/unexploredTree.test.ts \
  src/adventure/data/v2/unexploredProgression.test.ts \
  src/adventure/data/v2/unexploredMonsterPools.test.ts \
  src/adventure/data/v2/unexploredMonsters.test.ts \
  src/adventure/data/v2/unexploredEncounters.test.ts \
  src/adventure/data/v2/unexploredRewards.test.ts \
  src/adventure/data/v2/unexploredHuntRewards.test.ts \
  src/adventure/data/v2/unexploredBosses.test.ts \
  src/adventure/data/v2/unexploredBossRewards.test.ts \
  src/lib/server/unexploredService.test.ts \
  src/lib/server/unexploredHunt.test.ts \
  src/lib/server/unexploredBossCraft.test.ts \
  src/app/api/v2/unexplored/route.test.ts \
  src/app/api/v2/unexplored/craft/route.test.ts \
  src/app/api/v2/unexplored/summon/route.test.ts
```

Expected: PASS.

- [x] **Step 2: 영향받은 사냥·협동·거래소 회귀를 실행한다.**

Run: `npm test -- src/app/api/v2/dungeon/hunt src/app/api/v2/coop src/app/api/v2/marketplace src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx`

Expected: PASS.

- [x] **Step 3: 타입·이미지·포맷 검증을 실행한다.**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run check-images`

Expected: missing reference 0.

Run: `git diff --check`

Expected: no output.

- [x] **Step 4: 기능 플래그 on 개발 서버에서 브라우저를 확인한다.**

`NEXT_PUBLIC_V2_UNEXPLORED=true npm run dev`로 로컬 서버만 실행한다. 1440×900과 390×844에서 다음을 확인한다.

- 캐릭터 메뉴 → 미개척지 탐사망 → 노드 선택/환불/초기화.
- 사냥터 목록 → 미개척지 → 일반 사냥과 같은 전투 UX.
- 배경 이미지가 최상위/중첩 카드 뒤로 비치지 않음.
- 160노드 선 교차가 목업 수준 이하이고 페이지 가로 넘침 없음.
- 120 초과 노드와 상호 배타 노드가 이유와 함께 비활성.
- 흔적 보관함 → 제작 → 소환 → 개인 보스 전투 → 독립 드롭 표시.
- 플래그 off 재시작 시 기존 메뉴·사냥·협동 화면이 이전과 동일.

- [x] **Step 5: 최종 상태를 감사한다.**

Run: `git status --short`

Expected: 미개척지 구현과 검증 중 의도한 파일만 변경되어 있다.

Run: `git log --oneline --max-count=20`

Expected: 위 작업별 작은 커밋이 순서대로 존재한다. 푸시와 배포는 하지 않는다.

## Out of Scope

- `NEXT_PUBLIC_V2_UNEXPLORED` 운영 활성화와 모든 환경 배포.
- 점검 모드 변경.
- 출시 전 골드 비용을 위한 운영 경제 스냅샷 조회. 별도 승인된 읽기 전용 조사에서 `UNEXPLORED_SUMMON_STONE_GOLD_COST`를 확정한 뒤 코드 상수를 바꾼다.
- 앞쪽 6개 풀의 추가 개인 보스, 공격형·변칙형 특화 몬스터 활성화, 보스 고유의 확정 제작 경로.
- 30 탐사 경험치 포인트 이후 남는 경험치로 능력치를 올리는 추가 성장.
- 운영 가격에 따라 보상을 자동 조정하는 동적 경제 시스템.
