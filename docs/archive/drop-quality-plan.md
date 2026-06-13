# 드랍 품질 등급 시스템 설계 (drop quality tiers)

> 상태: **구현 완료 (2026-05-12, 미커밋).** `crafted-quality-plan.md` 의 경량 변형. 제작 등급(`craftQuality.ts` / `craftedEquipment` / `craftTier`) 인프라를 최대한 재사용하되, **드랍 전용 명칭·전용 저장 버킷**으로 제작산과 섞이지 않게 한다. 구현 산출물: `src/adventure/data/dropQuality.ts`(+테스트) / `EquipItem.dropVariance` / `Monster.dropQualityBias` / `useInventory.droppedEquipment` / `EquippedItem.dropQuality` + `rehydrateSlot` / `onBattleEnd`·`offlineSim`·`applyResultToSaves` 드랍 롤 / `AutoHuntResultModal`·`InventoryView`·`CharacterMini` prefix 표시 / `sell_equipment` 의 `dropQuality` 옵션(`shop.ts`/`ShopView`/`/api/shop`) / `craft.ts` 가 equip 재료를 드랍산에서도 소비.

## 0. 한 줄 요약

몬스터·보스가 떨구는 **장비**에 한해, 드랍 시점에 **품질 등급을 위로만** 굴린다. 대부분(기본 ~95%)은 그대로 떨어지고, 가끔 **「정교한 ○○」**(+1u, ~4%), 드물게 **「빼어난 ○○」**(+2u, ~1%) 가 나온다 — 주력 양수 스탯이 그만큼 올라간 인스턴스. 하향 롤(불량 류)은 없다. **보스·고티어 몬스터는 `dropQualityBias` 로 좋은 품질이 더 잘 나온다.** 제작 등급(`불량/하급/일반/고급/걸작`)과는 **별개 명칭·별개 인벤 칸**.

퀘스트 보상 장비·상점 장비·시작 장비는 변동 없음. 포션은 해당 없음.

## 1. 게임 디자인 결정

| 항목 | 결정 |
|---|---|
| 적용 대상 | **몬스터/보스 장비 드랍만.** 퀘스트 보상 장비는 고정(보상 계약 유지), 상점·시작 장비도 고정. |
| 등급 단계 | **3단계, 위로만**: `기본`(접두어 없음) / `정교한`(+1u) / `빼어난`(+2u). 하향 롤 없음. |
| 명칭 | 드랍 전용 — `정교한 / 빼어난`. 제작 등급은 그대로 `불량/하급/일반/고급/걸작` (변경 없음). |
| 표시값 | 아이템 카드의 `stats` = `기본` 등급 = **최저 보장치**(평균 아님). 제작산은 표시값=평균, 드랍산은 표시값=하한 — 의도된 비대칭(드랍은 이미 드랍률 게이트를 통과했으므로 추가 하향은 이중 처벌). |
| 가중치 (기본) | `기본 95 / 정교한 4 / 빼어난 1` (raw weight, 정규화). 체감상 정교한 ≈ 25판당 1개, 빼어난 ≈ 100판당 1개 — '잭팟' 톤. |
| 보스/티어 보정 | **v1 부터 포함.** `Monster.dropQualityBias?: number`(기본 1)가 **비-기본 등급(1·2) 가중치에 곱**해진 뒤 정규화된다. bias 미지정 잡몹 = 95/4/1. 권장 값: 미니보스/고티어 = 2 → ≈ 90.5/7.6/1.9, 지역 보스 = 3 → ≈ 86.4/10.9/2.7, 레이드급(운봉·봉황 류) = 4 → ≈ 82.6/13.9/3.5. (값만 데이터로 박으면 됨 — 비율은 자동.) |
| variance 정의 | **기본 규칙**: u=1, 그 아이템의 **주력 양수 스탯**에 `+tier × 1`. 별도 데이터 불필요. 특수 아이템만 `EquipItem.dropVariance`(= `CraftVariance` 와 같은 형태) 로 override. 주력 양수 스탯 = `bonus` 의 최대 양수 항목, 동률이면 슬롯 기본(weapon→atk, armor→def, else `BONUS_KEYS` 순). 양수 보너스가 없는 장비(드뭄)는 항상 `기본`. |
| 마켓플레이스 / 우편 | **드랍 품질 인스턴스도 거래·선물 불가** (제작산과 동일 — 매물이 `item_id + 수량` 기준이라 인스턴스 등급을 못 실음). 인스턴스 거래는 제작·드랍 통합 후속 과제. |
| 상점 판매 | **가능** — `sell_equipment` 에 `dropQuality` 옵션(제작산의 `craftTier` 옵션과 대칭). 안 그러면 가방에 쌓이기만 함. 가격은 등급 무관(`getItemSellPrice(id)` 그대로). |
| 서버 권위 | 자동사냥(위탁) 드랍은 서버에서 롤(`offlineSim` 이 collect 트랜잭션 안에서 seeded rng 로 돌므로 그 스트림에 추가). 라이브 전투 드랍은 클라에서 롤 — 라이브 전투 자체가 클라 신뢰 모델이라 일관됨. |

## 2. 등급 모델

```ts
// src/adventure/data/dropQuality.ts (신규) — craftQuality.ts 와 평행 구조
export type DropQuality = 0 | 1 | 2;                 // 기본 / 정교한 / 빼어난
export const DROP_QUALITIES: readonly DropQuality[] = [0, 1, 2];
export const DROP_QUALITY_NAMES: Record<DropQuality, string> =
  { 0: "", 1: "정교한", 2: "빼어난" };               // 0 은 접두어 없음

// raw weight. bias 가 비-기본 등급(1·2)에만 곱해진 뒤 합으로 정규화.
const DROP_QUALITY_WEIGHTS: Record<DropQuality, number> = { 0: 95, 1: 4, 2: 1 };

export type DroppedEquipItem = EquipItem & { dropQuality: DropQuality };

// rng 가중 추첨 — 서버(위탁) / 클라(라이브) 양쪽에서 호출.
// bias(기본 1): 1·2 등급 가중치 배수. 보스·고티어 몬스터는 monster.dropQualityBias 를 그대로 넘긴다.
export function rollDropQuality(rng: () => number, bias = 1): DropQuality;

// 베이스 + 품질 → bonus·stats·이름 prefix 가 반영된 사본(+ dropQuality 마커).
// variance 가 없으면 베이스 그대로(+ 마커). dropQuality 0 이면 변동 없음.
export function applyDropQuality(base: EquipItem, q: DropQuality): DroppedEquipItem;

// 표시 헬퍼 (craftTierSuffix / craftTierTextClass 와 대칭).
export function dropQualitySuffix(q: DropQuality | null | undefined): string;     // "" | " · 정교한" 등
export function dropQualityTextClass(q: DropQuality | null | undefined): string;  // 0=기본톤, 1=teal, 2=amber
```

- `applyDropQuality` 의 stats 문자열 재생성은 `craftQuality` 의 `rebuildStats` 와 동일 로직 — 공용 유틸로 빼서 양쪽이 쓰게 한다(`items.ts` 의 `BONUS_LABELS`/`signedBonus` 기반).
- 주력 스탯 산정(`primaryPositiveStat(item): keyof EquipBonus | null`)도 `dropQuality.ts` 에 둔다 — `dropVariance` override 가 없을 때의 기본 variance(`{ [stat]: 1 }`)를 만든다.

## 3. 데이터 모델 변경

### 3.1 아이템 (`items.ts`)

```ts
export type EquipItem = {
  // ...기존...
  /** 드랍 품질 variance override. 미지정이면 "주력 양수 스탯 +1u" 기본 규칙. 적용 대상 아님(퀘 보상 등)이라도 무해 — 드랍 경로에서만 참조. */
  dropVariance?: CraftVariance;
};
```

특수 케이스만 명시 (예: 저수치 무기는 `dropVariance: { varianceTable: { atk: [0,0,0,1,2] } }` 같은 식 — 다만 3칸 모델이라 `[기본,정교한,빼어난]` 3칸 테이블 변형이 필요. → `DropVariance` 는 `craftQuality` 의 5칸 `varianceTable` 대신 **3칸**(`[number,number,number]`)을 쓰는 별 타입으로 둔다. `variance:Partial<EquipBonus>` 는 그대로 공유 가능). 대부분 아이템은 override 없음 = 데이터 작업 거의 없음.

### 3.1b 몬스터 (`monsters.ts`)

```ts
export type Monster = {
  // ...기존...
  /** 비-기본 드랍 품질(정교한·빼어난) 가중치 배수. 기본 1. 미니보스 2 / 지역 보스 3 / 레이드급 4 권장. */
  dropQualityBias?: number;
};
```

기존 보스(`world.ts` 의 `boss` 참조 몬스터)·고티어 라인에 한 줄씩 추가. 잡몹은 미지정 = 1.

### 3.2 인벤토리 (`useInventory.ts`)

`craftedEquipment[id][craftTier]` 와 평행하게:

```ts
type InventoryState = {
  // ...
  craftedEquipment: CraftedEquipmentState;   // 기존: 비-기본 craftTier(−2..−1, 1..2)
  droppedEquipment: DroppedEquipmentState;    // 신규: 비-기본 dropQuality(1, 2) → 개수
};
```

- `dropQuality 0` 인 드랍은 기존 `equipment[id]` 통짜 카운트에 그대로 (변동 없는 평범한 장비 — 지금과 동일).
- `addDroppedEquipment(id, q, n=1)`, `removeDroppedEquipment(id, q, n)`, `hasDroppedEquipment` — `crafted*` 함수들 그대로 복제.
- 마이그레이션 불필요 — 새 키, 기존 데이터 무영향.

### 3.3 장착 슬롯 (`character/types.ts`, `useCharacterState.ts`)

`EquippedItem.craftTier?: CraftTier` 와 나란히 `EquippedItem.dropQuality?: DropQuality`. `rehydrateSlot` 이 `findItemId` 후:
- `craftTier != null && tier !== 0` → `resolveCraftedItem(id, tier)` (기존)
- `dropQuality != null && dropQuality !== 0` → `resolveDroppedItem(id, q)` (신규, `dropQuality.ts` + `items.ts` 묶음)
- 둘 다 없으면 `ITEMS[id]` (기존)

`derivePlayerCombat` 입력은 EquipItem 의 `bonus` 만 보므로 변경 불필요 (이미 등급 반영된 사본이 들어감).

### 3.4 드랍 결과 (`offlineSim.ts`, `onBattleEnd.ts`)

`equipsGained: ItemId[]` → `equipsGained: { itemId: ItemId; quality: DropQuality }[]`.
- `offlineSim`: 드랍 확정 시 `rollDropQuality(rng, monster.dropQualityBias ?? 1)` (seeded 스트림에 추가 — collect replay 결정성 유지).
- `autoHunt.ts` 효율 후처리(`equipsGained.filter(() => rng() < efficiency)`) — 항목 모양만 바뀜.
- `AutoHuntResultModal`: prefix 붙여 표시.
- `applyResultToSaves` (`lib/server/autoHunt.ts`): `quality === 0` → `equipment[itemId]++`, `quality > 0` → `droppedEquipment[itemId][quality]++`. → `loadStateForSim` 이 잠그는 키에 `inventory.v2` 는 이미 포함.
- `onBattleEnd` (라이브): 드랍 시 `rollDropQuality(Math.random, monster.dropQualityBias ?? 1)` → 0 이면 `addEquipment`, >0 이면 `addDroppedEquipment`. 드랍 모달도 prefix.

### 3.5 상점 (`lib/server/shop.ts`, `ShopView.tsx`)

`sell_equipment` 액션에 `dropQuality?: DropQuality` 옵션 추가 (제작산 `craftTier` 와 같은 패턴) — 해당 인스턴스를 `droppedEquipment` 에서 차감, 가격은 `getItemSellPrice(id)`. `ShopView` 의 판매 목록 조립부가 `craftedEquipment` 펼치듯 `droppedEquipment` 도 펼침.

## 4. UI

- **드랍/수령 모달, 인벤토리, 장비창, 상점 판매 목록**: 이름 앞 prefix(`정교한 ○○` / `빼어난 ○○`) + `dropQualityTextClass` 색 강조 (1=teal, 2=amber — `ItemRarity` 색·`craftTierTextClass` 색과 안 겹치게). 압축 행 패턴 유지 — prefix 는 이름 안에, 별도 행 추가 없음.
- 인벤 비교 diff: `craftedEquipment` 와 동일하게 `bonus` 기준 비교 (이미 등급 반영된 사본이라 자동).
- `docs/items.md`: 드랍 품질 적용 표기 + `dropVariance` override 가 있는 아이템만 그 표를 도감에 명시 (아이템 추가 시 도감 동기화 룰 준수).

## 5. 작업 분해 (한 PR 권장)

1. `src/adventure/data/dropQuality.ts` 신규 — 타입·가중치·`rollDropQuality(rng, bias)`·`applyDropQuality`·`primaryPositiveStat`·표시 헬퍼. `rebuildStats` 는 `craftQuality.ts` 에서 공용 유틸로 추출해 공유.
2. `items.ts` — `EquipItem.dropVariance?` 필드 + `resolveDroppedItem(id, q)` 헬퍼(또는 `dropQuality.ts` 에).
2b. `monsters.ts` — `Monster.dropQualityBias?` 필드 + 보스/고티어 라인에 값 박기 (미니보스 2 / 지역 보스 3 / 레이드급 4).
3. `useInventory.ts` — `droppedEquipment` 상태 + `addDroppedEquipment`/`removeDroppedEquipment`/`hasDroppedEquipment` + 읽기 정규화.
4. `character/types.ts` + `useCharacterState.ts` — `EquippedItem.dropQuality` + `rehydrateSlot` 분기.
5. `offlineSim.ts` — `equipsGained` 항목 타입 변경 + `rollDropQuality(rng, monster.dropQualityBias ?? 1)`. `autoHunt.ts`(효율 필터)·`AutoHuntResultModal`·`summarizeOfflineResult` 따라 수정.
6. `lib/server/autoHunt.ts` `applyResultToSaves` — `quality>0` → `droppedEquipment` 반영.
7. `onBattleEnd.ts` + 라이브 드랍 모달 — `rollDropQuality(Math.random)` 분기 + prefix.
8. `lib/server/shop.ts` + `ShopView.tsx` — `sell_equipment` 의 `dropQuality` 옵션 + 판매 목록 펼침.
9. UI prefix·색상: 인벤/장비창/드랍 모달.
10. `docs/items.md` 동기화. `docs/changelog.md` 한 줄.
11. 테스트: `dropQuality.test.ts`(분포 근사·`applyDropQuality` 수치·`primaryPositiveStat`), `offlineSim` 드랍 테스트가 있으면 항목 모양 갱신, `shop.test.ts` `sell_equipment` + `dropQuality`.

## 6. 미정·후속

- 인스턴스 거래(제작·드랍 통합) — 거래소 매물에 인스턴스 등급을 싣는 별건. 그게 되면 마켓플레이스 비거래 제약 해제.
- `빼어난` 위 4단계(`걸출한`, `+3u`) 추가 여부 — v1 은 3단계. 필요하면 가중치(예: 95/3.5/1/0.5)만 조정 + `DropQuality` 타입에 3 추가.
- `dropQualityBias` 권장값 튜닝 — v1 은 1/2/3/4. 운영 데이터 보고 조정.
- `craftQuality.ts` 와 `dropQuality.ts` 의 중복(추첨/적용/표시 헬퍼) — 공용 `instanceQuality` 모듈로 합칠지는 구현하며 판단(과합치면 분기만 늘어남).
