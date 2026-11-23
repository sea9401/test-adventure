// 성장 패스 — 튜토리얼 '성장의 길'(3차 전직) 뒤에 이어지는 단계별 보상.
// 4차·5차 구간이 길어 그 안에 숙련도 단계를 두고, 7차 전직까지 이어진다.
// 이미 지난 단계는 기존 계정도 소급해서 받는다. 가입한 지 얼마 안 된 계정은 단계마다 회복약을 더 받는다.
// 수치는 2026-11-23 오너 방향(문 수치는 그대로, 단계 보상은 귀속 회복약 5개와 숙련 증서)에 맞춘 값이다.

import type { QuestCtx, QuestDef, QuestReward } from "./v2Quests";

export const GROWTH_PASS_LINE_ID = "growth_pass";
/** 이 차수의 직업에 한 번이라도 도달하면 패스가 열린다(성장의 길 마지막 단계와 같은 조건). */
export const GROWTH_PASS_OPEN_TIER = 3;
/** 가입 후 이 기간 안에 받으면 신규 모험가 추가 보상이 붙는다. */
export const GROWTH_PASS_NEWCOMER_DAYS = 30;
export const GROWTH_PASS_STEP_POTIONS = 5;
export const GROWTH_PASS_FINAL_STEP_POTIONS = 10;
export const GROWTH_PASS_NEWCOMER_POTIONS = 5;

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

const NEWCOMER_BONUS: QuestReward = {
  boundStaminaPotions: GROWTH_PASS_NEWCOMER_POTIONS,
};

function tierStep(tier: number, reward: QuestReward): QuestDef {
  return {
    id: `gp_tier${tier}`,
    line: GROWTH_PASS_LINE_ID,
    title: `${tier}차 전직`,
    desc: `캐릭터 > 성장의 신전에서 ${tier}차 직업으로 전직하세요.`,
    href: "/character/shrine",
    reward,
    newcomerBonus: NEWCOMER_BONUS,
    check: (c) => reachedTier(c) >= tier,
  };
}

function masteryStep(tier: number, goal: number): QuestDef {
  return {
    id: `gp_t${tier}_${goal}`,
    line: GROWTH_PASS_LINE_ID,
    title: `${tier}차 숙련도 ${goal.toLocaleString("ko-KR")}`,
    desc: `${tier}차 직업 하나의 숙련도를 ${goal.toLocaleString("ko-KR")}까지 올리세요. ${tier + 1}차로 전직했다면 달성으로 봅니다.`,
    href: "/battle/dungeon",
    reward: { boundStaminaPotions: GROWTH_PASS_STEP_POTIONS },
    newcomerBonus: NEWCOMER_BONUS,
    progress: (c) => (reachedTier(c) > tier ? goal : Math.min(goal, tierMastery(c, tier))),
    goal,
    check: (c) => reachedTier(c) > tier || tierMastery(c, tier) >= goal,
  };
}

export const GROWTH_PASS: QuestDef[] = [
  tierStep(4, { boundStaminaPotions: GROWTH_PASS_STEP_POTIONS, masteryCertificates: 1_000 }),
  masteryStep(4, 6_000),
  masteryStep(4, 12_000),
  tierStep(5, { boundStaminaPotions: GROWTH_PASS_STEP_POTIONS, masteryCertificates: 2_000 }),
  masteryStep(5, 12_000),
  masteryStep(5, 24_000),
  tierStep(6, { boundStaminaPotions: GROWTH_PASS_FINAL_STEP_POTIONS }),
  tierStep(7, { boundStaminaPotions: GROWTH_PASS_FINAL_STEP_POTIONS }),
];

/** 패스가 보이는 조건. 3차 직업에 도달한 적이 있어야 한다. */
export function growthPassOpen(c: QuestCtx): boolean {
  return reachedTier(c) >= GROWTH_PASS_OPEN_TIER;
}
