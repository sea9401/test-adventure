# 장비 해방 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진짜 6티어 이상 장비에 1~3줄의 무작위 해방 옵션을 부여하고, 고정 1,500만 골드 재해방·확률 단계 승급·귀속·전투/사냥/제작/레벨 성장 효과를 서버 권위로 안전하게 구현한다.

**Architecture:** 해방 상태는 개별 `V2EquipInstance`에 저장하고, 옵션 카탈로그·추첨·효과 합산은 `src/adventure/data/v2/`의 순수 모듈로 분리한다. 해방 요청은 캐릭터와 장비 저장을 잠근 하나의 DB 트랜잭션 안에서 처리하며 별도 UUID 영수증 테이블로 네트워크 재시도를 멱등 처리한다. 착용 옵션은 전투 또는 정산 시작 시 한 번 스냅샷으로 만들고 전투 파생치, 사냥 드롭, 현재 재전직 주기 성장, 개인 제작 골드 비용에만 명시적으로 주입한다. 대장간에는 전용 패널을 추가하되 비활성 재련은 건드리지 않으며 전체 기능은 기본값이 꺼진 플래그 뒤에 둔다.

**Tech Stack:** Next.js App Router Route Handlers, React 19 Client Components, TypeScript, Drizzle/PostgreSQL, Vitest, 기존 ATB 전투 엔진과 `saves_kv`, Tailwind 및 공용 불투명 surface 토큰.

## Global Constraints

- 수치와 부위별 전체 옵션 목록의 단일 기준은 `docs/superpowers/specs/2026-08-29-equipment-liberation-design.md`다. 구현 중 임의로 이름·가중치·Lv.20 최대치·적용 범위를 보완하지 않는다.
- 배포하지 않는다. `NEXT_PUBLIC_V2_EQUIPMENT_LIBERATION`은 기본값 `false`이며 구현과 검증 후에도 자동으로 켜지 않는다.
- 저장소 지침에 따라 서브에이전트를 만들지 않는다. 사용자가 별도로 위임을 요청하지 않는 한 `superpowers:executing-plans`로 현재 세션에서 순차 실행한다.
- 기존 비활성 `재련`의 코드·데이터·탭·저장 형식은 삭제하거나 활성화하거나 해방과 결합하지 않는다. 해방은 장비 품질도 재추첨하지 않는다.
- 표시 티어는 원본 카탈로그 티어로 계산한다. `v2EquipCatalogTierToDisplayTier(item.tier) >= 6`인 진짜 장비만 허용하고 `stormRefined` 인스턴스는 항상 거절한다.
- 최초 성공 시에만 `bound: true`와 영구 줄 수를 기록한다. 실패 요청은 골드·귀속·해방 상태를 하나도 바꾸지 않는다.
- 최초 해방은 승급 판정 없이 해방 3으로 시작한다. 재해방만 현재 단계에서 3→2 5%, 2→1 1%를 먼저 판정하며 같은 회차 옵션 레벨은 판정 후 단계 분포를 쓴다. 단계 하락과 천장은 없다.
- 최초와 재해방 모두 지갑+은행에서 고정 15,000,000골드를 소모한다. 반지의 제작 할인은 해방 비용에 적용하지 않는다.
- 최초 줄 수는 1줄 50%, 2줄 35%, 3줄 15%이며 이후 영구 고정한다. 모든 재해방은 현재 옵션 전체를 즉시 덮어쓰고 저장/잠금/복구/줄 확장을 제공하지 않는다.
- 동일 장비 인스턴스 안에서는 같은 옵션 종류를 중복 추첨하지 않는다. 다른 장비 부위의 같은 옵션은 정상 합산한다.
- 기초 능력치 %는 `baseAllocatedStats`에 대해 음식 %와 해방 %를 각각 계산해 더한다. 기존 직업·패시브 계산과 음식 고정 수치는 바꾸지 않는다.
- `모든 피해`는 최종 물리·마법 공격 축 모두에 적용하되 고정 HP 피해·반사에는 적용하지 않는다. `최종 회피 효과`는 현재 게임의 최종 회피 피해감소에 퍼센트포인트로 더하고 기존 85% 상한을 따른다.
- 레벨 성장 HP/MP는 현재 재전직 주기의 기본 자원 성장분으로 저장하고 최대 HP/MP %보다 먼저 합산한다. 장비를 벗거나 재해방해도 그 주기에는 유지하며 재전직으로 레벨 1이 될 때만 초기화한다.
- 사냥 관련 효과는 전투 시작 장비를 스냅샷으로 고정한다. 오프라인 정산은 정산 시작 시 한 번만 고정해 모든 반복 사냥에 사용한다.
- 라우트의 잠금 순서는 기존 순서를 우선한다. 새 해방 라우트는 `character.v2` → `equipment.v2` → 해방 요청 영수증 순으로 처리하고 모든 변경을 같은 트랜잭션에서 커밋한다.
- RNG는 서버에서만 실행하고 테스트에서는 주입 가능한 `() => number`를 사용한다. 클라이언트는 난수·결과·줄 수·단계를 제출할 수 없다.
- Next.js 페이지는 기본 Server Component를 유지하고 상호작용이 필요한 패널만 Client Component로 둔다. Route Handler는 Web `Request`/`Response` 계약을 사용한다.
- 장면 배경 위의 모든 본문과 카드는 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다. 잠김/비활성 카드는 컨테이너 전체 `opacity-*`로 흐리게 만들지 않는다.

---

## Phase 1 — 도메인 계약과 원자적 해방

### Task 1: 옵션 카탈로그, 저장 파서, 확률 추첨 기반

**Files:**
- Reference: `docs/superpowers/specs/2026-08-29-equipment-liberation-design.md`
- Create: `src/adventure/data/v2/equipmentLiberationCatalog.ts`
- Create: `src/adventure/data/v2/equipmentLiberationCatalog.test.ts`
- Create: `src/adventure/data/v2/equipmentLiberation.ts`
- Create: `src/adventure/data/v2/equipmentLiberation.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/coreLoopConfig.ts`
- Modify: `.env.example`

**Interfaces:**

```ts
export type LiberationRank = 1 | 2 | 3;
export type LiberationLineCount = 1 | 2 | 3;
export type LiberationOptionRoll = {
  id: LiberationOptionId;
  level: number;
};
export type V2LiberationState = {
  rank: LiberationRank;
  lineCount: LiberationLineCount;
  revision: number;
  options: LiberationOptionRoll[];
};

export function rollInitialLiberation(slot: V2EquipSlot, rng: () => number): V2LiberationState;
export function rerollLiberation(slot: V2EquipSlot, current: V2LiberationState, rng: () => number): V2LiberationState;
export function liberationOptionValue(id: LiberationOptionId, level: number): number;
export function firstLineProbability(slot: V2EquipSlot, id: LiberationOptionId): number;
```

- [x] **Step 1: 카탈로그와 분포의 실패 테스트를 작성한다.**

설계서의 부위별 풀을 정확히 고정한다: 무기 16, 갑옷 15, 장갑 14, 신발 12, 반지 13, 목걸이 13종. 각 ID의 허용 부위, 가중치 `100/70/40/15/5`, Lv.20 최대치와 표시 단위를 단언한다. 모든 부위에서 ID가 중복되지 않고 첫 줄 확률 합이 1인지 검사한다.

고정 RNG로 다음을 단언한다.

- 최초 단계는 항상 3이고 줄 수 경계는 50%/35%/15%다.
- 재해방 승급 경계는 5%와 1%이며 승급 후 단계의 레벨 분포를 즉시 쓴다.
- 단계 3의 `24/22/20/18/16`, 단계 2의 `19/18/17/16/15/15`, 단계 1의 `10.2×5/9×3/8×2/6` 합이 각각 100%다.
- 2~3줄 추첨은 선택된 ID를 제외한 가중치로 재계산되어 같은 ID가 나오지 않는다.
- 정수 값은 표준 반올림하고 양수는 최소 1, 퍼센트 값은 기존 표시 정밀도를 보존한다.
- 손상된 해방 저장은 제거 또는 안전한 값으로 정규화하며 알 수 없는 옵션 ID, 잘못된 부위 옵션, 중복 옵션을 받아들이지 않는다.

Run: `npm test -- src/adventure/data/v2/equipmentLiberationCatalog.test.ts src/adventure/data/v2/equipmentLiberation.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: FAIL because the liberation modules and instance field do not exist.

- [x] **Step 2: 전체 옵션 카탈로그와 비복원 가중 추첨을 구현한다.**

카탈로그에는 설계서의 83개 부위별 엔트리와 Lv.20 최대치를 그대로 선언한다. 공통 ID가 여러 부위에 등장할 수 있지만 한 부위 풀에는 한 번만 나타나게 한다. 확률 선택 함수는 `rng()`가 0 이상 1 미만이라고 가정하되 경계값을 방어적으로 clamp한다.

`V2EquipInstance`에 다음 선택 필드를 추가하고 `parseEquipmentSave`에서 방어적으로 파싱한다.

```ts
liberation?: V2LiberationState;
```

기존 저장에는 필드가 없으므로 그대로 호환되어야 한다. `bound`, `stormRefined`, 강화·제작 품질 필드는 그대로 보존한다.

- [x] **Step 3: 대상 판별과 기능 플래그를 추가한다.**

```ts
export function canLiberateEquipment(item: V2EquipmentItem, instance: V2EquipInstance): boolean {
  return v2EquipCatalogTierToDisplayTier(item.tier) >= 6 && instance.stormRefined !== true;
}

export const V2_EQUIPMENT_LIBERATION =
  process.env.NEXT_PUBLIC_V2_EQUIPMENT_LIBERATION === "true";
```

`.env.example`에는 `NEXT_PUBLIC_V2_EQUIPMENT_LIBERATION=false`를 추가하고 운영 환경 파일은 건드리지 않는다.

- [x] **Step 4: 단위 테스트를 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/equipmentLiberationCatalog.test.ts src/adventure/data/v2/equipmentLiberation.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: PASS.

- [x] **Step 5: 도메인 계약을 커밋한다.**

```bash
git add .env.example src/adventure/data/v2/coreLoopConfig.ts src/adventure/data/v2/equipmentLiberationCatalog.ts src/adventure/data/v2/equipmentLiberationCatalog.test.ts src/adventure/data/v2/equipmentLiberation.ts src/adventure/data/v2/equipmentLiberation.test.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2Equipment.test.ts
git commit -m "feat: define equipment liberation domain"
```

### Task 2: 멱등 영수증과 해방 API

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0178_equipment_liberation_requests.sql`
- Create: `drizzle/meta/0178_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/server/equipmentLiberationService.ts`
- Create: `src/lib/server/equipmentLiberationService.test.ts`
- Create: `src/app/api/v2/me/equipment/liberate/route.ts`
- Create: `src/app/api/v2/me/equipment/liberate/route.test.ts`

**Interfaces:**

```ts
type LiberateRequest = {
  iid: string;
  requestId: string;       // UUID
  expectedRevision: number; // 최초 해방은 0
};

type LiberateSuccess = {
  ok: true;
  item: V2EquipInstance;
  gold: number;
  bankedGold: number;
  spentGold: 15_000_000;
  replayed: boolean;
};
```

- [x] **Step 1: 서비스와 라우트의 실패 테스트를 작성한다.**

다음을 각각 테스트한다.

- 플래그 off는 404이며 저장을 읽거나 쓰지 않는다.
- UUID·iid·revision 검증 실패는 400이다.
- 없는 장비 404, 부적격/폭풍 개량 409, 잔액 부족 409다.
- 최초 성공은 지갑 우선·은행 보충으로 정확히 1,500만을 지불하고 `bound`, rank 3, 줄 수, revision 1을 한 번에 쓴다.
- 재해방은 줄 수를 유지하고 전체 옵션을 덮으며 revision을 1 증가시킨다.
- 오래된 `expectedRevision`은 409와 최신 인스턴스를 반환하며 과금하지 않는다.
- 같은 사용자·UUID·동일 의도의 재시도는 저장된 응답을 돌려주고 다시 과금하거나 RNG를 호출하지 않는다.
- 같은 UUID를 다른 iid/revision에 재사용하면 409 `request_id_conflict`다.
- 저장 도중 예외가 나면 골드·귀속·옵션·영수증이 모두 롤백된다.
- 두 동시 요청은 캐릭터 잠금 뒤 직렬화되고 둘 다 성공해도 각각 한 번만 과금된다.

Run: `npm test -- src/lib/server/equipmentLiberationService.test.ts src/app/api/v2/me/equipment/liberate/route.test.ts`

Expected: FAIL.

- [x] **Step 2: 요청 영수증 테이블과 마이그레이션을 생성한다.**

테이블은 `(user_id, request_id)` 복합 기본키, `iid`, `expected_revision`, `response jsonb`, `created_at`을 가진다. 사용자 FK는 기존 사용자 테이블의 삭제 정책을 따른다.

Run: `npm run db:generate -- --name equipment_liberation_requests`

Expected: `0178_equipment_liberation_requests.sql`, `0178_snapshot.json`, `_journal.json`이 생성되고 SQL에 복합 PK와 사용자 FK가 있다. 생성 번호나 이름이 달라지면 실제 생성 결과를 계획 문서와 커밋 경로에 일치시키고 수동으로 번호를 덮어쓰지 않는다.

- [x] **Step 3: 서버 서비스와 POST Route Handler를 구현한다.**

트랜잭션은 다음 순서를 지킨다.

1. 인증과 요청 형식을 검증한다.
2. `character.v2`를 잠그고 영수증을 조회한다.
3. 영수증이 있으면 의도를 대조하고 저장된 응답을 반환한다.
4. `equipment.v2`를 잠그고 iid·대상·expected revision·잔액을 검증한다.
5. 최초면 줄 수를 결정하고 rank 3 옵션을 뽑아 귀속한다. 재해방이면 승급 후 기존 줄 수만큼 다시 뽑는다.
6. `spendGold`로 지갑+은행에서 고정 비용을 지불한다.
7. 장비·캐릭터·응답 영수증을 같은 트랜잭션에 저장한다.

응답에는 전체 확률표나 내부 RNG 값을 넣지 않는다. 감사 로그에는 user, iid, 이전/이후 revision·rank·lineCount, 비용, requestId만 남기고 난수 시드나 민감 정보는 남기지 않는다.

- [x] **Step 4: 라우트 테스트와 타입 검사를 통과시킨다.**

Run: `npm test -- src/lib/server/equipmentLiberationService.test.ts src/app/api/v2/me/equipment/liberate/route.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [x] **Step 5: 원자적 해방 API를 커밋한다.**

```bash
git add src/db/schema.ts drizzle/0178_equipment_liberation_requests.sql drizzle/meta/0178_snapshot.json drizzle/meta/_journal.json src/lib/server/equipmentLiberationService.ts src/lib/server/equipmentLiberationService.test.ts src/app/api/v2/me/equipment/liberate/route.ts src/app/api/v2/me/equipment/liberate/route.test.ts
git commit -m "feat: add atomic equipment liberation api"
```

### Task 3: 귀속 장비 처분 안전장치와 거래 차단 회귀

**Files:**
- Modify: `src/app/api/v2/shop/equipment/sell/route.ts`
- Modify: `src/app/api/v2/shop/equipment/sell/route.test.ts`
- Modify: `src/app/api/v2/shop/equipment/sell-bulk/route.ts`
- Modify: `src/app/api/v2/shop/equipment/sell-bulk/route.test.ts`
- Modify: `src/app/api/v2/guild/workshop/dismantle/route.ts`
- Create: `src/app/api/v2/guild/workshop/dismantle/route.test.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/lib/server/equipmentBuyOrderSale.test.ts`
- Modify: `src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`
- Modify: `src/app/api/v2/guild/warehouse/route.test.ts`

- [x] **Step 1: 처분 확인과 이전 차단의 실패 테스트를 작성한다.**

단일 NPC 판매와 분해는 해방된 귀속 장비에 `confirmBound: true`가 없으면 409 `bound_confirmation_required`와 장비 요약을 반환한다. 자동 일괄 판매는 귀속 장비를 건너뛰며, iid를 명시한 일괄 판매는 확인값 없이 포함할 경우 전체 요청을 원자적으로 거절한다. 확인 후 판매/분해는 허용하고 해방 상태도 인스턴스와 함께 사라진다.

기존 거래소 등록, 구매 주문 즉시 판매, 거래 정산, 길드 창고 이전 테스트에 `liberation`이 있는 `bound: true` fixture를 추가해 모두 계속 거절되는지 단언한다.

Run: `npm test -- src/app/api/v2/shop/equipment/sell/route.test.ts src/app/api/v2/shop/equipment/sell-bulk/route.test.ts src/app/api/v2/guild/workshop/dismantle/route.test.ts src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts src/app/api/v2/guild/warehouse/route.test.ts`

Expected: FAIL for the new confirmation contract.

- [x] **Step 2: 강한 확인 계약을 라우트에 구현한다.**

기존 일반 장비 흐름은 응답과 상태 코드를 바꾸지 않는다. 서버가 iid로 실제 인스턴스를 다시 확인하며 클라이언트가 `bound: false`를 제출해 우회할 수 없게 한다. 확인 응답에는 “귀속과 모든 해방 옵션이 영구 소멸” 문구를 UI가 표시할 수 있는 오류 코드를 포함한다.

- [x] **Step 3: 회귀 테스트를 통과시킨다.**

Run: 위 Step 1의 테스트 명령.

Expected: PASS.

- [x] **Step 4: 귀속 안전장치를 커밋한다.**

```bash
git add src/app/api/v2/shop/equipment/sell src/app/api/v2/shop/equipment/sell-bulk src/app/api/v2/guild/workshop/dismantle src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts src/app/api/v2/guild/warehouse/route.test.ts
git commit -m "feat: guard disposal of liberated equipment"
```

---

## Phase 2 — 착용 효과와 캐릭터 성장

### Task 4: 착용 해방 효과 집계와 전투 파생치

**Files:**
- Create: `src/adventure/data/v2/equipmentLiberationEffects.ts`
- Create: `src/adventure/data/v2/equipmentLiberationEffects.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Create: `src/adventure/v2/combat/equipmentLiberationEffects.test.ts`

**Interfaces:**

```ts
export type EquippedLiberationEffects = {
  baseStatPct: Partial<Record<V2StatKey, number>>;
  flat: { atk: number; magicAtk: number; physicalDef: number; magicDef: number; maxHp: number; maxMp: number; accuracy: number; evasion: number; speed: number };
  pct: { atk: number; magicAtk: number; physicalDef: number; magicDef: number; maxHp: number; allDamage: number };
  combat: { critChancePp: number; critDamagePp: number; skillCritDamagePp: number; critResistPp: number; statusDamageReductionPct: number; physicalPenetrationPct: number; magicPenetrationPct: number; bossDamagePct: number; damageTakenReductionPct: number; shieldMaxHpPct: number; receivedHealingPct: number; healingOutputPct: number; skillMpCostReductionPct: number; finalEvasionEffectPp: number };
  hunt: LiberationHuntEffects;
  growth: LiberationGrowthEffects;
  craftGoldDiscountPct: number;
};

export function deriveEquippedLiberationEffects(save: V2EquipmentSave): EquippedLiberationEffects;
```

- [x] **Step 1: 합산과 기초 능력치 수식의 실패 테스트를 작성한다.**

장착 iid만 읽고 인벤토리 장비는 무시하는지, 다른 부위 동일 효과는 합산하는지, 손상·부적격 해방 데이터는 무시하는지 검사한다. 기초 능력치는 아래처럼 음식과 해방을 별도 절삭해 더하는 예제를 고정한다.

```ts
existingStat
  + Math.floor(baseAllocatedStat * foodPrimaryPct / 100)
  + Math.floor(baseAllocatedStat * liberationBaseStatPct / 100)
```

직업/패시브 % 처리와 음식 고정 수치는 이전 fixture와 동일해야 한다. HP/MP 고정 성장분은 최대치 % 계산 전에 더한다.

Run: `npm test -- src/adventure/data/v2/equipmentLiberationEffects.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL.

- [x] **Step 2: 효과 집계기와 전투 파생 배선을 구현한다.**

기존 `derivePlayerEquipmentV2`의 클래식 장비 합계를 변형하지 않고 별도 집계기를 호출한다. 고정 공격/방어, 공격/방어 %, 관통, 치명, 명중, 속도, 최대 자원, 모든 피해, 보스 피해를 현재 엔진의 대응 축에 한 번만 매핑한다. `모든 피해`는 최종 `atk`와 `magicAtk`에 각각 곱하고 고정 피해에는 들어가지 않게 한다.

- [x] **Step 3: 엔진에 부족한 최소 필드만 추가한다.**

기존 `skillCritDmgPct`, `mpCostReductionPct`, `passiveDamageTakenReductionPct`, `enchantBarrierPctMaxHp`, `enchantBreakerBossBonusPct`, `enemyPhysicalDefReductionPct`, `enemyMagicDefReductionPct`를 재사용한다. 신규 필드는 다음 두 개만 둔다.

```ts
receivedHealMult?: number;
finalEvasionReductionPctAdd?: number;
```

자기 회복에는 회복량 증가와 받는 회복량 증가가 둘 다 곱해지고, 타인 회복에는 시전자 출력과 대상 수신 배율을 각각 적용한다. 최종 회피 효과는 기존 회피 피해감소 결과에 더한 뒤 85%로 제한한다.

- [x] **Step 4: 전투 회귀 테스트를 통과시킨다.**

스킬 치명타, 보스 피해, 피해감소, 전투 시작 보호막, MP 소모 감소, 회복 송수신, 최종 회피 상한을 각각 한 가지 결정적 전투 fixture로 검증한다. 해방 옵션이 없는 기존 fixture 결과가 바이트 수준으로 동일한지도 단언한다.

Run: `npm test -- src/adventure/data/v2/equipmentLiberationEffects.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/equipmentLiberationEffects.test.ts`

Expected: PASS.

- [x] **Step 5: 전투 효과를 커밋한다.**

```bash
git add src/adventure/data/v2/equipmentLiberationEffects.ts src/adventure/data/v2/equipmentLiberationEffects.test.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/equipmentLiberationEffects.test.ts
git commit -m "feat: apply liberation combat effects"
```

### Task 5: 레벨업 HP/MP 성장과 재전직 초기화

**Files:**
- Modify: `src/adventure/data/v2/proficiency.ts`
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Create: `src/lib/server/equipmentLiberationLevelGrowth.ts`
- Create: `src/lib/server/equipmentLiberationLevelGrowth.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Create: `src/app/api/v2/dungeon/hunt/route.test.ts`
- Modify: `src/app/api/v2/me/use-exp-tome/route.ts`
- Create: `src/app/api/v2/me/use-exp-tome/route.test.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.test.ts`
- Modify: `src/lib/server/advanceClassRoute.test.ts`
- Modify: `src/lib/server/classElementRoute.test.ts`

**Interfaces:**

```ts
type LiberationCycleGrowth = { hp: number; mp: number };

export function applyLiberationLevelGrowth(args: {
  proficiency: V2ProficiencyState;
  levelsGained: number;
  effects: Pick<EquippedLiberationEffects, "growth">;
  rng: () => number;
}): { proficiency: V2ProficiencyState; hpGained: number; mpGained: number };
```

- [x] **Step 1: 주기 성장과 초기화 실패 테스트를 작성한다.**

`proficiency`에 `liberationCycleGrowth`를 추가한다. 갑옷 HP는 옵션 레벨에 따라 `round(30 × level / 20)`, 목걸이 MP는 `round(10 × level / 20)`을 상한으로 두고 레벨당 0~상한의 균등 정수를 한 번씩 뽑는다. 3레벨 상승이면 RNG를 종류별 3회 호출한다. 0도 정상 결과다.

장비를 벗거나 재해방해도 누적치는 유지한다. `resetLevelGrowth`를 거치는 재전직/속성 재전직은 HP와 MP를 0으로 만들고, 숙련도만 초기화하는 별도 동작은 지우지 않는다. 손상된 음수·소수 저장은 안전한 음이 아닌 정수로 파싱한다.

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts src/lib/server/equipmentLiberationLevelGrowth.test.ts src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts`

Expected: FAIL.

- [x] **Step 2: 순수 성장 함수를 구현하고 정상 레벨업 경로에 연결한다.**

적용 대상은 일반/희귀/미개척지/오프라인 사냥, 경험치 서적, 정상 캐시 경험치 아이템이다. 각 경로는 경험치 적용 전 착용 장비를 읽고 실제 `levelsGained`만큼 성장시킨다. 관리자 수리·레벨 직접 부여·테스트용 grant 경로에는 연결하지 않는다.

기능 플래그가 꺼졌거나 레벨이 오르지 않았거나 해당 옵션이 없으면 RNG와 추가 저장을 수행하지 않는다. 여러 레벨을 한 번에 올릴 때 중간 장비 변경은 없으므로 시작 스냅샷 하나를 사용한다.

- [x] **Step 3: 라우트 통합 테스트를 추가한다.**

사냥, 경험치 서적, 정상 캐시 아이템에서 성장하고 관리자 grant에서 성장하지 않는지 단언한다. 재전직 후 파생 최대 HP/MP에서 누적분이 빠지는지까지 검사한다.

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts src/lib/server/equipmentLiberationLevelGrowth.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/me/use-exp-tome/route.test.ts src/app/api/v2/me/use-cash-item/route.test.ts src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts`

Expected: PASS.

- [x] **Step 4: 레벨 성장을 커밋한다.**

```bash
git add src/adventure/data/v2/proficiency.ts src/adventure/data/v2/proficiency.test.ts src/lib/server/equipmentLiberationLevelGrowth.ts src/lib/server/equipmentLiberationLevelGrowth.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/me/use-exp-tome src/app/api/v2/me/use-cash-item src/lib/server/advanceClassRoute.test.ts src/lib/server/classElementRoute.test.ts
git commit -m "feat: add liberation level growth"
```

---

## Phase 3 — 사냥 보상과 제작 할인

### Task 6: 일반 사냥 보상 분류와 확률 배율

**Files:**
- Create: `src/adventure/data/v2/liberationHuntDropCategories.ts`
- Create: `src/adventure/data/v2/liberationHuntDropCategories.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntRewards.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntRewards.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.test.ts`
- Modify: `src/adventure/data/v2/rareMaps.ts`
- Modify: `src/adventure/data/v2/rareMaps.test.ts`
- Modify: `src/adventure/data/v2/v2EquipVariance.ts`
- Modify: `src/adventure/data/v2/v2EquipVariance.test.ts`

- [x] **Step 1: 드롭 분류와 배율의 실패 테스트를 작성한다.**

명시적 Set으로 아이템을 한 번만 분류한다.

- 일반 재료: 던전 기본 재료, 정착지 재료, 길드 작업장 기본 재료, 몬스터 제작 재료.
- 특화 재료: 미개척지 특화 풀 전용 재료.
- 희귀 재료: 강화석, 스태미나 조각, 강화 불씨, 찢어진 지도 조각 등 희귀 재료. 비활성 재련석은 제외한다.
- 희귀 지도·일반 보스 소환서: 희귀 지도 종류 추첨과 `SUMMON_SCROLL_MATERIAL_ID`만 포함한다.

Set들이 서로 겹치지 않고 현재 드롭 카탈로그의 대상 아이템을 빠짐없이 분류하는지 테스트한다. 확률 효과는 퍼센트포인트가 아니라 기존 확률에 `1 + pct/100`을 곱하고 1에서 제한한다. 기존 0%는 그대로 0%다.

Run: `npm test -- src/adventure/data/v2/liberationHuntDropCategories.test.ts src/app/api/v2/dungeon/hunt/huntRewards.test.ts src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/adventure/data/v2/rareMaps.test.ts src/adventure/data/v2/v2EquipVariance.test.ts`

Expected: FAIL.

- [x] **Step 2: 골드·EXP·재료·장비·지도 배율을 추첨 전에 적용한다.**

`computeBattleRewards`는 골드/EXP 배율을 받고, `rollHuntDrops`와 내부 roll helper는 카테고리별 배율을 기본값 1인 인수로 받는다. 희귀 결과를 사후 복제하지 말고 각 Bernoulli 추첨 확률 자체에 곱한다. 장비 드롭은 일반/고유 장비 확률에 동일한 장비 배율을 적용한다.

일반 보스 소환서와 희귀 지도만 전용 배율을 받고 개인 보스 소환석·협동 보스 고유 드롭은 받지 않는다.

- [x] **Step 3: 드롭 장비 최소 품질을 전용 mint 옵션으로 구현한다.**

```ts
export function mintRolledEquipInstance(
  id: V2EquipmentId,
  rng: () => number,
  options?: { minimumQualityPct?: number },
): V2EquipInstance;
```

각 스탯 난수 구간을 최소 품질~100%로 remap해 결과 품질이 최소치 미만이 되지 않게 한다. 이 옵션은 사냥 장비 mint에만 넘기고 보스·퀘스트·제작·상점 장비에는 넘기지 않는다. 최소 품질 +10pp는 기존 품질에 사후 덧셈하지 않는다.

- [x] **Step 4: 순수 보상 테스트를 통과시킨다.**

Run: Step 1의 테스트 명령.

Expected: PASS, including unchanged snapshots when all liberation multipliers are neutral.

- [x] **Step 5: 보상 기반을 커밋한다.**

```bash
git add src/adventure/data/v2/liberationHuntDropCategories.ts src/adventure/data/v2/liberationHuntDropCategories.test.ts src/app/api/v2/dungeon/hunt/huntRewards.ts src/app/api/v2/dungeon/hunt/huntRewards.test.ts src/app/api/v2/dungeon/hunt/huntDrops.ts src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/adventure/data/v2/rareMaps.ts src/adventure/data/v2/rareMaps.test.ts src/adventure/data/v2/v2EquipVariance.ts src/adventure/data/v2/v2EquipVariance.test.ts
git commit -m "feat: add liberation hunt reward modifiers"
```

### Task 7: 전투 시작 스냅샷과 미개척지·오프라인 통합

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.test.ts`
- Modify: `src/app/api/v2/me/offline-settle/route.ts`
- Modify: `src/lib/server/offlineSettle.test.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/lib/server/unexploredHunt.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

**Interfaces:**

```ts
export type LiberationHuntSnapshot = Readonly<{
  effects: LiberationHuntEffects;
  growth: LiberationGrowthEffects;
  postHuntHpRestorePct: number;
  postHuntMpRestorePct: number;
}>;
```

- [x] **Step 1: 장비 교체 방지와 범위 제한 실패 테스트를 작성한다.**

온라인 전투는 시작 시 착용 장비를 읽은 뒤 보상까지 같은 snapshot을 쓴다. 테스트 중간에 저장 장비를 바꿔도 시작 효과가 유지되어야 한다. 오프라인 10회 정산은 최초 한 번만 snapshot을 만들고 반복 중 장비 저장을 다시 읽지 않는다.

효과 적용 범위는 일반·희귀·미개척지·오프라인 사냥뿐이다. 보스 claim, 퀘스트, 생활, 길드, 이벤트 보상에는 해방 배율이 들어가지 않는다. 승리 후 HP/MP 회복은 이 네 사냥에서만 전투 결과 저장 전에 최대치 비율로 적용하고 패배에는 적용하지 않는다.

Run: `npm test -- src/app/api/v2/dungeon/hunt/route.test.ts src/lib/server/offlineSettle.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

Expected: FAIL.

- [x] **Step 2: 사냥 컨텍스트에 불변 snapshot을 주입한다.**

`runOneHunt`는 선택적 `liberationSnapshot`을 받고 없을 때만 시작 장비에서 만든다. 오프라인 라우트는 잠금 후 정산 시작 장비로 한 번 생성해 모든 반복 호출에 전달한다. 플래그 off 또는 해방 없는 장비는 `EMPTY_LIBERATION_HUNT_SNAPSHOT`을 사용해 기존 RNG 호출 순서와 결과를 유지한다.

- [x] **Step 3: 미개척지 보상 규칙에 카테고리별 배율을 적용한다.**

`buildUnexploredRewardPlan`/`rollUnexploredHuntRewards`가 일반·특화·희귀 재료와 장비 배율을 각각 받는다. 목걸이의 일반+특화 재료 옵션은 두 카테고리에 모두 적용한다. 흔적, 보스 소환석 제작 재료 고정 소모, 개인 보스 보상에는 임의로 적용하지 않는다.

- [x] **Step 4: 통합 테스트를 통과시킨다.**

Run: Step 1의 테스트 명령.

Expected: PASS.

- [x] **Step 5: 사냥 통합을 커밋한다.**

```bash
git add src/app/api/v2/dungeon/hunt src/app/api/v2/me/offline-settle/route.ts src/lib/server/offlineSettle.test.ts src/adventure/data/v2/unexploredHuntRewards.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.ts src/lib/server/unexploredHunt.test.ts
git commit -m "feat: snapshot liberation hunt effects"
```

### Task 8: 개인 제작·조합 골드 할인

**Files:**
- Create: `src/lib/server/equipmentLiberationCraftDiscount.ts`
- Create: `src/lib/server/equipmentLiberationCraftDiscount.test.ts`
- Modify: `src/app/api/v2/guild/workshop/route.ts`
- Modify: `src/lib/server/guildWorkshopSpecializationRoute.test.ts`
- Modify: `src/app/api/v2/life-workshop/route.ts`
- Modify: `src/lib/server/lifeWorkshopRoute.test.ts`
- Modify: `src/app/api/v2/me/scavenged-crafting/route.ts`
- Modify: `src/lib/server/scavengedCraftingRoute.test.ts`
- Modify: `src/app/api/v2/me/stamina-potion-combine/route.ts`
- Create: `src/app/api/v2/me/stamina-potion-combine/route.test.ts`
- Modify: `src/lib/server/unexploredBossCraft.ts`
- Modify: `src/lib/server/unexploredBossCraft.test.ts`
- Modify: `src/app/api/v2/unexplored/craft/route.ts`
- Modify: `src/app/api/v2/unexplored/craft/route.test.ts`

**Interfaces:**

```ts
export function discountedPersonalCraftGoldCost(
  baseGoldCost: number,
  discountPct: number,
): number {
  return Math.max(0, Math.floor(baseGoldCost * (1 - discountPct / 100)));
}
```

- [x] **Step 1: 허용·제외 범위의 실패 테스트를 작성한다.**

착용 반지의 할인은 개인이 지불하는 골드에만 적용하고 재료 수량은 그대로다. 허용 범위는 길드 작업장 개인 제작, 생활 작업장 제작, 노획품 조합, 스태미나 물약 조합, 미개척지 보스 소환석 제작이다. 각 라우트는 서버에서 현재 장비를 읽어 `baseGoldCost`, 실제 `goldCost`, `liberationDiscountPct`를 계산한다.

강화, 폭풍 개량, 해방, 스킬 의식, 거래소 수수료/가격, 길드 공동 금고·자원에는 적용되지 않는 회귀 테스트를 추가한다. 장비 스위칭은 의도된 사용법이므로 각 제작 트랜잭션에서 현재 착용 반지를 판정한다.

Run: `npm test -- src/lib/server/equipmentLiberationCraftDiscount.test.ts src/lib/server/guildWorkshopSpecializationRoute.test.ts src/lib/server/lifeWorkshopRoute.test.ts src/lib/server/scavengedCraftingRoute.test.ts src/app/api/v2/me/stamina-potion-combine/route.test.ts src/lib/server/unexploredBossCraft.test.ts src/app/api/v2/unexplored/craft/route.test.ts`

Expected: FAIL.

- [x] **Step 2: 공통 할인 함수와 다섯 제작 경로를 구현한다.**

기존 각 라우트의 재료 검증과 지갑+은행 결제 순서는 유지하고 `spendGold` 직전에만 할인된 비용으로 바꾼다. GET/POST 응답이 비용을 노출하는 경로에는 기본 비용과 할인율도 함께 반환해 UI와 서버 표시가 어긋나지 않게 한다.

미개척지 소환석은 `applyUnexploredBossCraft`에 이미 할인된 비용 또는 명시적인 할인율을 전달하고, 멱등 재시도 영수증에는 최초 실제 지불 비용을 보존한다.

- [x] **Step 3: 범위 테스트를 통과시킨다.**

Run: Step 1의 테스트 명령.

Expected: PASS.

- [x] **Step 4: 제작 할인을 커밋한다.**

```bash
git add src/lib/server/equipmentLiberationCraftDiscount.ts src/lib/server/equipmentLiberationCraftDiscount.test.ts src/app/api/v2/guild/workshop/route.ts src/lib/server/guildWorkshopSpecializationRoute.test.ts src/app/api/v2/life-workshop/route.ts src/lib/server/lifeWorkshopRoute.test.ts src/app/api/v2/me/scavenged-crafting/route.ts src/lib/server/scavengedCraftingRoute.test.ts src/app/api/v2/me/stamina-potion-combine src/lib/server/unexploredBossCraft.ts src/lib/server/unexploredBossCraft.test.ts src/app/api/v2/unexplored/craft
git commit -m "feat: apply liberation crafting discount"
```

---

## Phase 4 — 게임 UI와 안전한 조작 흐름

### Task 9: 해방 작업대와 확률 안내 UI

**Files:**
- Create: `src/adventure/v2/liberation/equipmentLiberationViewModel.ts`
- Create: `src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts`
- Create: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- Create: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.test.tsx`
- Modify: `src/app/(game)/town/smithy/page.tsx`
- Create: `src/app/(game)/town/smithy/page.test.tsx`

- [x] **Step 1: 작업대 상태 모델과 정적 렌더 실패 테스트를 작성한다.**

대장간 모드에 `liberation`을 추가하되 플래그 off이면 탭과 URL 진입 모두 기존 기본 모드로 돌아간다. 좌측은 대상 가능한 6T+ 장비 목록과 장착 여부·해방 단계·줄 수를, 우측은 선택 장비·현재 옵션·비용·잔액·예상 승급률·재추첨 확률표를 표시한다.

최초 화면에는 “성공 즉시 귀속”, “줄 수 영구 고정”, 50/35/15를 표시한다. 재해방 화면에는 “현재 옵션 전체 즉시 소멸”, 현재 단계 승급률, 단계별 레벨 분포를 표시하고 별도 확인을 요구한다. 옵션 표에는 상대 가중치와 첫 줄 실제 확률을 표시하고 2·3번째 줄은 선택된 옵션 제외 후 재계산된다는 문구가 있어야 한다.

Run: `npm test -- src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/V2EnhanceView.test.tsx src/app/'(game)'/town/smithy/page.test.tsx`

Expected: FAIL.

- [x] **Step 2: 독립 패널과 대장간 탭을 구현한다.**

패널은 `V2EnhanceView` 안에 해방 로직을 모두 넣지 않고 별도 컴포넌트로 유지한다. 데스크톱은 좌측 목록/우측 상세 2열, 모바일은 목록→상세 순서의 1열이다. 패널·장비 행·확률표·경고는 공용 불투명 surface 토큰을 사용하고 배경 이미지가 비치지 않게 한다.

해방 요청은 `crypto.randomUUID()`를 쓰며 네트워크 오류로 같은 사용자가 재시도할 때만 동일 requestId를 유지한다. 성공 또는 서버의 종결 오류 뒤 다음 시도는 새 UUID를 만든다. 요청 직전 선택 장비의 `expectedRevision`을 보내고 409 stale 응답이면 최신 장비를 즉시 반영한다.

- [x] **Step 3: 딥링크와 접근성 동작을 구현한다.**

`/town/smithy?mode=liberation&item=<iid>`를 읽어 해당 인스턴스를 선택한다. 키보드로 목록 선택과 확인 대화상자를 조작할 수 있어야 하며 busy 상태에서는 중복 제출을 막는다. 단계 상승은 결과 영역에서 명확히 강조하되 애니메이션 완료 전에 실제 상태를 숨기지 않는다.

- [x] **Step 4: UI 테스트를 통과시킨다.**

Run: Step 1의 테스트 명령.

Expected: PASS.

- [x] **Step 5: 해방 작업대를 커밋한다.**

```bash
git add src/adventure/v2/liberation src/adventure/v2/V2EnhanceView.tsx src/adventure/v2/V2EnhanceView.test.tsx src/app/'(game)'/town/smithy/page.tsx src/app/'(game)'/town/smithy/page.test.tsx
git commit -m "feat: add equipment liberation workbench"
```

### Task 10: 아이템 카드, 인벤토리 진입, 처분 확인 UI

**Files:**
- Modify: `src/adventure/v2/item-card/shared.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify: `src/adventure/v2/V2InventoryView.test.tsx`
- Modify: `src/adventure/v2/V2ShopView.tsx`
- Modify: `src/adventure/v2/V2ShopView.test.ts`
- Modify: `src/adventure/v2/V2ShopView.layout.test.tsx`
- Modify: `src/adventure/v2/guild/WorkshopDismantlePanel.tsx`
- Create: `src/adventure/v2/guild/WorkshopDismantlePanel.test.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.test.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

- [x] **Step 1: 표시·바로가기·확인 UI 실패 테스트를 작성한다.**

해방 장비 카드에는 `해방 3/2/1`, 줄 수와 각 옵션의 이름·Lv·실제 수치를 표시한다. 부적격 6T 미만과 폭풍 개량 장비는 해방 버튼을 보이지 않는다. 인벤토리의 대상 장비에는 대장간 딥링크가 있고 플래그 off에서는 배지와 버튼이 모두 없다.

NPC 판매와 분해가 서버의 `bound_confirmation_required`를 받으면 장비 이름, 해방 단계와 “귀속 및 모든 해방 옵션이 영구 소멸”을 보여준 뒤 확인 시 동일 작업을 `confirmBound: true`로 다시 보낸다. 자동 일괄 판매 결과에는 건너뛴 귀속 장비 수를 알려준다.

생활 작업장과 미개척지 소환석 제작 UI는 서버가 준 기본 비용, 반지 할인율, 실제 골드 비용을 함께 표시한다.

Run: `npm test -- src/adventure/v2/item-card/V2ItemCardPopover.test.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/guild/WorkshopDismantlePanel.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL.

- [x] **Step 2: 공용 배지와 옵션 포맷터를 연결한다.**

카탈로그의 단일 포맷터를 UI가 재사용해 퍼센트와 퍼센트포인트, 배율, 정수 값이 서로 다른 화면에서 다르게 보이지 않게 한다. 카드 컨테이너는 불투명 surface를 유지하고 비활성은 글자·아이콘 색으로 표현한다.

- [x] **Step 3: 처분 재확인과 제작 비용 표시를 구현한다.**

재확인 요청 중에는 버튼을 잠그고 실패하면 현재 목록을 새로 불러온다. 클라이언트가 스스로 할인 비용을 결제 기준으로 만들지 않고 서버 응답을 권위값으로 표시한다.

- [x] **Step 4: UI 회귀 테스트를 통과시킨다.**

Run: Step 1의 테스트 명령.

Expected: PASS.

- [x] **Step 5: 통합 UI를 커밋한다.**

```bash
git add src/adventure/v2/item-card src/adventure/v2/V2InventoryView.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/V2ShopView.tsx src/adventure/v2/V2ShopView.test.ts src/adventure/v2/V2ShopView.layout.test.tsx src/adventure/v2/guild/WorkshopDismantlePanel.tsx src/adventure/v2/guild/WorkshopDismantlePanel.test.tsx src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "feat: surface liberation across equipment ui"
```

---

## Phase 5 — 확률 검증, 밸런스 시뮬레이션, 전체 회귀

### Task 11: 확률 Monte Carlo와 직업별 전투 시뮬레이션

**Files:**
- Create: `scripts/simulate-equipment-liberation.mjs`
- Create: `src/adventure/data/v2/equipmentLiberationSimulation.ts`
- Create: `src/adventure/data/v2/equipmentLiberationSimulation.test.ts`
- Modify: `package.json`

- [x] **Step 1: 결정적 시뮬레이션 요약기의 실패 테스트를 작성한다.**

고정 seed와 100,000회 실행으로 다음 통계를 반환하는 순수 함수를 정의한다.

- 최초 줄 수 비율과 단계별 레벨 분포.
- 각 부위 첫 줄 옵션 출현율.
- 해방 3→2, 2→1 평균 시도 횟수와 해방 1까지 평균 골드.
- 1/2/3줄 장비의 대표 핵심·희귀·추구 옵션 조합 출현율.
- 옵션 없음, 평균 해방 3, 평균 해방 2, 상위 해방 1 세팅의 직업별 전투 변화.

허용 오차는 이항분포 표준오차를 기준으로 명시하고 seed가 같으면 JSON 결과가 동일해야 한다.

Run: `npm test -- src/adventure/data/v2/equipmentLiberationSimulation.test.ts`

Expected: FAIL.

- [x] **Step 2: 100,000회 확률 검증과 CLI를 구현한다.**

CLI는 운영 DB를 읽지 않고 정적 카탈로그와 익명화된 고정 6T fixture만 사용한다. `npm run simulate:equipment-liberation -- --seed=20260829 --iterations=100000`으로 실행하고 사람용 표와 기계 판독 JSON 요약을 출력한다. 카탈로그 추첨 함수를 그대로 호출해 별도의 중복 수식을 만들지 않는다.

- [x] **Step 3: 직업·세팅별 전투 검증을 추가한다.**

현재 구현된 각 직업에서 물리/마법, 치명/비치명, 고방어/저방어, 회피/탱킹 대표 fixture를 포함한다. 해방 1 상위 세팅에서도 기존 엔진 상한을 우회하지 않는지, 특정 직업만 모든 피해·관통·스킬 치명 효과를 이중 적용받지 않는지, HP/MP 성장과 받는 피해 감소가 예상 축에 한 번만 들어가는지 보고한다.

- [x] **Step 4: 시뮬레이션 테스트와 실행을 통과시킨다.**

Run: `npm test -- src/adventure/data/v2/equipmentLiberationSimulation.test.ts`

Expected: PASS.

Run: `npm run simulate:equipment-liberation -- --seed=20260829 --iterations=100000`

Expected: 50/35/15, 5%, 1%와 각 옵션 이론 확률이 허용 오차 안이며 비정상 이중 적용 경고가 0개다.

- [x] **Step 5: 시뮬레이션을 커밋한다.**

```bash
git add package.json scripts/simulate-equipment-liberation.mjs src/adventure/data/v2/equipmentLiberationSimulation.ts src/adventure/data/v2/equipmentLiberationSimulation.test.ts
git commit -m "test: simulate equipment liberation outcomes"
```

### Task 12: 전체 검증과 수동 UI 점검

**Files:**
- Modify only if verification finds a defect in files already listed above.

- [x] **Step 1: 해방 관련 집중 테스트를 한 번에 실행한다.**

```bash
npm test -- \
  src/adventure/data/v2/equipmentLiberationCatalog.test.ts \
  src/adventure/data/v2/equipmentLiberation.test.ts \
  src/adventure/data/v2/equipmentLiberationEffects.test.ts \
  src/lib/server/equipmentLiberationService.test.ts \
  src/app/api/v2/me/equipment/liberate/route.test.ts \
  src/lib/server/equipmentLiberationLevelGrowth.test.ts \
  src/adventure/data/v2/liberationHuntDropCategories.test.ts \
  src/lib/server/equipmentLiberationCraftDiscount.test.ts \
  src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
```

Expected: PASS.

- [x] **Step 2: 전체 정적·회귀 검증을 실행한다.**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check-images
npm run build
```

Expected: 모든 명령 PASS. `prebuild` 이미지 최적화가 새 파일을 만든 경우 코드 참조와 파일명을 다시 검사하고 의도된 산출물만 커밋한다.

- [x] **Step 3: 플래그 off 회귀를 수동 점검한다.**

개발 서버에서 플래그를 끈 상태로 대장간, 인벤토리, 일반/희귀/미개척지/오프라인 사냥, 거래소, NPC 판매, 분해, 제작 화면을 확인한다. 해방 탭·배지·효과가 보이지 않고 기존 수치와 흐름이 동일해야 한다.

- [x] **Step 4: 플래그 on UI를 라이트·다크 및 모바일·데스크톱에서 점검한다.**

다음을 확인한다.

- 좌측 목록/우측 상세와 모바일 1열 전환.
- 최초 귀속·줄 수 경고와 재해방 전체 덮어쓰기 확인.
- 단계/줄 수/옵션 값/확률표/잔액 부족/stale 응답 표시.
- 배경 이미지가 최상위 래퍼나 중첩 카드 뒤로 비치지 않음.
- 처분 확인, 인벤토리 딥링크, 제작 할인 표시.
- 네트워크 재시도에서 같은 UUID가 재과금되지 않음.

- [x] **Step 5: 마이그레이션과 작업 트리 무결성을 확인한다.**

```bash
git diff --check
git status --short
```

마이그레이션 번호·journal·snapshot이 일치하는지, `.env.production`과 배포/점검 스크립트가 변경되지 않았는지, 기존 사용자 변경을 덮지 않았는지 확인한다.

- [x] **Step 6: 검증 중 결함이 발견되면 해당 Task로 돌아가 회귀 테스트부터 보강한다.**

수정은 결함을 만든 기존 Task의 파일과 테스트에만 반영하고 해당 집중 테스트와 Step 2 전체 검증을 다시 실행한 뒤 `fix: close equipment liberation regressions`로 커밋한다. 수정이 없으면 빈 커밋을 만들지 않는다. 기능 플래그 전환, DB 적용, 배포와 점검 모드 변경은 이 계획 범위 밖이며 실행하지 않는다.
