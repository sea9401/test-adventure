import {
  GUILD_WORKSHOP_MATERIAL_SOURCES,
  type GuildWorkshopMaterialId,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import { MONSTER_CRAFT_MATERIAL_DROP_RULES } from "@/adventure/data/v2/monsterCraftMaterials";
import { COOP_BOSS_MATERIAL_ID } from "@/adventure/data/v2/coopRewards";
import {
  COOP_BOSSES,
  type StandardCoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import {
  MINING_SPOT_IDS,
  MINING_SPOTS,
  miningNodeForSpot,
} from "@/adventure/data/v2/miningSpots";
import { STORM_EXPEDITION_ROUTES } from "@/adventure/data/v2/stormExpedition";
import { STORM_EXPEDITION_ROUTE_MATERIAL_ID } from "@/adventure/data/v2/stormExpeditionRewards";
import { UNEXPLORED_MONSTER_POOLS } from "@/adventure/data/v2/unexploredMonsterPools";
import { UNEXPLORED_BASE_DROP_MATERIALS } from "@/adventure/data/v2/unexploredRewards";
import {
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_SPOTS,
  woodcuttingTreeForSpot,
} from "@/adventure/data/v2/woodcuttingSpots";

export type WorkshopMaterialSource = {
  known: boolean;
  label: string;
  href: string;
};

export function workshopMaterialSource(
  materialId: string,
): WorkshopMaterialSource {
  const woodcuttingSpot = WOODCUTTING_SPOT_IDS.map(
    (spotId) => WOODCUTTING_SPOTS[spotId],
  ).find(
    (spot) => woodcuttingTreeForSpot(spot).materialId === materialId,
  );
  if (woodcuttingSpot) {
    return {
      known: true,
      label: `벌목 · ${woodcuttingSpot.name}`,
      href: "/character/life",
    };
  }

  const miningSpot = MINING_SPOT_IDS.map(
    (spotId) => MINING_SPOTS[spotId],
  ).find((spot) => miningNodeForSpot(spot).materialId === materialId);
  if (miningSpot) {
    return {
      known: true,
      label: `채광 · ${miningSpot.name}`,
      href: "/character/life",
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(
      GUILD_WORKSHOP_MATERIAL_SOURCES,
      materialId,
    )
  ) {
    const source =
      GUILD_WORKSHOP_MATERIAL_SOURCES[materialId as GuildWorkshopMaterialId];
    return {
      known: true,
      label: `${source.source} · ${source.depthText}`,
      href: "/battle",
    };
  }

  const monsterRule = MONSTER_CRAFT_MATERIAL_DROP_RULES.find(
    (rule) => rule.materialId === materialId,
  );
  if (monsterRule) {
    return {
      known: true,
      label: `${monsterRule.sourceArea} · ${monsterRule.monsterKey}`,
      href: "/battle",
    };
  }

  const unexploredPool = UNEXPLORED_MONSTER_POOLS.find(
    (pool) => pool.materialId === materialId,
  );
  if (unexploredPool) {
    return {
      known: true,
      label: `미개척지 · ${unexploredPool.name}`,
      href: "/battle/dungeon/unexplored",
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(
      UNEXPLORED_BASE_DROP_MATERIALS,
      materialId,
    )
  ) {
    return {
      known: true,
      label: "미개척지 · 기본 몬스터",
      href: "/battle/dungeon/unexplored",
    };
  }

  const coopBossId = (
    Object.keys(COOP_BOSS_MATERIAL_ID) as StandardCoopBossKindId[]
  ).find((bossId) => COOP_BOSS_MATERIAL_ID[bossId] === materialId);
  if (coopBossId) {
    return {
      known: true,
      label: `협동 보스 · ${COOP_BOSSES[coopBossId].name}`,
      href: "/battle/coop",
    };
  }

  const stormRoute = STORM_EXPEDITION_ROUTES.find(
    (route) => STORM_EXPEDITION_ROUTE_MATERIAL_ID[route.id] === materialId,
  );
  if (stormRoute) {
    return {
      known: true,
      label: `폭풍 원정 · ${stormRoute.name}`,
      href: "/battle/storm-expedition",
    };
  }

  return {
    known: false,
    label: "거래소 또는 관련 콘텐츠 보상 확인",
    href: "/plaza/market",
  };
}
