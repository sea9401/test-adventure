# 제작 품질 등급 시스템 설계 (crafted quality tiers)

> 상태: **구현 완료 (2026-05-11)** — §7 작업 분해대로 구현. `craftQuality.ts` / `recipes.ts`(variance + 재료) / `items.ts` 리밸런스 / `useInventory.craftedEquipment` / 장착 경로 craftTier / `lib/server/craft.ts` + `POST /api/craft` / `page.tsx` handleCraft 서버화 / 대장간·인벤·장비창 UI / `docs/items.md` 동기화. 추가로 **상점 판매**도 등급 인스턴스 지원(`sell_equipment` 에 `craftTier` 옵션 — 안 그러면 인벤에 쌓임). 단위 테스트(`craftQuality.test.ts`, `craft.test.ts`, `shop.test.ts` sell_equipment) 포함. **마켓플레이스·우편 등급 인스턴스 거래는 계속 불가**(제작서가 거래 가능하므로 의도된 제약 — §1 마지막 행).

## 0. 한 줄 요약

제작(=`/api/craft` 한 번)으로 나오는 **장비** 아이템에 한해, 그 자리에서 **품질 등급**을 굴린다. 등급에 따라 아이템의 주요 옵션이 위아래로 일정 폭(`recipe.variance`) 만큼 흔들린다. 드랍·상점·퀘스트 보상으로 얻는 장비, 그리고 포션 레시피는 변동 없음.

같이 묶어서 진행할 것: **제작 액션의 서버 권위화**(audit-findings #1 후속). 등급 롤은 서버에서 생성해야 클라 치트가 안 통한다 — 어차피 할 작업이니 한 PR로.

## 1. 게임 디자인 결정 (확정)

| 항목 | 결정 |
|---|---|
| 등급 단계 | **5단계**: `불량 / 하급 / 일반 / 고급 / 걸작`. 옵션 오프셋 `−2u / −1u / 0 / +1u / +2u`, 가중치 `6 / 22 / 44 / 22 / 6 (%)` — 가운데(`일반`)로 몰리고 양 끝이 희소. |
| 적용 대상 | **모든 제작 장비** — 무기·방어구·**액세서리 포함**, 예외 없음. 엔드게임 라인(마정석/운봉)도 똑같이 적용(별도로 폭을 좁히거나 제외하지 않음). 포션 레시피만 변동 없음. |
| 하향 롤 | **허용한다.** 아이템 카드 표시값 = `일반` 등급 = 분포의 중앙값 = 평균. 최하 등급(`불량`)은 표시값보다 낮게 나온다. → 표시값이 "정직한 평균", 운 좋은 상위 등급이 진짜 보상. |
| 기존 제작 아이템 | **너프한다.** 지금 고정 수치를 그대로 `일반` 으로 두면 `걸작`에서 너무 강해짐. → 레시피별로 `일반` 기준값을 variance 폭만큼 아래로 조정해, `걸작` 결과가 대략 "오늘의 수치 ± 약간" 선이 되게. (수치표는 §6) |
| 저수치 아이템 처리 | `baseball_bat`(atk+2) 처럼 `−2u` 가 0 이하로 떨어지는 아이템은 클램프 대신 **레시피에 등급별 5칸 표를 직접 박는다**(`varianceTable`). 비선형 조정 가능. |
| 무한 재제작(리롤) 억제 | **재료 소모량을 지금보다 늘린다.** 매 재제작에 실질 비용을 부과하는 게 1차 게이트. 별도의 "잠금/쿨다운"은 두지 않는다. (조정표는 §6) |
| 마켓플레이스 / 우편 | **제작산 등급 인스턴스는 거래·선물 불가** (제작서가 거래 가능하므로 의도된 제약). 거래소 매물은 `item_id + 수량` 기준이라 등급을 못 실음. |
| 상점 판매 | **가능** — `sell_equipment` 에 `craftTier` 옵션. 안 그러면 등급 인스턴스가 인벤에 쌓이기만 함. 가격은 등급 무관(`getItemSellPrice(id)` 그대로). |

## 2. 등급 모델

### 2.1 등급 단계 (확정)

5단계, 가운데가 표시값(`일반`, 오프셋 0), 양옆 대칭. 분포는 가운데로 몰림. 오프셋 단위 `u` = 레시피별 variance 폭(§2.2).

| 등급 | 옵션 오프셋 | 가중치 |
|---|---|---|
| 불량 | −2u | 6% |
| 하급 | −1u | 22% |
| 일반 | 0 (표시값) | 44% |
| 고급 | +1u | 22% |
| 걸작 | +2u | 6% |

→ 표시값 = 중앙값 = 평균. `걸작` 6% 가 추격 보상, `불량` 6% 가 따끔함. `u=1` 인 아이템은 −2/−1/0/+1/+2 다섯 값이 다 구분됨. 가중치는 추후 미세조정 가능.

### 2.2 옵션 오프셋 적용 규칙

레시피에 두 가지 중 하나로 variance 를 정의한다 (둘 다 미지정이면 변동 없음 = 항상 `일반` 1종):

- **`variance: Partial<EquipBonus>`** — 스탯별 폭 `u`. 등급 t ∈ {−2,−1,0,+1,+2} 에 대해 `bonus[stat] += t × u_stat`.
- **`varianceTable: Partial<Record<keyof EquipBonus, [number,number,number,number,number]>>`** — 스탯별로 `[불량, 하급, 일반, 고급, 걸작]` 다섯 칸의 **델타를 직접 명시**. 저수치 아이템(예: `baseball_bat` atk → `[−1, 0, 0, +1, +2]` 처럼 비선형) 용. `varianceTable` 이 있으면 그 스탯은 `variance` 무시.

규칙:
- 어느 스탯에 variance 를 줄지는 레시피가 명시. 보통 **주력 양수 스탯만**(무기 atk, 방어구 def, 액세서리는 그 아이템의 주력 스탯). `golem_armor` 처럼 음수 페널티 스탯(spd −3 등)은 건드리지 않음 — 등급으로 페널티가 줄거나 늘면 헷갈림. (단, 액세서리도 적용 대상이므로 `mana_bracelet`/`peak_mantle` 등에도 폭을 줌 — §6.)
- `stats: [{label,value}]` 표시 문자열은 적용된 `bonus` 로부터 다시 만들어 보여준다 (기존엔 손으로 적어둔 값 — 제작산은 동적 생성).
- 결과 스탯이 0 이하로 떨어지면 안 되는 아이템(무기 atk 등)은 `varianceTable` 로 그 등급을 직접 1 이상으로 박는다 — 코드 레벨 클램프는 두지 않음(어디서 막혔는지 안 보이게 되므로).

### 2.3 등급 타입

```ts
// src/adventure/data/craftQuality.ts (신규)
export type CraftTier = -2 | -1 | 0 | 1 | 2;        // 불량 / 하급 / 일반 / 고급 / 걸작
export const CRAFT_TIER_NAMES: Record<CraftTier, string> =
  { [-2]: "불량", [-1]: "하급", 0: "일반", 1: "고급", 2: "걸작" };
export const CRAFT_TIER_WEIGHTS: Record<CraftTier, number> =
  { [-2]: 6, [-1]: 22, 0: 44, 1: 22, 2: 6 };

export type CraftVariance = {
  variance?: Partial<EquipBonus>;                                                  // 스탯별 u
  varianceTable?: Partial<Record<keyof EquipBonus, [number,number,number,number,number]>>; // 스탯별 5칸 델타
};

// 베이스 EquipItem + variance 정의 + 등급 → bonus·stats 가 등급 반영된 EquipItem 사본
export function applyCraftTier(base: EquipItem, v: CraftVariance, tier: CraftTier): EquipItem;

// 가중 추첨 (서버에서 호출)
export function rollCraftTier(rng: () => number): CraftTier;
```

## 3. 데이터 모델 변경

### 3.1 레시피

```ts
// recipes.ts — Recipe 에 CraftVariance 를 합친다 (둘 다 옵셔널, equipment 결과에만 의미)
export type Recipe = {
  ...
  /** 등급별 ±폭. 스탯별 u. */
  variance?: Partial<EquipBonus>;
  /** 등급별 5칸 델타 직접 명시 (저수치/비선형 아이템). 해당 스탯은 variance 보다 우선. */
  varianceTable?: Partial<Record<keyof EquipBonus, [number,number,number,number,number]>>;
};
```

### 3.2 인벤토리 — 등급별 카운트 (인스턴스 ID 불필요)

제작산 장비는 **개별 인스턴스 ID 없이** `(itemId, tier)` 별 개수로 관리한다. 같은 등급의 `걸작 야구 방망이` 두 개는 서로 구별할 필요 없으므로, 기존 "record of counts" 스타일을 그대로 따른다.

```ts
// useInventory.ts
export type InventoryState = {
  potions: ...;
  equipment: Partial<Record<ItemId, number>>;          // ← 드랍/상점/퀘스트/시작장비 = "무등급"
  craftedEquipment?: Partial<Record<ItemId, Partial<Record<string /*CraftTier as "-2".."2"*/, number>>>>; // ← 제작산
  materials: ...;
  consumables: ...;
  ...
};
```

- 드랍·상점·퀘스트 보상·시작 장비 → 지금처럼 `equipment[id]++` (무등급 = `ITEMS[id].bonus` 그대로).
- 제작 → `craftedEquipment[id][tier]++`.
- UI(인벤/장비창)는 무등급 스택과 등급 스택을 **별도 항목**으로 표시. 등급 스택은 이름 옆에 등급 라벨(예: `야구 방망이 ⟨고급⟩`)과 약한 색 틴트. (`rarity` 와 별개 축 — rarity 는 아이템 고유, tier 는 제작 롤.)
- 마이그레이션: 기존 세이브에 `craftedEquipment` 없음 → `{}` 로 시작. 이미 갖고 있던 제작산 장비는 `equipment` 에 카운트로 남아 있으므로 "무등급"으로 취급되고, §6 의 리밸런스로 `ITEMS[*].bonus` 가 내려가면 **자동으로 너프 적용됨** (의도된 결과).
  - ⚠️ 부작용: `ITEMS[*].bonus` 를 내리면 같은 아이템의 **드랍분도** 같이 내려간다. 소스별로 스탯을 다르게 줄 방법은 없음(과한 복잡도). 이 게임의 튜닝 정밀도에선 수용 가능 — §6 수치표 짤 때 드랍으로도 풀리는 아이템인지 확인.

### 3.3 장착 슬롯

`EquippedSlots.weapon/armor/accessory: EquipItem | null` 는 이미 **객체 사본**을 저장한다. 제작산을 장착하면, `applyCraftTier` 로 만든 사본(=bonus·stats 가 등급 반영됨)을 넣되 어느 등급이었는지 표식을 단다:

```ts
// 장착 슬롯에 들어가는 값은 EquipItem 사본 + 선택 필드:
type EquippedItem = EquipItem & { craftTier?: CraftTier };
```

- 장착: `craftedEquipment[id][tier]--`, 슬롯에 `applyCraftTier(...)` 사본(+`craftTier`) 저장.
- 해제: 슬롯의 `craftTier` 있으면 `craftedEquipment[id][tier]++`, 없으면 `equipment[id]++` (지금 동작).
- `findItemId(item)` 는 `name` 으로 역추적 — 이름은 안 바뀌므로 그대로 동작. 등급별 스탯은 사본의 `bonus` 에 박혀 있어서 derive 단계는 손댈 필요 없음.
- `derivePlayerCombat` / `composeCharacter` 는 슬롯의 `bonus` 만 읽으므로 **변경 없음**.

## 4. 서버 권위 제작 (`POST /api/craft`)

`/api/shop` 패턴 그대로 따른다.

- body: `{ recipeId: string }`
- 흐름:
  1. `ensureUser` + `checkSession`
  2. `db.transaction` 안에서 `inventory.v2` / `crafting.v2` 잠금 →
     - 레시피 존재 + 학습 여부(`known`) 검증
     - 재료 ingredient: `materials[id] >= count` 검증
     - equip ingredient(`nailed_baseball_bat` ← `baseball_bat` 등): 무등급 카운트 우선 소모, 없으면 `craftedEquipment` 에서 **가장 낮은 tier** 부터 소모. 어느 등급을 재료로 썼는지는 결과에 영향 없음.
     - 포션 결과: `potions[potionId] + quantity <= potionMax(bonus)` 검증
  3. 적용:
     - ingredient 차감
     - equipment 결과: `tier = rollCraftTier(서버 rng)` → `craftedEquipment[itemId][tier]++` (단, 레시피에 `variance` 없으면 항상 `tier=0`)
     - 포션 결과: `potions[potionId] += quantity`
     - `crafting.v2.crafted` 에 `recipeId` 추가 (없으면)
     - `upsertSave` 로 `inventory.v2` / `crafting.v2` version++
  4. 응답: `{ ok: true, inventory: <새 inventory.v2>, crafting: <새 crafting.v2>, result: { kind: "equipment", itemId, tier } | { kind: "potion", potionId, quantity } }`
- 클라:
  - `page.tsx` 의 `handleCraft` 가 이 API 호출로 바뀜. 성공 시 `inventory.replaceFromSaved(res.inventory)` + crafting state 도 같은 식으로 replace. 이어지는 `useRemotePatch` 자동 PATCH 는 409→재시도로 자가 수렴 (상점과 동일).
  - `result.tier` 로 "**걸작!** ⟨...⟩ 을(를) 만들었다!" 같은 등급 공개 연출. 등급별 색/문구.
- 에러 코드: `unknown_recipe` / `not_learned` / `missing_material` / `missing_ingredient` / `potion_full` → `CraftError`(상점의 `ShopError` 미러).

### 4.1 서버 RNG / 검증 가능성

- 단순히 `Math.random()` 으로 충분(상점엔 난수 없지만 사냥/드랍 쪽 패턴 참고). 결정성 필요 없음.
- 클라가 등급을 못 정하므로 치트 불가. 이게 서버 권위화의 핵심 이득.

## 5. UI / 도감 영향

- **대장간(제작 화면)**: 레시피 카드에 결과 옵션을 보여줄 때, `variance` 있으면 "공격력 +2 (±1, 품질에 따라)" 같이 폭을 명시. 제작 버튼 누르면 §4 의 등급 공개 연출.
- **인벤토리(`InventoryView`)**: 무등급/등급 스택 분리 표시. 등급 라벨 + 틴트.
- **장비창**: 장착 중인 제작산은 `⟨고급⟩` 등 표기. 비교 툴팁도 등급 반영 값으로.
- **도감(`docs/items.md` + 게임 내 도감)**: 제작산 항목은 "기준 옵션 = 일반 등급, 품질에 따라 ±폭" 주석. (메모리 규칙: 아이템 표 변경 시 `docs/items.md` 동기화.)
- 등급 색/이름은 `rarityTextClass` 와 별개의 작은 헬퍼(`craftTierTextClass` 등)로.

## 6. 리밸런스 작업표 — 확정

설계 원칙:
- **전부 `u=1`** — 변동 스탯이 `−2 / −1 / 0 / +1 / +2` 5칸으로 깔끔하게 갈리고, 변동 폭(±2)은 작은 아이템엔 큰 체감(atk 3→5 = +67%), 큰 아이템엔 적당한 체감(atk 8→10 = +25%)이 됨. 더 출렁이게 하려면 개별 항목 `u` 만 키우면 됨.
- **너프**: 중반 이후 아이템은 새 `일반` 기준 = `오늘값 − 1` → `걸작`(= 일반+2) = `오늘값 + 1`(운 좋을 때만 오늘 이상), 평균 = `오늘값 − 1`.
- **초저수치(atk2/spd2/def 등) 예외**: 5칸 span(`−2u` ≥ 1) 확보를 위해 기준값을 `+1`. 미세 버프지만 튜토리얼급이라 무방 — "너무 강해지는" 게 문제인 건 중반 이후 아이템뿐.
- 변동은 **주력 한 스탯에만**. 보조 스탯·페널티 스탯은 고정. (예: `golem_armor` 는 def 만, 페널티 그대로. `bat_hood`·`sticky_cloak` 처럼 def 가 곁다리인 건 그 아이템의 정체성 스탯(spd / luk)에 변동.)
- 이 제안에선 `varianceTable` 쓰는 항목 없음(`u=1` + 소폭 기준값 조정으로 다 커버). `varianceTable` 메커니즘은 향후 비선형 아이템용으로 남겨둠.
- 재료: 보스 확정 드랍 재료(`mana_crystal` ×2/킬, `giant_scale` ×3·`unbong_ore` ×2/킬)는 **개수 안 늘림** — 첫 제작은 보스 킬이 이미 게이트. 재제작(리롤) 비용은 **파밍 가능한 재료**(`hard_crystal` 등) 증량으로 부과.
- ⚠️ `ITEMS[*].bonus` 를 내리면 같은 아이템 드랍분도 같이 내려감(소스별 분기 없음). 이 표의 아이템들은 전부 제작 전용(드랍 안 됨)이라 무관.

| recipe (아이템) | 오늘값 | 변동 스탯 | 새 기준(일반) | `recipe.variance` | 5등급 결과 (불량/하급/일반/고급/걸작) | 재료 소모 (현재 → 제안) |
|---|---|---|---|---|---|---|
| baseball_bat | atk +2 | atk | **+3** | `{ atk: 1 }` | atk 1 / 2 / **3** / 4 / 5 | branch ×1 → ×2 |
| nailed_baseball_bat | atk +3, vit +1 | atk | atk **+3** (vit +1 고정) | `{ atk: 1 }` | atk 1 / 2 / **3** / 4 / 5 | baseball_bat ×1 + rusty_nail ×20 → +rusty_nail ×28 |
| squishy_armor | def +3 | def | **+3** | `{ def: 1 }` | def 1 / 2 / **3** / 4 / 5 | slime_core ×1 + slime_chunk ×10 → slime_chunk ×16 |
| sticky_cloak | def +2, luk +4 | luk | luk **+4** (def +2 고정) | `{ luk: 1 }` | luk 2 / 3 / **4** / 5 / 6 | spider_silk ×5 + slime_chunk ×3 → ×7 + ×5 |
| bat_hood | def +1, spd +2 | spd | spd **+3** (def +1 고정) | `{ spd: 1 }` | spd 1 / 2 / **3** / 4 / 5 | bat_eye ×2 + wilddog_hide ×2 → ×3 + ×3 |
| golem_armor | def +7 (atk−1/spd−3/luk−1) | def | **+6** (페널티 고정) | `{ def: 1 }` | def 4 / 5 / **6** / 7 / 8 | ruin_fragment ×5 + spider_silk ×5 + slime_chunk ×3 → ×7 + ×7 + ×5 |
| crystal_dagger | atk +5, dex +1 | atk | **+4** (dex +1 고정) | `{ atk: 1 }` | atk 2 / 3 / **4** / 5 / 6 | hard_crystal ×2 + wilddog_fang ×3 → ×3 + ×4 |
| fairy_blessing | vit +3, luk +2 | vit | vit **+3** (luk +2 고정) | `{ vit: 1 }` | vit 1 / 2 / **3** / 4 / 5 | vitality_ring ×1 + fairy_dust ×3 → fairy_dust ×5 |
| mana_sword / mana_shield / mana_spear / mana_knuckle | atk +7, 보조 +3~5 | atk | **+6** (보조 고정) | `{ atk: 1 }` | atk 4 / 5 / **6** / 7 / 8 | mana_crystal ×2 + hard_crystal ×5 → hard_crystal ×8 |
| mana_bracelet | vit +3, spd +2 | vit | vit **+3** (spd +2 고정) | `{ vit: 1 }` | vit 1 / 2 / **3** / 4 / 5 | mana_crystal ×2 → mana_crystal ×2 + **hard_crystal ×3** (신규) |
| peak_sword / peak_shield / peak_spear / peak_claw | atk +9, 보조 +5~6 | atk | **+8** (보조 고정) | `{ atk: 1 }` | atk 6 / 7 / **8** / 9 / 10 | giant_scale ×2 + unbong_ore ×3 + hard_crystal ×5 → hard_crystal ×8 |
| peak_mantle | dex +5, spd +4 | dex | **+4** (spd +4 고정) | `{ dex: 1 }` | dex 2 / 3 / **4** / 5 / 6 | giant_scale ×3 + unbong_ore ×2 → + **hard_crystal ×3** (신규) |
| peak_heart | str +5, vit +3 | str | **+4** (vit +3 고정) | `{ str: 1 }` | str 2 / 3 / **4** / 5 / 6 | giant_scale ×2 + unbong_ore ×2 → + **hard_crystal ×3** (신규) |
| potion_heal_s | — | — | (포션, 변동 없음) | — | — | slime_chunk ×3 → 유지 (리롤 동기 없음) |

검토 결과 (확정): ① `u=1` 유지 ② 너프 폭 `−1` 유지 ③ `mana_bracelet`/`peak_mantle`/`peak_heart` 에 `hard_crystal ×3` 추가 ④ `bat_hood`·`baseball_bat` 기준값 `+1` OK ⑤ 재료 증량폭 그대로.

## 7. 작업 분해 (대략)

1. `craftQuality.ts` — 타입/이름/가중치/`applyCraftTier`/`rollCraftTier`. + 단위 테스트(분포·오프셋·하한 클램프).
2. `recipes.ts` — `variance` 필드 추가, 레시피별 값(§6).
3. `items.ts` — 기존 제작산 `bonus`/`stats` 리밸런스(§6). `docs/items.md` 동기화.
4. `useInventory.ts` — `craftedEquipment` 추가, add/consume 헬퍼, `readInitial` 마이그레이션.
5. 장착 경로(`useCharacterState`/`composeCharacter` 주변) — `craftTier` 표식, equip/unequip 분기.
6. `lib/server/craft.ts` + `POST /api/craft` — 검증·적용·롤 (상점 미러). `CraftError`.
7. `page.tsx` `handleCraft` — API 호출로 교체, 등급 공개 연출.
8. UI — 대장간 카드(폭 표기), 인벤(스택 분리·라벨), 장비창(등급 표기), 도감.
9. (보류) 마켓플레이스/우편 등급 인스턴스 거래 — 별도 작업.

## 8. 결정 요약 (전부 확정)

5단계 `불량/하급/일반/고급/걸작` · 오프셋 `−2u/−1u/0/+1u/+2u` · 가중치 `6/22/44/22/6` · 모든 제작 장비에 적용(액세서리·엔드게임 포함, 포션만 제외) · 전부 `u=1` · 하향 롤 허용, 표시값 = `일반` = 평균 · 기존 제작 아이템 너프(중반 이후 `−1`, 초저수치는 `+1`) · §6 수치표대로 · 재료 소모량 §6대로 증량 · `varianceTable` 메커니즘은 향후용으로만(이번엔 미사용) · 거래/우편 v1 제외 · `/api/craft` 서버 권위화 동시 진행 · 인벤은 `craftedEquipment` 등급별 카운트, 장착 슬롯엔 등급 반영 사본 + `craftTier`.
