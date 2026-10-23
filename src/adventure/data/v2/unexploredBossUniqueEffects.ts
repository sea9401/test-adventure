import type { V2EquipmentId } from "./v2Equipment";

// 미개척지 개인 보스 고유 장비의 단품 효과. 모든 효과는 장비 하나로 발동하며,
// 같은 보스 장비끼리는 같은 자원(궤도·혹한·조준 등)을 공유해 함께 끼면 더 빨리 터진다.
export type UnexploredBossEffectKind =
  | "tracking_edge"
  | "phantom_haste"
  | "infinite_orbit"
  | "toxic_claw"
  | "coagulated_venom"
  | "uncorrupted_heart"
  | "glacial_crush"
  | "frozen_bulwark"
  | "absolute_zero"
  | "magisteel_guard"
  | "sealing_barrier"
  | "invincible_bulwark"
  | "prismatic_correction"
  | "starpath_aim"
  | "infinite_focus"
  | "immortal_frenzy"
  | "pulsing_regen"
  | "eternal_life";

export type UnexploredBossUniqueEffect = {
  kind: UnexploredBossEffectKind;
  label: string;
  description: string;
};

export const UNEXPLORED_BOSS_UNIQUE_EFFECTS: Record<string, UnexploredBossUniqueEffect> = {
  v2_unexplored_tracking_blade_dagger: {
    kind: "tracking_edge",
    label: "궤도 계산",
    description: "직접 공격 적중 시 궤도 1중첩(최대 5). 중첩당 직접 공격 피해 +3%. 직접 공격이 완전 회피되면 초기화.",
  },
  v2_unexplored_phantom_acceleration_boots: {
    kind: "phantom_haste",
    label: "잔상 가속",
    description: "적 공격을 회피하면 회피로 줄인 피해 비율만큼 다음 행동이 앞당겨진다(완전 회피 시 행동 간격의 15%, 적 행동당 1회).",
  },
  v2_unexplored_infinite_orbit_heart: {
    kind: "infinite_orbit",
    label: "궤도 절단",
    description: "직접 공격 적중 시 추적 1중첩. 10중첩이면 다음 직접 공격 1회가 대상 방어·마법방어 50%를 무시하고 피해 +80%.",
  },
  v2_unexplored_toxic_blood_claw: {
    kind: "toxic_claw",
    label: "독혈 침투",
    description: "대상 중독이 5스택 이상이면 직접 공격 피해 +8%.",
  },
  v2_unexplored_coagulated_venom_ring: {
    kind: "coagulated_venom",
    label: "응고독 반격",
    description: "피해를 받을 때마다(적 행동당 1회) 응고 1중첩. 3중첩이면 공격자에게 중독 2스택을 걸고 초기화.",
  },
  v2_unexplored_uncorrupted_heart: {
    kind: "uncorrupted_heart",
    label: "독혈 역류",
    description: "피해를 받을 때마다(적 행동당 1회) 독혈 1중첩. 10중첩이면 자신의 지속 피해를 정화하고 최대 HP 12% 회복, 공격자에게 자신 최대 HP 8% 고정 피해와 중독 3스택.",
  },
  v2_unexplored_glacial_crushing_hammer: {
    kind: "glacial_crush",
    label: "빙하 중압",
    description: "직접 공격 적중 시 대상 혹한 +1(최대 10). 혹한 1중첩당 대상 행동 속도 −1.5%.",
  },
  v2_unexplored_frozen_great_armor: {
    kind: "frozen_bulwark",
    label: "영구빙 갑주",
    description: "피해를 받으면(적 행동당 1회) 공격자 혹한 +1(최대 10). 혹한 1중첩당 대상 행동 속도 −1.5%.",
  },
  v2_unexplored_absolute_zero_core: {
    kind: "absolute_zero",
    label: "절대영도",
    description: "직접 공격 적중 시 대상 혹한 +2. 혹한 10이면 모두 소비해 빙결: 대상의 다음 행동 1회 취소, 다음 직접 공격 피해 +30%. 혹한 1중첩당 대상 행동 속도 −1.5%.",
  },
  v2_unexplored_magisteel_guard_gauntlets: {
    kind: "magisteel_guard",
    label: "장갑판",
    description: "전투 시작 시 최대 HP 5% 보호막. 보호막이 남아 있으면 받는 피해 −8%.",
  },
  v2_unexplored_sealing_barrier_ring: {
    kind: "sealing_barrier",
    label: "봉인 결계",
    description: "적 행동이 끝났을 때 자신에게 지속 피해가 걸려 있으면 최대 HP 4% 보호막(전투당 3회).",
  },
  v2_unexplored_invincible_fortress_armor: {
    kind: "invincible_bulwark",
    label: "불괴 방벽",
    description: "전투 시작 시 최대 HP 15% 방벽. 방벽이 남아 있는 동안 받는 피해 −15%. 방벽이 깨지면 방벽 크기의 40%를 공격자에게 고정 피해로 돌려주고, 자신의 행동 6회 뒤 다시 세운다.",
  },
  v2_unexplored_prismatic_firing_gauntlets: {
    kind: "prismatic_correction",
    label: "보정 사격",
    description: "직접 공격 적중 3회마다 다음 직접 공격 피해 +25%.",
  },
  v2_unexplored_starpath_aiming_ring: {
    kind: "starpath_aim",
    label: "별궤 조준",
    description: "치명타가 아닌 직접 공격 적중마다 치명타 확률 +4%p(최대 +20%p). 치명타가 나면 초기화.",
  },
  v2_unexplored_infinite_focus_crystal_eye: {
    kind: "infinite_focus",
    label: "천공 포격",
    description: "직접 공격 적중 시 조준 +1, 치명타면 +2. 20 이상이면 소비해 물리·마법 공격력 중 높은 값의 150% 고정 피해, 대상 방어·마법방어 −20%(3행동).",
  },
  v2_unexplored_immortal_king_greatsword: {
    kind: "immortal_frenzy",
    label: "광란 맥동",
    description: "잃은 HP 10%당 직접 공격 피해 +2%(최대 +14%).",
  },
  v2_unexplored_pulsing_berserker_gauntlets: {
    kind: "pulsing_regen",
    label: "재생 고동",
    description: "자신의 행동마다 잃은 HP의 2% 회복.",
  },
  v2_unexplored_eternal_life_core: {
    kind: "eternal_life",
    label: "영겁",
    description: "쓰러질 피해를 받으면 쓰러지지 않고 최대 HP 35%(두 번째는 20%)로 버틴다. 이후 전투 끝까지 직접 공격 피해 +20%, 속도 +15%. 사냥·보스 2회, 투기장 1회.",
  },
};

export function unexploredBossUniqueEffectOf(
  id: string | undefined,
): UnexploredBossUniqueEffect | undefined {
  return id ? UNEXPLORED_BOSS_UNIQUE_EFFECTS[id] : undefined;
}

export function collectUnexploredBossUniqueEffects(
  equipped: Partial<Record<string, V2EquipmentId>>,
): UnexploredBossEffectKind[] {
  const kinds: UnexploredBossEffectKind[] = [];
  for (const id of Object.values(equipped)) {
    const kind = unexploredBossUniqueEffectOf(id)?.kind;
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}
