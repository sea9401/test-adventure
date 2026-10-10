import { COOP_BOSSES, type CoopBossKind } from "./coopBosses";

// 길드 토벌전에서 길드가 매주 고르는 보스. 협동 보스 목록(COOP_BOSSES)과 분리해 협동 소환·상점·
// 보상표에는 나타나지 않는다. id 는 guild_raid_guild_scores.boss_kind 에 저장된다.
export type GuildRaidBossId = "mountain_chief_hard" | "canyon_predator_raid";

export type GuildRaidBossDef = {
  id: GuildRaidBossId;
  /** 전투용 보스 정의. 토벌 전투는 매 판 HP 100%에서 시작한다. */
  definition: CoopBossKind;
  /** 길드 진행 1단계 체력. 단계마다 GUILD_RAID_STAGE_HP_GROWTH 배씩 늘어난다. */
  stageBaseHp: number;
  rewardMultiplier: 1 | 2;
  /** 2배 보상을 받기 위한 길드 누적 피해 하한. 미달이면 최하 구간 보상. */
  bonusMinGuildDamage: number | null;
};

const CANYON_PREDATOR_HARD = COOP_BOSSES.canyon_predator_hard;

const CANYON_PREDATOR_RAID: CoopBossKind = {
  ...CANYON_PREDATOR_HARD,
  // 토벌 전투는 이 체력으로 시작해 쓰러지면 다시 채운다. 최대 HP 비례 피해가 보스마다 달라지지 않게
  // 협동판(840만) 대신 산군과 같은 체력 풀을 쓴다.
  sharedMaxHp: COOP_BOSSES.mountain_chief_hard.sharedMaxHp,
  // 2026-10-10 운영 상위 20명 시뮬(보스당 20회/인): 산군 대비 피해 중앙값 37.8%, 사분위 범위 25%p,
  // 5/20명이 전투 중 사망. 깊이 스케일만으로는 상위권 스펙을 따라가지 못해 능력치 배율을 직접 준다.
  // 공격력 위주로 올리면 사망 여부에 따라 빌드별 결과가 양극단으로 갈려(공격력 22배: 사분위 범위 73%p)
  // 방어 위주로 피해를 고르게 줄인다.
  anchorDepth: 100,
  base: {
    ...CANYON_PREDATOR_HARD.base,
    atk: CANYON_PREDATOR_HARD.base.atk * 8,
    def: CANYON_PREDATOR_HARD.base.def * 10,
    magicDef: (CANYON_PREDATOR_HARD.base.magicDef ?? 0) * 10,
  },
  // 토벌 전투는 매 판 HP 100%에서 시작해 발악 조건에 닿지 않으므로 두 발악을 처음부터 적용한다.
  enrageStages: CANYON_PREDATOR_HARD.enrageStages.map((stage) => ({
    ...stage,
    hpFraction: 1,
  })),
  traits: [
    "왕독의 집게: 방어 관통과 제한된 MP의 강한 물리 액티브",
    "토벌 전용: 재앙의 모래폭풍과 맹독갑각 붕괴 상태로 전투를 시작",
    "속도·회피·공격력·관통이 모두 오른 채로 중독 압박",
  ],
};

export const GUILD_RAID_BOSSES: Record<GuildRaidBossId, GuildRaidBossDef> = {
  mountain_chief_hard: {
    id: "mountain_chief_hard",
    definition: COOP_BOSSES.mountain_chief_hard,
    stageBaseHp: 1_200_000,
    rewardMultiplier: 1,
    bonusMinGuildDamage: null,
  },
  canyon_predator_raid: {
    id: "canyon_predator_raid",
    definition: CANYON_PREDATOR_RAID,
    // 산군 단계 체력 120만 × 피해 비율 중앙값(37.8%).
    stageBaseHp: 450_000,
    rewardMultiplier: 2,
    // 스콜 1회 피해 중앙값 약 310만 × 30회(상위권 두 명이 한 주 내내 공격한 정도).
    bonusMinGuildDamage: 93_000_000,
  },
};

export const GUILD_RAID_BOSS_IDS: readonly GuildRaidBossId[] = [
  "mountain_chief_hard",
  "canyon_predator_raid",
];

export const GUILD_RAID_DEFAULT_BOSS_ID: GuildRaidBossId = "mountain_chief_hard";

export function parseGuildRaidBossId(raw: unknown): GuildRaidBossId | null {
  return typeof raw === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_RAID_BOSSES, raw)
    ? (raw as GuildRaidBossId)
    : null;
}
