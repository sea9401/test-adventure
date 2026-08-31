import type { Monster } from "@/adventure/data/monsters/types";
import {
  UNEXPLORED_POOL_BY_ID,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";
import {
  unexploredBaseProxyMonsters,
  unexploredSpecialMonsters,
  type UnexploredSimulationDifficulty,
} from "./unexploredSimulationMonsters";

export const UNEXPLORED_BASE_MONSTER_IDS = [
  "unexplored_star_sea_warden",
  "unexplored_comet_tail_stalker",
  "unexplored_red_giant_priest",
  "unexplored_void_devourer",
  "unexplored_dead_star_observer",
] as const;

export type UnexploredBaseMonsterId =
  (typeof UNEXPLORED_BASE_MONSTER_IDS)[number];

const BASE_SOURCE_NAMES: Record<UnexploredBaseMonsterId, string> = {
  unexplored_star_sea_warden: "성해의 파수꾼",
  unexplored_comet_tail_stalker: "혜성꼬리 추적자",
  unexplored_red_giant_priest: "적색거성의 사제",
  unexplored_void_devourer: "공허를 먹는 짐승",
  unexplored_dead_star_observer: "죽은 별의 관측자",
};

const BASE_IMAGE_PATHS: Record<UnexploredBaseMonsterId, string> = {
  unexplored_star_sea_warden:
    "/images/monster/v2/unexplored-star-sea-warden.webp",
  unexplored_comet_tail_stalker:
    "/images/monster/v2/unexplored-comet-tail-stalker.webp",
  unexplored_red_giant_priest:
    "/images/monster/v2/unexplored-red-giant-priest.webp",
  unexplored_void_devourer:
    "/images/monster/v2/unexplored-void-devourer.webp",
  unexplored_dead_star_observer:
    "/images/monster/v2/unexplored-dead-star-observer.webp",
};

const SPECIAL_IMAGE_PATHS: Record<UnexploredPoolId, string> = {
  iron_legion: "/images/monster/v2/unexplored-armored-shieldman.webp",
  mana_barrier: "/images/monster/v2/unexplored-barrier-guardian.webp",
  regenerating_swarm:
    "/images/monster/v2/unexplored-regenerating-spore.webp",
  red_berserkers: "/images/monster/v2/unexplored-red-berserker.webp",
  crystal_artillery: "/images/monster/v2/unexplored-crystal-mage.webp",
  precision_hunters:
    "/images/monster/v2/unexplored-precision-scout.webp",
  runaway_machines: "/images/monster/v2/unexplored-rushing-machine.webp",
  shadow_stalkers: "/images/monster/v2/unexplored-shadow-scout.webp",
  venom_colony:
    "/images/monster/v2/unexplored-venom-fang-devourer.webp",
  bloodstained_dead: "/images/monster/v2/unexplored-hooked-dead.webp",
  frozen_legion: "/images/monster/v2/unexplored-frost-toucher.webp",
  crushing_colossi: "/images/monster/v2/unexplored-bedrock-colossus.webp",
};

export type UnexploredRuntimeMonster = {
  kind: "base" | "special";
  difficulty: number;
  poolId: UnexploredPoolId | null;
  monsterId: string;
  imageFileName: string;
  focused: boolean;
  monster: Monster;
};

function validateDifficulty(difficulty: number): number {
  if (!Number.isInteger(difficulty) || difficulty < 95 || difficulty > 120) {
    throw new Error(`Unsupported unexplored runtime difficulty: ${difficulty}`);
  }
  return difficulty;
}

function runtimeExp(): number {
  // 별의 무덤 기준 몬스터의 현행 사냥 EXP 중앙값. 노드 보정은 보상 해석기에서 별도 적용한다.
  return 1_320;
}

function imageFileName(imagePath: string): string {
  return imagePath.slice(imagePath.lastIndexOf("/") + 1);
}

function replaceEquippedSkill(
  monster: Monster,
  before: string,
  after: string,
): Monster {
  const equipped = monster.v2Skills?.equipped ?? [];
  const next = [...new Set(equipped.map((skillId) => skillId === before ? after : skillId))];
  return {
    ...monster,
    v2Skills: { learned: next, equipped: next },
  } as Monster;
}

function focusedMonster(poolId: UnexploredPoolId, monster: Monster): Monster {
  switch (poolId) {
    case "iron_legion":
      return { ...monster, def: Math.max(1, Math.round(monster.def * 1.15)) };
    case "mana_barrier":
      return {
        ...monster,
        magicDef: Math.max(1, Math.round((monster.magicDef ?? monster.def) * 1.15)),
        statusDamageReductionPct: Math.min(
          80,
          (monster.statusDamageReductionPct ?? 0) + 10,
        ),
      };
    case "regenerating_swarm":
      return {
        ...monster,
        hp: Math.max(1, Math.round(monster.hp * 1.15)),
        v2MaxMp: Math.max(1, (monster.v2MaxMp ?? 16) * 2),
      };
    case "red_berserkers":
      return {
        ...monster,
        atk: Math.max(1, Math.round(monster.atk * 1.1)),
        critPct: Math.min(100, (monster.critPct ?? 0) + 10),
      };
    case "crystal_artillery":
      return {
        ...monster,
        atk: Math.max(1, Math.round(monster.atk * 1.1)),
        v2MaxMp: Math.max(1, (monster.v2MaxMp ?? 40) * 2),
      };
    case "precision_hunters":
      return {
        ...monster,
        accuracy: (monster.accuracy ?? 0) + 15,
        critPct: Math.min(100, (monster.critPct ?? 0) + 8),
        playerDefVulnerable: Math.min(
          1,
          (monster.playerDefVulnerable ?? 0) + 0.05,
        ),
      };
    case "runaway_machines":
      return {
        ...monster,
        spd: Math.max(1, Math.round(monster.spd * 1.1)),
        bonusAttackChancePct: Math.min(
          100,
          (monster.bonusAttackChancePct ?? 0) + 15,
        ),
      };
    case "shadow_stalkers":
      return {
        ...monster,
        spd: Math.max(1, Math.round(monster.spd * 1.1)),
        evasionPct: Math.min(80, (monster.evasionPct ?? 0) + 10),
      };
    case "venom_colony":
      return replaceEquippedSkill(
        monster,
        "mob_venom_bite",
        "mob_catastrophe_venom",
      );
    case "bloodstained_dead":
      return {
        ...monster,
        spd: Math.max(1, Math.round(monster.spd * 1.1)),
        atk: Math.max(1, Math.round(monster.atk * 1.1)),
      };
    case "frozen_legion":
      return replaceEquippedSkill(
        monster,
        "mob_chilling_touch",
        "mob_deep_chill",
      );
    case "crushing_colossi":
      return {
        ...monster,
        atk: Math.max(1, Math.round(monster.atk * 1.1)),
        playerDefVulnerable: Math.min(
          1,
          (monster.playerDefVulnerable ?? 0) + 0.08,
        ),
      };
  }
}

export function unexploredMonsterAtDifficulty(params: {
  source: "base" | "special";
  poolId: UnexploredPoolId | null;
  monsterId?: UnexploredBaseMonsterId;
  focused: boolean;
  difficulty: number;
}): UnexploredRuntimeMonster {
  const difficulty = validateDifficulty(params.difficulty);
  if (params.source === "base") {
    const monsterId = params.monsterId ?? UNEXPLORED_BASE_MONSTER_IDS[0];
    const sourceName = BASE_SOURCE_NAMES[monsterId];
    const proxy = unexploredBaseProxyMonsters(
      difficulty as UnexploredSimulationDifficulty,
    ).find((entry) => entry.monsterId === sourceName);
    if (!proxy) throw new Error(`Missing unexplored base monster: ${monsterId}`);
    const image = BASE_IMAGE_PATHS[monsterId];
    return {
      kind: "base",
      difficulty,
      poolId: null,
      monsterId,
      imageFileName: imageFileName(image),
      focused: false,
      monster: {
        ...proxy.monster,
        image,
        exp: runtimeExp(),
      },
    };
  }

  if (!params.poolId) throw new Error("Special unexplored monster requires poolId");
  const pool = UNEXPLORED_POOL_BY_ID[params.poolId];
  const proxy = unexploredSpecialMonsters(
    difficulty as UnexploredSimulationDifficulty,
    "mechanics",
  ).find((entry) => entry.monsterId === pool.launchMonster.id);
  if (!proxy) throw new Error(`Missing unexplored launch monster: ${params.poolId}`);
  const image = SPECIAL_IMAGE_PATHS[params.poolId];
  const baseMonster: Monster = {
    ...proxy.monster,
    image,
    exp: runtimeExp(),
  };
  return {
    kind: "special",
    difficulty,
    poolId: params.poolId,
    monsterId: pool.launchMonster.id,
    imageFileName: imageFileName(image),
    focused: params.focused,
    monster: params.focused
      ? focusedMonster(params.poolId, baseMonster)
      : baseMonster,
  };
}

export function unexploredBaseMonstersAtDifficulty(
  difficulty: number,
): UnexploredRuntimeMonster[] {
  return UNEXPLORED_BASE_MONSTER_IDS.map((monsterId) =>
    unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      monsterId,
      focused: false,
      difficulty,
    }),
  );
}

export function unexploredLaunchSpecialMonstersAtDifficulty(
  difficulty: number,
  focusedPoolIds: readonly UnexploredPoolId[],
): UnexploredRuntimeMonster[] {
  const focused = new Set(focusedPoolIds);
  return Object.keys(UNEXPLORED_POOL_BY_ID).map((poolId) =>
    unexploredMonsterAtDifficulty({
      source: "special",
      poolId: poolId as UnexploredPoolId,
      focused: focused.has(poolId as UnexploredPoolId),
      difficulty,
    }),
  );
}
