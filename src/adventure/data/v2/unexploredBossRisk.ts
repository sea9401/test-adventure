import { UNEXPLORED_BOSS_IDS, type UnexploredBossId } from "./unexploredBosses";

// 미개척지 개인 보스 위험도. 소환할 때 고르는 강화 단계로, 높을수록 보스가 강하고 보상이 좋다.

/** 세션 체력(정수 열)이 넘치지 않게 둔 상한. */
export const UNEXPLORED_BOSS_RISK_MAX = 60;
/** 보상은 이 위험도까지 오르고, 그 위는 기록용이다. */
export const UNEXPLORED_BOSS_RISK_REWARD_CAP = 10;
export const UNEXPLORED_BOSS_RISK_HP_STEP = 0.5;
export const UNEXPLORED_BOSS_RISK_STAT_STEP = 0.08;
export const UNEXPLORED_BOSS_RISK_QUALITY_STEP_PCT = 5;
export const UNEXPLORED_BOSS_RISK_JACKPOT_STEP_PCT = 0.1;
/** 위험도 0에서 가장 드문 고유 장비의 확률(%). */
export const UNEXPLORED_BOSS_JACKPOT_BASE_PCT = 0.5;

function tierOf(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(UNEXPLORED_BOSS_RISK_MAX, number) : 0;
}

export function riskHpMultiplier(tier: number): number {
  return 1 + UNEXPLORED_BOSS_RISK_HP_STEP * tierOf(tier);
}

export function riskStatMultiplier(tier: number): number {
  return 1 + UNEXPLORED_BOSS_RISK_STAT_STEP * tierOf(tier);
}

function rewardTier(tier: number): number {
  return Math.min(UNEXPLORED_BOSS_RISK_REWARD_CAP, tierOf(tier));
}

export function riskBossCoreCount(tier: number): number {
  return 1 + rewardTier(tier);
}

export function riskMinimumQualityPct(tier: number): number {
  return UNEXPLORED_BOSS_RISK_QUALITY_STEP_PCT * rewardTier(tier);
}

export function riskJackpotChancePct(tier: number): number {
  return UNEXPLORED_BOSS_JACKPOT_BASE_PCT + UNEXPLORED_BOSS_RISK_JACKPOT_STEP_PCT * rewardTier(tier);
}

/** 요청의 위험도. 생략하면 0, 0부터 상한까지의 정수가 아니면 null. */
export function parseBossRiskTier(raw: unknown): number | null {
  if (raw === undefined) return 0;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= UNEXPLORED_BOSS_RISK_MAX
    ? raw
    : null;
}

/** 고를 수 있는 가장 높은 위험도. 그 보스를 처치한 적이 없으면 0. */
export function maxSelectableBossRisk(progress: { defeated: boolean; best: number }): number {
  return progress.defeated ? Math.min(UNEXPLORED_BOSS_RISK_MAX, tierOf(progress.best) + 1) : 0;
}

/** 보스별 최고 처치 위험도. 0인 보스는 넣지 않는다. */
export type UnexploredBossRiskRecord = Partial<Record<UnexploredBossId, number>>;

export function parseBossRiskRecord(raw: unknown): UnexploredBossRiskRecord {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const record: UnexploredBossRiskRecord = {};
  for (const bossId of UNEXPLORED_BOSS_IDS) {
    const tier = tierOf(source[bossId]);
    if (tier > 0) record[bossId] = tier;
  }
  return record;
}

export function recordBossRiskClear(
  record: UnexploredBossRiskRecord,
  bossId: UnexploredBossId,
  tier: number,
): UnexploredBossRiskRecord {
  const cleared = tierOf(tier);
  return cleared > (record[bossId] ?? 0) ? { ...record, [bossId]: cleared } : record;
}

export function totalBossRisk(record: UnexploredBossRiskRecord): number {
  return UNEXPLORED_BOSS_IDS.reduce((sum, bossId) => sum + (record[bossId] ?? 0), 0);
}

/** 칭호를 받는 최고 위험도 합계. */
export const UNEXPLORED_BOSS_RISK_TITLE_IDS = {
  30: "unexplored_boss_risk_30",
  60: "unexplored_boss_risk_60",
} as const;

export function unexploredBossRiskTitleIds(total: number): string[] {
  return Object.entries(UNEXPLORED_BOSS_RISK_TITLE_IDS)
    .filter(([required]) => Number(required) <= total)
    .map(([, titleId]) => titleId);
}
