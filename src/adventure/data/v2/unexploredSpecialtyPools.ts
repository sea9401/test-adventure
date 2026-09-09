import type { DungeonEnemy } from "./types";
import { enemiesForDepth } from "./dungeon";
import type { V2EquipmentId } from "./v2Equipment";

export type UnexploredSpecialtyPoolId =
  | "iron_legion" | "mana_barriers" | "regrowth_colony"
  | "red_warband" | "crystal_barrage" | "precision_hunters"
  | "runaway_machines" | "shadow_trackers" | "venom_colony"
  | "bloodstained_dead" | "frozen_legion" | "crushing_colossi";

export type UnexploredHuntMode =
  | { mode: "standard" }
  | { mode: "random" }
  | { mode: "focused"; poolId: UnexploredSpecialtyPoolId };

export type UnexploredSpecialtyMonster = {
  /** Drop routing remains stable even if this display name changes. */
  id: string;
  name: string;
  baseMonsterKey: string;
  image: string;
  equipmentId: V2EquipmentId;
};

export type UnexploredSpecialtyPool = {
  id: UnexploredSpecialtyPoolId;
  name: string;
  combatStyle: string;
  monsters: readonly UnexploredSpecialtyMonster[];
};

export type UnexploredSpecialtyEncounter = {
  poolId: UnexploredSpecialtyPoolId;
  monsterId: string;
  equipmentId: V2EquipmentId;
  enemy: DungeonEnemy;
};

function specialtyMonster(
  id: string,
  name: string,
  baseMonsterKey: string,
  image: string,
  equipmentId: V2EquipmentId,
): UnexploredSpecialtyMonster {
  return { id, name, baseMonsterKey, image, equipmentId };
}

// 기존 천공 균열·별의 무덤 몬스터의 전투 프로필과 초상화를 재사용한다.
// 새 표시는 고정 id로만 드롭을 판정하므로 표시 이름 변경이 장비 매핑을 바꾸지 않는다.
export const UNEXPLORED_SPECIALTY_POOLS = [
  {
    id: "iron_legion",
    name: "철갑 군단",
    combatStyle: "순수한 물리 방어와 피격 누적 방어",
    monsters: [
      specialtyMonster("iron_shieldman", "철갑 방패병", "성해의 파수꾼", "/images/monster/v2/star-sea-warden.webp", "v2_unexplored_iron_line_armor"),
      specialtyMonster("iron_spearman", "철갑 창병", "붕괴의 선봉장", "/images/monster/v2/storm-standard-bearer.webp", "v2_unexplored_iron_line_gloves"),
      specialtyMonster("iron_crusher", "철갑 파쇄병", "중력핵 골렘", "/images/monster/v2/rockback-guardian-beast.webp", "v2_unexplored_iron_line_boots"),
    ],
  },
  {
    id: "mana_barriers",
    name: "마력 방벽체",
    combatStyle: "마법 방어와 반복 보호막",
    monsters: [
      specialtyMonster("barrier_guardian", "결계 수호체", "성해의 파수꾼", "/images/monster/v2/star-sea-warden.webp", "v2_unexplored_mana_barrier_armor"),
      specialtyMonster("rune_enforcer", "룬 집행자", "죽은 별의 관측자", "/images/monster/v2/dead-star-observer.webp", "v2_unexplored_mana_barrier_ring"),
      specialtyMonster("seal_watcher", "봉인 감시체", "뇌정 성역지기", "/images/monster/v2/lightning-oracle.webp", "v2_unexplored_mana_barrier_necklace"),
    ],
  },
  {
    id: "regrowth_colony",
    name: "재생 군체",
    combatStyle: "행동 종료마다 체력을 되찾는 장기전 재생",
    monsters: [
      specialtyMonster("regrowth_spore", "재생 포자체", "공허를 먹는 짐승", "/images/monster/v2/void-devouring-beast.webp", "v2_unexplored_regrowth_colony_armor"),
      specialtyMonster("regrowth_devourer", "포식 재생체", "만독 비룡", "/images/monster/v2/blue-venom-pincer-king.webp", "v2_unexplored_regrowth_colony_gloves"),
      specialtyMonster("regrowth_nucleus", "증식 핵체", "중력핵 골렘", "/images/monster/v2/rockback-guardian-beast.webp", "v2_unexplored_regrowth_colony_necklace"),
    ],
  },
  {
    id: "red_warband",
    name: "붉은 광전대",
    combatStyle: "큰 피해를 견딘 뒤 다음 직접 공격으로 응징",
    monsters: [
      specialtyMonster("red_berserker", "붉은 광전병", "붕괴의 선봉장", "/images/monster/v2/storm-standard-bearer.webp", "v2_unexplored_battle_revenge_gloves"),
      specialtyMonster("blood_warrior", "혈전 투사", "혜성꼬리 추적자", "/images/monster/v2/comet-tail-stalker.webp", "v2_unexplored_battle_revenge_boots"),
      specialtyMonster("red_executioner", "붉은 처형자", "적색거성의 사제", "/images/monster/v2/red-giant-priest.webp", "v2_unexplored_battle_revenge_ring"),
    ],
  },
  {
    id: "crystal_barrage",
    name: "수정 포격대",
    combatStyle: "세 번째 유료 공격 스킬을 강화하는 MP 포격",
    monsters: [
      specialtyMonster("crystal_mage", "수정 술사", "적색거성의 사제", "/images/monster/v2/red-giant-priest.webp", "v2_unexplored_crystal_barrage_armor"),
      specialtyMonster("crystal_artillery", "굴절 포격체", "죽은 별의 관측자", "/images/monster/v2/dead-star-observer.webp", "v2_unexplored_crystal_barrage_gloves"),
      specialtyMonster("crystal_sentinel", "수정 파수체", "뇌정 성역지기", "/images/monster/v2/lightning-oracle.webp", "v2_unexplored_crystal_barrage_necklace"),
    ],
  },
  {
    id: "precision_hunters",
    name: "정밀 사냥단",
    combatStyle: "직접 사용하는 기본 공격 강화",
    monsters: [
      specialtyMonster("precision_scout", "정밀 척후병", "혜성꼬리 추적자", "/images/monster/v2/comet-tail-stalker.webp", "v2_unexplored_precision_hunt_boots"),
      specialtyMonster("precision_sniper", "치명 저격수", "무풍 추적귀", "/images/monster/v2/coldwind-raider-captain.webp", "v2_unexplored_precision_hunt_ring"),
      specialtyMonster("armor_hunter", "갑옷 사냥꾼", "붕괴의 선봉장", "/images/monster/v2/storm-standard-bearer.webp", "v2_unexplored_precision_hunt_gloves"),
    ],
  },
  {
    id: "runaway_machines",
    name: "폭주 기계",
    combatStyle: "스킬 사이에 추가 기본 공격을 잇는 연쇄 공격",
    monsters: [
      specialtyMonster("sprint_machine", "질주 기계", "무풍 추적귀", "/images/monster/v2/coldwind-raider-captain.webp", "v2_unexplored_chain_drive_boots"),
      specialtyMonster("combo_automaton", "연격 자동인형", "중력핵 골렘", "/images/monster/v2/rockback-guardian-beast.webp", "v2_unexplored_chain_drive_gloves"),
      specialtyMonster("overheat_executor", "과열 집행기", "뇌정 성역지기", "/images/monster/v2/lightning-oracle.webp", "v2_unexplored_chain_drive_ring"),
    ],
  },
  {
    id: "shadow_trackers",
    name: "그림자 추적자",
    combatStyle: "회피로 줄인 피해를 보호막으로 전환하는 생존",
    monsters: [
      specialtyMonster("shadow_scout", "그림자 척후병", "혜성꼬리 추적자", "/images/monster/v2/comet-tail-stalker.webp", "v2_unexplored_afterimage_hunt_boots"),
      specialtyMonster("night_assassin", "밤의 암살자", "무풍 추적귀", "/images/monster/v2/coldwind-raider-captain.webp", "v2_unexplored_afterimage_hunt_gloves"),
      specialtyMonster("afterimage_tracker", "허상 추적귀", "공허를 먹는 짐승", "/images/monster/v2/void-devouring-beast.webp", "v2_unexplored_afterimage_hunt_armor"),
    ],
  },
  {
    id: "venom_colony",
    name: "맹독 군락",
    combatStyle: "중독·출혈·연소 지속 피해 통합 강화",
    monsters: [
      specialtyMonster("venom_fang_devourer", "독니 포식자", "만독 비룡", "/images/monster/v2/blue-venom-pincer-king.webp", "v2_unexplored_triad_decay_gloves"),
      specialtyMonster("venom_sprayer", "맹독 살포체", "죽은 별의 관측자", "/images/monster/v2/dead-star-observer.webp", "v2_unexplored_triad_decay_ring"),
      specialtyMonster("corrosive_colony", "부식 군체", "공허를 먹는 짐승", "/images/monster/v2/void-devouring-beast.webp", "v2_unexplored_triad_decay_armor"),
    ],
  },
  {
    id: "bloodstained_dead",
    name: "혈흔 망자",
    combatStyle: "저체력에서 직접·상태 피해를 함께 견디는 완강",
    monsters: [
      specialtyMonster("hooked_dead", "갈고리 망자", "붕괴의 선봉장", "/images/monster/v2/storm-standard-bearer.webp", "v2_unexplored_unyielding_dead_gloves"),
      specialtyMonster("blood_column_stalker", "혈주 추격자", "혜성꼬리 추적자", "/images/monster/v2/comet-tail-stalker.webp", "v2_unexplored_unyielding_dead_boots"),
      specialtyMonster("severing_executor", "절단 집행자", "성해의 파수꾼", "/images/monster/v2/star-sea-warden.webp", "v2_unexplored_unyielding_dead_armor"),
    ],
  },
  {
    id: "frozen_legion",
    name: "혹한 군단",
    combatStyle: "치명타로 속도와 명중을 낮추는 둔화 제어",
    monsters: [
      specialtyMonster("frost_toucher", "서리 접촉자", "무풍 추적귀", "/images/monster/v2/coldwind-raider-captain.webp", "v2_unexplored_freezing_lock_gloves"),
      specialtyMonster("freeze_mage", "빙결 술사", "죽은 별의 관측자", "/images/monster/v2/dead-star-observer.webp", "v2_unexplored_freezing_lock_ring"),
      specialtyMonster("frozen_guard", "혹한 파수자", "성해의 파수꾼", "/images/monster/v2/star-sea-warden.webp", "v2_unexplored_freezing_lock_armor"),
    ],
  },
  {
    id: "crushing_colossi",
    name: "파쇄 거수",
    combatStyle: "속도를 대가로 직접 공격 방어 관통",
    monsters: [
      specialtyMonster("rock_colossus", "암반 거수", "중력핵 골렘", "/images/monster/v2/rockback-guardian-beast.webp", "v2_unexplored_crushing_pressure_armor"),
      specialtyMonster("ironwall_crusher", "철벽 분쇄자", "붕괴의 선봉장", "/images/monster/v2/storm-standard-bearer.webp", "v2_unexplored_crushing_pressure_gloves"),
      specialtyMonster("crust_shatterer", "지각 파괴자", "공허를 먹는 짐승", "/images/monster/v2/void-devouring-beast.webp", "v2_unexplored_crushing_pressure_boots"),
    ],
  },
] as const satisfies readonly UnexploredSpecialtyPool[];

const specialtyPoolIds = new Set<string>(
  UNEXPLORED_SPECIALTY_POOLS.map((pool) => pool.id),
);
const baseEnemiesByKey = new Map(
  [...enemiesForDepth(73), ...enemiesForDepth(79)].map((enemy) => [
    enemy.key,
    enemy,
  ]),
);

export function isUnexploredSpecialtyPoolId(
  value: unknown,
): value is UnexploredSpecialtyPoolId {
  return typeof value === "string" && specialtyPoolIds.has(value);
}

export function parseUnexploredHuntMode(raw: unknown): UnexploredHuntMode {
  if (!raw || typeof raw !== "object") return { mode: "standard" };
  const value = raw as { mode?: unknown; poolId?: unknown };
  if (value.mode === "random") return { mode: "random" };
  if (value.mode === "focused" && isUnexploredSpecialtyPoolId(value.poolId)) {
    return { mode: "focused", poolId: value.poolId };
  }
  return { mode: "standard" };
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function toEncounter(
  pool: UnexploredSpecialtyPool,
  monster: UnexploredSpecialtyMonster,
): UnexploredSpecialtyEncounter {
  const baseEnemy = baseEnemiesByKey.get(monster.baseMonsterKey);
  if (!baseEnemy) {
    throw new Error(`Unknown specialty base monster: ${monster.baseMonsterKey}`);
  }
  return {
    poolId: pool.id,
    monsterId: monster.id,
    equipmentId: monster.equipmentId,
    enemy: {
      ...baseEnemy,
      name: monster.name,
      image: monster.image,
    },
  };
}

export function pickUnexploredSpecialtyEncounter(
  mode: UnexploredHuntMode,
  rng: () => number,
): UnexploredSpecialtyEncounter | null {
  if (mode.mode === "standard") return null;
  const pool = mode.mode === "focused"
    ? UNEXPLORED_SPECIALTY_POOLS.find(({ id }) => id === mode.poolId)!
    : pickOne(UNEXPLORED_SPECIALTY_POOLS, rng);
  return toEncounter(pool, pickOne(pool.monsters, rng));
}
