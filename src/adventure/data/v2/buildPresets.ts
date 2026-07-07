import type { V2BuildTagId } from "./buildTags";
import type { V2EquipmentId } from "./v2Equipment";
import type { V2SkillId } from "./v2Skills";

export type V2BuildPresetId =
  | "venomlord_dash"
  | "relic_tank"
  | "arcane_breaker"
  | "duelist_sword"
  | "headwind_archer"
  | "blood_templar";

export type V2BuildPreset = {
  id: V2BuildPresetId;
  name: string;
  summary: string;
  tags: readonly V2BuildTagId[];
  equipmentIds: readonly V2EquipmentId[];
  skillIds: readonly V2SkillId[];
  strengths: readonly string[];
  weaknesses: readonly string[];
};

export type V2BuildGoalsState = {
  activePresetIds: V2BuildPresetId[];
};

export type V2BuildPresetProgressInput = {
  ownedEquipmentIds?: ReadonlySet<string>;
  registeredEquipmentIds?: ReadonlySet<string>;
  learnedSkillIds?: ReadonlySet<string>;
  equippedSkillIds?: ReadonlySet<string>;
};

export type V2BuildPresetProgress = {
  equipmentOwned: number;
  equipmentTotal: number;
  equipmentRegistered: number;
  skillsLearned: number;
  skillsEquipped: number;
  skillsTotal: number;
  score: number;
  maxScore: number;
  pct: number;
  missingEquipmentIds: V2EquipmentId[];
  missingSkillIds: V2SkillId[];
  unequippedLearnedSkillIds: V2SkillId[];
};

export type V2BuildPresetRecommendation = {
  preset: V2BuildPreset;
  progress: V2BuildPresetProgress;
  rank: number;
  reason: string;
};

export const BUILD_GOALS_SAVE_KEY = "build-goals.v2";
export const MAX_ACTIVE_BUILD_GOALS = 3;

export const V2_BUILD_PRESETS: readonly V2BuildPreset[] = [
  {
    id: "venomlord_dash",
    name: "독왕 질주",
    summary: "회피와 속도로 턴을 벌고, 독 스택을 쌓아 긴 전투에서 터뜨리는 빌드.",
    tags: ["luk", "poison", "dot", "evasion", "speed", "signature"],
    equipmentIds: [
      "v2_swamp_sig_venom_gloves",
      "v2_swamp_sig_slip_boots",
      "v2_swamp_sig_fang_dagger",
      "v2_abyssruin_sig_pincer_gloves",
    ],
    skillIds: [
      "v2c_venomist_toxiccloud",
      "v2c_venomancer_miasma",
      "v2c_venomlord_plague",
      "v2c_venomlord_sovereign",
    ],
    strengths: ["장기전 스택 폭발", "회피 기반 생존", "중독 적 방어 약화"],
    weaknesses: ["짧은 전투 효율 낮음", "독 축 카운터에 약함"],
  },
  {
    id: "relic_tank",
    name: "성물 탱커",
    summary: "저체력 피해 감소, 회복 강화, 보호막을 겹쳐 협동 보스와 장기전에 맞춘 빌드.",
    tags: ["vit", "spi", "tank", "heal", "shield", "low_hp", "set"],
    equipmentIds: [
      "v2_sanctum_sig_priest_armor",
      "v2_sanctum_sig_priest_necklace",
      "v2_sanctum_sig_sealed_ring",
      "v2_abyssruin_sig_apostle_staff",
    ],
    skillIds: [
      "v2c_warder_barrier",
      "v2c_templar_aegis",
      "v2c_bishop_heal",
      "v2c_archbishop_sanctuary",
    ],
    strengths: ["피해 흡수와 회복 안정성", "긴 전투 유지력", "마법 방어 보강"],
    weaknesses: ["처치 속도 낮음", "회복 차단에 취약"],
  },
  {
    id: "arcane_breaker",
    name: "비전 파쇄",
    summary: "마법 공격, 치명, MP 환급을 묶어 마법취약/마력 폭발 축을 밀어주는 빌드.",
    tags: ["int", "magic", "crit", "resource", "vulnerability", "signature"],
    equipmentIds: [
      "v2_throne_sig_eclipse_staff",
      "v2_stormpeak_sig_oracle_staff",
      "v2_plateau_sig_cairn_crown",
      "v2_redfield_sig_powder_staff",
    ],
    skillIds: [
      "v2c_archmage_collapse",
      "v2c_archmage_theory",
      "v2c_arcanist_burst",
      "v2c_inscriber_release",
    ],
    strengths: ["마법 버스트", "MP 운용 안정", "취약/지연 연계"],
    weaknesses: ["MP와 치명 조건 의존", "마법 방어 높은 적에게 둔화"],
  },
  {
    id: "duelist_sword",
    name: "결투 검성",
    summary: "대검·추가타·치명 보너스로 단일 적을 안정적으로 밀어붙이는 빌드.",
    tags: ["str", "physical", "crit", "pierce", "signature"],
    equipmentIds: [
      "v2_den_sig_alpha_greatsword",
      "v2_redfield_sig_ash_spear",
      "v2_plateau_sig_skeleton_lance",
      "v2_den_sig_alpha_necklace",
    ],
    skillIds: [
      "v2c_chief_strike",
      "v2c_swordsaint_flash",
      "v2c_swordmaster_focus",
      "v2c_veteran_lethal",
    ],
    strengths: ["1:1 안정딜", "고방어 상대 관통", "추가타로 긴 전투 보정"],
    weaknesses: ["다수전 대응 낮음", "회피형 적에게 명중 보정 필요"],
  },
  {
    id: "headwind_archer",
    name: "역풍 궁수",
    summary: "활, 회피, 속도 버프를 묶어 선제권과 명중 안정성을 확보하는 빌드.",
    tags: ["dex", "physical", "crit", "evasion", "speed", "pierce"],
    equipmentIds: [
      "v2_throne_sig_starfall_bow",
      "v2_stormpeak_sig_raider_bow",
      "v2_abyssruin_sig_pursuer_bow",
      "v2_stormpeak_gale_boots",
    ],
    skillIds: [
      "v2c_ranger_ambush",
      "v2c_ranger_finesse3",
      "v2c_chief_strike",
      "v2c_chief_afterimage",
    ],
    strengths: ["선제권과 회피", "치명 기반 속도 상승", "명중 보조"],
    weaknesses: ["튼튼한 적에게 장기화", "폭딜 실패 시 효율 하락"],
  },
  {
    id: "blood_templar",
    name: "혈성기사",
    summary: "HP를 비용으로 쓰고 저체력 피해 감소와 회복 강화로 위기 폭발력을 얻는 빌드.",
    tags: ["str", "vit", "physical", "heal", "low_hp", "tank"],
    equipmentIds: [
      "v2_redfield_sig_ember_ring",
      "v2_abyssruin_sig_sunken_robe",
      "v2_throne_sig_black_plate",
      "v2_throne_sig_void_crown",
    ],
    skillIds: [
      "v2c_bloodtemplar_stigma",
      "v2c_bloodtemplar_martyr",
      "v2c_crimsontemplar_judgment",
      "v2c_crimsontemplar_oath",
    ],
    strengths: ["위기 상황 폭발력", "저체력 피해 감소", "자가 회복"],
    weaknesses: ["회복 차단에 취약", "HP 비용 관리 필요"],
  },
];

export const V2_BUILD_PRESET_IDS = V2_BUILD_PRESETS.map((preset) => preset.id);

const V2_BUILD_PRESET_ID_SET = new Set<string>(V2_BUILD_PRESET_IDS);

export function isV2BuildPresetId(value: unknown): value is V2BuildPresetId {
  return typeof value === "string" && V2_BUILD_PRESET_ID_SET.has(value);
}

export function emptyBuildGoalsState(): V2BuildGoalsState {
  return { activePresetIds: [] };
}

export function parseBuildGoalsState(raw: unknown): V2BuildGoalsState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyBuildGoalsState();
  }
  const ids = Array.isArray((raw as { activePresetIds?: unknown }).activePresetIds)
    ? (raw as { activePresetIds: unknown[] }).activePresetIds
    : [];
  return {
    activePresetIds: ids
      .filter(isV2BuildPresetId)
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, MAX_ACTIVE_BUILD_GOALS),
  };
}

export function setBuildGoalActive(
  state: V2BuildGoalsState,
  presetId: V2BuildPresetId,
  active: boolean,
): V2BuildGoalsState {
  const current = state.activePresetIds.filter((id) => id !== presetId);
  if (!active) return { activePresetIds: current };
  return {
    activePresetIds: [presetId, ...current].slice(0, MAX_ACTIVE_BUILD_GOALS),
  };
}

export function buildPresetProgress(
  preset: V2BuildPreset,
  input: V2BuildPresetProgressInput,
): V2BuildPresetProgress {
  const ownedEquipmentIds = input.ownedEquipmentIds ?? new Set<string>();
  const registeredEquipmentIds =
    input.registeredEquipmentIds ?? new Set<string>();
  const learnedSkillIds = input.learnedSkillIds ?? new Set<string>();
  const equippedSkillIds = input.equippedSkillIds ?? new Set<string>();
  const equipmentOwned = preset.equipmentIds.filter((id) =>
    ownedEquipmentIds.has(id),
  ).length;
  const equipmentRegistered = preset.equipmentIds.filter((id) =>
    registeredEquipmentIds.has(id),
  ).length;
  const skillsLearned = preset.skillIds.filter((id) =>
    learnedSkillIds.has(id),
  ).length;
  const skillsEquipped = preset.skillIds.filter((id) =>
    equippedSkillIds.has(id),
  ).length;
  const maxScore = preset.equipmentIds.length * 2 + preset.skillIds.length * 2;
  const score =
    equipmentOwned + equipmentRegistered + skillsLearned + skillsEquipped;
  return {
    equipmentOwned,
    equipmentTotal: preset.equipmentIds.length,
    equipmentRegistered,
    skillsLearned,
    skillsEquipped,
    skillsTotal: preset.skillIds.length,
    score,
    maxScore,
    pct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    missingEquipmentIds: preset.equipmentIds.filter(
      (id) => !ownedEquipmentIds.has(id),
    ),
    missingSkillIds: preset.skillIds.filter((id) => !learnedSkillIds.has(id)),
    unequippedLearnedSkillIds: preset.skillIds.filter(
      (id) => learnedSkillIds.has(id) && !equippedSkillIds.has(id),
    ),
  };
}

export function buildPresetRecommendationReason(
  progress: V2BuildPresetProgress,
): string {
  if (progress.score >= progress.maxScore) return "완성 상태";
  if (
    progress.skillsLearned >= progress.skillsTotal &&
    progress.unequippedLearnedSkillIds.length > 0
  ) {
    return "스킬 장착만 보강";
  }
  if (
    progress.equipmentOwned >= progress.equipmentTotal &&
    progress.equipmentRegistered < progress.equipmentTotal
  ) {
    return "도감 등록 보강";
  }
  if (progress.skillsLearned >= progress.skillsTotal) return "스킬 학습 완료";
  if (progress.equipmentOwned >= progress.equipmentTotal) return "장비 보유 완료";
  if (progress.equipmentOwned > progress.skillsLearned) return "장비 기반 우세";
  if (progress.skillsLearned > progress.equipmentOwned) return "스킬 기반 우세";
  return "균형 진행";
}

export function recommendBuildPresets(
  presets: readonly V2BuildPreset[],
  input: V2BuildPresetProgressInput,
): V2BuildPresetRecommendation[] {
  return presets
    .map((preset, index) => {
      const progress = buildPresetProgress(preset, input);
      return { preset, progress, index };
    })
    .sort((a, b) => {
      if (a.progress.score !== b.progress.score) {
        return b.progress.score - a.progress.score;
      }
      if (a.progress.pct !== b.progress.pct) return b.progress.pct - a.progress.pct;
      if (a.progress.skillsEquipped !== b.progress.skillsEquipped) {
        return b.progress.skillsEquipped - a.progress.skillsEquipped;
      }
      if (a.progress.equipmentOwned !== b.progress.equipmentOwned) {
        return b.progress.equipmentOwned - a.progress.equipmentOwned;
      }
      return a.index - b.index;
    })
    .map(({ preset, progress }, index) => ({
      preset,
      progress,
      rank: index + 1,
      reason: buildPresetRecommendationReason(progress),
    }));
}
