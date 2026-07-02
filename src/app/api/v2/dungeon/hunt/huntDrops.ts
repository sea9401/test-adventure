// 사냥 드랍 굴림 오케스트레이션 — runOneHunt 에서 추출한 순수 RNG 헬퍼.
//   승리 시 재료/강화석/소환서/재련석/정착지 재료 + 정규/유니크 장비를 한 번에 굴린다.
//   ⚠️ Math.random 호출 순서는 원본 인라인 코드와 byte-identical 해야 한다(아래 순서 고정).
//   tx/DB 미접촉 — 결과 객체만 반환하고, 영속(materials merge·equipment.v2 기록)은 라우트가 한다.
import { rollDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
import { rollEquipDrop } from "@/adventure/data/v2/dungeonEquipDrops";
import {
  rollBandUniqueDrop,
  rollBandCommonDrop,
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
import {
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import type { DungeonFloorId } from "@/adventure/data/v2/types";

export type HuntDropResult = {
  drops: DropResult;
  droppedEquipment: V2EquipmentId | null;
  droppedUnique: V2EquipmentId | null;
  nextOwned: V2EquipInstance[];
};

// 승리 시 1회 드랍 굴림. 패배면 빈 결과(원본 보유분 그대로).
//   - drops: 재료 + 강화석(mapStoneMult) + 소환서 + 재련석 + 정착지 재료 + 대장간 제작 재료.
//   - droppedEquipment: 정규 장비(스타터 rollEquipDrop ?? 프론티어 밴드 rollBandCommonDrop).
//   - droppedUnique: 유니크(밴드 rollBandUniqueDrop ?? 레거시 층 rollUniqueDrop), 정규와 독립.
//   - nextOwned: ownedEquip + 드랍 개체(새 iid·±편차 굴림). 드랍 없으면 ownedEquip 그대로.
export function rollHuntDrops(params: {
  won: boolean;
  dropFloor: DungeonFloorId;
  depth: number;
  ownedEquip: V2EquipInstance[];
  mapDropMult: number;
  mapUniqueMult: number;
  mapStoneMult: number;
}): HuntDropResult {
  const {
    won,
    dropFloor,
    depth,
    ownedEquip,
    mapDropMult,
    mapUniqueMult,
    mapStoneMult,
  } = params;

  // 신참 드롭 보너스 폐지 — 신참 혜택은 EXP 전용(사용자 결정). 드롭은 항상 ×1.
  const drops: DropResult = won
    ? rollDrops(dropFloor, Math.random, mapDropMult)
    : {};
  let droppedEquipment: V2EquipmentId | null = null;
  let droppedUnique: V2EquipmentId | null = null;
  let nextOwned: V2EquipInstance[] = ownedEquip;

  if (won) {
    // 강화석 — 재료 보류 플래그(V2_MATERIALS_ENABLED)와 무관한 독립 드랍. 전 깊이 공통
    // (초보자도 줍고 거래소에서 환금). 다이얼 = v2Enhance ENHANCE_STONE_DROP_PCT.
    for (const [id, n] of Object.entries(
      rollEnhanceStoneDrops(Math.random, mapStoneMult),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 협동 보스 소환서 — 강화석과 같은 독립 드랍(전 깊이 공통·레어맵 배수 미적용).
    // 다이얼 = coopBosses SUMMON_SCROLL_DROP_PCT.
    const scroll = rollSummonScrollDrop(Math.random);
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
      rollSettlementMaterialDrops(Math.random),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }
    // 대장간 제작 재료 — 티어별 병목 재료. 정착지 재료와 같은 개인 재료 인벤토리에 들어가며
    // 대장간 제작 시 소모된다.
    for (const [id, n] of Object.entries(
      rollGuildWorkshopMaterialDrops(depth, Math.random),
    )) {
      drops[id] = (drops[id] ?? 0) + n;
    }

    // 장비 드랍 — 정규 장비는 중복 드랍 허용(보유분도 새 굴림으로 재드랍 = god-roll 추격).
    // ownedSet 은 rollUniqueDrop 의 유니크 dedup 용(유니크는 종류당 1개). 정규 rollEquipDrop
    // 은 중복 허용이라 ownedSet 무시(보유분도 새 굴림으로 재드랍).
    const ownedSet = new Set<V2EquipmentId>(ownedEquip.map((i) => i.id));
    // 정규 장비 드랍: 스타터(1~12)=rollEquipDrop(6%), 프론티어 밴드(13~30)=흔한 밴드 장비
    //   (rollBandCommonDrop, 로컬 깊이 램프 2~4%). rollEquipDrop 이 13+ 에서 null → ?? 로 밴드
    //   흔한 풀이 그 자리(정규 장비 슬롯)를 채운다(깊이 범위 안 겹쳐 rng 한 쪽만 소비).
    droppedEquipment =
      rollEquipDrop(depth, ownedSet, Math.random, mapDropMult) ??
      rollBandCommonDrop(depth, Math.random, mapDropMult);
    if (droppedEquipment !== null) {
      // 드랍 = 새 개체 + 새 굴림(±편차).
      nextOwned = [...nextOwned, mintRolledEquipInstance(droppedEquipment)];
      ownedSet.add(droppedEquipment);
    }
    // 유니크 — 정규 드랍과 독립한 별도 초저확률 롤(드랍 전용). 정규 장비와 둘 다 떨어질 수도.
    // 신참 배율(Lv<30 ×2) 미적용 — 유니크 chase 희귀도는 레벨 무관 균일.
    // 두 갈래: 레거시 층 풀(rollUniqueDrop, 깊이 1~6 들판 — 보유분 제외 dedup, 종류당 1개) +
    // 심층 밴드 풀(rollBandUniqueDrop, 마른 협곡 13~18 등 — 중복 드랍 허용, 보유분도 재드랍).
    // 깊이 범위가 겹치지 않아 둘 중 하나만 rng 소비 — ?? 합성 안전
    // (밴드 밖이면 bandUniquePoolForDepth=null → rng 미소비, dropFloor 8 풀은 chance 0 → 미소비).
    droppedUnique =
      rollBandUniqueDrop(depth, ownedSet, Math.random, mapUniqueMult) ??
      rollUniqueDrop(dropFloor, ownedSet, Math.random, mapUniqueMult);
    if (droppedUnique !== null) {
      nextOwned = [...nextOwned, mintRolledEquipInstance(droppedUnique)];
    }
  }

  return { drops, droppedEquipment, droppedUnique, nextOwned };
}
