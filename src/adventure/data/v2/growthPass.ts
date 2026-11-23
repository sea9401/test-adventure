// 성장 패스 — 튜토리얼 '성장의 길'(3차 전직) 뒤에 이어지는 구간별 목표와 보상.
// 3차부터 6차까지 차수마다 한 구간이고, 그 차수에 도달하면 구간이 열린다.
// 구간 안의 목표는 순서 없이 달성한 것부터 받는다(숙련도 목표만 앞 단계부터).
// 이미 달성한 목표는 기존 계정도 소급해서 받는다. 가입한 지 얼마 안 된 계정은 목표마다 회복약을 더 받는다.
// 수치는 2026-11-23 오너 방향(문 수치는 그대로, 보상은 귀속 회복약과 숙련 증서, 보스 토벌 같은 목표로 세분화)에 맞춘 값이고,
// 목표 위치는 같은 날 운영 기록의 차수별 분포(사냥터 깊이·수행·협동 보스·숙련의 탑·강화)를 보고 잡았다.

import { huntStageName } from "./dungeon";
import type { QuestCtx, QuestDef, QuestLine, QuestReward } from "./v2Quests";

const LINE_PREFIX = "growth_pass_";

/** 구간이 열리는 차수. 3차 구간은 성장의 길 마지막 단계(3차 전직)와 같은 조건이다. */
export const GROWTH_PASS_CHAPTER_TIERS = [3, 4, 5, 6] as const;
export type GrowthPassChapterTier = (typeof GROWTH_PASS_CHAPTER_TIERS)[number];

export function growthPassLineId(tier: GrowthPassChapterTier): string {
  return `${LINE_PREFIX}${tier}`;
}

export function isGrowthPassLine(lineId: string): boolean {
  return lineId.startsWith(LINE_PREFIX);
}

/** 가입 후 이 기간 안에 받으면 신규 모험가 추가 보상이 붙는다. */
export const GROWTH_PASS_NEWCOMER_DAYS = 30;
/** 일반 목표의 귀속 회복약. */
export const GROWTH_PASS_STEP_POTIONS = 3;
/** 4차·5차 전직 목표의 귀속 회복약. */
export const GROWTH_PASS_JOB_STEP_POTIONS = 5;
/** 6차·7차 전직 목표의 귀속 회복약. */
export const GROWTH_PASS_FINAL_STEP_POTIONS = 10;
/** 신규 모험가 추가 보상: 일반 목표와 전직 목표. */
export const GROWTH_PASS_NEWCOMER_POTIONS = 2;
export const GROWTH_PASS_NEWCOMER_JOB_POTIONS = 5;

const DAY_MS = 24 * 60 * 60 * 1_000;

export function isGrowthPassNewcomer(
  accountCreatedAt: number | null | undefined,
  now: number = Date.now(),
): boolean {
  return (
    typeof accountCreatedAt === "number" &&
    Number.isFinite(accountCreatedAt) &&
    now - accountCreatedAt <= GROWTH_PASS_NEWCOMER_DAYS * DAY_MS
  );
}

/** 한 번이라도 도달한 최고 차수. 값이 없는 옛 호출부는 지금 직업의 차수로 본다. */
function reachedTier(c: QuestCtx): number {
  return Math.max(c.maxJobTier ?? 0, c.tier);
}

function tierMastery(c: QuestCtx, tier: number): number {
  return Math.max(0, Math.floor(c.tierMastery?.[tier] ?? 0));
}

/** 직업군을 바꿔도 이어지는 수행 횟수. 값이 없는 옛 호출부는 지금 직업군의 횟수로 본다. */
function cultivations(c: QuestCtx): number {
  return Math.max(c.cultivationsTotal ?? 0, c.cultivations);
}

const STEP_REWARD: QuestReward = { boundStaminaPotions: GROWTH_PASS_STEP_POTIONS };
const STEP_BONUS: QuestReward = {
  boundStaminaPotions: GROWTH_PASS_NEWCOMER_POTIONS,
};
const JOB_BONUS: QuestReward = {
  boundStaminaPotions: GROWTH_PASS_NEWCOMER_JOB_POTIONS,
};

function comma(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 전직 목표. 구간의 마지막 목표다. */
function jobStep(
  chapter: GrowthPassChapterTier,
  reward: QuestReward,
): QuestDef {
  const tier = chapter + 1;
  return {
    id: `gp_tier${tier}`,
    line: growthPassLineId(chapter),
    title: `${tier}차 전직`,
    desc: `캐릭터 > 성장의 신전에서 ${tier}차 직업으로 전직하세요.`,
    href: "/character/shrine",
    reward,
    newcomerBonus: JOB_BONUS,
    check: (c) => reachedTier(c) >= tier,
  };
}

/** 그 차수 직업 하나의 숙련도. 같은 구간의 숙련도 목표는 앞 단계를 받은 뒤에 다음 단계가 보인다. */
function masteryStep(tier: GrowthPassChapterTier, goal: number): QuestDef {
  return {
    id: `gp_t${tier}_${goal}`,
    line: growthPassLineId(tier),
    title: `${tier}차 숙련도 ${comma(goal)}`,
    desc: `${tier}차 직업 하나의 숙련도를 ${comma(goal)}까지 올리세요. ${tier + 1}차로 전직했다면 달성으로 봅니다.`,
    href: "/battle/dungeon",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    chain: `gp:mastery${tier}`,
    progress: (c) =>
      reachedTier(c) > tier ? goal : Math.min(goal, tierMastery(c, tier)),
    goal,
    check: (c) => reachedTier(c) > tier || tierMastery(c, tier) >= goal,
  };
}

/** 사냥터의 새 지역에 도달. depth 는 그 지역의 첫 깊이다. */
function depthStep(chapter: GrowthPassChapterTier, depth: number): QuestDef {
  const stage = huntStageName(depth);
  const theme = stage.split(" · ")[0];
  return {
    id: `gp_depth${depth}`,
    line: growthPassLineId(chapter),
    title: `${theme} 도달`,
    desc: `사냥터에서 ${stage}까지 나아가세요.`,
    href: "/battle/dungeon",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    // 화면의 사냥터 단계(깊이 두 칸이 한 단계)와 같은 눈금으로 보여 준다.
    progress: (c) => Math.min(Math.ceil(depth / 2), Math.ceil(c.frontierDepth / 2)),
    goal: Math.ceil(depth / 2),
    check: (c) => c.frontierDepth >= depth,
  };
}

/** 성장 패스가 가리키는 협동 보스. 이름과 소환서 수는 coopBosses.ts 와 테스트로 맞춘다. */
export const GROWTH_PASS_BOSSES = {
  mountain: { name: "산군", scrollCost: 10, kinds: ["mountain_chief", "mountain_chief_hard"] },
  canyon: { name: "스콜피온 킹", scrollCost: 15, kinds: ["canyon_predator", "canyon_predator_hard"] },
  lake: { name: "호수의 괴물", scrollCost: 20, kinds: ["lake_sovereign", "lake_sovereign_hard"] },
  void: { name: "공허의 대사제", scrollCost: 30, kinds: ["void_priest"] },
} as const;
export type GrowthPassBossKey = keyof typeof GROWTH_PASS_BOSSES;

function bossStep(chapter: GrowthPassChapterTier, key: GrowthPassBossKey): QuestDef {
  const boss = GROWTH_PASS_BOSSES[key];
  return {
    id: `gp_boss_${key}`,
    line: growthPassLineId(chapter),
    title: `${boss.name} 토벌`,
    desc: `협동 보스 ${boss.name} 토벌에 참여하고 보상을 받으세요. 직접 부르려면 소환서 ${boss.scrollCost}장이 필요합니다.`,
    href: "/battle/coop",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    check: (c) =>
      boss.kinds.some((kind) => c.coopBossKindIds?.includes(kind) === true),
  };
}

function cultivationStep(chapter: GrowthPassChapterTier, goal: number): QuestDef {
  return {
    id: `gp_cult${goal}`,
    line: growthPassLineId(chapter),
    title: `수행 ${comma(goal)}회`,
    desc: `캐릭터 > 성장의 신전에서 수행을 모두 ${comma(goal)}회 하세요. 직업군을 바꿔도 횟수는 이어집니다.`,
    href: "/character/shrine",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    progress: (c) => Math.min(goal, cultivations(c)),
    goal,
    check: (c) => cultivations(c) >= goal,
  };
}

function towerStep(chapter: GrowthPassChapterTier, floor: number): QuestDef {
  return {
    id: `gp_tower${floor}`,
    line: growthPassLineId(chapter),
    title: `숙련의 탑 ${floor}층`,
    desc: `숙련의 탑에서 ${floor}층까지 오르세요.`,
    href: "/battle/mastery-tower",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    progress: (c) => Math.min(floor, c.masteryTowerFloor),
    goal: floor,
    check: (c) => c.masteryTowerFloor >= floor,
  };
}

function enhanceStep(chapter: GrowthPassChapterTier, level: number): QuestDef {
  return {
    id: `gp_enh${level}`,
    line: growthPassLineId(chapter),
    title: `장비 +${level} 강화`,
    desc: `대장간에서 장비 하나를 +${level}까지 강화하세요.`,
    href: "/town/smithy",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    progress: (c) => Math.min(level, c.maxEnhanceLevel),
    goal: level,
    check: (c) => c.maxEnhanceLevel >= level,
  };
}

function guildStep(chapter: GrowthPassChapterTier): QuestDef {
  return {
    id: "gp_guild",
    line: growthPassLineId(chapter),
    title: "길드 가입",
    desc: "길드에 가입하거나 길드를 만드세요.",
    href: "/guild",
    reward: STEP_REWARD,
    newcomerBonus: STEP_BONUS,
    check: (c) => c.hasGuild,
  };
}

type Chapter = { tier: GrowthPassChapterTier; steps: QuestDef[] };

const CHAPTERS: Chapter[] = [
  {
    tier: 3,
    steps: [
      depthStep(3, 37),
      bossStep(3, "mountain"),
      cultivationStep(3, 30),
      enhanceStep(3, 5),
      guildStep(3),
      jobStep(3, {
        boundStaminaPotions: GROWTH_PASS_JOB_STEP_POTIONS,
        masteryCertificates: 1_000,
      }),
    ],
  },
  {
    tier: 4,
    steps: [
      masteryStep(4, 6_000),
      masteryStep(4, 12_000),
      depthStep(4, 49),
      bossStep(4, "canyon"),
      cultivationStep(4, 60),
      towerStep(4, 10),
      jobStep(4, {
        boundStaminaPotions: GROWTH_PASS_JOB_STEP_POTIONS,
        masteryCertificates: 2_000,
      }),
    ],
  },
  {
    tier: 5,
    steps: [
      masteryStep(5, 12_000),
      masteryStep(5, 24_000),
      depthStep(5, 61),
      bossStep(5, "lake"),
      cultivationStep(5, 100),
      towerStep(5, 25),
      jobStep(5, { boundStaminaPotions: GROWTH_PASS_FINAL_STEP_POTIONS }),
    ],
  },
  {
    tier: 6,
    steps: [
      masteryStep(6, 30_000),
      masteryStep(6, 60_000),
      depthStep(6, 79),
      bossStep(6, "void"),
      towerStep(6, 50),
      enhanceStep(6, 10),
      jobStep(6, { boundStaminaPotions: GROWTH_PASS_FINAL_STEP_POTIONS }),
    ],
  },
];

/** 구간별 목표. 화면 안내용. */
export const GROWTH_PASS_CHAPTERS: readonly Chapter[] = CHAPTERS;

/** 모든 목표(구간 순서). */
export const GROWTH_PASS: QuestDef[] = CHAPTERS.flatMap((chapter) => chapter.steps);

/**
 * 퀘스트 화면의 줄. 지금 구간이 위에 오도록 높은 차수부터 놓는다.
 * 그 차수에 도달한 적이 있어야 보인다.
 */
export const GROWTH_PASS_LINES: QuestLine[] = [...CHAPTERS]
  .reverse()
  .map(({ tier }) => ({
    id: growthPassLineId(tier),
    name: `성장 패스 · ${tier}차 구간`,
    subtitle: `${tier + 1}차로 전직하기 전까지의 목표입니다. 순서 없이 달성한 것부터 받습니다.`,
    sequential: false,
    tutorial: true,
    visibleWhen: (c: QuestCtx) => reachedTier(c) >= tier,
  }));
