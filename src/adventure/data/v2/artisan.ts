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
  0,
  250,
  650,
  1200,
  2000,
  3100,
  4600,
  6600,
  9200,
  12500,
  17500,
  22500,
  27500,
  32500,
  37500,
  42500,
  47500,
  52500,
  60000,
  70000,
  82500,
  97500,
  115000,
  135000,
  157500,
  182500,
  210000,
  240000,
  272500,
  307500,
];
export const ARTISAN_HONOR_FIRST_STEP = 37500;
export const ARTISAN_HONOR_STEP_GROWTH = 2500;

export type ArtisanRewardMilestone = {
  level: number;
  title: string;
  description: string;
};

export type ArtisanJobId =
  | "apprentice_blacksmith"
  | "blacksmith"
  | "master_blacksmith";

export type ArtisanJobTier = 1 | 2 | 3;
export type ArtisanJobCategory = "lifestyle";
export type ArtisanEffectScope = "crafting";

export type ArtisanJobDefinition = {
  id: ArtisanJobId;
  profession: ArtisanProfessionId;
  category: ArtisanJobCategory;
  effectScope: ArtisanEffectScope;
  tier: ArtisanJobTier;
  name: string;
  requiredLevel: number;
  role: string;
  unlockText: string;
};

export type ArtisanSkillId =
  | "blacksmith_maker_mark"
  | "blacksmith_basic_forging"
  | "blacksmith_material_sense"
  | "blacksmith_precision_forging"
  | "blacksmith_dismantle"
  | "blacksmith_signature_craft"
  | "blacksmith_masterwork"
  | "blacksmith_high_quality"
  | "blacksmith_master_mark"
  | "blacksmith_specialty"
  | "blacksmith_option_focus"
  | "blacksmith_catalyst"
  | "blacksmith_structure"
  | "blacksmith_stable_structure"
  | "blacksmith_catalyst_preserve"
  | "blacksmith_masterwork_technique"
  | "blacksmith_signature"
  | "blacksmith_final_inspection";

export type ArtisanSkillKind = "passive" | "craftMode" | "craftAction";

export type ArtisanSkillDefinition = {
  id: ArtisanSkillId;
  jobId: ArtisanJobId;
  effectScope: ArtisanEffectScope;
  level: number;
  kind: ArtisanSkillKind;
  name: string;
  description: string;
  implemented: boolean;
};

export const BLACKSMITH_MASTERWORK_LEVEL = 8;
export const BLACKSMITH_PLUS2_QUALITY_LEVEL = 9;
export const BLACKSMITH_MATERIAL_SENSE_LEVEL = 4;
export const BLACKSMITH_DISMANTLE_LEVEL = 6;
export const BLACKSMITH_MASTER_MARK_LEVEL = 10;

export const BLACKSMITH_ARTISAN_JOBS: readonly ArtisanJobDefinition[] = [
  {
    id: "apprentice_blacksmith",
    profession: "blacksmith",
    category: "lifestyle",
    effectScope: "crafting",
    tier: 1,
    name: "견습 대장장이",
    requiredLevel: 1,
    role: "제작자 각인과 기본 품질 제작",
    unlockText: "길드 제작소에서 첫 제작 시작",
  },
  {
    id: "blacksmith",
    profession: "blacksmith",
    category: "lifestyle",
    effectScope: "crafting",
    tier: 2,
    name: "대장장이",
    requiredLevel: 5,
    role: "상급 제작, 제작 전용 장비, 재료 효율",
    unlockText: "대장장이 Lv 5",
  },
  {
    id: "master_blacksmith",
    profession: "blacksmith",
    category: "lifestyle",
    effectScope: "crafting",
    tier: 3,
    name: "명장 대장장이",
    requiredLevel: BLACKSMITH_MASTERWORK_LEVEL,
    role: "명장 제작, ★ 확정, 명장 납품 가치",
    unlockText: `대장장이 Lv ${BLACKSMITH_MASTERWORK_LEVEL}`,
  },
];

export const BLACKSMITH_ARTISAN_SKILLS: readonly ArtisanSkillDefinition[] = [
  {
    id: "blacksmith_maker_mark",
    jobId: "apprentice_blacksmith",
    effectScope: "crafting",
    level: 1,
    kind: "passive",
    name: "제작자 각인",
    description: "제작 장비에 제작자 이름, 레벨, 제작 시각을 남김",
    implemented: true,
  },
  {
    id: "blacksmith_basic_forging",
    jobId: "apprentice_blacksmith",
    effectScope: "crafting",
    level: 2,
    kind: "passive",
    name: "기초 단조",
    description: "대장장이 레벨에 따라 제작 품질 확률 증가",
    implemented: true,
  },
  {
    id: "blacksmith_material_sense",
    jobId: "apprentice_blacksmith",
    effectScope: "crafting",
    level: BLACKSMITH_MATERIAL_SENSE_LEVEL,
    kind: "passive",
    name: "재료 감각",
    description: "해체 시 장비 티어와 품질에 맞는 제작 재료 회수량 판정",
    implemented: true,
  },
  {
    id: "blacksmith_precision_forging",
    jobId: "blacksmith",
    effectScope: "crafting",
    level: 5,
    kind: "craftMode",
    name: "정밀 단조",
    description: "고비용 제작 모드와 품질 확률 확장의 기반",
    implemented: true,
  },
  {
    id: "blacksmith_dismantle",
    jobId: "blacksmith",
    effectScope: "crafting",
    level: BLACKSMITH_DISMANTLE_LEVEL,
    kind: "craftAction",
    name: "해체술",
    description: "장비 분해로 제작 재료 일부 회수",
    implemented: true,
  },
  {
    id: "blacksmith_signature_craft",
    jobId: "blacksmith",
    effectScope: "crafting",
    level: 7,
    kind: "passive",
    name: "전용 장비 숙련",
    description: "제작 전용 장비 레시피와 품질 제작 가치 강화",
    implemented: true,
  },
  {
    id: "blacksmith_masterwork",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: BLACKSMITH_MASTERWORK_LEVEL,
    kind: "craftMode",
    name: "명장 제작",
    description: "비용을 더 들여 ★ 이상 품질과 명장 제작품 표식 획득",
    implemented: true,
  },
  {
    id: "blacksmith_high_quality",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: BLACKSMITH_PLUS2_QUALITY_LEVEL,
    kind: "passive",
    name: "고품질 단조",
    description: "명장 제작 시 확률로 ★★ 품질 제작품 생산",
    implemented: true,
  },
  {
    id: "blacksmith_master_mark",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: BLACKSMITH_MASTER_MARK_LEVEL,
    kind: "passive",
    name: "명장의 각인",
    description: "Lv 10 이상에 만든 명장 제작품의 납품 보너스 추가 강화",
    implemented: true,
  },
  {
    id: "blacksmith_specialty",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 13,
    kind: "passive",
    name: "전문 분야",
    description: "무기·방어구·장신구 중 영구 전문 분야 하나 선택",
    implemented: true,
  },
  {
    id: "blacksmith_option_focus",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 15,
    kind: "craftMode",
    name: "옵션 성향",
    description: "전문 분야 장비의 원하는 옵션군이 우선될 확률 부여",
    implemented: true,
  },
  {
    id: "blacksmith_catalyst",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 17,
    kind: "craftMode",
    name: "집중 촉매",
    description: "추가 재료로 옵션 성향 적용 확률을 90%까지 강화",
    implemented: true,
  },
  {
    id: "blacksmith_structure",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 20,
    kind: "craftMode",
    name: "구조 제작술",
    description: "같은 총 옵션량 안에서 주력·옵션·극한 배분 선택",
    implemented: true,
  },
  {
    id: "blacksmith_stable_structure",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 22,
    kind: "craftMode",
    name: "안정 제작",
    description: "옵션 편차를 중앙으로 모으는 안정 구조 해금",
    implemented: true,
  },
  {
    id: "blacksmith_catalyst_preserve",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 24,
    kind: "passive",
    name: "촉매 회수",
    description: "전문 제작에 사용한 촉매를 20% 확률로 보존",
    implemented: true,
  },
  {
    id: "blacksmith_masterwork_technique",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 26,
    kind: "craftMode",
    name: "명장 전문 제작",
    description: "옵션 성향과 구조 제작술을 명장 제작에도 적용",
    implemented: true,
  },
  {
    id: "blacksmith_signature",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 28,
    kind: "passive",
    name: "전문 각인과 대표작",
    description: "전문 제작품에 분야 각인을 남기고 대표작 지정",
    implemented: true,
  },
  {
    id: "blacksmith_final_inspection",
    jobId: "master_blacksmith",
    effectScope: "crafting",
    level: 30,
    kind: "craftAction",
    name: "최종 검수",
    description: "명장 전문 제작 시 총량이 같은 두 결과 중 하나 확정",
    implemented: true,
  },
];

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
  {
    level: 8,
    title: "명장 제작",
    description: "★ 이상 품질 확정 및 명장 제작품 표식",
  },
  {
    level: 9,
    title: "고품질 단조",
    description: "+2 품질 제작품 확률 개방",
  },
  {
    level: 10,
    title: "왕도 명장",
    description: "Lv 10 이상 명장 제작품의 납품 보너스 추가 강화",
  },
  {
    level: 13,
    title: "영구 전문 분야",
    description: "무기·방어구·장신구 중 하나를 영구 선택",
  },
  {
    level: 15,
    title: "옵션 성향",
    description: "전문 분야 장비의 옵션군 우선 제작",
  },
  {
    level: 17,
    title: "집중 촉매",
    description: "촉매를 소모해 성향 적용 확률 강화",
  },
  {
    level: 20,
    title: "구조 제작술",
    description: "총량을 유지하며 장비 옵션 배분 조절",
  },
  {
    level: 22,
    title: "안정 제작",
    description: "옵션 편차를 줄이는 안정 구조 해금",
  },
  {
    level: 24,
    title: "촉매 회수",
    description: "사용한 촉매를 20% 확률로 보존",
  },
  {
    level: 26,
    title: "명장 전문 제작",
    description: "전문 제작 기술을 명장 제작에 적용",
  },
  {
    level: 28,
    title: "전문 각인",
    description: "전문 제작품 각인과 대표작 지정",
  },
  {
    level: 30,
    title: "최종 검수",
    description: "같은 총량의 두 명장 결과 중 하나 선택",
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
    level = ARTISAN_XP_LEVEL_THRESHOLDS.length;
    let threshold = lastThreshold;
    let step = ARTISAN_HONOR_FIRST_STEP;
    while (xp >= threshold + step) {
      threshold += step;
      step += ARTISAN_HONOR_STEP_GROWTH;
      level += 1;
    }
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
  let threshold = lastThreshold;
  let step = ARTISAN_HONOR_FIRST_STEP;
  for (
    let honorLevel = ARTISAN_XP_LEVEL_THRESHOLDS.length + 1;
    honorLevel <= level;
    honorLevel += 1
  ) {
    threshold += step;
    step += ARTISAN_HONOR_STEP_GROWTH;
  }
  return threshold;
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

export function blacksmithJobForLevel(levelRaw: number): ArtisanJobDefinition {
  const level = Math.max(1, Math.floor(levelRaw));
  let current = BLACKSMITH_ARTISAN_JOBS[0];
  for (const job of BLACKSMITH_ARTISAN_JOBS) {
    if (level >= job.requiredLevel) current = job;
  }
  return current;
}

export function unlockedBlacksmithJobs(
  levelRaw: number,
): ArtisanJobDefinition[] {
  const level = Math.max(1, Math.floor(levelRaw));
  return BLACKSMITH_ARTISAN_JOBS.filter((job) => level >= job.requiredLevel);
}

export function unlockedBlacksmithSkills(
  levelRaw: number,
): ArtisanSkillDefinition[] {
  const level = Math.max(1, Math.floor(levelRaw));
  return BLACKSMITH_ARTISAN_SKILLS.filter((skill) => level >= skill.level);
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
