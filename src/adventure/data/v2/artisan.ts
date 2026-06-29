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

export const ARTISAN_XP_PER_LEVEL = 100;

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
  return Math.floor(xp / ARTISAN_XP_PER_LEVEL) + 1;
}

export function artisanXpIntoLevel(
  state: ArtisanProfessionState | undefined,
): number {
  const xp = Math.max(0, state?.xp ?? 0);
  return xp % ARTISAN_XP_PER_LEVEL;
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
