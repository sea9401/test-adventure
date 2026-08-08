import {
  SUMMON_SCROLL_DROP_PCT,
  SUMMON_SCROLL_MATERIAL_ID,
} from "./coopBosses";
import { V2_MATERIALS } from "./dungeonDrops";
import {
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_DROP_RULES,
} from "./guildWorkshopMaterials";
import { MONSTER_CRAFT_MATERIAL_DROP_RULES } from "./monsterCraftMaterials";
import {
  ENHANCE_EMBER_DROP_PCT,
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_DROP_PCT,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
} from "./scavengedCrafting";
import {
  SETTLEMENT_MATERIAL_DROP_PCT,
  SETTLEMENT_MATERIAL_ID,
} from "./settlementMaterials";
import {
  STAMINA_SHARD_DROP_PCT,
  STAMINA_SHARD_MATERIAL_ID,
} from "./staminaPotionCrafting";
import {
  REFORGE_STONE_DROP_PCT,
  REFORGE_STONE_MATERIAL_ID,
  V2_REFORGE_ENABLED,
} from "./v2EquipVariance";
import {
  ENHANCE_STONE_DROP_PCT,
  ENHANCE_STONE_MATERIAL_ID,
} from "./v2Enhance";

export type HuntMaterialDropBoost = "drop" | "stone" | null;

export type HuntMaterialDropCatalogEntry = {
  id: string;
  name: string;
  description: string;
  chancePct: number;
  source: string;
  boost: HuntMaterialDropBoost;
};

type RawHuntMaterialDrop = {
  id: string;
  chancePct: number;
  source: string;
  boost?: HuntMaterialDropBoost;
};

function catalogEntry(
  raw: RawHuntMaterialDrop,
): HuntMaterialDropCatalogEntry | null {
  const material = V2_MATERIALS[raw.id];
  if (!material || !Number.isFinite(raw.chancePct) || raw.chancePct <= 0) {
    return null;
  }
  return {
    id: raw.id,
    name: material.name,
    description: material.description,
    chancePct: Math.round(raw.chancePct * 1000) / 1000,
    source: raw.source,
    boost: raw.boost ?? null,
  };
}

// 모든 일반 사냥 승리에서 독립적으로 굴리는 재료. 0% 또는 비활성 규칙은 도감에서
// 자동 제외해 실제 획득 가능 여부와 표시가 어긋나지 않게 한다.
export function commonHuntMaterialDrops(): HuntMaterialDropCatalogEntry[] {
  const raw: RawHuntMaterialDrop[] = [
    ...(["blue", "red"] as const).map((kind) => ({
      id: ENHANCE_STONE_MATERIAL_ID[kind],
      chancePct: ENHANCE_STONE_DROP_PCT[kind],
      source: "모든 사냥터",
      boost: "stone" as const,
    })),
    {
      id: SUMMON_SCROLL_MATERIAL_ID,
      chancePct: SUMMON_SCROLL_DROP_PCT,
      source: "모든 사냥터",
    },
    ...(["timber", "ironOre"] as const).map((kind) => ({
      id: SETTLEMENT_MATERIAL_ID[kind],
      // 정착지 재료 롤은 0~1 확률값을 직접 비교한다.
      chancePct:
        SETTLEMENT_MATERIAL_DROP_PCT[SETTLEMENT_MATERIAL_ID[kind]] * 100,
      source: "모든 사냥터",
    })),
    ...(V2_REFORGE_ENABLED
      ? (["basic", "high"] as const).map((kind) => ({
          id: REFORGE_STONE_MATERIAL_ID[kind],
          chancePct: REFORGE_STONE_DROP_PCT[kind],
          source: "모든 사냥터",
        }))
      : []),
    {
      id: STAMINA_SHARD_MATERIAL_ID,
      chancePct: STAMINA_SHARD_DROP_PCT,
      source: "모든 사냥터",
    },
    {
      id: ENHANCE_EMBER_MATERIAL_ID,
      chancePct: ENHANCE_EMBER_DROP_PCT,
      source: "모든 사냥터",
    },
    {
      id: TORN_MAP_FRAGMENT_MATERIAL_ID,
      chancePct: TORN_MAP_FRAGMENT_DROP_PCT,
      source: "모든 사냥터",
    },
  ];

  return raw
    .map(catalogEntry)
    .filter((entry): entry is HuntMaterialDropCatalogEntry => entry != null)
    .sort((a, b) => b.chancePct - a.chancePct || a.name.localeCompare(b.name));
}

export function regionalHuntMaterialDrops({
  areaName,
  depthStart,
  depthEnd,
  monsterKeys,
}: {
  areaName?: string;
  depthStart: number;
  depthEnd: number;
  monsterKeys: readonly string[];
}): HuntMaterialDropCatalogEntry[] {
  const start = Math.max(1, Math.floor(depthStart));
  const end = Math.max(start, Math.floor(depthEnd));
  const monsters = new Set(monsterKeys);
  const raw: RawHuntMaterialDrop[] = [];

  for (const rule of GUILD_WORKSHOP_MATERIAL_DROP_RULES) {
    const firstDepth = Math.max(start, rule.minDepth);
    const lastDepth = Math.min(end, rule.maxDepth ?? end);
    if (firstDepth > lastDepth) continue;
    raw.push({
      id: rule.materialId,
      chancePct: GUILD_WORKSHOP_MATERIAL_DROP_PCT[rule.materialId] * 100,
      source:
        firstDepth === start && lastDepth === end
          ? "지역 공통"
          : `깊이 ${firstDepth}~${lastDepth}`,
    });
  }

  for (const rule of MONSTER_CRAFT_MATERIAL_DROP_RULES) {
    if (
      !monsters.has(rule.monsterKey) ||
      (areaName != null && rule.sourceArea !== areaName)
    ) {
      continue;
    }
    raw.push({
      id: rule.materialId,
      chancePct: rule.chance * 100,
      source: `${rule.monsterKey} 전용`,
      boost: "drop",
    });
  }

  return raw
    .map(catalogEntry)
    .filter((entry): entry is HuntMaterialDropCatalogEntry => entry != null);
}

export function formatHuntMaterialDropChance(chancePct: number): string {
  const safe = Math.max(0, Number(chancePct) || 0);
  const digits = safe >= 1 ? 0 : safe >= 0.1 ? 2 : 3;
  return `${Number(safe.toFixed(digits))}%`;
}
