import { V2_STAT_KEYS, V2_STAT_LABELS } from "@/adventure/data/v2/v2StatKeys";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  dungeonThemeCatalog,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

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
  equippedIds: string[];
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
  statAxes: { key: string; label: string; avg: number; dominantCount: number }[];
  economy: {
    label: string;
    players: number;
    avgGold: number;
    medianGold: number;
    maxGold: number;
  }[];
  equipmentUsage: { id: string; name: string; count: number }[];
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

const CLASS_LABELS: Record<string, string> = {
  warrior: "전사",
  mage: "마법사",
  rogue: "도적",
  martial: "무도가",
  survivor: "생존자",
  none: "모험가",
};

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
  const classAcc: Record<string, number> = {};
  const tierAcc: Record<number, number> = {};
  const dominantStatAcc: Record<string, number> = {};
  const statSum: Record<string, number> = {};
  for (const k of V2_STAT_KEYS) {
    statSum[k] = 0;
    dominantStatAcc[k] = 0;
  }
  const goldByLevelBand = LEVEL_BANDS.map(() => [] as number[]);
  const equipUsage: Record<string, number> = {};
  const powerAll: number[] = [];

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
    }

    const pi = POWER_BANDS.findIndex(
      (b) => u.power >= b.min && u.power <= b.max,
    );
    if (pi >= 0) powerAcc[pi]++;

    classAcc[u.classId] = (classAcc[u.classId] ?? 0) + 1;
    tierAcc[u.classTier] = (tierAcc[u.classTier] ?? 0) + 1;

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
    statAxes,
    economy,
    equipmentUsage,
  };
}
