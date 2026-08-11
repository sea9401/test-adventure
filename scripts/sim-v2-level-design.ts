// v2 1→78 레벨 디자인 통합 점검기.
//
// 운영 환경(.env.production)의 코어루프/스태미나/ATB/EXP 설정을 그대로 읽고, 플레이어가 실제로
// 선택하는 대표 깊이(2·4·6 ... 78)를 전부 검사한다. 기존 sim-v2-progression 과 달리:
//   - 레벨은 실제 상한 100을 넘기지 않는다.
//   - 직업 계보별 숙련도 해금, 직업 내장 보너스, SP 예산, 장착 패시브를 반영한다.
//   - 수행은 실제 비용 곡선으로 계산한다(보수적으로 전 구간 최소 숙달 포인트 2/승 사용).
//   - 지역 입구는 이전 지역 장비, 같은 지역 후속 단계는 이미 연 현재 지역 흔한 장비 풀을 쓴다.
//   - 실제 스태미나 회복량, EXP 배율, 신참 EXP, 장비/시그니처 드랍률을 함께 출력한다.
//
// 이 도구는 실제 유저 세이브를 재생하지 않는다. 장비는 카탈로그 기준 위력(굴림·강화·유니크 제외),
// 성장은 권장 전투력에 도달하는 최소 레벨/숙련도 프록시다. 따라서 "며칠"은 자연 회복 에너지만 본
// 이론적 하한이며, 실제 플레이 시간·HP/MP 충전·패배는 별도 열로 판단한다.
//
// 실행:
//   npm run sim:level-design
//   npm run sim:level-design -- --trials=8 --verbose
//   npm run sim:level-design -- --depth=50 --enhance=10 --verbose
//   npm run sim:level-design -- --depth=8 --json
//   npm run sim:level-design -- --strict   # 위험 단계가 있으면 exit 1


import { pathToFileURL } from "node:url";

import {
  resolveBattle,
  setBattleLogCollection,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import {
  V2_CORE_LOOP_V2,
  V2_HUNT_USE_STAMINA,
  V2_ATB_SKILLS,
  V2_LEVEL_CAP,
  calcSpBudget,
} from "../src/adventure/data/v2/coreLoopConfig";
import {
  MAX_FRONTIER_DEPTH,
  depthName,
  enemiesForDepth,
  huntStageName,
  isHuntStageDepth,
} from "../src/adventure/data/v2/dungeon";
import {
  floorPowerGate,
} from "../src/adventure/data/v2/dungeonLadder";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { monsterGoldReward } from "../src/adventure/v2/combat/monsterGold";
import type { Monster } from "../src/adventure/data/monsters/types";
import {
  MAX_STAMINA,
  REGEN_SECONDS_PER_POINT,
  HUNT_COST,
} from "../src/adventure/v2/stamina";
import {
  applyNewbieExpBonusByBattles,
  NEWBIE_BONUS_BATTLE_THRESHOLD,
  requiredExpToNext,
  XP_RATE_MULT,
} from "../src/lib/leveling";
import {
  STARTER_DROP_POOL,
} from "../src/adventure/data/v2/dungeonEquipDrops";
import {
  BAND_COMMON_POOLS,
  bandCommonChanceForDepth,
  bandUniquePoolForDepth,
} from "../src/adventure/data/v2/dungeonUniqueDrops";
import {
  ADVENTURE_SUPPORT_PASS,
} from "../src/adventure/data/v2/adventureSupport";
import {
  V2_EQUIPMENT,
  isUnique,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2WeaponType,
} from "../src/adventure/data/v2/v2Equipment";
import { enhanceBonusPct } from "../src/adventure/data/v2/v2Enhance";
import {
  V2_JOB_CATALOG,
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
  TIER6_UNLOCK_CUMLEVEL,
  jobUnlockSpBonus,
  rejobRequiredLevel,
} from "../src/adventure/data/v2/v2JobCatalog";
import {
  dungeonReadiness,
  type DungeonReadiness,
} from "../src/adventure/v2/dungeonReadiness";
import { skillsForJob } from "../src/adventure/data/v2/v2SkillsByJob";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  resolveExclusiveSkills,
  spCostOf,
  v2SkillLearnCost,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { clampLoadoutToBudget } from "../src/adventure/data/v2/v2Loadout";
import {
  applyCultivation,
  emptyProficiency,
  V2_PROFICIENCY_PER_KILL_BASE,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import {
  computeStatFloors,
  rollLevelGrowth,
} from "../src/adventure/data/v2/statGrowth";
import { V2_STAT_KEYS, type V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { V2Class } from "../src/adventure/data/v2/classes";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { jobPassive } from "../src/adventure/data/v2/v2JobPassives";
import { STARTER_CHARGE } from "../src/adventure/starterSaveValues";

export const LEVEL_DESIGN_ARCHETYPES = [
  "STR",
  "DEX",
  "VIT",
  "INT",
  "SPI",
  "LUK",
  "BAL",
] as const;
export type LevelDesignArchetype = (typeof LEVEL_DESIGN_ARCHETYPES)[number];

type ArchSpec = {
  mainStat: V2StatKey;
  growthTargets: readonly V2StatKey[];
  baseClass: V2Class;
  weaponType: V2WeaponType;
  jobPath: readonly [string, string, string, string, string, string];
  starterSkills: readonly V2SkillId[];
};

const ARCH_SPEC: Record<LevelDesignArchetype, ArchSpec> = {
  STR: {
    mainStat: "str",
    growthTargets: ["str"],
    baseClass: "warrior",
    weaponType: "greatsword",
    jobPath: ["warrior", "squire", "berserker", "warlord", "overlord", "hegemon"],
    starterSkills: ["v2_skill_strike"],
  },
  DEX: {
    mainStat: "dex",
    growthTargets: ["dex"],
    baseClass: "rogue",
    weaponType: "bow",
    jobPath: ["rogue", "archer", "ranger", "chief", "marksman", "heavenlybow"],
    starterSkills: ["v2_skill_flurry"],
  },
  VIT: {
    mainStat: "vit",
    growthTargets: ["vit"],
    baseClass: "warrior",
    weaponType: "greatsword",
    jobPath: ["warrior", "shieldman", "guardian", "warden", "ironknight", "fortressknight"],
    starterSkills: ["v2_skill_recover"],
  },
  INT: {
    mainStat: "int",
    growthTargets: ["int"],
    baseClass: "mage",
    weaponType: "staff",
    jobPath: ["mage", "caster", "magus", "sage", "arcanist", "archmage"],
    starterSkills: ["v2_skill_meditate", "v2c_mage_boltcast"],
  },
  SPI: {
    mainStat: "spi",
    growthTargets: ["spi"],
    baseClass: "mage",
    weaponType: "staff",
    jobPath: ["mage", "acolyte", "bishop", "archbishop", "saint", "savior"],
    starterSkills: ["v2_skill_recover", "v2_skill_meditate", "v2c_mage_boltcast"],
  },
  LUK: {
    mainStat: "luk",
    growthTargets: ["luk"],
    baseClass: "rogue",
    weaponType: "dagger",
    jobPath: ["rogue", "assassin", "shadow", "phantom", "nightshade", "blackmoon"],
    starterSkills: ["v2_skill_fortune"],
  },
  // 균형형은 순수 능력치 기준점이다. 직업 보너스가 없는 비현실적 무직 모델 대신 정규 기사 계보를
  // 타되, 레벨 성장과 수행을 6스탯에 순환 분배해 "한 축 몰빵이 아닌 실제 직업 캐릭터"로 비교한다.
  BAL: {
    mainStat: "str",
    growthTargets: V2_STAT_KEYS,
    baseClass: "warrior",
    weaponType: "greatsword",
    jobPath: ["warrior", "squire", "paladin", "veteran", "swordmaster", "swordsaint"],
    starterSkills: ["v2_skill_strike", "v2_skill_recover"],
  },
};

const JOB_SEGMENT_REQUIREMENTS = [
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
  TIER6_UNLOCK_CUMLEVEL,
] as const;

const EQUIP_SLOTS: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

const STAMINA_PER_DAY = Math.floor(
  (24 * 60 * 60) / (REGEN_SECONDS_PER_POINT * HUNT_COST),
);
const MAX_CAREER_WINS = 500_000;
const NEWBIE_BONUS_BATTLES = NEWBIE_BONUS_BATTLE_THRESHOLD + 1;
const GROWTH_PACING_DEPTHS = [
  2, 6, 8, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78,
] as const;

export type CliOptions = {
  trials: number;
  seed: number;
  verbose: boolean;
  json: boolean;
  strict: boolean;
  depth: number | null;
  allowNonProduction: boolean;
  enhanceLevel: number;
};

export type LevelDesignWarning =
  | "DIFFICULTY_CLIFF"
  | "READINESS_RECOVERY"
  | "LOW_WIN_RATE"
  | "BUILD_GAP"
  | "SLOW_FIGHT";

type ProgressionSnapshot = {
  arch: LevelDesignArchetype;
  level: number;
  careerWins: number;
  currentJobId: string;
  jobTier: number;
  cultivations: number;
  spBudget: number;
  equippedSkills: V2SkillId[];
  equipment: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  maxEquipmentTier: number;
  totalStats: Record<V2StatKey, number>;
  player: PlayerCombat;
  power: number;
};

export type LevelDesignProgressionSnapshot = {
  arch: LevelDesignArchetype;
  depth: number;
  power: number;
  currentJobId: string;
  player: PlayerCombat;
  v2Skills: V2SkillsState;
};

type CombatAudit = {
  wins: number;
  attempts: number;
  winRatePct: number;
  ciHalfWidthPct: number;
  avgWinTurns: number;
  avgHpChargePerAttempt: number;
  avgMpChargePerAttempt: number;
  expPerAttempt: number;
  goldGrossPerAttempt: number;
  goldAfterHpRecoveryPerAttempt: number;
  goldAfterAllRecoveryPerAttempt: number;
};

type BuildAudit = {
  arch: LevelDesignArchetype;
  level: number;
  careerWins: number;
  energyFloorDays: number;
  currentJobId: string;
  currentJobName: string;
  jobTier: number;
  cultivations: number;
  spBudget: number;
  equippedSkillCount: number;
  equippedSkills: V2SkillId[];
  equipment: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  combatStats: {
    str: number;
    dex: number;
    vit: number;
    int: number;
    spi: number;
    luk: number;
    atk: number;
    magicAtk: number;
    def: number;
    magicDef: number;
    spd: number;
    maxHp: number;
    maxMp: number;
    accRating: number;
    evaRating: number;
    critChancePct: number;
  };
  power: number;
  gateReached: boolean;
  readiness: DungeonReadiness;
  maxEquipmentTier: number;
  combat: CombatAudit;
};

export type StageAudit = {
  depth: number;
  name: string;
  internalName: string;
  gate: number;
  gateJumpPct: number;
  minWinRateDropPct: number;
  commonDropChancePct: number;
  signatureDropChancePct: number;
  builds: BuildAudit[];
  minWinRatePct: number;
  maxWinRatePct: number;
  winRateGapPct: number;
  powerTargetMisses: number;
  readinessRecoveryCount: number;
  weakest: LevelDesignArchetype[];
  strongest: LevelDesignArchetype[];
  warnings: LevelDesignWarning[];
};

type AuditReport = {
  generatedAt: string;
  config: {
    coreLoop: boolean;
    staminaHunt: boolean;
    atbSkills: boolean;
    xpRate: number;
    maxStamina: number;
    regenSecondsPerPoint: number;
    staminaPerDay: number;
    trialsPerMonster: number;
      seed: number;
      enhanceLevel: number;
  };
  assumptions: string[];
  stages: StageAudit[];
  warningCounts: Record<LevelDesignWarning, number>;
  observationCounts: {
    powerTargetMissStages: number;
    powerTargetMissBuilds: number;
  };
  growthPacing: GrowthPacingAudit;
};

export type GrowthPacingRow = {
  depth: number;
  name: string;
  avgVeteranExpPerWin: number;
  expJumpFromPrevious: number | null;
  newbieLevelCapWins: number;
  veteranLevelCapWins: number;
  veteranIdealDays: number;
  veteranDailyLoginDays: number;
  freeBatchRequests: number;
  supportBatchRequests: number;
  commonDropChancePct: number;
  commonPoolSize: number;
  commonAnyExpectedWins: number | null;
  commonSpecificExpectedWins: number | null;
  signatureDropChancePct: number;
  signaturePoolSize: number;
  signatureAnyExpectedWins: number | null;
  signatureSpecificExpectedWins: number | null;
};

export type GrowthPacingAudit = {
  totalExpToLevelCap: number;
  energy: {
    baseMax: number;
    baseFullHours: number;
    baseNaturalPerDay: number;
    baseDailyLoginCapturePct: number;
    supportMax: number;
    supportFullHours: number;
    supportNaturalPerDay: number;
    supportDailyLoginCapturePct: number;
    starterChargeEach: number;
  };
  career: {
    tierRequirements: number[];
    totalWinsToTier6Path: number;
    idealDaysToTier6Path: number;
    dailyLoginDaysToTier6Path: number;
    supportDailyLoginDaysToTier6Path: number;
  };
  largestExpJump: {
    fromDepth: number;
    toDepth: number;
    multiplier: number;
  } | null;
  rows: GrowthPacingRow[];
};

export function huntStageDepths(maxDepth: number = MAX_FRONTIER_DEPTH): number[] {
  return Array.from({ length: maxDepth }, (_, i) => i + 1).filter(isHuntStageDepth);
}

export function parseOptions(args: readonly string[]): CliOptions {
  const valueOf = (prefix: string): string | undefined =>
    args.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1);
  // 빌드별 5종 몬스터 합산 승률이 경고선(30%p) 근처일 때 2~20회 표본은
  // 정상 구간도 빌드 격차로 오판했다. 50회(빌드당 250전)는 고표본 100회 결과와
  // 같은 경고 0건으로 수렴하면서 전체 점검도 약 10초 안에 끝나는 기본값이다.
  const trials = Math.max(1, Math.min(100, Math.floor(Number(valueOf("--trials")) || 50)));
  const seed = Math.floor(Number(valueOf("--seed")) || 20260801);
  const rawDepth = Number(valueOf("--depth"));
  const enhanceLevel = Math.max(
    0,
    Math.min(20, Math.floor(Number(valueOf("--enhance")) || 0)),
  );
  const depth = Number.isFinite(rawDepth) && isHuntStageDepth(rawDepth) ? rawDepth : null;
  return {
    trials,
    seed,
    verbose: args.includes("--verbose"),
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    depth,
    allowNonProduction: args.includes("--allow-non-production"),
    enhanceLevel,
  };
}

function assertRuntimeConfig(options: CliOptions): void {
  const mismatches = [
    !V2_CORE_LOOP_V2 ? "NEXT_PUBLIC_V2_CORE_LOOP_V2=true" : null,
    !V2_HUNT_USE_STAMINA ? "NEXT_PUBLIC_V2_HUNT_USE_STAMINA=true" : null,
    !V2_ATB_SKILLS ? "NEXT_PUBLIC_V2_ATB_SKILLS=true" : null,
  ].filter((v): v is string => v !== null);
  if (mismatches.length > 0 && !options.allowNonProduction) {
    throw new Error(
      `운영 전투 설정이 아닙니다: ${mismatches.join(", ")}. npm run sim:level-design 으로 실행하거나 --allow-non-production 을 지정하세요.`,
    );
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 2166136261;
  for (const ch of parts.join(":")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type CareerSegment = { jobIndex: number; start: number; end: number };

const EXP_TO_LEVEL: number[] = [0, 0];
for (let level = 1, total = 0; level < V2_LEVEL_CAP; level++) {
  total += requiredExpToNext(level) ?? 0;
  EXP_TO_LEVEL[level + 1] = total;
}

function averageFarmExp(depth: number): number {
  const farmDepth = Math.max(2, depth - 2);
  const enemies = monstersAtDepth(farmDepth);
  return enemies.length > 0
    ? enemies.reduce((sum, enemy) => sum + enemy.exp, 0) / enemies.length
    : 0;
}

function expFromWins(wins: number, depth: number, careerStart: number): number {
  const count = Math.max(0, Math.floor(wins));
  const baseExp = averageFarmExp(depth) * XP_RATE_MULT;
  const newbieWins = Math.max(
    0,
    Math.min(count, NEWBIE_BONUS_BATTLES - Math.max(0, careerStart)),
  );
  return baseExp * (count + newbieWins);
}

function winsForLevel(level: number, depth: number, careerStart: number): number {
  const target = EXP_TO_LEVEL[Math.max(1, Math.min(V2_LEVEL_CAP, Math.floor(level)))] ?? 0;
  if (target <= 0) return 0;
  const baseExp = averageFarmExp(depth) * XP_RATE_MULT;
  if (baseExp <= 0) return Number.MAX_SAFE_INTEGER;
  const newbieAvailable = Math.max(0, NEWBIE_BONUS_BATTLES - careerStart);
  const newbieCapacityExp = newbieAvailable * baseExp * 2;
  if (target <= newbieCapacityExp) return Math.ceil(target / (baseExp * 2));
  return newbieAvailable + Math.ceil((target - newbieCapacityExp) / baseExp);
}

function averageRewardExp(depth: number, newbie: boolean): number {
  const enemies = monstersAtDepth(depth);
  if (enemies.length === 0) return 0;
  const battleCount = newbie ? 0 : NEWBIE_BONUS_BATTLES;
  return (
    enemies.reduce((sum, enemy) => {
      const base = applyNewbieExpBonusByBattles(enemy.exp, battleCount).gained;
      return sum + Math.round(base * XP_RATE_MULT);
    }, 0) / enemies.length
  );
}

function winsForExp(totalExp: number, expPerWin: number): number {
  if (totalExp <= 0) return 0;
  if (expPerWin <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(totalExp / expPerWin);
}

function winsForExpWithNewbieBonus(
  totalExp: number,
  newbieExpPerWin: number,
  veteranExpPerWin: number,
): number {
  const newbieCapacityExp = NEWBIE_BONUS_BATTLES * newbieExpPerWin;
  if (totalExp <= newbieCapacityExp) return winsForExp(totalExp, newbieExpPerWin);
  return (
    NEWBIE_BONUS_BATTLES +
    winsForExp(totalExp - newbieCapacityExp, veteranExpPerWin)
  );
}

function expectedWins(chance: number, poolSize = 1): number | null {
  if (chance <= 0 || poolSize <= 0) return null;
  return poolSize / chance;
}

export function buildGrowthPacing(): GrowthPacingAudit {
  const totalExpToLevelCap = EXP_TO_LEVEL[V2_LEVEL_CAP] ?? 0;
  const supportMax = MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus;
  const supportNaturalPerDay = Math.floor(
    STAMINA_PER_DAY * (1 + ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct / 100),
  );
  const tierRequirements = [...JOB_SEGMENT_REQUIREMENTS];
  const totalWinsToTier6Path = tierRequirements.reduce((sum, wins) => sum + wins, 0);
  const rows: GrowthPacingRow[] = [];
  let previous: { depth: number; exp: number } | null = null;
  let largestExpJump: GrowthPacingAudit["largestExpJump"] = null;

  for (const depth of GROWTH_PACING_DEPTHS) {
    const veteranExp = averageRewardExp(depth, false);
    const newbieExp = averageRewardExp(depth, true);
    const veteranLevelCapWins = winsForExp(totalExpToLevelCap, veteranExp);
    const commonChance =
      depth <= 6 ? STARTER_DROP_POOL.chance : bandCommonChanceForDepth(depth);
    const commonPoolSize =
      depth <= 6
        ? Object.values(V2_EQUIPMENT).filter(
            (item) =>
              item.tier <= 3 &&
              !isUnique(item) &&
              !item.craftOnly &&
              !item.starterOnly &&
              !item.noDrop,
          ).length
        : (BAND_COMMON_POOLS.find(
            (pool) => depth >= pool.minDepth && depth <= pool.maxDepth,
          )?.ids.length ?? 0);
    const signaturePool = bandUniquePoolForDepth(depth);
    const signatureChance = signaturePool?.chance ?? 0;
    const expJumpFromPrevious = previous ? veteranExp / previous.exp : null;
    if (
      previous &&
      (!largestExpJump || expJumpFromPrevious! > largestExpJump.multiplier)
    ) {
      largestExpJump = {
        fromDepth: previous.depth,
        toDepth: depth,
        multiplier: expJumpFromPrevious!,
      };
    }
    rows.push({
      depth,
      name: huntStageName(depth),
      avgVeteranExpPerWin: veteranExp,
      expJumpFromPrevious,
      newbieLevelCapWins: winsForExpWithNewbieBonus(
        totalExpToLevelCap,
        newbieExp,
        veteranExp,
      ),
      veteranLevelCapWins,
      veteranIdealDays: veteranLevelCapWins / STAMINA_PER_DAY,
      veteranDailyLoginDays: veteranLevelCapWins / MAX_STAMINA,
      freeBatchRequests: Math.ceil(
        veteranLevelCapWins / ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch,
      ),
      supportBatchRequests: Math.ceil(
        veteranLevelCapWins / ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch,
      ),
      commonDropChancePct: commonChance * 100,
      commonPoolSize,
      commonAnyExpectedWins: expectedWins(commonChance),
      commonSpecificExpectedWins: expectedWins(commonChance, commonPoolSize),
      signatureDropChancePct: signatureChance * 100,
      signaturePoolSize: signaturePool?.ids.length ?? 0,
      signatureAnyExpectedWins: expectedWins(signatureChance),
      signatureSpecificExpectedWins: expectedWins(
        signatureChance,
        signaturePool?.ids.length ?? 0,
      ),
    });
    previous = { depth, exp: veteranExp };
  }

  return {
    totalExpToLevelCap,
    energy: {
      baseMax: MAX_STAMINA,
      baseFullHours: (MAX_STAMINA * REGEN_SECONDS_PER_POINT) / 3600,
      baseNaturalPerDay: STAMINA_PER_DAY,
      baseDailyLoginCapturePct: (MAX_STAMINA / STAMINA_PER_DAY) * 100,
      supportMax,
      supportFullHours:
        (supportMax * REGEN_SECONDS_PER_POINT) /
        (1 + ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct / 100) /
        3600,
      supportNaturalPerDay,
      supportDailyLoginCapturePct: (supportMax / supportNaturalPerDay) * 100,
      starterChargeEach: STARTER_CHARGE,
    },
    career: {
      tierRequirements,
      totalWinsToTier6Path,
      idealDaysToTier6Path: totalWinsToTier6Path / STAMINA_PER_DAY,
      dailyLoginDaysToTier6Path: totalWinsToTier6Path / MAX_STAMINA,
      supportDailyLoginDaysToTier6Path: totalWinsToTier6Path / supportMax,
    },
    largestExpJump,
    rows,
  };
}

function levelForWins(wins: number, depth: number, careerStart: number): number {
  const gained = expFromWins(wins, depth, careerStart);
  let low = 1;
  let high = V2_LEVEL_CAP;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((EXP_TO_LEVEL[mid] ?? 0) <= gained) low = mid;
    else high = mid - 1;
  }
  return low;
}

function careerSegments(depth: number, maxWins = 500_000): CareerSegment[] {
  const segments: CareerSegment[] = [];
  let start = 0;
  for (let jobIndex = 0; jobIndex < 5; jobIndex++) {
    const masteryWins = JOB_SEGMENT_REQUIREMENTS[jobIndex];
    const capWins = winsForLevel(V2_LEVEL_CAP, depth, start);
    const end = Math.min(maxWins, start + Math.max(masteryWins, capWins));
    segments.push({ jobIndex, start, end });
    start = end;
    if (start >= maxWins) return segments;
  }
  segments.push({ jobIndex: 5, start, end: maxWins });
  return segments;
}

function careerPosition(depth: number, careerWins: number): {
  segments: CareerSegment[];
  segment: CareerSegment;
  level: number;
} {
  const wins = Math.max(0, Math.floor(careerWins));
  const segments = careerSegments(depth, Math.max(500_000, wins + 1));
  const segment =
    segments.find((candidate) => wins < candidate.end) ?? segments[segments.length - 1];
  return {
    segments,
    segment,
    level: levelForWins(wins - segment.start, depth, segment.start),
  };
}

function proficiencyForCareer(
  arch: LevelDesignArchetype,
  depth: number,
  careerWins: number,
  cultivate: boolean = true,
): {
  proficiency: V2ProficiencyState;
  currentJobId: string;
  unlockedJobs: string[];
  level: number;
} {
  const spec = ARCH_SPEC[arch];
  const wins = Math.max(0, Math.floor(careerWins));
  const position = careerPosition(depth, wins);
  const jobIndex = position.segment.jobIndex;
  const currentJobId = spec.jobPath[jobIndex];
  const prof = emptyProficiency();
  prof.groups[spec.baseClass] = {
    cultivations: 0,
    tier: 1,
    cumLevel: wins,
  };
  prof.reincarnations = jobIndex;
  prof.jobHistory = spec.jobPath.slice(0, jobIndex + 1);

  for (let i = 1; i < spec.jobPath.length; i++) {
    const segment = position.segments[i];
    if (!segment) break;
    const amount = Math.max(0, Math.min(segment.end - segment.start, wins - segment.start));
    if (amount > 0) prof.jobCumLevel![spec.jobPath[i]] = amount;
  }

  // 실제 최소 지급량(깊은 지역은 3/승)을 전 경력에 적용해 과대평가하지 않는다. 스킬 학습비를 먼저
  // 차감한 뒤 남은 포인트만 수행에 쓴다.
  prof.points = wins * V2_PROFICIENCY_PER_KILL_BASE;
  const unlockedJobs = spec.jobPath.slice(0, jobIndex + 1);
  const learned = affordableSkills(spec, unlockedJobs, prof.points);
  prof.points -= learned.spent;

  if (cultivate) {
    let targetIndex = 0;
    while (true) {
      const target = spec.growthTargets[targetIndex % spec.growthTargets.length];
      const cultivated = applyCultivation(
        prof,
        spec.baseClass,
        undefined,
        target,
        currentJobId,
      );
      if (!cultivated) break;
      Object.assign(prof, cultivated.next);
      targetIndex += 1;
    }
  }
  return { proficiency: prof, currentJobId, unlockedJobs, level: position.level };
}

function affordableSkills(
  spec: ArchSpec,
  unlockedJobs: readonly string[],
  pointBudget: number,
): { learned: V2SkillId[]; spent: number } {
  const learned: V2SkillId[] = [...spec.starterSkills];
  const seen = new Set<V2SkillId>(learned);
  let spent = 0;
  for (const jobId of unlockedJobs) {
    for (const id of skillsForJob(jobId)) {
      if (seen.has(id) || V2_SKILLS[id]?.monsterOnly) continue;
      const cost = v2SkillLearnCost(id);
      if (spent + cost > pointBudget) continue;
      learned.push(id);
      seen.add(id);
      spent += cost;
    }
  }
  return { learned, spent };
}

function equippedSkillsFor(
  spec: ArchSpec,
  currentJobId: string,
  learned: readonly V2SkillId[],
  spBudget: number,
): V2SkillId[] {
  const current = new Set(skillsForJob(currentJobId));
  const ordered = [...learned].sort((a, b) => {
    const da = V2_SKILLS[a];
    const db = V2_SKILLS[b];
    const currentA = current.has(a) ? 1 : 0;
    const currentB = current.has(b) ? 1 : 0;
    if (currentA !== currentB) return currentB - currentA;
    const patternPriorityA = da.defaultPattern?.priority;
    const patternPriorityB = db.defaultPattern?.priority;
    if (patternPriorityA !== undefined && patternPriorityB !== undefined) {
      return patternPriorityB - patternPriorityA;
    }
    if (patternPriorityA !== undefined) return -1;
    if (patternPriorityB !== undefined) return 1;
    // SPI 지원 빌드는 최종 회복기 하나를 챙긴다고 본다. 회복기를 전부 우선하면 공격/생존
    // 패시브가 밀리므로 정점 회복기 하나만 보장한다.
    const roleA = spec.growthTargets.includes("spi") && a === "v2c_saint_miracle" ? 1 : 0;
    const roleB = spec.growthTargets.includes("spi") && b === "v2c_saint_miracle" ? 1 : 0;
    if (roleA !== roleB) return roleB - roleA;
    const relevantA =
      da.stat && da.stat !== "spd" && spec.growthTargets.includes(da.stat) ? 1 : 0;
    const relevantB =
      db.stat && db.stat !== "spd" && spec.growthTargets.includes(db.stat) ? 1 : 0;
    if (relevantA !== relevantB) return relevantB - relevantA;
    const combatA = da.category === "attack" || da.passive ? 1 : 0;
    const combatB = db.category === "attack" || db.passive ? 1 : 0;
    if (combatA !== combatB) return combatB - combatA;
    return db.tier - da.tier || spCostOf(da) - spCostOf(db);
  });
  return clampLoadoutToBudget(resolveExclusiveSkills(ordered), spBudget);
}

function starterEquipmentCandidates(completedDepth: number): V2EquipmentId[] {
  const maxTier = Math.max(1, Math.min(3, Math.ceil(Math.max(1, completedDepth) / 2)));
  return Object.values(V2_EQUIPMENT)
    .filter((item) => {
      if (item.tier > maxTier || isUnique(item) || item.craftOnly) return false;
      // T1 전문화 스타터는 상점에서 살 수 있다. 그 외 noDrop 은 진행 장비 프록시에서 제외한다.
      if (item.noDrop && !item.starterOnly) return false;
      return true;
    })
    .map((item) => item.id);
}

function equipmentScore(item: V2Equipment, arch: LevelDesignArchetype): number {
  const options = item.options ?? {};
  const flavor =
    arch === "VIT"
      ? (options.hp ?? 0) * 0.2 + (options.def ?? 0) * 2 - item.weight * 0.25
      : arch === "INT" || arch === "SPI"
        ? (options.mp ?? 0) * 0.1 +
          (options.healPowerPct ?? 0) * 3 +
          (options.magicDef ?? 0) +
          (options.spd ?? 0) -
          item.weight * 0.5
        : arch === "DEX" || arch === "LUK"
          ? (options.crit ?? 0) * 2 +
            (options.critMult ?? 0) * 0.5 +
            (options.eva ?? 0) * 2 +
            (options.spd ?? 0) -
            item.weight
          : (options.crit ?? 0) * 2 +
            (options.critMult ?? 0) * 0.5 +
            (options.spd ?? 0) * 1.5 +
            (options.hp ?? 0) * 0.1 +
            (options.def ?? 0) * 0.25 -
            item.weight;
  return item.power + flavor;
}

function equipmentForEntry(
  arch: LevelDesignArchetype,
  depth: number,
): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const completedDepth = Math.max(0, depth - 2);
  const candidates = new Set<V2EquipmentId>(starterEquipmentCandidates(completedDepth));
  for (const pool of BAND_COMMON_POOLS) {
    if (pool.minDepth <= completedDepth) {
      for (const id of pool.ids) candidates.add(id);
    }
  }

  const spec = ARCH_SPEC[arch];
  const result: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  for (const slot of EQUIP_SLOTS) {
    let items = [...candidates]
      .map((id) => V2_EQUIPMENT[id])
      .filter((item) => item.slot === slot);
    if (slot === "weapon") {
      const matching = items.filter((item) => item.weaponType === spec.weaponType);
      if (matching.length > 0) items = matching;
    }
    // 획득한 최고 티어는 우선하되, 같은 티어에서는 위력 몇 점 차이 때문에 무게·핵심 옵션이
    // 전부 무시되지 않도록 실제 전투 기여도로 고른다.
    items.sort(
      (a, b) => b.tier - a.tier || equipmentScore(b, arch) - equipmentScore(a, arch),
    );
    if (items[0]) result[slot] = items[0].id;
  }
  return result;
}

function mergeStats(
  a: Partial<Record<V2StatKey, number>>,
  b: Partial<Record<V2StatKey, number>>,
): Partial<Record<V2StatKey, number>> {
  const out: Partial<Record<V2StatKey, number>> = { ...a };
  for (const stat of V2_STAT_KEYS) {
    const value = b[stat] ?? 0;
    if (value) out[stat] = (out[stat] ?? 0) + value;
  }
  return out;
}

function snapshotFor(
  arch: LevelDesignArchetype,
  depth: number,
  careerWins: number,
  seed: number,
  enhanceLevel: number = 0,
  cultivate: boolean = true,
  overrides: {
    equipment?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
    extraSp?: number;
    equipmentEnhanceLevels?: Partial<Record<V2EquipmentId, number>>;
  } = {},
): ProgressionSnapshot {
  const spec = ARCH_SPEC[arch];
  const { proficiency, currentJobId, unlockedJobs, level } = proficiencyForCareer(
    arch,
    depth,
    careerWins,
    cultivate,
  );
  const affordable = affordableSkills(
    spec,
    unlockedJobs,
    careerWins * V2_PROFICIENCY_PER_KILL_BASE,
  );
  const spBudget = calcSpBudget(
    proficiency.groups,
    0,
    Math.max(0, Math.floor(overrides.extraSp ?? 0)),
    jobUnlockSpBonus(proficiency),
  );
  const equippedSkills = equippedSkillsFor(
    spec,
    currentJobId,
    affordable.learned,
    spBudget,
  );
  const passive = aggregateEquippedPassives(equippedSkills);
  const currentJob = V2_JOB_CATALOG[currentJobId];
  const grown = rollLevelGrowth(
    {},
    spec.baseClass,
    proficiency,
    mulberry32(hashSeed(seed, arch, depth, level, careerWins, "growth")),
    {
      currentJobId,
      targetStats: spec.growthTargets,
      points: Math.max(0, level - 1) * 3,
    },
  );
  const equipment = overrides.equipment ?? equipmentForEntry(arch, depth);
  const equipmentRolls = Object.values(equipment).reduce<
    Partial<Record<V2EquipmentId, V2EquipRoll>>
  >((rolls, id) => {
    const item = V2_EQUIPMENT[id];
    const itemEnhanceLevel = overrides.equipmentEnhanceLevels?.[id] ?? enhanceLevel;
    const enhancePct = enhanceBonusPct(itemEnhanceLevel);
    if (enhancePct > 0) {
      rolls[id] = {
        power: Math.floor(item.power * (1 + enhancePct / 100)),
        weight: item.weight,
      };
    }
    return rolls;
  }, {});
  const derived = derivePlayerCombatV2Pure({
    level,
    allocatedStats: grown,
    statCaps: proficiency.caps,
    statFloors: computeStatFloors(proficiency),
    v2Equipped: equipment,
    v2StatRolls: equipmentRolls,
    playerClass: spec.baseClass,
    classTier: 1,
    learnedSkillIds: affordable.learned,
    jobBonus: mergeStats(currentJob?.jobBonus ?? {}, passive.stat),
    jobPassiveEffect: jobPassive(currentJobId),
    atkPerDexCoef: passive.atkPerDexCoef,
    atkPerLukCoef: passive.atkPerLukCoef,
    statPct: passive.statPct,
    maxHpPct: passive.maxHpPct,
    maxMpPct: passive.maxMpPct,
    passiveCritPct: passive.critPct,
    passiveCritDmgPct: passive.critDmgPct,
    passiveEvasionPct: passive.evasionPct,
    passiveLifestealPct: passive.lifestealPct,
    passiveCounterChancePct: passive.counterChancePct,
    passiveCounterDamageUsesReflectBoost: passive.counterDamageUsesReflectBoost,
    passiveDefPct: passive.defPct,
    passiveThornsDefPct: passive.thornsDefPct,
    passiveAccuracyPct: passive.accuracyPct,
    passiveHealPowerPct: passive.healPowerPct,
    passiveDamageTakenReductionPct: passive.damageTakenReductionPct,
    passiveMagicDefPct: passive.magicDefPct,
    passiveOpeningMagicDamageReductionPct: passive.openingMagicDamageReductionPct,
    passiveOpeningMagicDamageReductionPhases: passive.openingMagicDamageReductionPhases,
    passiveEnemyPhysicalDefReductionPct: passive.enemyPhysicalDefReductionPct,
    passiveEnemyMagicDefReductionPct: passive.enemyMagicDefReductionPct,
    passivePoisonedEnemyDefReductionPct: passive.poisonedEnemyDefReductionPct,
    passiveBerserkAtkPctPerLostHpPct: passive.berserkAtkPctPerLostHpPct,
    passiveEnemyMagicVulnPctPerStack: passive.enemyMagicVulnPctPerStack,
    passiveEnemyMagicVulnApplyChancePct: passive.enemyMagicVulnApplyChancePct,
    passiveMagicSkillDamagePct: passive.magicSkillDamagePct,
    passiveSingleHitPhysicalSkillDamagePct:
      passive.singleHitPhysicalSkillDamagePct,
    passiveSpdToAtkMaxPct: passive.spdToAtkMaxPct,
    passiveSpdPerLukCoef: passive.spdPerLukCoef,
    passiveSkillCritOverflow: passive.skillCritOverflow,
    passiveSkillCritAfterEvade: passive.skillCritAfterEvade,
    passiveComboFinisherBonusPct: passive.comboFinisherBonusPct,
  });
  const player = derived.player;
  const power = derivePowerScore({
    atk: player.atk,
    magicAtk: player.magicAtk,
    def: player.def,
    spd: player.spd,
    maxHp: player.maxHp,
    maxMp: player.maxMp,
    magicBarrierMax: player.magicBarrierMax,
    evaRating: player.evaRating,
    accRating: player.accRating,
  });
  const tiers = Object.values(equipment).map((id) => V2_EQUIPMENT[id].tier);
  return {
    arch,
    level,
    careerWins,
    currentJobId,
    jobTier: currentJob?.tier ?? 1,
    cultivations: proficiency.groups[spec.baseClass]?.cultivations ?? 0,
    spBudget,
    equippedSkills,
    equipment,
    maxEquipmentTier: tiers.length > 0 ? Math.max(...tiers) : 0,
    totalStats: derived.totalStats,
    player,
    power,
  };
}

export function auditCustomLoadoutCombat(options: {
  arch: LevelDesignArchetype;
  depth: number;
  equipment: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  careerWins: number;
  extraSp?: number;
  enhanceLevel?: number;
  equipmentEnhanceLevels?: Partial<Record<V2EquipmentId, number>>;
  trials?: number;
  seed?: number;
}) {
  const seed = Math.floor(options.seed ?? 20260808);
  const snapshot = snapshotFor(
    options.arch,
    options.depth,
    options.careerWins,
    seed,
    options.enhanceLevel ?? 0,
    true,
    {
      equipment: options.equipment,
      extraSp: options.extraSp,
      equipmentEnhanceLevels: options.equipmentEnhanceLevels,
    },
  );
  return {
    ...combatAudit(snapshot, options.depth, options.trials ?? 200, seed),
    power: snapshot.power,
    spBudget: snapshot.spBudget,
    passiveSkills: snapshot.equippedSkills.filter((id) => Boolean(V2_SKILLS[id].passive)),
    equippedSkills: snapshot.equippedSkills,
    player: snapshot.player,
    totalStats: snapshot.totalStats,
    enemies: monstersAtDepth(options.depth),
  };
}

function minimumProgressionFor(
  arch: LevelDesignArchetype,
  depth: number,
  seed: number,
  enhanceLevel: number,
): ProgressionSnapshot {
  const gate = floorPowerGate(depth);
  for (const segment of careerSegments(depth)) {
    const lastWins = Math.max(segment.start, segment.end - 1);
    if (snapshotFor(arch, depth, lastWins, seed, enhanceLevel).power < gate) continue;
    let lowWins = segment.start;
    let highWins = lastWins;
    while (lowWins < highWins) {
      const mid = Math.floor((lowWins + highWins) / 2);
      const candidate = snapshotFor(arch, depth, mid, seed, enhanceLevel);
      if (candidate.power >= gate) highWins = mid;
      else lowWins = mid + 1;
    }
    // 결정적 랜덤 성장의 작은 비단조 흔들림을 흡수한다.
    const from = Math.max(segment.start, lowWins - 64);
    for (let wins = from; wins <= lowWins + 64 && wins < segment.end; wins++) {
      const candidate = snapshotFor(arch, depth, wins, seed, enhanceLevel);
      if (candidate.power >= gate) return candidate;
    }
    return snapshotFor(arch, depth, lowWins, seed, enhanceLevel);
  }
  return snapshotFor(arch, depth, MAX_CAREER_WINS, seed, enhanceLevel);
}

export function buildLevelDesignProgressionSnapshot(options: {
  arch: LevelDesignArchetype;
  depth: number;
  seed?: number;
  enhanceLevel?: number;
  careerWins?: number;
  cultivate?: boolean;
}): LevelDesignProgressionSnapshot {
  const depth = Math.max(
    2,
    Math.min(MAX_FRONTIER_DEPTH, Math.floor(options.depth)),
  );
  const seed = Math.floor(options.seed ?? 20260809);
  const enhanceLevel = Math.max(
    0,
    Math.min(20, Math.floor(options.enhanceLevel ?? 0)),
  );
  const snapshot = options.careerWins == null
    ? minimumProgressionFor(options.arch, depth, seed, enhanceLevel)
    : snapshotFor(
        options.arch,
        depth,
        Math.max(0, Math.floor(options.careerWins)),
        seed,
        enhanceLevel,
        options.cultivate ?? true,
      );
  const equipped = [...snapshot.equippedSkills];
  return {
    arch: snapshot.arch,
    depth,
    power: snapshot.power,
    currentJobId: snapshot.currentJobId,
    player: snapshot.player,
    v2Skills: { learned: equipped, equipped: [...equipped] },
  };
}

function monstersAtDepth(depth: number): Monster[] {
  return enemiesForDepth(depth)
    .map((entry) => V2_MONSTERS[entry.key])
    .filter((monster): monster is Monster => monster !== undefined)
    .map((monster) => scaleMonsterForFloor(monster, depth, true));
}

function wilsonHalfWidth(wins: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return (margin / denom) * 100;
}

function combatAudit(
  snapshot: ProgressionSnapshot,
  depth: number,
  trials: number,
  seed: number,
): CombatAudit {
  const originalRandom = Math.random;
  Math.random = mulberry32(hashSeed(seed, snapshot.arch, depth, "combat"));
  const enemies = monstersAtDepth(depth);
  const v2Skills: V2SkillsState = {
    learned: snapshot.equippedSkills,
    equipped: snapshot.equippedSkills,
  };
  let wins = 0;
  let attempts = 0;
  let winTurns = 0;
  let hpCharge = 0;
  let mpCharge = 0;
  let exp = 0;
  let goldGross = 0;
  try {
    for (const enemy of enemies) {
      for (let trial = 0; trial < trials; trial++) {
        const result = resolveBattle(
          { ...snapshot.player, hp: snapshot.player.maxHp, mp: snapshot.player.maxMp },
          enemy,
          "LevelDesignSim",
          {
            pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
            potions: {},
            v2Skills,
            depth,
          },
        );
        attempts += 1;
        hpCharge += Math.max(0, snapshot.player.maxHp - result.finalState.playerHp);
        mpCharge += Math.max(0, (snapshot.player.maxMp ?? 0) - result.finalState.playerMp);
        if (result.outcome === "win") {
          wins += 1;
          winTurns += result.turns;
          goldGross += monsterGoldReward(enemy);
          exp +=
            applyNewbieExpBonusByBattles(enemy.exp, snapshot.careerWins).gained *
            XP_RATE_MULT;
        }
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  const avgHpChargePerAttempt = attempts > 0 ? hpCharge / attempts : 0;
  const avgMpChargePerAttempt = attempts > 0 ? mpCharge / attempts : 0;
  const goldGrossPerAttempt = attempts > 0 ? goldGross / attempts : 0;
  return {
    wins,
    attempts,
    winRatePct: attempts > 0 ? (wins / attempts) * 100 : 0,
    ciHalfWidthPct: wilsonHalfWidth(wins, attempts),
    avgWinTurns: wins > 0 ? winTurns / wins : 0,
    avgHpChargePerAttempt,
    avgMpChargePerAttempt,
    expPerAttempt: attempts > 0 ? exp / attempts : 0,
    goldGrossPerAttempt,
    goldAfterHpRecoveryPerAttempt: goldGrossPerAttempt - avgHpChargePerAttempt,
    goldAfterAllRecoveryPerAttempt:
      goldGrossPerAttempt - avgHpChargePerAttempt - avgMpChargePerAttempt,
  };
}

export type FixedProgressionCombatAudit = {
  arch: LevelDesignArchetype;
  power: number;
  cultivations: number;
  winRatePct: number;
  avgWinTurns: number;
};

/**
 * 표시 권장 전투력을 먼저 맞추는 기본 점검과 별개로, 고정된 성장 상태가 실제로 어디까지
 * 우회할 수 있는지 검증한다. 특히 수행 0회 엔드 장비 시나리오가 최종 사냥터를 안정적으로
 * 파밍하는 회귀를 잡는 용도다.
 */
export function auditFixedProgressionCombat(options: {
  depth: number;
  careerWins: number;
  cultivate: boolean;
  trials?: number;
  seed?: number;
  enhanceLevel?: number;
}): FixedProgressionCombatAudit[] {
  const trials = Math.max(1, Math.min(100, Math.floor(options.trials ?? 50)));
  const seed = Math.floor(options.seed ?? 20260801);
  const enhanceLevel = Math.max(
    0,
    Math.min(20, Math.floor(options.enhanceLevel ?? 0)),
  );
  return LEVEL_DESIGN_ARCHETYPES.map((arch) => {
    const snapshot = snapshotFor(
      arch,
      options.depth,
      options.careerWins,
      seed,
      enhanceLevel,
      options.cultivate,
    );
    const combat = combatAudit(snapshot, options.depth, trials, seed);
    return {
      arch,
      power: snapshot.power,
      cultivations: snapshot.cultivations,
      winRatePct: combat.winRatePct,
      avgWinTurns: combat.avgWinTurns,
    };
  });
}

export function classifyStage(params: {
  minWinRateDropPct?: number;
  readinessRecoveryCount?: number;
  minWinRatePct: number;
  winRateGapPct: number;
  maxAvgWinTurns: number;
}): LevelDesignWarning[] {
  const warnings: LevelDesignWarning[] = [];
  if ((params.minWinRateDropPct ?? 0) >= 20) warnings.push("DIFFICULTY_CLIFF");
  if ((params.readinessRecoveryCount ?? 0) > 0) warnings.push("READINESS_RECOVERY");
  if (params.minWinRatePct < 60) warnings.push("LOW_WIN_RATE");
  if (params.winRateGapPct >= 30) warnings.push("BUILD_GAP");
  if (params.maxAvgWinTurns > 25) warnings.push("SLOW_FIGHT");
  return warnings;
}

function auditStage(
  depth: number,
  previousDepth: number | null,
  previousMinWinRatePct: number | null,
  options: CliOptions,
): StageAudit {
  const gate = floorPowerGate(depth);
  const previousGate = previousDepth === null ? gate : floorPowerGate(previousDepth);
  const builds = LEVEL_DESIGN_ARCHETYPES.map((arch): BuildAudit => {
    const snapshot = minimumProgressionFor(
      arch,
      depth,
      options.seed,
      options.enhanceLevel,
    );
    const combat = combatAudit(snapshot, depth, options.trials, options.seed);
    const job = V2_JOB_CATALOG[snapshot.currentJobId];
    const readiness = dungeonReadiness({
      depth,
      frontierDepth: previousDepth ?? depth,
      playerPower: snapshot.power,
      recommendedPower: gate,
      jobTier: snapshot.jobTier,
      level: snapshot.level,
      levelCap: rejobRequiredLevel(snapshot.currentJobId),
    });
    return {
      arch,
      level: snapshot.level,
      careerWins: snapshot.careerWins,
      energyFloorDays: snapshot.careerWins / STAMINA_PER_DAY,
      currentJobId: snapshot.currentJobId,
      currentJobName: job?.name ?? snapshot.currentJobId,
      jobTier: snapshot.jobTier,
      cultivations: snapshot.cultivations,
      spBudget: snapshot.spBudget,
      equippedSkillCount: snapshot.equippedSkills.length,
      equippedSkills: snapshot.equippedSkills,
      equipment: snapshot.equipment,
      combatStats: {
        str: snapshot.totalStats.str,
        dex: snapshot.totalStats.dex,
        vit: snapshot.totalStats.vit,
        int: snapshot.totalStats.int,
        spi: snapshot.totalStats.spi,
        luk: snapshot.totalStats.luk,
        atk: snapshot.player.atk,
        magicAtk: snapshot.player.magicAtk ?? 0,
        def: snapshot.player.def,
        magicDef: snapshot.player.magicDef ?? 0,
        spd: snapshot.player.spd,
        maxHp: snapshot.player.maxHp,
        maxMp: snapshot.player.maxMp ?? 0,
        accRating: snapshot.player.accRating ?? 0,
        evaRating: snapshot.player.evaRating ?? 0,
        critChancePct: snapshot.player.critChancePct ?? 0,
      },
      power: snapshot.power,
      gateReached: snapshot.power >= gate,
      readiness,
      maxEquipmentTier: snapshot.maxEquipmentTier,
      combat,
    };
  });
  const rates = builds.map((build) => build.combat.winRatePct);
  const minWinRatePct = Math.min(...rates);
  const maxWinRatePct = Math.max(...rates);
  const winRateGapPct = maxWinRatePct - minWinRatePct;
  const powerTargetMisses = builds.filter((build) => !build.gateReached).length;
  const readinessRecoveryCount = builds.filter(
    (build) => build.readiness.status === "rebuilding",
  ).length;
  const weakest = builds
    .filter((build) => Math.abs(build.combat.winRatePct - minWinRatePct) < 0.001)
    .map((build) => build.arch);
  const strongest = builds
    .filter((build) => Math.abs(build.combat.winRatePct - maxWinRatePct) < 0.001)
    .map((build) => build.arch);
  const gateJumpPct = previousDepth === null ? 0 : ((gate / previousGate) - 1) * 100;
  const minWinRateDropPct =
    previousMinWinRatePct == null
      ? 0
      : Math.max(0, previousMinWinRatePct - minWinRatePct);
  const warnings = classifyStage({
    minWinRateDropPct,
    readinessRecoveryCount,
    minWinRatePct,
    winRateGapPct,
    maxAvgWinTurns: Math.max(...builds.map((build) => build.combat.avgWinTurns)),
  });
  return {
    depth,
    name: huntStageName(depth),
    internalName: depthName(depth),
    gate,
    gateJumpPct,
    minWinRateDropPct,
    commonDropChancePct:
      depth <= 6 ? STARTER_DROP_POOL.chance * 100 : bandCommonChanceForDepth(depth) * 100,
    signatureDropChancePct: (bandUniquePoolForDepth(depth)?.chance ?? 0) * 100,
    builds,
    minWinRatePct,
    maxWinRatePct,
    winRateGapPct,
    powerTargetMisses,
    readinessRecoveryCount,
    weakest,
    strongest,
    warnings,
  };
}

export function buildReport(options: CliOptions): AuditReport {
  const depths = options.depth === null ? huntStageDepths() : [options.depth];
  const stages: StageAudit[] = [];
  for (let i = 0; i < depths.length; i++) {
    const previousDepth =
      i > 0 ? depths[i - 1] : depths[i] > 2 ? depths[i] - 2 : null;
    stages.push(
      auditStage(
        depths[i],
        previousDepth,
        stages.at(-1)?.minWinRatePct ?? null,
        options,
      ),
    );
  }
  const warningCounts: Record<LevelDesignWarning, number> = {
    DIFFICULTY_CLIFF: 0,
    READINESS_RECOVERY: 0,
    LOW_WIN_RATE: 0,
    BUILD_GAP: 0,
    SLOW_FIGHT: 0,
  };
  for (const stage of stages) {
    for (const warning of stage.warnings) warningCounts[warning] += 1;
  }
  const observationCounts = {
    powerTargetMissStages: stages.filter((stage) => stage.powerTargetMisses > 0).length,
    powerTargetMissBuilds: stages.reduce(
      (sum, stage) => sum + stage.powerTargetMisses,
      0,
    ),
  };
  return {
    generatedAt: new Date().toISOString(),
    config: {
      coreLoop: V2_CORE_LOOP_V2,
      staminaHunt: V2_HUNT_USE_STAMINA,
      atbSkills: V2_ATB_SKILLS,
      xpRate: XP_RATE_MULT,
      maxStamina: MAX_STAMINA,
      regenSecondsPerPoint: REGEN_SECONDS_PER_POINT,
      staminaPerDay: STAMINA_PER_DAY,
      trialsPerMonster: options.trials,
      seed: options.seed,
      enhanceLevel: options.enhanceLevel,
    },
    assumptions: [
      "레벨은 실제 상한 100을 사용한다.",
      "레벨 도달 승리 수는 직전 대표 단계의 실제 EXP를 처음부터 계속 받았다고 본 이론적 하한이다.",
      "숙련도는 승리당 최소 숙달 포인트 2만 적용해 수행 성장량을 보수적으로 계산한다.",
      "지역 입구는 이전 지역까지 획득 가능한 일반 장비, 후속 단계는 현재 지역 일반 장비를 사용한다.",
      "장비 굴림·제작·유니크·음식·길드 버프는 제외한다.",
      options.enhanceLevel > 0
        ? `일반 장비 전 부위에 강화 +${options.enhanceLevel}(${enhanceBonusPct(options.enhanceLevel)}%)를 적용한다.`
        : "강화는 적용하지 않는다. --enhance=N으로 강화 전제 결과를 비교할 수 있다.",
      `기본 성장 게이트 탐색은 빌드당 최대 ${MAX_CAREER_WINS.toLocaleString("ko-KR")}승까지 수행한다.`,
      "난이도 지표 미달은 빌드별 환산 편차가 커 관찰값으로만 남기고, 전직 후 레벨 회복 상태만 준비도 경고로 분류한다.",
      "careerWins/7200일은 자연 회복 에너지만 사용한 이론적 하한이다.",
    ],
    stages,
    warningCounts,
    observationCounts,
    growthPacing: buildGrowthPacing(),
  };
}

const WARNING_LABEL: Record<LevelDesignWarning, string> = {
  DIFFICULTY_CLIFF: "승률절벽",
  READINESS_RECOVERY: "전직회복 필요",
  LOW_WIN_RATE: "저승률",
  BUILD_GAP: "빌드격차",
  SLOW_FIGHT: "장기전",
};

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function fixed(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function expected(value: number | null): string {
  return value == null ? "-" : Math.round(value).toLocaleString("ko-KR");
}

function printGrowthPacing(growth: GrowthPacingAudit): void {
  const { energy, career } = growth;
  console.log("\n성장·에너지·장비 페이싱");
  console.log(
    `Lv1→${V2_LEVEL_CAP} 필요 EXP ${growth.totalExpToLevelCap.toLocaleString("ko-KR")} · 기본 에너지 ${energy.baseFullHours.toFixed(1)}시간 만충(일 자연회복의 ${energy.baseDailyLoginCapturePct.toFixed(1)}%를 1일 1회 접속으로 회수)`,
  );
  console.log(
    `지원권 에너지 ${energy.supportMax.toLocaleString("ko-KR")} · ${energy.supportFullHours.toFixed(1)}시간 만충 · 1일 1회 회수율 ${energy.supportDailyLoginCapturePct.toFixed(1)}% · 신규 HP/MP 충전 각 ${energy.starterChargeEach.toLocaleString("ko-KR")}`,
  );
  console.log(
    `단일 계보 6차까지 숙련 ${career.tierRequirements.map((wins) => wins.toLocaleString("ko-KR")).join("+")}=${career.totalWinsToTier6Path.toLocaleString("ko-KR")}승 · 자연회복 하한 ${career.idealDaysToTier6Path.toFixed(1)}일 · 일 1회 기본 ${career.dailyLoginDaysToTier6Path.toFixed(1)}일 · 지원권 ${career.supportDailyLoginDaysToTier6Path.toFixed(1)}일`,
  );
  if (growth.largestExpJump) {
    console.log(
      `대표 단계 최대 EXP 상승: 깊이 ${growth.largestExpJump.fromDepth}→${growth.largestExpJump.toDepth} ×${growth.largestExpJump.multiplier.toFixed(1)}`,
    );
  }
  console.log("깊이 단계               EXP/승  상승  만렙승(신참/베테랑)  베테랑 일수(회복/일1회) 요청(무료/지원) 일반 기대(아무/특정) 고유 기대(아무/특정)");
  for (const row of growth.rows) {
    const jump = row.expJumpFromPrevious == null ? "-" : `×${row.expJumpFromPrevious.toFixed(1)}`;
    console.log(
      `${pad(row.depth, 3)} ${row.name.padEnd(18).slice(0, 18)} ${pad(fixed(row.avgVeteranExpPerWin, 1), 7)} ${pad(jump, 5)} ${pad(`${row.newbieLevelCapWins.toLocaleString("ko-KR")}/${row.veteranLevelCapWins.toLocaleString("ko-KR")}`, 18)} ${pad(`${fixed(row.veteranIdealDays, 2)}/${fixed(row.veteranDailyLoginDays, 2)}`, 13)}일 ${pad(`${row.freeBatchRequests}/${row.supportBatchRequests}`, 11)} ${pad(`${expected(row.commonAnyExpectedWins)}/${expected(row.commonSpecificExpectedWins)}`, 17)} ${pad(`${expected(row.signatureAnyExpectedWins)}/${expected(row.signatureSpecificExpectedWins)}`, 17)}`,
    );
  }
}

function printBuilds(stage: StageAudit): void {
  console.log("  빌드  Lv   숙련승  일하한 직업             T  power/gate   WR±CI    turn  HP충전 MP충전 순G(HP/전체) SP/스킬  준비도");
  for (const build of stage.builds) {
    const combat = build.combat;
    const gateMark = build.gateReached ? "✓" : "!";
    console.log(
      `  ${build.arch.padEnd(4)} ${pad(build.level, 3)} ${pad(build.careerWins.toLocaleString("ko-KR"), 8)} ${pad(fixed(build.energyFloorDays, 1), 5)}일 ${build.currentJobName.padEnd(8).slice(0, 8)} ${pad(build.jobTier, 2)} ${pad(`${build.power}/${stage.gate}${gateMark}`, 11)}  ${pad(fixed(combat.winRatePct), 3)}±${fixed(combat.ciHalfWidthPct)}  ${pad(fixed(combat.avgWinTurns, 1), 5)}  ${pad(fixed(combat.avgHpChargePerAttempt), 6)} ${pad(fixed(combat.avgMpChargePerAttempt), 6)} ${pad(`${fixed(combat.goldAfterHpRecoveryPerAttempt)}/${fixed(combat.goldAfterAllRecoveryPerAttempt)}`, 11)} ${pad(build.spBudget, 2)}/${build.equippedSkillCount}  ${build.readiness.label}`,
    );
  }
}

function printReport(report: AuditReport, options: CliOptions): void {
  console.log("v2 1→78 레벨 디자인 통합 점검");
  console.log(
    `운영 설정: core=${report.config.coreLoop} stamina=${report.config.staminaHunt} atb=${report.config.atbSkills} XP×${report.config.xpRate} · 에너지 ${report.config.maxStamina}/${report.config.regenSecondsPerPoint}초 · 자연회복 ${report.config.staminaPerDay.toLocaleString("ko-KR")}회/일`,
  );
  console.log(
    `표본: 몬스터당 ${report.config.trialsPerMonster}회 × 지역당 5종 × 7빌드 · 장비 +${report.config.enhanceLevel} · seed=${report.config.seed}`,
  );
  console.log("깊이  단계                 gate  jump WR하락  WR범위  격차 권장↓ 회복 약세      장비T  드랍(일반/고유)  경고");
  for (const stage of report.stages) {
    const maxTier = Math.max(...stage.builds.map((build) => build.maxEquipmentTier));
    const warningText = stage.warnings.map((warning) => WARNING_LABEL[warning]).join(",") || "-";
    console.log(
      `${pad(stage.depth, 3)}  ${stage.name.padEnd(18).slice(0, 18)} ${pad(stage.gate, 5)} ${pad(`${fixed(stage.gateJumpPct)}%`, 6)} ${pad(`${fixed(stage.minWinRateDropPct)}%p`, 6)} ${pad(`${fixed(stage.minWinRatePct)}-${fixed(stage.maxWinRatePct)}%`, 8)} ${pad(`${fixed(stage.winRateGapPct)}%`, 5)} ${pad(stage.powerTargetMisses, 5)} ${pad(stage.readinessRecoveryCount, 4)} ${stage.weakest.join("/").padEnd(8).slice(0, 8)} ${pad(maxTier, 5)}  ${pad(`${fixed(stage.commonDropChancePct, 2)}/${fixed(stage.signatureDropChancePct, 2)}%`, 13)}  ${warningText}`,
    );
    if (options.verbose) printBuilds(stage);
  }

  const flagged = report.stages
    .filter((stage) => stage.warnings.length > 0)
    .sort((a, b) => {
      const score = (stage: StageAudit) =>
        stage.readinessRecoveryCount * 100 +
        (100 - stage.minWinRatePct) +
        stage.winRateGapPct +
        Math.max(0, stage.minWinRateDropPct - 20);
      return score(b) - score(a);
    });
  if (!options.verbose && flagged.length > 0) {
    const highlighted = options.depth === null ? flagged.slice(0, 8) : flagged;
    console.log(`\n핵심 위험 단계 상세 (${highlighted.length}/${flagged.length})`);
    for (const stage of highlighted) {
      console.log(
        `\n[깊이 ${stage.depth} · ${stage.name}] ${stage.warnings.map((warning) => WARNING_LABEL[warning]).join(", ")}`,
      );
      printBuilds(stage);
    }
    if (highlighted.length < flagged.length) {
      console.log("\n나머지는 --verbose 또는 --depth=N --verbose로 확인할 수 있습니다.");
    }
  }

  console.log("\n경고 합계");
  console.log(
    Object.entries(report.warningCounts)
      .map(([warning, count]) => `${WARNING_LABEL[warning as LevelDesignWarning]} ${count}`)
      .join(" · "),
  );
  console.log(
    `관찰: 난이도 지표 미달 ${report.observationCounts.powerTargetMissStages}단계 · 누적 ${report.observationCounts.powerTargetMissBuilds}빌드`,
  );
  printGrowthPacing(report.growthPacing);
  console.log("주의: 숙련 일수는 실제 소요시간이 아니라 에너지 자연회복만 본 하한입니다.");
}

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseOptions(args);
  assertRuntimeConfig(options);
  const originalRandom = Math.random;
  setBattleLogCollection(false);
  Math.random = mulberry32(options.seed);
  try {
    const report = buildReport(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report, options);
    const hasWarnings = Object.values(report.warningCounts).some((count) => count > 0);
    return options.strict && hasWarnings ? 1 : 0;
  } finally {
    Math.random = originalRandom;
    setBattleLogCollection(true);
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
