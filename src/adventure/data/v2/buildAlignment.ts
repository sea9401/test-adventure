import type { V2StatKey } from "./v2StatKeys";

export type BuildFocus = "physical" | "magic";
export type BuildAlignmentIssue = "growth" | "job";

export type BuildAlignmentAdvisory = {
  focus: BuildFocus;
  issues: BuildAlignmentIssue[];
  message: string;
};

export type BuildAlignmentInput = {
  atk: number;
  magicAtk: number;
  grown: Partial<Record<V2StatKey, number>>;
  jobBonus: Partial<Record<V2StatKey, number>>;
};

const ATTACK_FOCUS_RATIO = 1.25;
const MIN_GROWTH_MISMATCH = 20;
const GROWTH_MISMATCH_RATIO = 1.5;
const JOB_MISMATCH_RATIO = 1.25;

function nonNegative(value: number | undefined): number {
  return Math.max(0, Number(value) || 0);
}

function attackFocus(atk: number, magicAtk: number): BuildFocus | null {
  const physical = Math.max(0, atk);
  const magic = Math.max(0, magicAtk);
  if (magic >= physical * ATTACK_FOCUS_RATIO && magic > physical) {
    return "magic";
  }
  if (physical >= magic * ATTACK_FOCUS_RATIO && physical > magic) {
    return "physical";
  }
  return null;
}

function advisoryMessage(
  focus: BuildFocus,
  issues: BuildAlignmentIssue[],
): string {
  const focusLabel = focus === "magic" ? "마법" : "물리";
  const oppositeLabel = focus === "magic" ? "물리" : "마법";
  const recommendation =
    focus === "magic"
      ? "지능·정신 성장과 마법 계열 직업을 확인해 주세요."
      : "힘·민첩 성장과 물리 계열 직업을 확인해 주세요.";
  const mismatch =
    issues.length === 2
      ? "성장 능력치와 현재 직업 보너스가"
      : issues[0] === "growth"
        ? "성장 능력치가"
        : "현재 직업 보너스가";
  return `현재 주 공격은 ${focusLabel} 중심이지만 ${mismatch} ${oppositeLabel} 계열에 치우쳐 있습니다. ${recommendation}`;
}

/** LUK·VIT는 공용 축으로 두고 공격축과 직접 충돌하는 성장·직업 보너스만 안내한다. */
export function deriveBuildAlignmentAdvisory(
  input: BuildAlignmentInput,
): BuildAlignmentAdvisory | null {
  const focus = attackFocus(input.atk, input.magicAtk);
  if (!focus) return null;

  const physicalGrowth =
    nonNegative(input.grown.str) + nonNegative(input.grown.dex);
  const magicGrowth =
    nonNegative(input.grown.int) + nonNegative(input.grown.spi);
  const physicalJob =
    nonNegative(input.jobBonus.str) +
    nonNegative(input.jobBonus.dex);
  const magicJob =
    nonNegative(input.jobBonus.int) + nonNegative(input.jobBonus.spi);
  const issues: BuildAlignmentIssue[] = [];

  const growthMismatch =
    focus === "magic"
      ? physicalGrowth >= MIN_GROWTH_MISMATCH &&
        physicalGrowth >= magicGrowth * GROWTH_MISMATCH_RATIO
      : magicGrowth >= MIN_GROWTH_MISMATCH &&
        magicGrowth >= physicalGrowth * GROWTH_MISMATCH_RATIO;
  if (growthMismatch) issues.push("growth");

  const focusedJob = focus === "magic" ? magicJob : physicalJob;
  const oppositeJob = focus === "magic" ? physicalJob : magicJob;
  if (
    oppositeJob > 0 &&
    oppositeJob >= focusedJob * JOB_MISMATCH_RATIO &&
    oppositeJob > focusedJob
  ) {
    issues.push("job");
  }

  return issues.length > 0
    ? { focus, issues, message: advisoryMessage(focus, issues) }
    : null;
}
