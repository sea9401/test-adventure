# Unexplored Specialty Drop Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 별의 무덤 구간에 선택 가능한 미개척지 특화 몬스터 풀 12종과 전용 3부위 세트 36종을 추가하고, 드롭·장비 집계·PvE/PvP 전투·도감과 사냥 UI에서 승인된 수치와 발동 경계를 동일하게 적용한다.

**Architecture:** 신규 장비와 풀 메타데이터는 각각 독립된 데이터 모듈에 두고 기존 장비 카탈로그와 사냥 라우트가 이를 합성한다. 세트의 정적 보너스는 기존 태그 세트 집계를 확장하고, 상태를 요구하는 고유 효과는 `UnexploredSetEffect`와 `UnexploredSetRuntime`이라는 별도 판별 유니언으로 PvE/PvP 엔진에 전달한다. 신규 장비 드롭은 기존 정규·유니크 드롭과 별개의 마지막 RNG 슬롯으로 추가해 기존 결과 순서를 보존한다.

**Tech Stack:** Next.js 16.2 App Router Route Handlers, React 19 client components, TypeScript 5, Vitest 4, React Testing Library, 기존 JSON save(`character.v2`, `equipment.v2`)

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-09-09-unexplored-specialty-drop-sets-design.md`이며 장비 이름, 위력, 옵션, 세트 수치와 전투 경계는 그대로 옮긴다.
- 신규 장비는 총 36종, 화면 표시 6티어, 일반 희귀도, 무기 외 슬롯이며 중복 획득과 거래를 허용한다.
- 전용 장비 기본 드롭률은 0.4%, 해당 풀 집중 시 0.6%다. 기존 특화 재료 1%/1.5%, 희귀 무기 0.1%/0.2%와 정규·유니크 장비 굴림은 변경하지 않는다.
- 2세트와 3세트 보너스는 누적하고, 기존 무기 포함 3세트와 신규 3세트의 `3+3` 조합을 허용한다.
- 상태 이상 지속 피해 증가는 착용자가 부여한 중독·출혈·연소 주기 피해에만 적용하고 부여 확률, 스택, 즉발 피해와 부가 효과는 바꾸지 않는다.
- 일반 회피는 직접 피해 경감이며 완전 회피는 기존 그림자도약 같은 별도 무효화 판정만 뜻한다.
- 회복량 증가가 `군체 재생`에 적용되면 안 되고, 회복 감소·회복 불가는 적용해야 한다.
- 기존 플레이어의 기본 모드는 `standard`로 파싱해 별의 무덤의 현재 몬스터와 드롭 결과를 바꾸지 않는다.
- 특화 사냥은 깊이 79~84에서만 허용한다. `random`은 12개 풀 중 하나를 무작위 선택하고 0.4%, `focused`는 저장된 한 풀만 선택하고 0.6%를 적용한다.
- 신규 전용 장비의 0.4%/0.6%는 최종 확률이며 희귀 지도·장비 해방 배율을 곱하지 않는다. 특화 조우를 사용하지 않는 희귀 지도에서는 신규 전용 장비를 굴리지 않는다.
- 신규 PNG나 WebP는 추가하지 않고 현재 `public/images/monster/v2/` 이미지를 재사용한다. 따라서 이미지 최적화 프로필은 변경하지 않는다.
- 새 UI의 패널과 카드는 `src/components/ui/surfaces.ts`의 불투명 표면 상수를 사용하고 컨테이너 전체 `opacity-*`를 적용하지 않는다.
- DB 테이블이나 마이그레이션은 추가하지 않는다. 새 집중 설정은 `character.v2` JSON save의 선택 필드로 저장하며 잘못된 값은 `standard`로 복구한다.
- 구현, 테스트와 로컬 커밋까지만 수행한다. 배포와 점검 모드 변경은 범위 밖이다.

## File Structure

- Create `src/adventure/data/v2/unexploredSpecialtyEquipment.ts`: 36개 장비 원본과 12개 태그 세트 정의의 단일 소스.
- Create `src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts`: 장비 수, 슬롯, 수치, 세트 역참조와 2/3세트 스냅샷.
- Create `src/adventure/data/v2/unexploredSpecialtyPools.ts`: 12개 풀, 36개 몬스터 표시 정보, 집중 설정 파서와 조우 선택 순수 함수.
- Create `src/adventure/data/v2/unexploredSpecialtyPools.test.ts`: 풀/몬스터/드롭 장비의 일대일 연결과 선택 확률 경계.
- Create `src/app/api/v2/dungeon/specialty-focus/route.ts`: 집중 설정 조회·저장 Route Handler.
- Create `src/app/api/v2/dungeon/specialty-focus/route.test.ts`: 인증, 해금 깊이, 입력 검증과 기존 save 보존.
- Create `src/adventure/v2/combat/unexploredSetEffects.ts`: 활성 효과 조회, 정적 배율과 상태 전이의 PvE/PvP 공용 순수 함수.
- Create `src/adventure/v2/combat/unexploredSetEffects.test.ts`: 12세트 공용 경계 단위 테스트.
- Create `src/adventure/v2/combat/unexploredSetPve.test.ts`: 실제 PvE 엔진 통합 회귀 테스트.
- Create `src/adventure/v2/combat/unexploredSetPvp.test.ts`: 실제 PvP 엔진 대칭 통합 회귀 테스트.
- Create `src/adventure/v2/UnexploredSpecialtyPanel.tsx`: 일반/무작위/집중 선택과 풀별 몬스터·드롭 목록.
- Create `src/adventure/v2/UnexploredSpecialtyPanel.test.tsx`: 접근성, 불투명 표면, 저장 요청과 확률 문구 테스트.
- Create `scripts/sim-unexplored-specialty-sets.ts`: 기존 6티어와 신규 단일/`3+3` 대표 조합 비교 리포트.
- Modify `src/adventure/data/v2/v2EquipmentCatalog.ts`: 신규 장비 원본을 카탈로그에 합성.
- Modify `src/adventure/data/v2/v2EquipmentTypes.ts`: 정적 세트 옵션과 특화 효과 판별 타입 추가.
- Modify `src/adventure/data/v2/v2Equipment.ts`: 신규 세트 합성, 표시 라벨과 활성 효과 수집 공개.
- Modify `src/adventure/data/v2/v2EquipVariance.ts`: 새 옵션 키의 굴림·품질 가중치 처리.
- Modify `src/lib/server/derivePlayerEquipmentV2.ts`: 2/3세트 정적 보너스와 활성 특화 효과 집계.
- Modify `src/lib/server/derivePlayerCombatV2.ts`: 집계 결과를 `PlayerCombat`에 연결.
- Modify `src/adventure/v2/combat/engineState.ts`: 전투 중 특화 세트 상태와 플레이어 정적 계수 추가.
- Modify `src/adventure/v2/combat/engine.ts`: PvE 초기화, 행동 종료, 지속 피해 틱 연결.
- Modify `src/adventure/v2/combat/engine.playerPhase.ts`: 평타·직접 스킬 공격형 효과 연결.
- Modify `src/adventure/v2/combat/engine.enemyPhase.ts`: 실제 HP 피해, 회피 경감량과 적 행동 종료 생존 효과 연결.
- Modify `src/adventure/v2/combat/engine-pvp.ts`: PvP 초기화·지속 피해·공통 상태 처리.
- Modify `src/adventure/v2/combat/engine.pvpPhase.ts`: 양쪽 공격/피격 효과의 대칭 처리.
- Modify `src/adventure/v2/combat/playerDotDamage.ts`: 중독·출혈·연소 통합 증폭 적용.
- Modify `src/app/api/v2/dungeon/hunt/huntCharacter.ts`: 집중 설정을 포함하는 character save 타입.
- Modify `src/app/api/v2/dungeon/hunt/huntDrops.ts`: 독립 특화 장비 굴림과 mint.
- Modify `src/app/api/v2/dungeon/hunt/huntDrops.test.ts`: 기존 RNG 보존과 신규 드롭 반복 정산 테스트.
- Modify `src/app/api/v2/dungeon/hunt/route.ts`: 저장된 모드로 조우를 선택하고 신규 드롭을 응답·도감에 연결.
- Modify `src/adventure/v2/useDungeonHunt.ts`: 단판·일괄 응답의 특화 드롭 필드 처리.
- Modify `src/adventure/v2/V2DungeonFloorView.tsx`: 79~84에서 특화 패널을 노출하고 모드 변경 뒤 상태 새로고침.
- Modify `src/adventure/v2/V2CodexView.tsx`: 풀별 3종 드롭 출처와 기본/집중 확률 표시.
- Modify `src/adventure/v2/item-card/V2ItemCardPopover.tsx`: 신규 정적 옵션과 특화 고유 효과 설명 표시.
- Modify `src/adventure/v2/item-card/V2ItemCompareCard.tsx`: 비교 카드에서 신규 정적 옵션 표시.
- Modify `src/adventure/data/v2/equipmentProgression.ts`: `v2_unexplored_` 장비의 별의 무덤 돌파 요구치 78 고정.

---

### Task 1: 장비 36종과 12개 세트의 데이터 계약

**Files:**
- Create: `src/adventure/data/v2/unexploredSpecialtyEquipment.ts`
- Create: `src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2EquipmentTypes.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2EquipVariance.ts`
- Modify: `src/adventure/data/v2/v2EquipVariance.test.ts`
- Test: `src/adventure/data/v2/v2Equipment.test.ts`

**Interfaces:**
- Produces: `UNEXPLORED_SPECIALTY_EQUIPMENT`, `UNEXPLORED_SPECIALTY_TAG_SETS`, `UnexploredSetEffect`, `collectUnexploredSetEffects(equipped)`.
- Consumes: 기존 `V2EquipmentBase`, `V2EquipOptions`, `V2EquipTagSet`, 카탈로그 스케일과 `setTags` 집계 규칙.

- [ ] **Step 1: 신규 데이터의 실패 테스트를 작성한다**

```ts
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, V2_EQUIP_TAG_SETS, v2EquipCatalogTierToDisplayTier } from "./v2Equipment";
import {
  UNEXPLORED_SPECIALTY_EQUIPMENT_IDS,
  UNEXPLORED_SPECIALTY_SET_IDS,
} from "./unexploredSpecialtyEquipment";

describe("unexplored specialty equipment", () => {
  it("36개 장비와 12개 2/3단계 세트를 노출한다", () => {
    expect(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS).toHaveLength(36);
    expect(new Set(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS).size).toBe(36);
    expect(UNEXPLORED_SPECIALTY_SET_IDS).toHaveLength(12);
    for (const id of UNEXPLORED_SPECIALTY_EQUIPMENT_IDS) {
      expect(v2EquipCatalogTierToDisplayTier(V2_EQUIPMENT[id].tier)).toBe(6);
      expect(V2_EQUIPMENT[id].slot).not.toBe("weapon");
      expect(V2_EQUIPMENT[id].rarity ?? "common").toBe("common");
      expect(V2_EQUIPMENT[id].noDrop).toBe(true);
    }
    for (const id of UNEXPLORED_SPECIALTY_SET_IDS) {
      const set = V2_EQUIP_TAG_SETS.find((candidate) => candidate.id === id)!;
      expect(set.thresholds.map(({ count }) => count)).toEqual([2, 3]);
      expect(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS.filter(
        (itemId) => V2_EQUIPMENT[itemId].setTags?.includes(id),
      )).toHaveLength(3);
    }
  });
});
```

- [ ] **Step 2: 집중 테스트를 실행해 RED를 확인한다**

Run: `npx vitest run src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts`

Expected: FAIL because `unexploredSpecialtyEquipment` and its exports do not exist.

- [ ] **Step 3: 장비·세트 타입을 확장한다**

`V2EquipOptions`와 `V2EquipAggregate`에서 아래 세 값은 세트 보너스로만 사용한다. 아이템 원본 옵션에는 넣지 않으므로 개체 편차가 고유 효과 계수를 굴리지 않는다.

```ts
export type V2EquipOptions = {
  // existing fields...
  basicAttackDamagePct?: number;
  extraBasicAttackDamagePct?: number;
  statusDotDamagePct?: number;
};

export type UnexploredSetEffect =
  | { kind: "iron_wall"; label: "철벽 누적" }
  | { kind: "mana_redeployment"; label: "영맥 재전개" }
  | { kind: "colony_regeneration"; label: "군체 재생" }
  | { kind: "battle_revenge"; label: "격전 본능" }
  | { kind: "crystal_focus"; label: "수정 집속" }
  | { kind: "precision_shot"; label: "정밀 사격" }
  | { kind: "chain_drive"; label: "연쇄 구동" }
  | { kind: "afterimage_coating"; label: "허상 피막" }
  | { kind: "unyielding_dead"; label: "망자의 완강" }
  | { kind: "frost_mark"; label: "서리 표식" }
  | { kind: "freezing_lock"; label: "빙점 봉쇄" }
  | { kind: "colossus_crush"; label: "거수 파쇄" };
```

`V2EquipTagSet.thresholds`에 `effect?: UnexploredSetEffect`를 추가한다. `V2_EQUIP_OPTION_KEYS`, 옵션 라벨, 퍼센트 키와 품질 가중치 레코드도 세 키를 빠짐없이 받되 품질 가중치는 `0`으로 두어 세트 보너스가 개체 굴림 품질에 섞이지 않게 한다.

- [ ] **Step 4: 36개 장비 원본을 별도 모듈에 작성한다**

ID와 세트 ID는 아래 표를 고정 계약으로 사용하고, 각 객체의 `name`, `power`, `options`는 승인 설계 문서의 같은 행을 그대로 옮긴다. 모든 객체는 `tier: 16`, `weight: 0`, `noDrop: true`, `rarity: "common"`을 사용한다.

| 세트 ID | 장비 ID 3종 |
| --- | --- |
| `unexplored_iron_line` | `v2_unexplored_iron_line_armor`, `v2_unexplored_iron_line_gloves`, `v2_unexplored_iron_line_boots` |
| `unexplored_mana_barrier` | `v2_unexplored_mana_barrier_armor`, `v2_unexplored_mana_barrier_ring`, `v2_unexplored_mana_barrier_necklace` |
| `unexplored_regrowth_colony` | `v2_unexplored_regrowth_colony_armor`, `v2_unexplored_regrowth_colony_gloves`, `v2_unexplored_regrowth_colony_necklace` |
| `unexplored_battle_revenge` | `v2_unexplored_battle_revenge_gloves`, `v2_unexplored_battle_revenge_boots`, `v2_unexplored_battle_revenge_ring` |
| `unexplored_crystal_barrage` | `v2_unexplored_crystal_barrage_armor`, `v2_unexplored_crystal_barrage_gloves`, `v2_unexplored_crystal_barrage_necklace` |
| `unexplored_precision_hunt` | `v2_unexplored_precision_hunt_boots`, `v2_unexplored_precision_hunt_ring`, `v2_unexplored_precision_hunt_gloves` |
| `unexplored_chain_drive` | `v2_unexplored_chain_drive_boots`, `v2_unexplored_chain_drive_gloves`, `v2_unexplored_chain_drive_ring` |
| `unexplored_afterimage_hunt` | `v2_unexplored_afterimage_hunt_boots`, `v2_unexplored_afterimage_hunt_gloves`, `v2_unexplored_afterimage_hunt_armor` |
| `unexplored_triad_decay` | `v2_unexplored_triad_decay_gloves`, `v2_unexplored_triad_decay_ring`, `v2_unexplored_triad_decay_armor` |
| `unexplored_unyielding_dead` | `v2_unexplored_unyielding_dead_gloves`, `v2_unexplored_unyielding_dead_boots`, `v2_unexplored_unyielding_dead_armor` |
| `unexplored_freezing_lock` | `v2_unexplored_freezing_lock_gloves`, `v2_unexplored_freezing_lock_ring`, `v2_unexplored_freezing_lock_armor` |
| `unexplored_crushing_pressure` | `v2_unexplored_crushing_pressure_armor`, `v2_unexplored_crushing_pressure_gloves`, `v2_unexplored_crushing_pressure_boots` |

Module shape와 전체 원본 데이터는 다음과 같이 둔다. 설명은 세트명을 이용해 결정적으로 생성하고 전투 수치는 전부 인자로 드러낸다.

```ts
function specialtyItem<const Id extends string>(
  id: Id,
  name: string,
  slot: "armor" | "gloves" | "boots" | "ring" | "necklace",
  power: number,
  options: V2EquipOptions,
  setId: string,
): V2EquipmentBase<Id> {
  const concept = slot === "armor" ? "heavy"
    : slot === "ring" ? "luck"
      : slot === "necklace" ? "mana"
        : "light";
  return {
    id, name, slot, concept, power, options,
    tier: 16, weight: 0, rarity: "common", noDrop: true,
    description: `${name}. 미개척지 특화 세트 장비.`,
    setTags: [setId],
  };
}

export const UNEXPLORED_SPECIALTY_EQUIPMENT = {
  v2_unexplored_iron_line_armor: specialtyItem("v2_unexplored_iron_line_armor", "철갑 전열갑", "armor", 260, { hp: 1_350, def: 135, magicDef: 60, critResist: 15, spd: -8 }, "unexplored_iron_line"),
  v2_unexplored_iron_line_gloves: specialtyItem("v2_unexplored_iron_line_gloves", "장창 수호완갑", "gloves", 86, { hp: 400, def: 70, accuracy: 18, critResist: 10 }, "unexplored_iron_line"),
  v2_unexplored_iron_line_boots: specialtyItem("v2_unexplored_iron_line_boots", "파쇄 지주화", "boots", 80, { hp: 420, def: 60, magicDef: 30, critResist: 10, spd: -2 }, "unexplored_iron_line"),

  v2_unexplored_mana_barrier_armor: specialtyItem("v2_unexplored_mana_barrier_armor", "영맥 방벽의", "armor", 255, { hp: 1_000, mp: 400, magicDef: 150, critResist: 12, statusDamageReductionPct: 18 }, "unexplored_mana_barrier"),
  v2_unexplored_mana_barrier_ring: specialtyItem("v2_unexplored_mana_barrier_ring", "집행 룬환", "ring", 140, { mp: 340, magicDef: 55, crit: 10, accuracy: 20, statusDamageReductionPct: 8 }, "unexplored_mana_barrier"),
  v2_unexplored_mana_barrier_necklace: specialtyItem("v2_unexplored_mana_barrier_necklace", "봉인 감시목걸이", "necklace", 165, { hp: 550, mp: 480, magicDef: 130, critResist: 12, statusDamageReductionPct: 12, healPowerPct: 8 }, "unexplored_mana_barrier"),

  v2_unexplored_regrowth_colony_armor: specialtyItem("v2_unexplored_regrowth_colony_armor", "되살이 포자갑", "armor", 258, { hp: 1_250, mp: 250, def: 70, magicDef: 70, healPowerPct: 15, statusDamageReductionPct: 10 }, "unexplored_regrowth_colony"),
  v2_unexplored_regrowth_colony_gloves: specialtyItem("v2_unexplored_regrowth_colony_gloves", "포식 생체완갑", "gloves", 88, { hp: 450, def: 55, magicDef: 40, accuracy: 16, healPowerPct: 10 }, "unexplored_regrowth_colony"),
  v2_unexplored_regrowth_colony_necklace: specialtyItem("v2_unexplored_regrowth_colony_necklace", "증식 생명핵", "necklace", 160, { hp: 650, mp: 350, magicDef: 90, critResist: 10, healPowerPct: 12 }, "unexplored_regrowth_colony"),

  v2_unexplored_battle_revenge_gloves: specialtyItem("v2_unexplored_battle_revenge_gloves", "격전 완갑", "gloves", 90, { hp: 360, def: 35, crit: 14, critMult: 55, accuracy: 16 }, "unexplored_battle_revenge"),
  v2_unexplored_battle_revenge_boots: specialtyItem("v2_unexplored_battle_revenge_boots", "혈전 추격화", "boots", 82, { hp: 300, crit: 12, critMult: 45, eva: 8, accuracy: 14, spd: 20 }, "unexplored_battle_revenge"),
  v2_unexplored_battle_revenge_ring: specialtyItem("v2_unexplored_battle_revenge_ring", "응징 처형환", "ring", 144, { hp: 400, magicDef: 35, crit: 14, critMult: 65, accuracy: 18 }, "unexplored_battle_revenge"),

  v2_unexplored_crystal_barrage_armor: specialtyItem("v2_unexplored_crystal_barrage_armor", "수정 각인법의", "armor", 254, { hp: 780, mp: 400, magicDef: 90, accuracy: 10 }, "unexplored_crystal_barrage"),
  v2_unexplored_crystal_barrage_gloves: specialtyItem("v2_unexplored_crystal_barrage_gloves", "굴절 조준완갑", "gloves", 88, { hp: 180, mp: 180, crit: 12, critMult: 50, accuracy: 20 }, "unexplored_crystal_barrage"),
  v2_unexplored_crystal_barrage_necklace: specialtyItem("v2_unexplored_crystal_barrage_necklace", "집속 포격핵", "necklace", 158, { hp: 350, mp: 380, magicDef: 75, crit: 10, critMult: 40, accuracy: 16 }, "unexplored_crystal_barrage"),

  v2_unexplored_precision_hunt_boots: specialtyItem("v2_unexplored_precision_hunt_boots", "선행 관측화", "boots", 80, { hp: 240, crit: 8, eva: 12, accuracy: 24, spd: 24 }, "unexplored_precision_hunt"),
  v2_unexplored_precision_hunt_ring: specialtyItem("v2_unexplored_precision_hunt_ring", "정점 조준환", "ring", 142, { hp: 220, mp: 160, crit: 16, critMult: 70, accuracy: 26 }, "unexplored_precision_hunt"),
  v2_unexplored_precision_hunt_gloves: specialtyItem("v2_unexplored_precision_hunt_gloves", "파갑 사냥완갑", "gloves", 88, { hp: 280, def: 40, crit: 12, critMult: 50, accuracy: 28 }, "unexplored_precision_hunt"),

  v2_unexplored_chain_drive_boots: specialtyItem("v2_unexplored_chain_drive_boots", "과열 추진화", "boots", 82, { hp: 220, crit: 10, eva: 12, accuracy: 12, spd: 24 }, "unexplored_chain_drive"),
  v2_unexplored_chain_drive_gloves: specialtyItem("v2_unexplored_chain_drive_gloves", "연격 구동완갑", "gloves", 88, { hp: 240, crit: 12, critMult: 50, accuracy: 18, spd: 10 }, "unexplored_chain_drive"),
  v2_unexplored_chain_drive_ring: specialtyItem("v2_unexplored_chain_drive_ring", "폭주 동력환", "ring", 142, { hp: 280, mp: 180, crit: 12, critMult: 60, accuracy: 16, spd: 8 }, "unexplored_chain_drive"),

  v2_unexplored_afterimage_hunt_boots: specialtyItem("v2_unexplored_afterimage_hunt_boots", "암영 정찰화", "boots", 80, { hp: 300, eva: 20, critResist: 6, spd: 24 }, "unexplored_afterimage_hunt"),
  v2_unexplored_afterimage_hunt_gloves: specialtyItem("v2_unexplored_afterimage_hunt_gloves", "야습 암살완갑", "gloves", 86, { hp: 320, def: 45, magicDef: 30, eva: 12, accuracy: 18, spd: 10 }, "unexplored_afterimage_hunt"),
  v2_unexplored_afterimage_hunt_armor: specialtyItem("v2_unexplored_afterimage_hunt_armor", "허상 피막갑", "armor", 248, { hp: 950, def: 55, magicDef: 75, eva: 20, critResist: 10, statusDamageReductionPct: 8 }, "unexplored_afterimage_hunt"),

  v2_unexplored_triad_decay_gloves: specialtyItem("v2_unexplored_triad_decay_gloves", "독니 침식완갑", "gloves", 86, { hp: 300, def: 40, crit: 10, accuracy: 20, spd: 10 }, "unexplored_triad_decay"),
  v2_unexplored_triad_decay_ring: specialtyItem("v2_unexplored_triad_decay_ring", "독무 분사환", "ring", 138, { hp: 300, mp: 220, magicDef: 45, accuracy: 18, spd: 10 }, "unexplored_triad_decay"),
  v2_unexplored_triad_decay_armor: specialtyItem("v2_unexplored_triad_decay_armor", "부식 군체갑", "armor", 252, { hp: 1_050, def: 70, magicDef: 70, critResist: 8, statusDamageReductionPct: 12 }, "unexplored_triad_decay"),

  v2_unexplored_unyielding_dead_gloves: specialtyItem("v2_unexplored_unyielding_dead_gloves", "갈고리 혈흔완갑", "gloves", 86, { hp: 350, def: 45, crit: 12, critMult: 45, accuracy: 18 }, "unexplored_unyielding_dead"),
  v2_unexplored_unyielding_dead_boots: specialtyItem("v2_unexplored_unyielding_dead_boots", "혈주 추격화", "boots", 80, { hp: 300, crit: 10, eva: 8, accuracy: 16, spd: 22 }, "unexplored_unyielding_dead"),
  v2_unexplored_unyielding_dead_armor: specialtyItem("v2_unexplored_unyielding_dead_armor", "절단 망자갑", "armor", 252, { hp: 1_000, def: 80, magicDef: 60, critResist: 10, statusDamageReductionPct: 8 }, "unexplored_unyielding_dead"),

  v2_unexplored_freezing_lock_gloves: specialtyItem("v2_unexplored_freezing_lock_gloves", "서리 접촉완갑", "gloves", 86, { hp: 260, mp: 180, crit: 12, critMult: 45, accuracy: 18 }, "unexplored_freezing_lock"),
  v2_unexplored_freezing_lock_ring: specialtyItem("v2_unexplored_freezing_lock_ring", "빙결 주문환", "ring", 140, { hp: 280, mp: 280, magicDef: 50, crit: 14, critMult: 55, accuracy: 16 }, "unexplored_freezing_lock"),
  v2_unexplored_freezing_lock_armor: specialtyItem("v2_unexplored_freezing_lock_armor", "혹한 파수갑", "armor", 252, { hp: 900, mp: 250, def: 65, magicDef: 90, critResist: 8, statusDamageReductionPct: 8 }, "unexplored_freezing_lock"),

  v2_unexplored_crushing_pressure_armor: specialtyItem("v2_unexplored_crushing_pressure_armor", "암반 거수갑", "armor", 268, { hp: 1_350, def: 120, magicDef: 45, critResist: 10, spd: -6 }, "unexplored_crushing_pressure"),
  v2_unexplored_crushing_pressure_gloves: specialtyItem("v2_unexplored_crushing_pressure_gloves", "철벽 분쇄완갑", "gloves", 90, { hp: 400, def: 60, crit: 12, critMult: 50, accuracy: 16, spd: -2 }, "unexplored_crushing_pressure"),
  v2_unexplored_crushing_pressure_boots: specialtyItem("v2_unexplored_crushing_pressure_boots", "지각 파쇄화", "boots", 84, { hp: 420, def: 55, magicDef: 25, crit: 10, critMult: 45, spd: -4 }, "unexplored_crushing_pressure"),
} as const satisfies Record<string, V2EquipmentBase>;
```

- [ ] **Step 5: 12개 태그 세트의 정적 보너스와 효과를 작성한다**

```ts
export const UNEXPLORED_SPECIALTY_TAG_SETS = [
  {
    id: "unexplored_iron_line",
    name: "철갑 전열",
    thresholds: [
      { count: 2, bonus: { hp: 400, def: 45, critResist: 6 } },
      { count: 3, bonus: { hp: 250, magicDef: 25 }, effect: { kind: "iron_wall", label: "철벽 누적" } },
    ],
  },
  {
    id: "unexplored_mana_barrier",
    name: "영맥 방벽",
    thresholds: [
      { count: 2, bonus: { mp: 220, magicDef: 50, statusDamageReductionPct: 8 } },
      { count: 3, bonus: { hp: 300, critResist: 5 }, effect: { kind: "mana_redeployment", label: "영맥 재전개" } },
    ],
  },
  {
    id: "unexplored_regrowth_colony",
    name: "증식 생체",
    thresholds: [
      { count: 2, bonus: { hp: 450, healPowerPct: 10, statusDamageReductionPct: 6 } },
      { count: 3, bonus: { hp: 300, def: 30, magicDef: 30 }, effect: { kind: "colony_regeneration", label: "군체 재생" } },
    ],
  },
  {
    id: "unexplored_battle_revenge",
    name: "혈전 반격",
    thresholds: [
      { count: 2, bonus: { hp: 400, crit: 5, accuracy: 10 } },
      { count: 3, bonus: { hp: 350, crit: 6, critMult: 40 }, effect: { kind: "battle_revenge", label: "격전 본능" } },
    ],
  },
  {
    id: "unexplored_crystal_barrage",
    name: "굴절 포격",
    thresholds: [
      { count: 2, bonus: { mp: 180, accuracy: 8, crit: 4 } },
      { count: 3, bonus: { hp: 200, magicDef: 20, critMult: 25 }, effect: { kind: "crystal_focus", label: "수정 집속" } },
    ],
  },
  {
    id: "unexplored_precision_hunt",
    name: "무결점 사냥",
    thresholds: [
      { count: 2, bonus: { hp: 200, accuracy: 18, spd: 5, basicAttackDamagePct: 15 } },
      { count: 3, bonus: { accuracy: 10, crit: 7, critMult: 45 }, effect: { kind: "precision_shot", label: "정밀 사격" } },
    ],
  },
  {
    id: "unexplored_chain_drive",
    name: "연쇄 구동",
    thresholds: [
      { count: 2, bonus: { spd: 10, accuracy: 10, extraBasicAttackDamagePct: 20 } },
      { count: 3, bonus: { hp: 250, crit: 5, critMult: 35 }, effect: { kind: "chain_drive", label: "연쇄 구동" } },
    ],
  },
  {
    id: "unexplored_afterimage_hunt",
    name: "잔영 추적",
    thresholds: [
      { count: 2, bonus: { hp: 350, eva: 12, critResist: 6 } },
      { count: 3, bonus: { hp: 450, def: 30, magicDef: 30, statusDamageReductionPct: 8 }, effect: { kind: "afterimage_coating", label: "허상 피막" } },
    ],
  },
  {
    id: "unexplored_triad_decay",
    name: "삼재 침식",
    thresholds: [
      { count: 2, bonus: { hp: 300, mp: 180, accuracy: 10, statusDotDamagePct: 15 } },
      { count: 3, bonus: { hp: 300, spd: 8, statusDotDamagePct: 25 } },
    ],
  },
  {
    id: "unexplored_unyielding_dead",
    name: "망자의 완강",
    thresholds: [
      { count: 2, bonus: { hp: 350, magicDef: 20, critResist: 6, statusDamageReductionPct: 6 } },
      { count: 3, bonus: { hp: 400, def: 30, magicDef: 30, critResist: 8 }, effect: { kind: "unyielding_dead", label: "망자의 완강" } },
    ],
  },
  {
    id: "unexplored_freezing_lock",
    name: "빙점 봉쇄",
    thresholds: [
      { count: 2, bonus: { hp: 250, mp: 180, crit: 5, magicDef: 20 }, effect: { kind: "frost_mark", label: "서리 표식" } },
      { count: 3, bonus: { hp: 350, magicDef: 30, critResist: 6, critMult: 35 }, effect: { kind: "freezing_lock", label: "빙점 봉쇄" } },
    ],
  },
  {
    id: "unexplored_crushing_pressure",
    name: "중압 파쇄",
    thresholds: [
      { count: 2, bonus: { hp: 400, def: 40, magicDef: 20, critResist: 6 } },
      { count: 3, bonus: { hp: 350, def: 25, crit: 6, critMult: 35 }, effect: { kind: "colossus_crush", label: "거수 파쇄" } },
    ],
  },
] as const satisfies readonly V2EquipTagSet[];
```

`V2_EQUIP_TAG_SETS`는 기존 배열 끝에 `...UNEXPLORED_SPECIALTY_TAG_SETS`를 합성하고 `collectUnexploredSetEffects()`는 활성 threshold의 `effect`만 낮은 단계부터 반환한다.

- [ ] **Step 6: 카탈로그와 표시 계층에 합성한다**

`v2EquipmentCatalog.ts`의 원본 객체 끝에 `...UNEXPLORED_SPECIALTY_EQUIPMENT`를 추가한다. 표시 6티어 출처 라벨은 `"폭풍 원정·미개척지 특화"`로 바꾼다. 승인 문서의 위력은 최종 표시값이므로 `equipmentPowerScale()`에서 `v2_unexplored_` ID는 `1`을 반환해 기존 endgame/tier 16 이중 보정을 받지 않게 하고, 36종의 최종 `V2_EQUIPMENT[id].power`가 원본과 정확히 같은지 테스트한다.

- [ ] **Step 7: 집중 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipVariance.test.ts`

Expected: PASS with 36 unique equipment IDs, 12 unique set IDs, and no missing reverse links.

- [ ] **Step 8: Task 1을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredSpecialtyEquipment.ts src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2EquipmentTypes.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipVariance.ts src/adventure/data/v2/v2EquipVariance.test.ts src/adventure/data/v2/v2Equipment.test.ts
git commit -m "feat: add unexplored specialty equipment sets"
```

### Task 2: 특화풀 조우 데이터와 집중 설정

**Files:**
- Create: `src/adventure/data/v2/unexploredSpecialtyPools.ts`
- Create: `src/adventure/data/v2/unexploredSpecialtyPools.test.ts`
- Create: `src/app/api/v2/dungeon/specialty-focus/route.ts`
- Create: `src/app/api/v2/dungeon/specialty-focus/route.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntCharacter.ts`

**Interfaces:**
- Produces: `UnexploredHuntMode`, `UnexploredSpecialtyPoolId`, `parseUnexploredHuntMode(raw)`, `pickUnexploredSpecialtyEncounter(mode, rng)`.
- Consumes: Task 1의 36개 `V2EquipmentId`, 기존 `DungeonEnemy`, `character.v2.frontierDepth`.

- [ ] **Step 1: 풀 완전성과 선택 경계 실패 테스트를 작성한다**

```ts
it("12개 풀에 몬스터와 전용 장비가 정확히 3개씩 있다", () => {
  expect(UNEXPLORED_SPECIALTY_POOLS).toHaveLength(12);
  const monsters = UNEXPLORED_SPECIALTY_POOLS.flatMap((pool) => pool.monsters);
  expect(monsters).toHaveLength(36);
  expect(new Set(monsters.map((monster) => monster.id)).size).toBe(36);
  expect(new Set(monsters.map((monster) => monster.equipmentId))).toEqual(
    new Set(UNEXPLORED_SPECIALTY_EQUIPMENT_IDS),
  );
});

it("random은 전체 풀을, focused는 지정 풀만 사용한다", () => {
  expect(pickUnexploredSpecialtyEncounter({ mode: "random" }, () => 0).poolId)
    .toBe("iron_legion");
  expect(pickUnexploredSpecialtyEncounter(
    { mode: "focused", poolId: "venom_colony" },
    () => 0.999,
  ).poolId).toBe("venom_colony");
});
```

- [ ] **Step 2: 테스트를 실행해 RED를 확인한다**

Run: `npx vitest run src/adventure/data/v2/unexploredSpecialtyPools.test.ts src/app/api/v2/dungeon/specialty-focus/route.test.ts`

Expected: FAIL because the pool module and route do not exist.

- [ ] **Step 3: 12개 풀과 36개 표시 몬스터를 작성한다**

```ts
export type UnexploredSpecialtyPoolId =
  | "iron_legion" | "mana_barriers" | "regrowth_colony"
  | "red_warband" | "crystal_barrage" | "precision_hunters"
  | "runaway_machines" | "shadow_trackers" | "venom_colony"
  | "bloodstained_dead" | "frozen_legion" | "crushing_colossi";

export type UnexploredHuntMode =
  | { mode: "standard" }
  | { mode: "random" }
  | { mode: "focused"; poolId: UnexploredSpecialtyPoolId };
```

풀 표시명은 차례대로 `철갑 군단`, `마력 방벽체`, `재생 군체`, `붉은 광전대`, `수정 포격대`, `정밀 사냥단`, `폭주 기계`, `그림자 추적자`, `맹독 군락`, `혈흔 망자`, `혹한 군단`, `파쇄 거수`를 사용한다. 각 풀의 몬스터 이름과 `equipmentId`는 승인 문서 장비 표의 같은 행을 사용한다. `baseMonsterKey`와 `image`는 현행 73~84 몬스터 프로필·이미지를 재사용하되, 새 드롭 판정은 표시 이름이 아니라 고정 `id`를 사용한다.

- [ ] **Step 4: 파서와 결정적 조우 선택을 구현한다**

```ts
export function parseUnexploredHuntMode(raw: unknown): UnexploredHuntMode {
  if (!raw || typeof raw !== "object") return { mode: "standard" };
  const value = raw as { mode?: unknown; poolId?: unknown };
  if (value.mode === "random") return { mode: "random" };
  if (value.mode === "focused" && isUnexploredSpecialtyPoolId(value.poolId)) {
    return { mode: "focused", poolId: value.poolId };
  }
  return { mode: "standard" };
}
```

`pickUnexploredSpecialtyEncounter()`는 `standard`에서 `null`, `random`에서 RNG 두 번으로 풀과 몬스터를 균등 선택, `focused`에서 지정 풀 안 몬스터만 RNG 한 번으로 균등 선택한다.

- [ ] **Step 5: GET/POST Route Handler 테스트를 작성하고 구현한다**

GET은 파싱된 현재 모드와 `unlocked: frontierDepth >= 79`를 반환한다. POST body는 `{ mode: "standard" | "random" | "focused", poolId?: string }`만 허용하고, 79 미만은 `403 specialty_locked`, 잘못된 ID는 `400 invalid_specialty_pool`로 거부한다. 저장할 때 `character.v2`의 다른 필드를 보존한다.

```ts
const next = {
  ...character,
  unexploredHuntMode: parseUnexploredHuntMode(body),
};
await upsertSave(tx, userId, "character.v2", next);
```

- [ ] **Step 6: 집중 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/data/v2/unexploredSpecialtyPools.test.ts src/app/api/v2/dungeon/specialty-focus/route.test.ts`

Expected: PASS, including legacy/invalid saves falling back to `standard` without mutation.

- [ ] **Step 7: Task 2를 커밋한다**

```bash
git add src/adventure/data/v2/unexploredSpecialtyPools.ts src/adventure/data/v2/unexploredSpecialtyPools.test.ts src/app/api/v2/dungeon/specialty-focus/route.ts src/app/api/v2/dungeon/specialty-focus/route.test.ts src/app/api/v2/dungeon/hunt/huntCharacter.ts
git commit -m "feat: add unexplored specialty hunt focus"
```

### Task 3: 독립 장비 드롭과 사냥 라우트 연결

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntDrops.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/dungeon/hunt/huntResultEffects.ts`
- Create: `src/app/api/v2/dungeon/hunt/route.test.ts`
- Create: `src/app/api/v2/dungeon/hunt/huntResultEffects.test.ts`

**Interfaces:**
- Consumes: Task 2의 `pickUnexploredSpecialtyEncounter()` 결과 `{ poolId, monsterId, equipmentId, enemy }`.
- Produces: `rollUnexploredSpecialtyEquipmentDrop()`, `droppedSpecialty`, `droppedSpecialties` API 필드와 mint된 장비 개체.

- [ ] **Step 1: 확률·전용 매핑·기존 RNG 보존 실패 테스트를 작성한다**

```ts
it.each([
  [false, 0.003999, "v2_unexplored_iron_line_armor"],
  [false, 0.004000, null],
  [true, 0.005999, "v2_unexplored_iron_line_armor"],
  [true, 0.006000, null],
] as const)("focused=%s roll=%s", (focused, roll, expected) => {
  expect(rollUnexploredSpecialtyEquipmentDrop({
    encounter: IRON_SHIELD_ENCOUNTER,
    focused,
    rng: () => roll,
  })).toBe(expected);
});
```

기존 `rollHuntDrops` 테스트에는 신규 조우를 생략했을 때 `Math.random` 호출 수와 반환 객체가 이전과 같다는 회귀를 추가한다.

- [ ] **Step 2: 집중 테스트를 실행해 RED를 확인한다**

Run: `npx vitest run src/app/api/v2/dungeon/hunt/huntDrops.test.ts`

Expected: FAIL because the specialty roller and result fields do not exist.

- [ ] **Step 3: 기존 굴림 뒤에 독립 특화 슬롯을 추가한다**

```ts
export const UNEXPLORED_EQUIPMENT_DROP_CHANCE = 0.004;
export const UNEXPLORED_FOCUSED_EQUIPMENT_DROP_CHANCE = 0.006;

export function rollUnexploredSpecialtyEquipmentDrop(input: {
  encounter: UnexploredSpecialtyEncounter | null;
  focused: boolean;
  rng: () => number;
}): V2EquipmentId | null {
  if (!input.encounter) return null;
  const base = input.focused
    ? UNEXPLORED_FOCUSED_EQUIPMENT_DROP_CHANCE
    : UNEXPLORED_EQUIPMENT_DROP_CHANCE;
  return input.rng() < base
    ? input.encounter.equipmentId
    : null;
}
```

`rollHuntDrops()`의 모든 기존 재료·정규·유니크·파편 굴림이 끝난 뒤 이 함수를 호출한다. 성공하면 `mintRolledEquipInstance()`로 새 iid와 편차를 생성한다. `rollHuntDropsRepeated()`도 각 반복에서 `droppedSpecialties`를 누적한다.

- [ ] **Step 4: 사냥 라우트가 저장된 모드로 조우를 선택하게 한다**

깊이 79~84이고 희귀 지도 모드가 아닐 때만 저장된 모드를 읽는다. `standard`는 기존 `enemiesForDepth(depth)`를 그대로 사용하고, `random`/`focused`는 특화 조우의 `enemy`를 사용한다. `monsterKey`는 기존 제작 재료용 `enemy.key`, 신규 장비는 별도 `specialtyEncounter`를 전달해 키 충돌을 막는다.

```ts
const unexploredMode = parseUnexploredHuntMode(charSave.unexploredHuntMode);
const specialtyEncounter =
  !rareMapIid && depth >= 79 && depth <= MAX_FRONTIER_DEPTH
    ? pickUnexploredSpecialtyEncounter(unexploredMode, Math.random)
    : null;
const enemy = specialtyEncounter?.enemy ?? pickRandomEnemy(enemiesForDepth(depth));
```

- [ ] **Step 5: 응답·도감 이벤트·일괄 합산에 신규 드롭을 연결한다**

`droppedSpecialty`와 `droppedSpecialties`를 단판/일괄 응답에 추가하고, `huntEquipmentCodexEvents()`와 획득 장비 도감 등록에는 정규·유니크와 같은 `equipment` 이벤트로 포함한다. 기존 `droppedEquipment`, `droppedUnique` 필드는 의미와 순서를 유지한다.

- [ ] **Step 6: 집중 라우트·드롭 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/app/api/v2/dungeon/hunt/route.test.ts src/app/api/v2/dungeon/hunt/huntResultEffects.test.ts`

Expected: PASS; standard/깊이 78/희귀 지도에서는 신규 RNG를 소비하지 않고, random은 0.4%, focused는 0.6% 기준을 사용한다.

- [ ] **Step 7: Task 3을 커밋한다**

```bash
git add src/app/api/v2/dungeon/hunt/huntDrops.ts src/app/api/v2/dungeon/hunt/huntDrops.test.ts src/app/api/v2/dungeon/hunt/huntResultEffects.ts src/app/api/v2/dungeon/hunt/huntResultEffects.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt/route.test.ts
git commit -m "feat: drop specialty sets from unexplored hunts"
```

### Task 4: 장비 집계와 공용 특화 효과 런타임

**Files:**
- Create: `src/adventure/v2/combat/unexploredSetEffects.ts`
- Create: `src/adventure/v2/combat/unexploredSetEffects.test.ts`
- Modify: `src/lib/server/derivePlayerEquipmentV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/playerDotDamage.ts`

**Interfaces:**
- Produces: `PlayerCombat.unexploredSetEffects`, `basicAttackDamagePct`, `extraBasicAttackDamagePct`, `statusDotDamagePct`, `UnexploredSetRuntime` 초기 상태와 순수 resolver.
- Consumes: Task 1의 활성 threshold와 정적 보너스.

- [ ] **Step 1: 정적 집계와 런타임 초기값 실패 테스트를 작성한다**

```ts
const TRIAD_DECAY_THREE = {
  armor: "v2_unexplored_triad_decay_armor",
  gloves: "v2_unexplored_triad_decay_gloves",
  ring: "v2_unexplored_triad_decay_ring",
} as const;

const PRECISION_TWO = {
  boots: "v2_unexplored_precision_hunt_boots",
  ring: "v2_unexplored_precision_hunt_ring",
} as const;

it("삼재 침식 3세트는 주기 피해 40%만 더한다", () => {
  const aggregate = aggregateV2Equipment(TRIAD_DECAY_THREE);
  expect(aggregate.statusDotDamagePct).toBe(40);
  expect(aggregate).not.toHaveProperty("poisonChancePct");
});

it("정밀 사냥 2세트는 평타 피해 15%를 집계한다", () => {
  expect(aggregateV2Equipment(PRECISION_TWO).basicAttackDamagePct).toBe(15);
});

it("장비가 없으면 활성 특화 효과가 없다", () => {
  expect(collectUnexploredSetEffects({})).toEqual([]);
});
```

- [ ] **Step 2: 테스트를 실행해 RED를 확인한다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetEffects.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL on missing aggregate and `PlayerCombat` fields.

- [ ] **Step 3: 장비 집계에서 정적 수치와 활성 효과를 분리한다**

`V2EquipAggregate`에 세 정적 % 필드를 추가하고 `addEquipBonus()`에서 합산한다. `collectUnexploredSetEffects()`는 장착 수가 threshold 이상인 효과만 반환하며, 일반 시그니처 배열에는 섞지 않는다.

```ts
export type UnexploredSetRuntime = {
  revengePending: boolean;
  paidDirectSkillCount: number;
  manualBasicAttackCount: number;
  manaSkillCount: number;
  evasionReducedThisEnemyAction: number;
  chainDriveResolving: boolean;
};

export function initialUnexploredSetRuntime(): UnexploredSetRuntime {
  return {
    revengePending: false,
    paidDirectSkillCount: 0,
    manualBasicAttackCount: 0,
    manaSkillCount: 0,
    evasionReducedThisEnemyAction: 0,
    chainDriveResolving: false,
  };
}

export type UnexploredAttackContext = {
  kind: "manual_basic" | "direct_skill" | "counter" | "extra_basic" | "independent";
  mpActuallySpent: number;
  hit: boolean;
  anyCrit: boolean;
  multiHitIndex: number;
  multiHitCount: number;
};

export function ironWallDefGain(input: {
  hpDamage: number; currentBonus: number; battleStartDef: number;
}): number;
export function manaRedeployment(input: {
  currentSkillCount: number; isSkill: boolean; currentShield: number; maxHp: number;
}): { skillCount: number; shield: number };
export function colonyRegeneration(input: {
  hp: number; maxHp: number; receivedHealMult: number;
}): number;
export function shouldQueueRevenge(hpDamage: number, maxHp: number): boolean;
export function afterimageShield(input: {
  evasionPreventedDamage: number; currentShield: number; maxHp: number;
}): number;
export function unyieldingDamage(input: {
  damage: number; hpBefore: number; maxHp: number; eligibleKind: boolean;
}): number;
export function revengeDamageMultiplier(input: {
  pending: boolean; context: UnexploredAttackContext;
}): number;
export function revengePendingAfterAttack(input: {
  pending: boolean; context: UnexploredAttackContext; hpDamage: number;
}): boolean;
export function crystalFocusStep(input: {
  count: number; isPaidDirectSkill: boolean;
}): { count: number; damageMult: number; consumeOnAttempt: boolean };
export function precisionShotStep(input: {
  count: number; isManualBasic: boolean;
}): { count: number; damageMult: number; ignoreNormalMiss: boolean };
export function chainDriveFollowUp(input: {
  eligibleDirectSkillHit: boolean; alreadyResolving: boolean; roll: number;
  extraBasicAttackDamagePct: number;
}): { fires: boolean; basicDamageMult: number };
export function frostMark(input: {
  eligibleCrit: boolean; freezingLock: boolean;
}): { speedReductionPct: number; accuracyPenalty: number; actions: number } | null;
export function defenseAfterColossusCrush(input: {
  defense: number; context: UnexploredAttackContext;
}): number;
```

- [ ] **Step 4: 지속 피해 통합 증폭을 한 지점에서 적용한다**

`applyPlayerDotDamageBonuses()`가 중독·출혈·연소의 주기 피해량에 `statusDotDamagePct`를 마지막 가산 배율로 한 번 적용하도록 시그니처를 확장한다.

```ts
export function applyPlayerDotDamageBonuses(
  dots: V2DotState,
  poisonDamagePct = 0,
  burnDamagePct = 0,
  statusDotDamagePct = 0,
): V2DotState;
```

출혈 폭발과 중독 폭발처럼 별도 즉발 함수는 이 값을 받지 않는다. 상태 부여 확률, 스택 수와 연소 회복 감소 필드도 바꾸지 않는다.

- [ ] **Step 5: 정적 집계 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetEffects.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/poisonDamageAmplification.test.ts src/adventure/v2/combat/burnDamage.test.ts`

Expected: PASS with 15% + 25% = 40% additive set bonus and existing poison/burn passives still applied exactly once.

- [ ] **Step 6: Task 4를 커밋한다**

```bash
git add src/adventure/v2/combat/unexploredSetEffects.ts src/adventure/v2/combat/unexploredSetEffects.test.ts src/lib/server/derivePlayerEquipmentV2.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/playerDotDamage.ts
git commit -m "feat: derive unexplored set combat effects"
```

### Task 5: PvE 생존형 세트 효과

**Files:**
- Create: `src/adventure/v2/combat/unexploredSetPve.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.skillHealing.ts`
- Modify: `src/adventure/v2/combat/unexploredSetEffects.ts`

**Interfaces:**
- Consumes: Task 4의 활성 효과와 `UnexploredSetRuntime`.
- Produces: 철벽 누적, 영맥 재전개, 군체 재생, 격전 본능의 피격 감지, 허상 피막, 망자의 완강 PvE 동작.

- [ ] **Step 1: 여섯 생존 경계의 실패 테스트를 작성한다**

먼저 공용 resolver의 수치와 경계를 고정하고, 같은 파일의 통합 케이스에서 `resolveBattle()` 또는 단계별 엔진 함수가 각 resolver를 호출하는지 검증한다. 생성되는 정수 피해·회복·보호막은 모두 `Math.floor`로 내림한다.

```ts
it("철벽 누적은 실제 HP 피해의 0.75%이며 시작 DEF 100%에서 멈춘다", () => {
  expect(ironWallDefGain({ hpDamage: 200, currentBonus: 99, battleStartDef: 100 })).toBe(100);
  expect(ironWallDefGain({ hpDamage: 0, currentBonus: 40, battleStartDef: 100 })).toBe(40);
});

it("영맥 재전개는 세 번째 일반 스킬에 최대 HP 8% 보호막을 높은 값으로 갱신한다", () => {
  expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 50, maxHp: 1_000 }))
    .toEqual({ skillCount: 0, shield: 80 });
  expect(manaRedeployment({ currentSkillCount: 2, isSkill: true, currentShield: 100, maxHp: 1_000 }))
    .toEqual({ skillCount: 0, shield: 100 });
});

it("군체 재생은 저체력 여부와 최대 HP 상한을 적용하고 회복 불가를 존중한다", () => {
  expect(colonyRegeneration({ hp: 500, maxHp: 1_000, receivedHealMult: 1 })).toBe(20);
  expect(colonyRegeneration({ hp: 350, maxHp: 1_000, receivedHealMult: 1 })).toBe(30);
  expect(colonyRegeneration({ hp: 350, maxHp: 1_000, receivedHealMult: 0 })).toBe(0);
});

it("격전 본능은 한 적 행동의 실제 HP 피해가 최대 HP 5% 이상일 때 예약한다", () => {
  expect(shouldQueueRevenge(49, 1_000)).toBe(false);
  expect(shouldQueueRevenge(50, 1_000)).toBe(true);
});

it("허상 피막은 회피 경감량 15%를 최대 HP 3%까지 보호막으로 만든다", () => {
  expect(afterimageShield({ evasionPreventedDamage: 400, currentShield: 0, maxHp: 1_000 })).toBe(30);
  expect(afterimageShield({ evasionPreventedDamage: 100, currentShield: 20, maxHp: 1_000 })).toBe(35);
});

it("망자의 완강은 개별 피해 직전 HP 35% 이하의 직접·상태 피해를 15% 곱감한다", () => {
  expect(unyieldingDamage({ damage: 100, hpBefore: 350, maxHp: 1_000, eligibleKind: true })).toBe(85);
  expect(unyieldingDamage({ damage: 100, hpBefore: 351, maxHp: 1_000, eligibleKind: true })).toBe(100);
  expect(unyieldingDamage({ damage: 100, hpBefore: 350, maxHp: 1_000, eligibleKind: false })).toBe(100);
});
```

추가 케이스로 보호막에 전부 흡수된 피해는 철벽/응징의 실제 HP 피해가 아니고, 완전 회피는 허상 피막을 만들지 않으며, 군체 재생에는 `healMult`가 적용되지 않지만 `receivedHealMult=0`은 회복을 막는지 검증한다.

- [ ] **Step 2: PvE 테스트를 실행해 RED를 확인한다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPve.test.ts`

Expected: FAIL on the first missing runtime transition.

- [ ] **Step 3: 실제 HP 피해와 회피 경감량을 구조화해 전달한다**

적 한 행동의 각 타격에서 아래 값을 계산하고 행동 종료까지 합산한다.

```ts
type EnemyHitResolution = {
  rawDirectDamage: number;
  damageAfterEvasion: number;
  shieldAbsorbed: number;
  hpDamage: number;
  evasionPreventedDamage: number;
  fullyEvaded: boolean;
};
```

기존 로그 수치는 바꾸지 않고 특화 효과 resolver에만 이 구조를 전달한다.

- [ ] **Step 4: 피격·행동 종료 효과를 순서대로 연결한다**

처리 순서는 `완전 회피 → 회피 경감 → 저체력 망자의 완강 → 기존 피해 감소 → 보호막 → 실제 HP 피해 → 철벽/응징 누적 → 적 행동 종료 허상 피막`으로 고정한다. 다단 공격 중 망자의 완강은 각 타격 직전 HP로 다시 판정하고, 철벽 상한은 전투 시작 DEF 스냅샷으로 계산한다.

- [ ] **Step 5: 보호막과 고정 재생을 행동 경계에 연결한다**

전투 시작 보호막 8%를 기존 보호막에 더하되, 세 번째 유료/무료 스킬을 가리지 않는 일반 스킬 사용 카운트는 플레이어의 성공한 스킬 행동에서만 증가시킨다. 갱신은 `Math.max(currentShield, floor(maxHp * 0.08))`이다. 군체 재생은 플레이어 행동 종료 직전에 계산하고 `healMult`를 전달하지 않으며, 받는 회복 배율만 적용한다.

- [ ] **Step 6: PvE 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPve.test.ts src/adventure/v2/combat/engine.test.ts src/adventure/v2/combat/engine.skillMultiHit.test.ts src/adventure/v2/combat/engine.dotClock.test.ts`

Expected: PASS with no changes to actors that lack `unexploredSetEffects`.

- [ ] **Step 7: Task 5를 커밋한다**

```bash
git add src/adventure/v2/combat/unexploredSetPve.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.skillHealing.ts src/adventure/v2/combat/unexploredSetEffects.ts
git commit -m "feat: apply defensive unexplored sets in pve"
```

### Task 6: PvE 공격형 세트 효과

**Files:**
- Modify: `src/adventure/v2/combat/unexploredSetPve.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/unexploredSetEffects.ts`

**Interfaces:**
- Consumes: Task 4 런타임과 Task 5의 행동 경계.
- Produces: 격전 본능 소비, 수정 집속, 정밀 사격, 연쇄 구동, 서리 표식/빙점 봉쇄, 거수 파쇄 PvE 동작.

- [ ] **Step 1: 공격형 발동 경계 실패 테스트를 추가한다**

```ts
const attackContext = (
  kind: UnexploredAttackContext["kind"],
  overrides: Partial<UnexploredAttackContext> = {},
): UnexploredAttackContext => ({
  kind, mpActuallySpent: 0, hit: true, anyCrit: false,
  multiHitIndex: 0, multiHitCount: 1, ...overrides,
});

it("응징은 다음 직접 공격 전체를 20% 강화하고 실제 피해 전에는 보존한다", () => {
  const context = attackContext("direct_skill");
  expect(revengeDamageMultiplier({ pending: true, context })).toBe(1.2);
  expect(revengeDamageMultiplier({ pending: true, context: attackContext("extra_basic") })).toBe(1);
  expect(revengePendingAfterAttack({ pending: true, context, hpDamage: 0 })).toBe(true);
  expect(revengePendingAfterAttack({ pending: true, context, hpDamage: 1 })).toBe(false);
});

it("MP를 실제 소모한 세 번째 직접 피해 스킬 전체만 25% 강화한다", () => {
  expect(crystalFocusStep({ count: 2, isPaidDirectSkill: true }))
    .toEqual({ count: 0, damageMult: 1.25, consumeOnAttempt: true });
  expect(crystalFocusStep({ count: 2, isPaidDirectSkill: false }))
    .toEqual({ count: 2, damageMult: 1, consumeOnAttempt: false });
});

it("직접 사용한 네 번째 평타는 일반 빗나감을 무시하고 최종 피해 50%를 얻는다", () => {
  expect(precisionShotStep({ count: 3, isManualBasic: true }))
    .toEqual({ count: 0, damageMult: 1.5, ignoreNormalMiss: true });
  expect(precisionShotStep({ count: 3, isManualBasic: false }))
    .toEqual({ count: 3, damageMult: 1, ignoreNormalMiss: false });
});

it("직접 피해 스킬당 한 번 25%로 72% 평타 추가 공격을 만들고 재귀하지 않는다", () => {
  expect(chainDriveFollowUp({ eligibleDirectSkillHit: true, alreadyResolving: false, roll: 0.249, extraBasicAttackDamagePct: 20 }))
    .toEqual({ fires: true, basicDamageMult: 0.72 });
  expect(chainDriveFollowUp({ eligibleDirectSkillHit: true, alreadyResolving: false, roll: 0.25, extraBasicAttackDamagePct: 20 }).fires).toBe(false);
  expect(chainDriveFollowUp({ eligibleDirectSkillHit: true, alreadyResolving: true, roll: 0, extraBasicAttackDamagePct: 20 }).fires).toBe(false);
});

it("치명타 직접 공격은 2행동 속도 감소를 걸고 3세트가 수치와 명중 약화를 강화한다", () => {
  expect(frostMark({ eligibleCrit: true, freezingLock: false }))
    .toEqual({ speedReductionPct: 12, accuracyPenalty: 0, actions: 2 });
  expect(frostMark({ eligibleCrit: true, freezingLock: true }))
    .toEqual({ speedReductionPct: 20, accuracyPenalty: 12, actions: 2 });
});

it("평타와 직접 스킬은 대응 방어력 10%를 무시하고 독립 추가 피해는 제외한다", () => {
  expect(defenseAfterColossusCrush({ defense: 100, context: attackContext("manual_basic") })).toBe(90);
  expect(defenseAfterColossusCrush({ defense: 100, context: attackContext("direct_skill") })).toBe(90);
  expect(defenseAfterColossusCrush({ defense: 100, context: attackContext("independent") })).toBe(100);
});
```

정밀 사격은 치명타와 적중 시 상태 이상을 정상 판정하되 강화 공격 자체가 별도 추가 공격을 만들지 않는지, 연쇄 구동은 2세트의 추가 기본 공격 피해 +20%를 받아 60%가 72%가 되는지도 고정한다.

- [ ] **Step 2: PvE 공격 테스트 RED를 확인한다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPve.test.ts`

Expected: FAIL on missing damage multipliers, counters, debuffs and follow-up guard.

- [ ] **Step 3: 공격 문맥을 명시적으로 구분한다**

Task 4에서 정의한 `UnexploredAttackContext`를 사용해 평타/스킬 본체만 카운터와 관통을 받고, 반격·추가 기본 공격·장비 독립 피해는 문맥으로 제외한다. 다단 스킬의 카운트와 발동 확률은 첫 처리에서 한 번만 결정하고 최종 직접 피해 배율은 스킬 전체에 공유한다.

- [ ] **Step 4: 공격 전 예약과 공격 후 소비를 분리한다**

공격 전에는 응징 20%, 수정 집속 25%, 정밀 사격 50%, 방어 관통 10%를 결정한다. 공격 후 실제 직접 피해가 1 이상일 때만 응징을 소비하고, 수정 집속은 완전 회피여도 세 번째 유료 스킬 사용 시 0으로 초기화한다. 정밀 사격은 네 번째 직접 평타를 시도한 시점에 카운트를 0으로 초기화한다.

- [ ] **Step 5: 연쇄 구동과 빙점 약화를 재귀 방지와 함께 연결한다**

연쇄 구동은 스킬 적중 후 `chainDriveResolving`이 false일 때 한 번만 25%를 굴리고, 후속 공격 동안 true로 설정한다. 서리 표식은 다단 스킬에서 `anyCrit`가 true면 한 번만 적용하며 기존 한기 스택 필드는 읽거나 쓰지 않는다. `freezing_lock`이 함께 활성화되면 12% 대신 20%, 추가로 `enemyAccuracyPenalty = 12`를 2번의 대상 행동 동안 유지한다.

- [ ] **Step 6: PvE 공격 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPve.test.ts src/adventure/v2/combat/engine.extraHits.test.ts src/adventure/v2/combat/engine.skillMultiHit.test.ts src/adventure/v2/combat/frostChillPve.test.ts`

Expected: PASS with exactly one roll per eligible skill and no follow-up chains.

- [ ] **Step 7: Task 6을 커밋한다**

```bash
git add src/adventure/v2/combat/unexploredSetPve.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/unexploredSetEffects.ts
git commit -m "feat: apply offensive unexplored sets in pve"
```

### Task 7: PvP 대칭 적용

**Files:**
- Create: `src/adventure/v2/combat/unexploredSetPvp.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/unexploredSetEffects.ts`
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Modify: `src/adventure/data/v2/replayPayload.test.ts`

**Interfaces:**
- Consumes: Tasks 4~6의 동일 resolver와 수치 상수.
- Produces: p1/p2 모두에 동일한 특화 런타임, 약화 지속시간과 replay 직렬화.

- [ ] **Step 1: 좌우 대칭과 PvE 동일 계수 실패 테스트를 작성한다**

```ts
function fighter(overrides: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 1_000, maxHp: 1_000, mp: 100, maxMp: 100,
    atk: 100, magicAtk: 100, def: 100, magicDef: 100,
    spd: 10, critChancePct: 0, critMult: 1.5,
    evasionPct: 0, accuracyPct: 100, attackCount: 1,
    ...overrides,
  } as PlayerCombat;
}

it.each(["p1", "p2"] as const)("%s만 활성 효과가 있으면 자기 런타임만 초기화한다", (side) => {
  const withSet = fighter({ unexploredSetEffects: [{ kind: "battle_revenge", label: "격전 본능" }] });
  const withoutSet = fighter();
  const state = initialBattleStatePvP(
    side === "p1" ? withSet : withoutSet,
    side === "p2" ? withSet : withoutSet,
    "P1",
    "P2",
  );
  expect(state[side].stacks.unexplored).toEqual(initialUnexploredSetRuntime());
  expect(state[side === "p1" ? "p2" : "p1"].stacks.unexplored).toBeUndefined();
});

it("PvP 양쪽이 같은 공용 resolver 계수를 사용한다", () => {
  const direct: UnexploredAttackContext = {
    kind: "direct_skill", mpActuallySpent: 10, hit: true, anyCrit: false,
    multiHitIndex: 0, multiHitCount: 1,
  };
  for (const side of ["p1", "p2"] as const) {
    expect(revengeDamageMultiplier({ pending: side === "p1", context: direct }))
      .toBe(side === "p1" ? 1.2 : 1);
    expect(unyieldingDamage({ damage: 100, hpBefore: 350, maxHp: 1_000, eligibleKind: true }))
      .toBe(85);
  }
});

it("빙점 봉쇄 표시 상태는 두 대상 행동 뒤 만료되고 기존 한기와 별도 필드다", () => {
  const state = initialBattleStatePvP(
    fighter({ unexploredSetEffects: [{ kind: "freezing_lock", label: "빙점 봉쇄" }] }),
    fighter(),
    "P1",
    "P2",
  );
  const marked = applyUnexploredFrostMarkPvP(state, "p1", "p2");
  expect(marked.p2.unexploredDebuffs).toMatchObject({ frostActions: 2, accuracyPenalty: 12 });
  expect(marked.p2.chill).toEqual(state.p2.chill);
  expect(tickUnexploredDebuffs(tickUnexploredDebuffs(marked, "p2"), "p2").p2.unexploredDebuffs)
    .toBeUndefined();
});
```

- [ ] **Step 2: PvP 테스트 RED를 확인한다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPvp.test.ts`

Expected: FAIL because PvP side state has no unexplored runtime.

- [ ] **Step 3: 각 PvP side에 독립 런타임을 초기화한다**

`initialBattleStatePvP()`에서 활성 특화 효과가 있는 side만 `stacks.unexplored` 상태를 만든다. 양쪽의 전투 시작 DEF, 최대 HP, 스킬/평타 카운트, 응징과 회피 경감 누계를 각각 자기 side에 둔다.

- [ ] **Step 4: 공용 resolver를 PvP 공격·피격 경계에 연결한다**

Task 5의 피격 순서와 Task 6의 공격 문맥을 그대로 사용한다. PvP 고유 배율은 기존 위치에서 먼저/나중에 적용하되 “최종 직접 피해 +20/+25/+50%”는 PvE와 같은 최종 직접 피해 레이어에 한 번만 곱한다. 거수 파쇄는 물리면 `def`, 마법이면 `magicDef`의 10%를 무시한다.

PvP 전용 연결부는 아래처럼 side key를 받는 순수 상태 전이로 공개해 양쪽이 같은 코드를 통과하게 한다.

```ts
export function applyUnexploredFrostMarkPvP(
  state: PvPBattleState,
  attacker: "p1" | "p2",
  defender: "p1" | "p2",
): PvPBattleState;

export function tickUnexploredDebuffs(
  state: PvPBattleState,
  actor: "p1" | "p2",
): PvPBattleState;
```

- [ ] **Step 5: replay payload에 필요한 표시 상태만 추가한다**

진행 카운터 전체를 직렬화하지 않고 기존 `playerSignatureResources`/`enemySignatureResources`에 사용자에게 의미 있는 값만 넣는다: `응징`, `수정 집속 1/3`, `정밀 사격 3/4`, `철벽 누적 방어`, `서리 표식 남은 행동`. 옛 replay의 선택 필드 누락은 빈 상태로 파싱한다.

- [ ] **Step 6: PvP와 replay 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/v2/combat/unexploredSetPvp.test.ts src/adventure/v2/combat/engine-pvp.test.ts src/adventure/data/v2/replayPayload.test.ts`

Expected: PASS for p1/p2 symmetry and legacy replay parsing.

- [ ] **Step 7: Task 7을 커밋한다**

```bash
git add src/adventure/v2/combat/unexploredSetPvp.test.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/unexploredSetEffects.ts src/adventure/data/v2/replayPayload.ts src/adventure/data/v2/replayPayload.test.ts
git commit -m "feat: mirror unexplored sets in pvp"
```

### Task 8: 사냥 선택·도감·아이템 설명 UI

**Files:**
- Create: `src/adventure/v2/UnexploredSpecialtyPanel.tsx`
- Create: `src/adventure/v2/UnexploredSpecialtyPanel.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/useDungeonHunt.ts`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCompareCard.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

**Interfaces:**
- Consumes: Task 2 focus GET/POST, 풀 메타데이터와 Task 3 응답 필드.
- Produces: 79~84 특화 선택 화면, 풀별 드롭 목록, 신규 세트/정적 옵션 설명.

- [ ] **Step 1: 사용자 표면 실패 테스트를 작성한다**

```tsx
it("일반·무작위·12개 집중 선택과 정확한 확률을 표시한다", async () => {
  render(<UnexploredSpecialtyPanel unlocked initialMode={{ mode: "standard" }} />);
  expect(screen.getByRole("radio", { name: /일반 사냥/ })).toBeChecked();
  expect(screen.getByText(/무작위 특화.*0.4%/)).toBeInTheDocument();
  expect(screen.getByText(/철갑 군단.*0.6%/)).toBeInTheDocument();
  expect(screen.getByText("철갑 방패병")).toBeInTheDocument();
  expect(screen.getByText("철갑 전열갑")).toBeInTheDocument();
});
```

잠금 상태는 컨테이너 투명도를 낮추지 않고 텍스트 색과 disabled 버튼만 사용하며, 카드 클래스가 `SURFACE_CARD` 또는 `SURFACE_INSET`을 포함하는지 확인한다.

- [ ] **Step 2: UI 테스트 RED를 확인한다**

Run: `npx vitest run src/adventure/v2/UnexploredSpecialtyPanel.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

Expected: FAIL because the panel and new option/effect labels do not exist.

- [ ] **Step 3: 접근 가능한 특화 패널을 구현한다**

패널은 radio group 하나로 `standard`, `random`, 12개 `focused` 풀을 선택한다. 변경 시 POST가 성공한 뒤에만 선택 상태를 갱신하고 실패하면 기존 값을 유지한다. 풀 카드는 이름, 전투 성격, 몬스터 3종과 각 전용 장비명을 표시한다. 모바일에서는 한 열, 넓은 화면에서는 두 열로 배치하되 본문은 불투명 표면을 사용한다.

- [ ] **Step 4: 사냥 화면과 단판·일괄 결과에 연결한다**

`V2DungeonFloorView`는 일반 사냥 깊이 79~84에서만 패널을 렌더하고 희귀 지도 화면에서는 숨긴다. 선택 저장 중 사냥 버튼을 잠그고, 저장 성공 후 다음 단판·자동·일괄·오프라인 사냥이 서버 저장값을 사용하게 한다. `useDungeonHunt` 타입에는 `droppedSpecialty`/`droppedSpecialties`를 추가하고 결과 카드의 기존 장비 목록에 합쳐 표시한다.

- [ ] **Step 5: 도감과 아이템 카드 설명을 확장한다**

도감의 별의 무덤 드롭 영역 아래에 풀별 몬스터→장비 3개와 `기본 0.4% · 집중 0.6%`를 표시한다. 아이템 카드의 2/3세트 threshold는 활성 여부와 관계없이 정확한 설명을 노출하며, `statusDotDamagePct`, `basicAttackDamagePct`, `extraBasicAttackDamagePct`는 각각 `상태 이상 지속 피해`, `기본 공격 피해`, `추가 기본 공격 피해`로 표시한다.

- [ ] **Step 6: UI 테스트를 GREEN으로 만든다**

Run: `npx vitest run src/adventure/v2/UnexploredSpecialtyPanel.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx src/adventure/v2/V2CodexView.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx`

Expected: PASS in light/dark class assertions, keyboard selection, failed POST rollback and exact Korean labels.

- [ ] **Step 7: Task 8을 커밋한다**

```bash
git add src/adventure/v2/UnexploredSpecialtyPanel.tsx src/adventure/v2/UnexploredSpecialtyPanel.test.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/useDungeonHunt.ts src/adventure/v2/V2CodexView.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/item-card/V2ItemCompareCard.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx
git commit -m "feat: expose unexplored specialty hunt sets"
```

### Task 9: 진행도·거래·도감과 `3+3` 밸런스 검증

**Files:**
- Modify: `src/adventure/data/v2/equipmentProgression.ts`
- Modify: `src/adventure/data/v2/equipmentProgression.test.ts`
- Modify: `src/adventure/data/v2/equipmentCodex.test.ts`
- Modify: `src/adventure/v2/marketplace/equipmentBuyOrders.test.ts`
- Create: `scripts/sim-unexplored-specialty-sets.ts`

**Interfaces:**
- Consumes: 완성된 장비 카탈로그와 PvE 엔진.
- Produces: 깊이 78 장착 게이트, 도감·거래 회귀와 단일/`3+3` 비교 리포트.

- [ ] **Step 1: 획득 후 시스템 통합 실패 테스트를 작성한다**

```ts
it("미개척지 특화 장비는 별의 무덤 돌파 뒤 장착 가능하다", () => {
  const item = V2_EQUIPMENT.v2_unexplored_iron_line_armor;
  expect(equipmentProgressionLock(item, 77)?.minFrontierDepth).toBe(78);
  expect(equipmentProgressionLock(item, 78)).toBeNull();
});

it("36종 모두 도감과 거래소 장비 후보에 남는다", () => {
  for (const id of UNEXPLORED_SPECIALTY_EQUIPMENT_IDS) {
    expect(equipmentCodexSummary({ registeredIds: [id] }).registeredIds).toContain(id);
    expect(equipmentOrderSnapshot({ iid: `test_${id}`, id, roll: { power: 0, weight: 0 } }))
      .not.toBeNull();
  }
});
```

- [ ] **Step 2: 통합 테스트 RED를 확인한다**

Run: `npx vitest run src/adventure/data/v2/equipmentProgression.test.ts src/adventure/data/v2/equipmentCodex.test.ts src/adventure/v2/marketplace/equipmentBuyOrders.test.ts`

Expected: FAIL until source-specific progression and catalog expectations include the new IDs.

- [ ] **Step 3: 진행도와 범용 카탈로그 필터를 수정한다**

`minFrontierDepthForEquipment()`에 `item.id.startsWith("v2_unexplored_") -> 78`을 tier 16 기본값보다 먼저 추가한다. 거래·도감 코드는 일반 장비 전체를 자동 포함해야 하므로 신규 ID를 하드코딩한 별도 분기는 추가하지 않고, 기존 필터가 `noDrop: true`를 거래 불가로 오해하는 부분만 테스트 근거와 함께 수정한다.

- [ ] **Step 4: 대표 빌드 비교 스크립트를 작성한다**

스크립트는 고정 seed 100개와 300행동 상한으로 다음 조합을 동일 스탯·동일 적에 실행한다.

```ts
const scenarios = [
  "existing_t6_baseline",
  "iron_line_3",
  "triad_decay_3",
  "precision_hunt_3",
  "chain_drive_3",
  "crushing_pressure_3",
  "existing_weapon_3_plus_battle_revenge_3",
  "existing_weapon_3_plus_precision_hunt_3",
  "existing_weapon_3_plus_crushing_pressure_3",
] as const;
```

각 조합의 승률, 중앙 행동 수, 초당/행동당 직접 피해, 주기 피해, 받은 피해, 평균 보호막과 발동 횟수를 표로 출력한다. 검증 실패 조건은 유한하지 않은 값, 300행동 초과, 의도한 효과 발동 횟수 0, 세트 해제 후 효과 잔존이다. 수치 조정은 승인 문서를 변경하는 일이므로 시뮬레이션에서 공격 조합이 기존 6티어 기준 대비 35% 이상 높거나 생존 조합의 유효 HP가 50% 이상 높으면 구현을 멈추고 결과만 보고한다.

- [ ] **Step 5: 통합 테스트와 시뮬레이션을 GREEN으로 만든다**

Run: `npx vitest run src/adventure/data/v2/equipmentProgression.test.ts src/adventure/data/v2/equipmentCodex.test.ts src/adventure/v2/marketplace/equipmentBuyOrders.test.ts`

Run: `node --import tsx scripts/sim-unexplored-specialty-sets.ts`

Expected: tests PASS and the script exits 0 only when all finite/inertness limits pass and no escalation threshold is crossed.

- [ ] **Step 6: Task 9를 커밋한다**

```bash
git add src/adventure/data/v2/equipmentProgression.ts src/adventure/data/v2/equipmentProgression.test.ts src/adventure/data/v2/equipmentCodex.test.ts src/adventure/v2/marketplace/equipmentBuyOrders.test.ts scripts/sim-unexplored-specialty-sets.ts
git commit -m "test: validate unexplored set progression and balance"
```

### Task 10: 전체 회귀와 완료 검증

**Files:**
- Modify only files required by a failing verification, with a regression test in the same subsystem.

**Interfaces:**
- Consumes: Tasks 1~9의 모든 구현.
- Produces: 타입·테스트·린트·이미지·프로덕션 빌드 검증 증거.

- [ ] **Step 1: 특화 기능 집중 테스트를 한 번에 실행한다**

```bash
npx vitest run \
  src/adventure/data/v2/unexploredSpecialtyEquipment.test.ts \
  src/adventure/data/v2/unexploredSpecialtyPools.test.ts \
  src/app/api/v2/dungeon/specialty-focus/route.test.ts \
  src/app/api/v2/dungeon/hunt/huntDrops.test.ts \
  src/adventure/v2/combat/unexploredSetEffects.test.ts \
  src/adventure/v2/combat/unexploredSetPve.test.ts \
  src/adventure/v2/combat/unexploredSetPvp.test.ts \
  src/adventure/v2/UnexploredSpecialtyPanel.test.tsx \
  src/adventure/v2/item-card/V2ItemCardPopover.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: 전체 단위 회귀를 실행한다**

Run: `npm test`

Expected: PASS with zero failed test files and zero failed tests.

- [ ] **Step 3: TypeScript와 ESLint를 실행한다**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src/adventure/data/v2/unexploredSpecialtyEquipment.ts src/adventure/data/v2/unexploredSpecialtyPools.ts src/app/api/v2/dungeon/specialty-focus/route.ts src/app/api/v2/dungeon/hunt/huntDrops.ts src/app/api/v2/dungeon/hunt/route.ts src/adventure/v2/combat/unexploredSetEffects.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/UnexploredSpecialtyPanel.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2CodexView.tsx`

Expected: exit 0 with no errors.

- [ ] **Step 4: 이미지와 모듈 예산을 확인한다**

Run: `npm run check-images`

Expected: exit 0; 재사용한 몬스터 이미지 참조가 모두 존재한다.

Run: `npm run check-module-budgets`

Expected: exit 0; 대형 엔진 파일 증가는 별도 효과 모듈 추출로 예산 안에 남는다.

- [ ] **Step 5: 프로덕션 빌드를 실행한다**

Run: `npm run build`

Expected: Next.js 16.2.11 production build exits 0. `prebuild`의 이미지 최적화/검사와 `postbuild` 검사도 함께 통과한다.

- [ ] **Step 6: diff 범위와 미배포 상태를 확인한다**

Run: `git diff --check`

Expected: no output and exit 0.

Run: `git status --short`

Expected: 이 계획 구현 파일 외 사용자 변경은 그대로 보존되어 있으며 `deploy/maintenance.sh` 실행이나 배포 관련 변경이 없다.

- [ ] **Step 7: 검증 실패가 있으면 해당 Task로 돌아가 수정한다**

실패한 하위 시스템의 원래 Task에 회귀 테스트를 먼저 추가하고, 그 Task에 적힌 정확한 파일 목록만 `git add`한다. 수정 후 Step 1~6을 다시 실행하고 `git commit -m "fix: close unexplored set regressions"`로 커밋한다. 검증 수정이 없으면 빈 커밋을 만들지 않는다. 배포와 점검 모드 전환은 수행하지 않는다.
