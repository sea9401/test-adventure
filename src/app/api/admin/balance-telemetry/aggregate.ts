import { V2_STAT_KEYS, V2_STAT_LABELS } from "@/adventure/data/v2/v2StatKeys";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  dungeonThemeCatalog,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIALS,
  type GuildWorkshopMaterialId,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
} from "@/adventure/data/v2/v2JobCatalog";

// 밸런스 텔레메트리 순수 집계(Phase 1). 라우트가 per-user derive 한 결과를 받아 분포로 환산.
//   DB·derive 와 분리 — 밴딩/중앙값/지배스탯 로직을 단위 테스트 가능하게.

export type TelemetryUser = {
  level: number;
  frontierDepth: number;
  gold: number;
  power: number;
  totalStats: Record<V2StatKey, number>;
  classId: string;
  classTier: number;
  jobId: string;
  jobName: string;
  jobTier: number;
  totalMastery: number;
  currentMastery: number;
  reincarnations: number;
  spBudget: number;
  spUsed: number;
  skillsLearned: number;
  skillsEquipped: number;
  equipmentOwned: number;
  equipmentEquipped: number;
  maxEnhanceLevel: number;
  fishCaught: number;
  fishSpecies: number;
  antiquesFound: number;
  equippedIds: string[];
  blacksmithLevel: number;
  blacksmithXp: number;
  workshopTotalCrafts: number;
  workshopQualityCrafts: number;
  workshopMasterworkCrafts: number;
  workshopCraftOnlyCrafts: number;
  workshopHighestTier: number;
  workshopBestQualityLevel: number;
  workshopMaterials: Partial<Record<GuildWorkshopMaterialId, number>>;
  deliveryClaimsToday: number;
};

export type Bucket = { label: string; players: number; avgPower: number };

export type BalanceTelemetry = {
  summary: {
    players: number;
    adminExcluded: number;
    deriveFailed: number;
    avgPower: number;
    medianPower: number;
    maxFrontierDepth: number;
  };
  depthBands: Bucket[];
  levelBands: Bucket[];
  powerBands: { label: string; players: number }[];
  classDist: { key: string; label: string; count: number }[];
  tierDist: { tier: number; count: number }[];
  jobDist: { key: string; label: string; tier: number; count: number }[];
  jobTierDist: { tier: number; count: number }[];
  masteryBands: { label: string; players: number }[];
  reincarnationBands: { label: string; players: number }[];
  spPressureBands: { label: string; players: number }[];
  statAxes: { key: string; label: string; avg: number; dominantCount: number }[];
  economy: {
    label: string;
    players: number;
    avgGold: number;
    medianGold: number;
    maxGold: number;
  }[];
  equipmentUsage: { id: string; name: string; count: number }[];
  equipmentSummary: {
    label: string;
    players: number;
    avgEquipped: number;
    avgOwned: number;
    avgMaxEnhance: number;
  }[];
  lifeProgress: {
    fishingPlayers: number;
    avgFishCaught: number;
    avgFishSpecies: number;
    treasurePlayers: number;
    avgAntiquesFound: number;
  };
  workshopEconomy: {
    summary: {
      activeBlacksmiths: number;
      avgBlacksmithLevel: number;
      totalCrafts: number;
      qualityCrafts: number;
      masterworkCrafts: number;
      craftOnlyCrafts: number;
      maxHighestTier: number;
      deliveryClaimsToday: number;
      bestQualityBasic: number;
      bestQualityStar: number;
      bestQualityDoubleStar: number;
      qualityCraftRatePct: number;
      masterworkCraftRatePct: number;
      craftOnlyCraftRatePct: number;
      avgCraftsPerActiveBlacksmith: number;
      avgMaterialsPerActiveBlacksmith: number;
      materialStockPerCraft: number;
    };
    levelBands: {
      label: string;
      players: number;
      avgBlacksmithLevel: number;
      totalCrafts: number;
      masterworkCrafts: number;
      craftOnlyCrafts: number;
    }[];
    materials: {
      id: GuildWorkshopMaterialId;
      name: string;
      total: number;
      holders: number;
      avgPerHolder: number;
    }[];
  };
};

const LEVEL_BANDS: { label: string; min: number; max: number }[] = [
  { label: "1-29", min: 1, max: 29 },
  { label: "30-49", min: 30, max: 49 },
  { label: "50-69", min: 50, max: 69 },
  { label: "70-89", min: 70, max: 89 },
  { label: "90-99", min: 90, max: 99 },
  { label: "100+", min: 100, max: Infinity },
];

const POWER_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0-199", min: 0, max: 199 },
  { label: "200-399", min: 200, max: 399 },
  { label: "400-699", min: 400, max: 699 },
  { label: "700-999", min: 700, max: 999 },
  { label: "1000-1499", min: 1000, max: 1499 },
  { label: "1500+", min: 1500, max: Infinity },
];

const MASTERY_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0", min: 0, max: 0 },
  { label: `1-${TIER2_UNLOCK_CUMLEVEL - 1}`, min: 1, max: TIER2_UNLOCK_CUMLEVEL - 1 },
  {
    label: `${TIER2_UNLOCK_CUMLEVEL}-${TIER3_UNLOCK_CUMLEVEL - 1}`,
    min: TIER2_UNLOCK_CUMLEVEL,
    max: TIER3_UNLOCK_CUMLEVEL - 1,
  },
  {
    label: `${TIER3_UNLOCK_CUMLEVEL}-${TIER4_UNLOCK_CUMLEVEL - 1}`,
    min: TIER3_UNLOCK_CUMLEVEL,
    max: TIER4_UNLOCK_CUMLEVEL - 1,
  },
  {
    label: `${TIER4_UNLOCK_CUMLEVEL}-${TIER5_UNLOCK_CUMLEVEL - 1}`,
    min: TIER4_UNLOCK_CUMLEVEL,
    max: TIER5_UNLOCK_CUMLEVEL - 1,
  },
  {
    label: `${TIER5_UNLOCK_CUMLEVEL}+`,
    min: TIER5_UNLOCK_CUMLEVEL,
    max: Infinity,
  },
];

const REINCARNATION_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0회", min: 0, max: 0 },
  { label: "1회", min: 1, max: 1 },
  { label: "2-4회", min: 2, max: 4 },
  { label: "5회+", min: 5, max: Infinity },
];

const SP_PRESSURE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0%", min: 0, max: 0 },
  { label: "1-49%", min: 0.00001, max: 0.49 },
  { label: "50-79%", min: 0.5, max: 0.79 },
  { label: "80-99%", min: 0.8, max: 0.99 },
  { label: "100%+", min: 1, max: Infinity },
];

const CLASS_LABELS: Record<string, string> = {
  warrior: "전사",
  mage: "마법사",
  rogue: "도적",
  martial: "무도가",
  survivor: "생존자",
  none: "모험가",
};

function emptyWorkshopMaterialRecord(): Record<GuildWorkshopMaterialId, number> {
  return Object.fromEntries(
    GUILD_WORKSHOP_MATERIAL_IDS.map((id) => [id, 0]),
  ) as Record<GuildWorkshopMaterialId, number>;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function aggregateBalanceTelemetry(
  users: TelemetryUser[],
  meta: { adminExcluded: number; deriveFailed: number },
): BalanceTelemetry {
  const players = users.length;

  // 테마 깊이 밴드(동적 — 새 테마 추가 시 자동 반영) + 레거시(>MAX) 버킷.
  const themeBands = dungeonThemeCatalog(MAX_FRONTIER_DEPTH).map((t) => ({
    label: `${t.name} (${t.depthStart}~${t.depthEnd})`,
    min: t.depthStart,
    max: t.depthEnd,
  }));

  const depthAcc = themeBands.map(() => ({ players: 0, powerSum: 0 }));
  let legacyDepth = 0;
  const levelAcc = LEVEL_BANDS.map(() => ({ players: 0, powerSum: 0 }));
  const powerAcc = POWER_BANDS.map(() => 0);
  const masteryAcc = MASTERY_BANDS.map(() => 0);
  const reincarnationAcc = REINCARNATION_BANDS.map(() => 0);
  const spPressureAcc = SP_PRESSURE_BANDS.map(() => 0);
  const classAcc: Record<string, number> = {};
  const tierAcc: Record<number, number> = {};
  const jobAcc: Record<string, { label: string; tier: number; count: number }> = {};
  const jobTierAcc: Record<number, number> = {};
  const dominantStatAcc: Record<string, number> = {};
  const statSum: Record<string, number> = {};
  for (const k of V2_STAT_KEYS) {
    statSum[k] = 0;
    dominantStatAcc[k] = 0;
  }
  const goldByLevelBand = LEVEL_BANDS.map(() => [] as number[]);
  const equipmentByLevelBand = LEVEL_BANDS.map(
    () => [] as {
      equipped: number;
      owned: number;
      maxEnhance: number;
    }[],
  );
  const equipUsage: Record<string, number> = {};
  const workshopByLevelBand = LEVEL_BANDS.map(
    () =>
      [] as {
        blacksmithLevel: number;
        totalCrafts: number;
        masterworkCrafts: number;
        craftOnlyCrafts: number;
      }[],
  );
  const workshopMaterialTotals = emptyWorkshopMaterialRecord();
  const workshopMaterialHolders = emptyWorkshopMaterialRecord();
  const powerAll: number[] = [];
  let fishCaughtSum = 0;
  let fishSpeciesSum = 0;
  let fishingPlayers = 0;
  let antiquesFoundSum = 0;
  let treasurePlayers = 0;
  let activeBlacksmiths = 0;
  let blacksmithLevelSum = 0;
  let workshopTotalCrafts = 0;
  let workshopQualityCrafts = 0;
  let workshopMasterworkCrafts = 0;
  let workshopCraftOnlyCrafts = 0;
  let workshopMaxHighestTier = 0;
  let deliveryClaimsToday = 0;
  const bestQualityCounts = [0, 0, 0];

  for (const u of users) {
    powerAll.push(u.power);

    if (u.frontierDepth > MAX_FRONTIER_DEPTH) {
      legacyDepth++;
    } else {
      const di = themeBands.findIndex(
        (b) => u.frontierDepth >= b.min && u.frontierDepth <= b.max,
      );
      if (di >= 0) {
        depthAcc[di].players++;
        depthAcc[di].powerSum += u.power;
      }
    }

    const li = LEVEL_BANDS.findIndex((b) => u.level >= b.min && u.level <= b.max);
    if (li >= 0) {
      levelAcc[li].players++;
      levelAcc[li].powerSum += u.power;
      goldByLevelBand[li].push(u.gold);
      equipmentByLevelBand[li].push({
        equipped: u.equipmentEquipped,
        owned: u.equipmentOwned,
        maxEnhance: u.maxEnhanceLevel,
      });
      workshopByLevelBand[li].push({
        blacksmithLevel: u.blacksmithLevel,
        totalCrafts: u.workshopTotalCrafts,
        masterworkCrafts: u.workshopMasterworkCrafts,
        craftOnlyCrafts: u.workshopCraftOnlyCrafts,
      });
    }

    const pi = POWER_BANDS.findIndex(
      (b) => u.power >= b.min && u.power <= b.max,
    );
    if (pi >= 0) powerAcc[pi]++;

    const mi = MASTERY_BANDS.findIndex(
      (b) => u.currentMastery >= b.min && u.currentMastery <= b.max,
    );
    if (mi >= 0) masteryAcc[mi]++;

    const ri = REINCARNATION_BANDS.findIndex(
      (b) => u.reincarnations >= b.min && u.reincarnations <= b.max,
    );
    if (ri >= 0) reincarnationAcc[ri]++;

    const spRatio = u.spBudget > 0 ? u.spUsed / u.spBudget : 0;
    const si = SP_PRESSURE_BANDS.findIndex(
      (b) => spRatio >= b.min && spRatio <= b.max,
    );
    if (si >= 0) spPressureAcc[si]++;

    classAcc[u.classId] = (classAcc[u.classId] ?? 0) + 1;
    tierAcc[u.classTier] = (tierAcc[u.classTier] ?? 0) + 1;
    jobAcc[u.jobId] = {
      label: u.jobName,
      tier: u.jobTier,
      count: (jobAcc[u.jobId]?.count ?? 0) + 1,
    };
    jobTierAcc[u.jobTier] = (jobTierAcc[u.jobTier] ?? 0) + 1;

    let domKey: V2StatKey = V2_STAT_KEYS[0];
    let domVal = -Infinity;
    for (const k of V2_STAT_KEYS) {
      const v = u.totalStats[k] ?? 0;
      statSum[k] += v;
      if (v > domVal) {
        domVal = v;
        domKey = k;
      }
    }
    dominantStatAcc[domKey]++;

    for (const id of u.equippedIds) {
      equipUsage[id] = (equipUsage[id] ?? 0) + 1;
    }

    fishCaughtSum += u.fishCaught;
    fishSpeciesSum += u.fishSpecies;
    if (u.fishCaught > 0) fishingPlayers++;
    antiquesFoundSum += u.antiquesFound;
    if (u.antiquesFound > 0) treasurePlayers++;

    if (u.blacksmithXp > 0 || u.workshopTotalCrafts > 0) {
      activeBlacksmiths++;
    }
    blacksmithLevelSum += u.blacksmithLevel;
    workshopTotalCrafts += u.workshopTotalCrafts;
    workshopQualityCrafts += u.workshopQualityCrafts;
    workshopMasterworkCrafts += u.workshopMasterworkCrafts;
    workshopCraftOnlyCrafts += u.workshopCraftOnlyCrafts;
    workshopMaxHighestTier = Math.max(
      workshopMaxHighestTier,
      u.workshopHighestTier,
    );
    deliveryClaimsToday += u.deliveryClaimsToday;
    bestQualityCounts[
      Math.max(0, Math.min(2, Math.floor(u.workshopBestQualityLevel)))
    ]++;
    for (const id of GUILD_WORKSHOP_MATERIAL_IDS) {
      const amount = Math.max(0, Math.floor(Number(u.workshopMaterials[id]) || 0));
      workshopMaterialTotals[id] += amount;
      if (amount > 0) workshopMaterialHolders[id]++;
    }
  }

  const depthBands: Bucket[] = themeBands.map((b, i) => ({
    label: b.label,
    players: depthAcc[i].players,
    avgPower: depthAcc[i].players
      ? Math.round(depthAcc[i].powerSum / depthAcc[i].players)
      : 0,
  }));
  if (legacyDepth > 0) {
    depthBands.push({
      label: `${MAX_FRONTIER_DEPTH}+ (레거시 무한기)`,
      players: legacyDepth,
      avgPower: 0,
    });
  }

  const levelBands: Bucket[] = LEVEL_BANDS.map((b, i) => ({
    label: b.label,
    players: levelAcc[i].players,
    avgPower: levelAcc[i].players
      ? Math.round(levelAcc[i].powerSum / levelAcc[i].players)
      : 0,
  }));

  const powerBands = POWER_BANDS.map((b, i) => ({
    label: b.label,
    players: powerAcc[i],
  }));

  const classDist = Object.entries(classAcc)
    .map(([key, count]) => ({ key, label: CLASS_LABELS[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);

  const tierDist = Object.entries(tierAcc)
    .map(([tier, count]) => ({ tier: Number(tier), count }))
    .sort((a, b) => a.tier - b.tier);

  const jobDist = Object.entries(jobAcc)
    .map(([key, v]) => ({ key, label: v.label, tier: v.tier, count: v.count }))
    .sort((a, b) => b.count - a.count || b.tier - a.tier)
    .slice(0, 20);

  const jobTierDist = Object.entries(jobTierAcc)
    .map(([tier, count]) => ({ tier: Number(tier), count }))
    .sort((a, b) => a.tier - b.tier);

  const masteryBands = MASTERY_BANDS.map((b, i) => ({
    label: b.label,
    players: masteryAcc[i],
  }));

  const reincarnationBands = REINCARNATION_BANDS.map((b, i) => ({
    label: b.label,
    players: reincarnationAcc[i],
  }));

  const spPressureBands = SP_PRESSURE_BANDS.map((b, i) => ({
    label: b.label,
    players: spPressureAcc[i],
  }));

  const statAxes = V2_STAT_KEYS.map((k) => ({
    key: k,
    label: V2_STAT_LABELS[k] ?? k,
    avg: players ? Math.round(statSum[k] / players) : 0,
    dominantCount: dominantStatAcc[k],
  })).sort((a, b) => b.avg - a.avg);

  const economy = LEVEL_BANDS.map((b, i) => {
    const g = goldByLevelBand[i];
    return {
      label: b.label,
      players: g.length,
      avgGold: g.length
        ? Math.round(g.reduce((s, x) => s + x, 0) / g.length)
        : 0,
      medianGold: median(g),
      maxGold: g.length ? Math.max(...g) : 0,
    };
  });

  const equipmentUsage = Object.entries(equipUsage)
    .map(([id, count]) => ({
      id,
      name: V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT]?.name ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const avgOf = <T,>(items: T[], pick: (x: T) => number) =>
    items.length
      ? Math.round(items.reduce((sum, x) => sum + pick(x), 0) / items.length)
      : 0;

  const equipmentSummary = LEVEL_BANDS.map((b, i) => {
    const list = equipmentByLevelBand[i];
    return {
      label: b.label,
      players: list.length,
      avgEquipped: avgOf(list, (x) => x.equipped),
      avgOwned: avgOf(list, (x) => x.owned),
      avgMaxEnhance: avgOf(list, (x) => x.maxEnhance),
    };
  });
  const workshopLevelBands = LEVEL_BANDS.map((b, i) => {
    const list = workshopByLevelBand[i];
    return {
      label: b.label,
      players: list.length,
      avgBlacksmithLevel: avgOf(list, (x) => x.blacksmithLevel),
      totalCrafts: list.reduce((sum, x) => sum + x.totalCrafts, 0),
      masterworkCrafts: list.reduce((sum, x) => sum + x.masterworkCrafts, 0),
      craftOnlyCrafts: list.reduce((sum, x) => sum + x.craftOnlyCrafts, 0),
    };
  });
  const workshopMaterials = GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
    const holders = workshopMaterialHolders[id];
    return {
      id,
      name: GUILD_WORKSHOP_MATERIALS[id].name,
      total: workshopMaterialTotals[id],
      holders,
      avgPerHolder: holders
        ? Math.round(workshopMaterialTotals[id] / holders)
        : 0,
    };
  });
  const totalWorkshopMaterials = workshopMaterials.reduce(
    (sum, material) => sum + material.total,
    0,
  );
  const ratePct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 100) : 0;

  return {
    summary: {
      players,
      adminExcluded: meta.adminExcluded,
      deriveFailed: meta.deriveFailed,
      avgPower: players
        ? Math.round(powerAll.reduce((s, x) => s + x, 0) / players)
        : 0,
      medianPower: median(powerAll),
      maxFrontierDepth: MAX_FRONTIER_DEPTH,
    },
    depthBands,
    levelBands,
    powerBands,
    classDist,
    tierDist,
    jobDist,
    jobTierDist,
    masteryBands,
    reincarnationBands,
    spPressureBands,
    statAxes,
    economy,
    equipmentUsage,
    equipmentSummary,
    lifeProgress: {
      fishingPlayers,
      avgFishCaught: players ? Math.round(fishCaughtSum / players) : 0,
      avgFishSpecies: players ? Math.round(fishSpeciesSum / players) : 0,
      treasurePlayers,
      avgAntiquesFound: players ? Math.round(antiquesFoundSum / players) : 0,
    },
    workshopEconomy: {
      summary: {
        activeBlacksmiths,
        avgBlacksmithLevel: players ? Math.round(blacksmithLevelSum / players) : 0,
        totalCrafts: workshopTotalCrafts,
        qualityCrafts: workshopQualityCrafts,
        masterworkCrafts: workshopMasterworkCrafts,
        craftOnlyCrafts: workshopCraftOnlyCrafts,
        maxHighestTier: workshopMaxHighestTier,
        deliveryClaimsToday,
        bestQualityBasic: bestQualityCounts[0],
        bestQualityStar: bestQualityCounts[1],
        bestQualityDoubleStar: bestQualityCounts[2],
        qualityCraftRatePct: ratePct(workshopQualityCrafts, workshopTotalCrafts),
        masterworkCraftRatePct: ratePct(
          workshopMasterworkCrafts,
          workshopTotalCrafts,
        ),
        craftOnlyCraftRatePct: ratePct(
          workshopCraftOnlyCrafts,
          workshopTotalCrafts,
        ),
        avgCraftsPerActiveBlacksmith: activeBlacksmiths
          ? Math.round(workshopTotalCrafts / activeBlacksmiths)
          : 0,
        avgMaterialsPerActiveBlacksmith: activeBlacksmiths
          ? Math.round(totalWorkshopMaterials / activeBlacksmiths)
          : 0,
        materialStockPerCraft: workshopTotalCrafts
          ? Math.round((totalWorkshopMaterials / workshopTotalCrafts) * 10) / 10
          : totalWorkshopMaterials,
      },
      levelBands: workshopLevelBands,
      materials: workshopMaterials,
    },
  };
}
