// 던전 심층 단계(폭풍 원정·태초의 성소). 완주할수록 열리는 상한 없는 난이도 단계다.
// 두 던전 라우트와 화면이 함께 쓰므로 여기서는 아무것도 가져오지 않는다.

export type DeepDungeonId = "storm" | "sanctuary";

/** 단계마다 오르는 적 깊이 가산치. */
export const DEEP_STAGE_DEPTH_STEP = 8;
/** 실전 완주 증표 = 기본 + 단계당. */
export const DEEP_TOKEN_BASE = 10;
export const DEEP_TOKEN_PER_STAGE = 2;

function wholeNumber(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function deepStageDepthBonus(stage: number): number {
  return wholeNumber(stage) * DEEP_STAGE_DEPTH_STEP;
}

export function deepStageTokenReward(stage: number): number {
  const normalized = wholeNumber(stage);
  return normalized > 0 ? DEEP_TOKEN_BASE + DEEP_TOKEN_PER_STAGE * normalized : 0;
}

export type DeepProgress = { deepBest: number; deepBestAt: number };

export function parseDeepProgress(raw: unknown): DeepProgress {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { deepBest: wholeNumber(source.deepBest), deepBestAt: wholeNumber(source.deepBestAt) };
}

/** 고를 수 있는 가장 높은 단계. 그 던전을 완주한 적이 없으면 0(심층 잠김). */
export function maxSelectableDeepStage(progress: { clears: number; deepBest: number }): number {
  return wholeNumber(progress.clears) >= 1 ? wholeNumber(progress.deepBest) + 1 : 0;
}

/** 요청의 단계 값. 생략하면 0(심층 아님), 0 이상의 정수가 아니면 null. */
export function parseDeepStageRequest(raw: unknown): number | null {
  if (raw === undefined) return 0;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

export function deepStageRequestError(
  stage: number,
  progress: { clears: number; deepBest: number },
): "deep_stage_locked" | null {
  return stage > maxSelectableDeepStage(progress) ? "deep_stage_locked" : null;
}

/** 실전 완주를 기록한다. 더 높은 단계일 때만 최고 단계와 도달 시각이 바뀐다. */
export function recordDeepStageClear(
  progress: DeepProgress,
  stage: number,
  now: number,
): DeepProgress {
  const normalized = wholeNumber(stage);
  return normalized > progress.deepBest
    ? { deepBest: normalized, deepBestAt: now }
    : progress;
}

/** 칭호를 받는 최고 완주 단계. */
export const DEEP_STAGE_TITLE_STAGES = [10, 20, 30] as const;
export const DEEP_STAGE_TITLE_IDS = {
  storm: { 10: "storm_deep_10", 20: "storm_deep_20", 30: "storm_deep_30" },
  sanctuary: { 10: "sanctuary_deep_10", 20: "sanctuary_deep_20", 30: "sanctuary_deep_30" },
} as const satisfies Record<DeepDungeonId, Record<(typeof DEEP_STAGE_TITLE_STAGES)[number], string>>;

/** 지금 최고 단계로 받을 수 있는 칭호 id(낮은 단계부터). */
export function deepStageTitleIds(dungeon: DeepDungeonId, best: number): string[] {
  const normalized = wholeNumber(best);
  return DEEP_STAGE_TITLE_STAGES.filter((stage) => stage <= normalized).map(
    (stage) => DEEP_STAGE_TITLE_IDS[dungeon][stage],
  );
}
