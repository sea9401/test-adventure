export type ReferralTutorialProgressTaskId =
  | "hunt_depth_24"
  | "join_guild"
  | "life_level_5"
  | "hunt_depth_36"
  | "life_level_10";

export type ReferralTutorialTaskId =
  | "signup"
  | ReferralTutorialProgressTaskId;

export type ReferralTutorialTask = {
  id: ReferralTutorialTaskId;
  title: string;
  description: string;
  staminaPotionsPerUser: number;
  href: string | null;
};

export const REFERRAL_TUTORIAL_TASKS = [
  {
    id: "signup",
    title: "모험 시작",
    description: "홍보 링크로 모험을 시작하세요.",
    staminaPotionsPerUser: 2,
    href: null,
  },
  {
    id: "hunt_depth_24",
    title: "더 깊은 사냥터로",
    description: "사냥터 깊이 24를 돌파하세요.",
    staminaPotionsPerUser: 2,
    href: "/battle",
  },
  {
    id: "join_guild",
    title: "길드의 일원",
    description: "길드에 가입하거나 길드를 창단하세요.",
    staminaPotionsPerUser: 2,
    href: "/guild",
  },
  {
    id: "life_level_5",
    title: "첫 생활 숙련",
    description: "생활 직종 하나를 레벨 5까지 성장시키세요.",
    staminaPotionsPerUser: 2,
    href: "/character/life",
  },
  {
    id: "hunt_depth_36",
    title: "심부 돌파",
    description: "사냥터 깊이 36을 돌파하세요.",
    staminaPotionsPerUser: 2,
    href: "/battle",
  },
  {
    id: "life_level_10",
    title: "생활의 기반",
    description: "생활 직종 하나를 레벨 10까지 성장시키세요.",
    staminaPotionsPerUser: 2,
    href: "/character/life",
  },
] as const satisfies readonly ReferralTutorialTask[];

export const REFERRAL_PROGRESS_TASK_IDS = [
  "hunt_depth_24",
  "join_guild",
  "life_level_5",
  "hunt_depth_36",
  "life_level_10",
] as const satisfies readonly ReferralTutorialProgressTaskId[];

const PROGRESS_TASK_ID_SET = new Set<string>(REFERRAL_PROGRESS_TASK_IDS);
const LEGACY_REWARD_DEPTHS = [6, 12, 18, 24, 36] as const;

export function normalizeReferralProgressTaskIds(
  value: unknown,
): ReferralTutorialProgressTaskId[] {
  if (!Array.isArray(value)) return [];
  const present = new Set(
    value.filter((item): item is string =>
      typeof item === "string" && PROGRESS_TASK_ID_SET.has(item)),
  );
  return REFERRAL_PROGRESS_TASK_IDS.filter((id) => present.has(id));
}

export function referralHuntTaskIds(
  frontierDepth: unknown,
): ReferralTutorialProgressTaskId[] {
  const depth = nonNegativeInt(frontierDepth);
  return [
    ...(depth >= 24 ? ["hunt_depth_24" as const] : []),
    ...(depth >= 36 ? ["hunt_depth_36" as const] : []),
  ];
}

export function referralLifeTaskIds(
  lifeLevel: unknown,
): ReferralTutorialProgressTaskId[] {
  const level = nonNegativeInt(lifeLevel);
  return [
    ...(level >= 5 ? ["life_level_5" as const] : []),
    ...(level >= 10 ? ["life_level_10" as const] : []),
  ];
}

export function referralLegacyTaskIds(
  rewardedDepth: unknown,
): ReferralTutorialProgressTaskId[] {
  const depth = nonNegativeInt(rewardedDepth);
  const paidCount = LEGACY_REWARD_DEPTHS.filter((value) => value <= depth).length;
  return REFERRAL_PROGRESS_TASK_IDS.slice(0, paidCount);
}

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
