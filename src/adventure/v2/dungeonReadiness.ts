export type DungeonReadinessStatus =
  | "proven"
  | "rebuilding"
  | "challenge";

export type DungeonReadiness = {
  status: DungeonReadinessStatus;
  label: string;
  tone: "positive" | "neutral" | "warning";
};

export type DungeonReadinessInput = {
  depth: number;
  frontierDepth: number;
  jobTier?: number | null;
  level?: number | null;
  levelCap?: number | null;
};

const REJOB_RECOVERY_RATIO = 0.35;

/**
 * 사냥터 안내는 정복 기록과 현재 성장 상태만 사용한다.
 * 정복 기록은 실제 승리 증거이고, 상위 직업 초반은 레벨 초기화 직후라 같은 스탯 합계여도
 * 성능이 크게 낮을 수 있다. 이 값은 안내 전용이며 서버 입장 조건에 사용하지 않는다.
 */
export function dungeonReadiness(input: DungeonReadinessInput): DungeonReadiness {
  const hasJobProgress =
    input.jobTier != null &&
    input.jobTier >= 2 &&
    input.level != null &&
    input.levelCap != null &&
    input.levelCap > 1;
  const recovering =
    hasJobProgress &&
    (input.level! - 1) / (input.levelCap! - 1) < REJOB_RECOVERY_RATIO;

  if (recovering) {
    return {
      status: "rebuilding",
      label: "전직 후 성장 회복 권장",
      tone: "warning",
    };
  }

  if (input.depth <= input.frontierDepth) {
    return {
      status: "proven",
      label: "정복 기록 있음 · 빌드별 차이",
      tone: "neutral",
    };
  }

  return {
    status: "challenge",
    label: "도전 가능 · 빌드별 차이",
    tone: "warning",
  };
}

export function dungeonGrowthLabel(input: {
  jobTier?: number | null;
  level?: number | null;
  levelCap?: number | null;
}): string | null {
  if (input.level == null) return null;
  const job =
    input.jobTier == null
      ? "현재 직업"
      : input.jobTier <= 0
        ? "모험가"
        : `${input.jobTier}티어`;
  const level =
    input.levelCap != null
      ? `Lv.${input.level}/${input.levelCap}`
      : `Lv.${input.level}`;
  return `${job} · ${level}`;
}
