// 미개척지 탐사 등급. 탐사 포인트 30개를 채운 뒤에도 쌓이는 탐사 경험치를 상한 없는 등급으로 센다.
// 다른 미개척지 모듈이 모두 이 파일을 쓰므로 여기서는 아무것도 가져오지 않는다.

/** 경험치로 얻는 탐사 포인트 상한. 이 값을 채운 뒤부터 탐사 등급이 오른다. */
export const EXPLORATION_MAX_XP_POINTS = 30;
/** 탐사 등급 하나에 필요한 탐사 경험치(Lv.100 사냥 승리 수). */
export const EXPLORATION_GRADE_XP = 15_000;

type ExplorationProgress = { xpPoints: number; explorationXp: number };

function wholeNumber(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function explorationGrade(save: ExplorationProgress): number {
  if (wholeNumber(save.xpPoints) < EXPLORATION_MAX_XP_POINTS) return 0;
  return Math.floor(wholeNumber(save.explorationXp) / EXPLORATION_GRADE_XP);
}

export function explorationGradeProgress(save: ExplorationProgress): {
  grade: number;
  gradeXp: number;
  gradeXpCost: number;
} {
  const capped = wholeNumber(save.xpPoints) >= EXPLORATION_MAX_XP_POINTS;
  return {
    grade: explorationGrade(save),
    gradeXp: capped ? wholeNumber(save.explorationXp) % EXPLORATION_GRADE_XP : 0,
    gradeXpCost: EXPLORATION_GRADE_XP,
  };
}

// k번째 추가 탐사 포인트는 5 × k(k+1)/2 등급에 받는다(5, 15, 30, 50, 75 …). 간격이 5씩 벌어진다.
const BONUS_POINT_STEP = 5;

function bonusPointGrade(index: number): number {
  return (BONUS_POINT_STEP * index * (index + 1)) / 2;
}

/** 지금 등급까지 받은 추가 탐사 포인트 수. */
export function explorationGradeBonusPoints(grade: number): number {
  const normalized = wholeNumber(grade);
  let points = 0;
  while (bonusPointGrade(points + 1) <= normalized) points += 1;
  return points;
}

/** 다음 추가 탐사 포인트를 받는 등급. */
export function nextExplorationGradePointGrade(grade: number): number {
  return bonusPointGrade(explorationGradeBonusPoints(grade) + 1);
}

/** 프리셋 칸마다 필요한 탐사 등급. 앞의 세 칸은 처음부터 열려 있다. */
export const UNEXPLORED_PRESET_UNLOCK_GRADES = [0, 0, 0, 10, 40] as const;

export function unexploredPresetSlotCount(grade: number): number {
  const normalized = wholeNumber(grade);
  return UNEXPLORED_PRESET_UNLOCK_GRADES.filter((required) => required <= normalized).length;
}

/** 흔적 보관 상한 단계. 뒤로 갈수록 높은 등급이 필요하다. */
export const UNEXPLORED_TRACE_CAP_TIERS = [
  { grade: 0, cap: 2_500 },
  { grade: 20, cap: 3_500 },
  { grade: 60, cap: 5_000 },
] as const;
export const UNEXPLORED_TRACE_CAP_MAX =
  UNEXPLORED_TRACE_CAP_TIERS[UNEXPLORED_TRACE_CAP_TIERS.length - 1].cap;

export function unexploredTraceCap(grade: number): number {
  const normalized = wholeNumber(grade);
  let cap: number = UNEXPLORED_TRACE_CAP_TIERS[0].cap;
  for (const tier of UNEXPLORED_TRACE_CAP_TIERS) {
    if (tier.grade <= normalized) cap = tier.cap;
  }
  return cap;
}

/** 등급 칭호. 키는 필요한 탐사 등급. */
export const EXPLORATION_GRADE_TITLE_IDS = {
  10: "exploration_grade_10",
  50: "exploration_grade_50",
  100: "exploration_grade_100",
} as const;

/** 지금 등급으로 받을 수 있는 칭호 id(낮은 등급부터). */
export function explorationGradeTitleIds(grade: number): string[] {
  const normalized = wholeNumber(grade);
  return Object.entries(EXPLORATION_GRADE_TITLE_IDS)
    .filter(([required]) => Number(required) <= normalized)
    .map(([, titleId]) => titleId);
}
