// 사냥 드랍 굴림 오케스트레이션 — runOneHunt 에서 추출한 순수 RNG 헬퍼.
//   승리 시 재료/강화석/소환서/재련석/정착지 재료 + 정규/유니크 장비를 한 번에 굴린다.
//   ⚠️ Math.random 호출 순서는 원본 인라인 코드와 byte-identical 해야 한다(아래 순서 고정).
//   tx/DB 미접촉 — 결과 객체만 반환하고, 영속(materials merge·equipment.v2 기록)은 라우트가 한다.
import { rollDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
import { rollEquipDrop } from "@/adventure/data/v2/dungeonEquipDrops";
import {
  rollBandUniqueDrop,
  rollBandCommonDrop,
  rollSkyRiftWeaponDrop,
  rollUniqueDrop,
} from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  SUMMON_SCROLL_MATERIAL_ID,
  rollSummonScrollDrop,
} from "@/adventure/data/v2/coopBosses";
import { rollEnhanceStoneDrops } from "@/adventure/data/v2/v2Enhance";
import { rollReforgeStoneDrops } from "@/adventure/data/v2/v2EquipVariance";
import { rollSettlementMaterialDrops } from "@/adventure/data/v2/settlementMaterials";
import { rollGuildWorkshopMaterialDrops } from "@/adventure/data/v2/guildWorkshopMaterials";
import { rollMonsterCraftMaterialDrops } from "@/adventure/data/v2/monsterCraftMaterials";
import {
  STAMINA_SHARD_MATERIAL_ID,
  rollStaminaShardDrop,
} from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  rollEnhanceEmberDrop,
  rollTornMapFragmentDrop,
} from "@/adventure/data/v2/scavengedCrafting";
import {
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import type { LiberationHuntEffects } from "@/adventure/data/v2/equipmentLiberationEffects";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

export type HuntDropResult = {
  drops: DropResult;
  droppedEquipment: V2EquipmentId | null;
  droppedUnique: V2EquipmentId | null;
  nextOwned: V2EquipInstance[];
};

export type HuntRepeatedDropResult = {
  drops: DropResult;
  droppedEquipments: V2EquipmentId[];
  droppedUniques: V2EquipmentId[];
  nextOwned: V2EquipInstance[];
};

// 승리 시 1회 드랍 굴림. 패배면 빈 결과(원본 보유분 그대로).
//   - drops: 재료 + 강화석(mapStoneMult) + 소환서 + 재련석 + 정착지 재료 + 제작소 제작 재료.
//   - droppedEquipment: 정규 장비(스타터 rollEquipDrop ?? 프론티어 밴드 rollBandCommonDrop).
//   - droppedUnique: 유니크(밴드 rollBandUniqueDrop ?? 레거시 층 rollUniqueDrop), 정규와 독립.
//   - nextOwned: ownedEquip + 드랍 개체(새 iid·±편차 굴림). 드랍 없으면 ownedEquip 그대로.
export function rollHuntDrops(params: {
  won: boolean;
  dropFloor: DungeonFloorId;
  depth: number;
  monsterKey: string;
  ownedEquip: V2EquipInstance[];
  mapDropMult: number;
  mapUniqueMult: number;
  mapStoneMult: number;
  liberationHuntEffects?: LiberationHuntEffects;
}): HuntDropResult {
  const {
    won,
    dropFloor,
    depth,
    monsterKey,
    ownedEquip,
    mapDropMult,
    mapUniqueMult,
    mapStoneMult,
    liberationHuntEffects,
  } = params;
  const normalMaterialMult =
    1 + Math.max(0, liberationHuntEffects?.normalMaterialDropPct ?? 0) / 100;
  const rareMaterialMult =
    1 + Math.max(0, liberationHuntEffects?.rareMaterialDropPct ?? 0) / 100;
  const equipmentMult =
    1 + Math.max(0, liberationHuntEffects?.equipmentDropPct ?? 0) / 100;
  const rareMapAndScrollMult =
    1 +
    Math.max(
      0,
      liberationHuntEffects?.rareMapAndSummonScrollDropPct ?? 0,
    ) /
      100;
  const minimumEquipmentQualityPp = Math.max(
    0,
    liberationHuntEffects?.minimumEquipmentQualityPp ?? 0,
  );

  // 신참 드롭 보너스 폐지 — 신참 혜택은 EXP 전용(사용자 결정). 드롭은 항상 ×1.
  const drops: DropResult = won
    ? rollDrops(dropFloor, Math.random, mapDropMult * normalMaterialMult)
    : {};
  let droppedEquipment: V2EquipmentId | null = null;
  let droppedUnique: V2EquipmentId | null = null;
  let nextOwned: V2EquipInstance[] = ownedEquip;

  if (won) {
    // 강화석 — 재료 보류 플래그(V2_MATERIALS_ENABLED)와 무관한 독립 드랍. 전 깊이 공통
    // (초보자도 줍고 거래소에서 환금). 다이얼 = v2Enhance ENHANCE_STONE_DROP_PCT.
    for (const [id, n] of Object.entries(
      rollEnhanceStoneDrops(Math.random, mapStoneMult * rareMaterialMult),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 협동 보스 소환서 — 강화석과 같은 독립 드랍(전 깊이 공통·레어맵 배수 미적용).
    // 다이얼 = coopBosses SUMMON_SCROLL_DROP_PCT.
    const scroll = rollSummonScrollDrop(Math.random, rareMapAndScrollMult);
    if (scroll > 0) {
      drops[SUMMON_SCROLL_MATERIAL_ID] =
        (drops[SUMMON_SCROLL_MATERIAL_ID] ?? 0) + scroll;
    }
    // 재련석 2종 — 강화석과 같은 독립 드랍(전 깊이 공통·레어맵 배수 미적용).
    // 다이얼 = v2EquipVariance REFORGE_STONE_DROP_PCT.
    for (const [id, n] of Object.entries(rollReforgeStoneDrops(Math.random))) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 정착지 재료(통나무/철광석) — 강화석과 같은 독립 드랍(전 깊이 공통·희소·레어맵 배수 미적용).
    // 다이얼 = settlementMaterials SETTLEMENT_MATERIAL_DROP_PCT.
    for (const [id, n] of Object.entries(
      rollSettlementMaterialDrops(Math.random, normalMaterialMult),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 제작소 제작 재료 — 티어별 병목 재료. 정착지 재료와 같은 개인 재료 인벤토리에 들어가며
    // 제작소 제작 시 소모된다.
    for (const [id, n] of Object.entries(
      rollGuildWorkshopMaterialDrops(depth, Math.random, normalMaterialMult),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 일반 몬스터 전용 제작 재료 — 실제로 처치한 몬스터만 자기 재료를 굴린다.
    for (const [id, n] of Object.entries(
      rollMonsterCraftMaterialDrops(
        monsterKey,
        Math.random,
        mapDropMult * normalMaterialMult,
      ),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }

    // 장비 드랍 — 정규 장비는 중복 드랍 허용(보유분도 새 굴림으로 재드랍 = god-roll 추격).
    // ownedSet 은 rollUniqueDrop 의 유니크 dedup 용(유니크는 종류당 1개). 정규 rollEquipDrop
    // 은 중복 허용이라 ownedSet 무시(보유분도 새 굴림으로 재드랍).
    const ownedSet = new Set<V2EquipmentId>(ownedEquip.map((i) => i.id));
    // 정규 장비 드랍: 스타터(1~6)=rollEquipDrop(1.2%), 프론티어 밴드(7~84)=흔한 밴드 장비
    //   (rollBandCommonDrop, 기본 로컬 깊이 램프 0.3~0.6%·최상위 3개 테마 0.05~0.075%).
    //   rollEquipDrop 이 7+ 에서 null → ?? 로 밴드
    //   흔한 풀이 그 자리(정규 장비 슬롯)를 채운다(깊이 범위 안 겹쳐 rng 한 쪽만 소비).
    droppedEquipment =
      rollEquipDrop(depth, ownedSet, Math.random, mapDropMult * equipmentMult) ??
      rollBandCommonDrop(depth, Math.random, mapDropMult * equipmentMult) ??
      rollSkyRiftWeaponDrop(depth, Math.random, mapDropMult * equipmentMult);
    if (droppedEquipment !== null) {
      // 드랍 = 새 개체 + 새 굴림(±편차).
      nextOwned = [
        ...nextOwned,
        mintRolledEquipInstance(droppedEquipment, Math.random, {
          minimumQualityPct: minimumEquipmentQualityPp,
        }),
      ];
      ownedSet.add(droppedEquipment);
    }
    // 유니크 — 정규 드랍과 독립한 별도 초저확률 롤(드랍 전용). 정규 장비와 둘 다 떨어질 수도.
    // 신참 배율(Lv<30 ×2) 미적용 — 유니크 chase 희귀도는 레벨 무관 균일.
    // 두 갈래: 레거시 층 풀(rollUniqueDrop, 깊이 1~6 들판 — 보유분 제외 dedup, 종류당 1개) +
    // 심층 밴드 풀(rollBandUniqueDrop, 잊힌 성소 25~30 등 — 중복 드랍 허용, 보유분도 재드랍).
    // 깊이 범위가 겹치지 않아 둘 중 하나만 rng 소비 — ?? 합성 안전
    // (밴드 밖이면 bandUniquePoolForDepth=null → rng 미소비, dropFloor 8 풀은 chance 0 → 미소비).
    droppedUnique =
      rollBandUniqueDrop(
        depth,
        ownedSet,
        Math.random,
        mapUniqueMult * equipmentMult,
      ) ??
      rollUniqueDrop(
        dropFloor,
        ownedSet,
        Math.random,
        mapUniqueMult * equipmentMult,
      );
    if (droppedUnique !== null) {
      nextOwned = [
        ...nextOwned,
        mintRolledEquipInstance(droppedUnique, Math.random, {
          minimumQualityPct: minimumEquipmentQualityPp,
        }),
      ];
    }

    // 활력의 파편 — 모든 일반 사냥 승리의 독립 글로벌 드롭. 기존 드롭·장비 굴림 뒤에서
    // RNG를 소비해 이미 배치된 굴림 순서를 보존하며, 희귀 지도 배율은 적용하지 않는다.
    const staminaShard = rollStaminaShardDrop(Math.random, rareMaterialMult);
    if (staminaShard > 0) {
      drops[STAMINA_SHARD_MATERIAL_ID] =
        (drops[STAMINA_SHARD_MATERIAL_ID] ?? 0) + staminaShard;
    }

    // 추가 수집형 재료도 기존 모든 굴림 뒤에서 독립적으로 판정한다. 두 재료 모두
    // 희귀 지도 보상 배율과 무관하며, 앞서 배치된 드롭의 RNG 순서는 바꾸지 않는다.
    const enhanceEmber = rollEnhanceEmberDrop(Math.random, rareMaterialMult);
    if (enhanceEmber > 0) {
      drops[ENHANCE_EMBER_MATERIAL_ID] =
        (drops[ENHANCE_EMBER_MATERIAL_ID] ?? 0) + enhanceEmber;
    }
    const tornMapFragment = rollTornMapFragmentDrop(
      Math.random,
      rareMaterialMult,
    );
    if (tornMapFragment > 0) {
      drops[TORN_MAP_FRAGMENT_MATERIAL_ID] =
        (drops[TORN_MAP_FRAGMENT_MATERIAL_ID] ?? 0) + tornMapFragment;
    }
  }

  return { drops, droppedEquipment, droppedUnique, nextOwned };
}

/**
 * 희귀 탐사 압축 정산용. 확률을 곱해 한 번 굴리지 않고 기존 1회 드랍을 독립 반복해
 * 무득·복수 획득 분포와 장비별 iid/옵션 굴림을 그대로 보존한다.
 */
export function rollHuntDropsRepeated(
  params: Parameters<typeof rollHuntDrops>[0] & { rewardRolls: number },
): HuntRepeatedDropResult {
  const rewardRolls = Number.isFinite(params.rewardRolls)
    ? Math.max(1, Math.floor(params.rewardRolls))
    : 1;
  const drops: DropResult = {};
  const droppedEquipments: V2EquipmentId[] = [];
  const droppedUniques: V2EquipmentId[] = [];
  let nextOwned = params.ownedEquip;

  for (let i = 0; i < rewardRolls; i += 1) {
    const result = rollHuntDrops({ ...params, ownedEquip: nextOwned });
    nextOwned = result.nextOwned;
    for (const [id, amount] of Object.entries(result.drops)) {
      if (!amount || amount <= 0) continue;
      drops[id] = (drops[id] ?? 0) + amount;
    }
    if (result.droppedEquipment) {
      droppedEquipments.push(result.droppedEquipment);
    }
    if (result.droppedUnique) droppedUniques.push(result.droppedUnique);
  }

  return { drops, droppedEquipments, droppedUniques, nextOwned };
}
