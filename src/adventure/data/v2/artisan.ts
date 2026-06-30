export type ArtisanProfessionId = "blacksmith";

export type ArtisanProfessionState = {
  xp: number;
  crafts: number;
};

export type ArtisanState = Partial<
  Record<ArtisanProfessionId, ArtisanProfessionState>
>;

export const ARTISAN_PROFESSION_NAME: Record<ArtisanProfessionId, string> = {
  blacksmith: "대장장이",
};

// 누적 XP 기준. 저가 제작(10~14xp) 반복만으로 고레벨이 너무 빨리 열리지 않게
// 초반은 완만하게, 제작 전용 레시피 구간부터는 길드 단위 장기 목표가 되도록 올린다.
export const ARTISAN_XP_LEVEL_THRESHOLDS: readonly number[] = [
  0, 250, 650, 1200, 2000, 3100, 4600, 6600, 9200, 12500,
];
export const ARTISAN_XP_AFTER_TABLE_STEP = 5000;

export type ArtisanRewardMilestone = {
  level: number;
  title: string;
  description: string;
};

export const BLACKSMITH_REWARD_MILESTONES: readonly ArtisanRewardMilestone[] = [
  {
    level: 1,
    title: "기본 제작",
    description: "기본 무기와 방어구 제작",
  },
  {
    level: 2,
    title: "보조 장비",
    description: "장갑과 신발 제작 해금",
  },
  {
    level: 3,
    title: "중급 장비",
    description: "중급 무기, 방어구, 반지 제작 해금",
  },
  {
    level: 4,
    title: "정밀 제작",
    description: "중급 보조 장비와 목걸이 제작 해금",
  },
  {
    level: 5,
    title: "상급 장비",
    description: "상급 장비 전반 제작 해금",
  },
  {
    level: 6,
    title: "전용 무기",
    description: "제작 전용 고유 무기 레시피 해금",
  },
  {
    level: 7,
    title: "명장 장신구",
    description: "제작 전용 명장 반지 레시피 해금",
  },
];

export function parseArtisanState(raw: unknown): ArtisanState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ArtisanState = {};
  const blacksmith = (raw as Record<string, unknown>).blacksmith;
  if (
    blacksmith != null &&
    typeof blacksmith === "object" &&
    !Array.isArray(blacksmith)
  ) {
    const xp = Math.max(
      0,
      Math.floor(Number((blacksmith as Record<string, unknown>).xp) || 0),
    );
    const crafts = Math.max(
      0,
      Math.floor(Number((blacksmith as Record<string, unknown>).crafts) || 0),
    );
    out.blacksmith = { xp, crafts };
  }
  return out;
}

export function artisanLevel(state: ArtisanProfessionState | undefined): number {
  const xp = Math.max(0, state?.xp ?? 0);
  let level = 1;
  for (let i = 1; i < ARTISAN_XP_LEVEL_THRESHOLDS.length; i += 1) {
    if (xp < ARTISAN_XP_LEVEL_THRESHOLDS[i]) break;
    level = i + 1;
  }
  const lastThreshold =
    ARTISAN_XP_LEVEL_THRESHOLDS[ARTISAN_XP_LEVEL_THRESHOLDS.length - 1];
  if (xp >= lastThreshold) {
    level =
      ARTISAN_XP_LEVEL_THRESHOLDS.length +
      Math.floor((xp - lastThreshold) / ARTISAN_XP_AFTER_TABLE_STEP);
  }
  return level;
}

export function artisanXpForLevel(levelRaw: number): number {
  const level = Math.max(1, Math.floor(levelRaw));
  const idx = level - 1;
  if (idx < ARTISAN_XP_LEVEL_THRESHOLDS.length) {
    return ARTISAN_XP_LEVEL_THRESHOLDS[idx];
  }
  const lastThreshold =
    ARTISAN_XP_LEVEL_THRESHOLDS[ARTISAN_XP_LEVEL_THRESHOLDS.length - 1];
  return (
    lastThreshold +
    (idx - ARTISAN_XP_LEVEL_THRESHOLDS.length + 1) *
      ARTISAN_XP_AFTER_TABLE_STEP
  );
}

export function artisanXpIntoLevel(
  state: ArtisanProfessionState | undefined,
): number {
  const xp = Math.max(0, state?.xp ?? 0);
  const level = artisanLevel(state);
  return xp - artisanXpForLevel(level);
}

export function artisanXpForNextLevel(
  state: ArtisanProfessionState | undefined,
): number {
  const level = artisanLevel(state);
  return artisanXpForLevel(level + 1) - artisanXpForLevel(level);
}

export function unlockedArtisanMilestones(
  milestones: readonly ArtisanRewardMilestone[],
  level: number,
): ArtisanRewardMilestone[] {
  return milestones.filter((milestone) => milestone.level <= level);
}

export function nextArtisanMilestone(
  milestones: readonly ArtisanRewardMilestone[],
  level: number,
): ArtisanRewardMilestone | null {
  return milestones.find((milestone) => milestone.level > level) ?? null;
}

export function addArtisanXp(
  state: ArtisanState,
  professionId: ArtisanProfessionId,
  xpGain: number,
): ArtisanState {
  const current = state[professionId] ?? { xp: 0, crafts: 0 };
  const safeGain = Math.max(0, Math.floor(xpGain));
  return {
    ...state,
    [professionId]: {
      xp: current.xp + safeGain,
      crafts: current.crafts + 1,
    },
  };
}

export function addArtisanXpOnly(
  state: ArtisanState,
  professionId: ArtisanProfessionId,
  xpGain: number,
): ArtisanState {
  const current = state[professionId] ?? { xp: 0, crafts: 0 };
  const safeGain = Math.max(0, Math.floor(xpGain));
  return {
    ...state,
    [professionId]: {
      xp: current.xp + safeGain,
      crafts: current.crafts,
    },
  };
}
