import type { Monster } from "./types";

export const COAST_MONSTERS: Record<string, Monster> = {
  // ── 해안 지선 (조수 갯벌 / 산호초 섬) ───────────────────────────────────
  // 폐허(Lv9)~산기슭(Lv18) 사이에 놓이는 바닷길 잡몹. 갯벌 ≈ 폐허 난이도, 섬 ≈ 산기슭 난이도.
  "집게발 게": {
    name: "집게발 게",
    image: "/images/monster/crab.webp",
    tags: ["beast"],
    hp: 150,
    atk: 11,
    def: 8,
    spd: 3,
    exp: 11,
    skill: { kind: "pierce", name: "집게발 비집기", armorPierce: 2 },
    drops: [
      { kind: "material", materialId: "crab_shell", chance: 0.09 },
      // 초반 발판 — 게딱지 손방패 제작서.
      { kind: "recipe", recipeId: "crab_shell_buckler", chance: 0.04 },
    ],
  },
  갯도요: {
    name: "갯도요",
    image: "/images/monster/curlewsandpiper.webp",
    tags: ["beast"],
    hp: 95,
    atk: 12,
    def: 3,
    spd: 9,
    evasionPct: 20,
    exp: 11,
    drops: [
      { kind: "material", materialId: "crab_shell", chance: 0.03 },
      { kind: "recipe", recipeId: "tideflats_waders", chance: 0.04 },
    ],
  },
  "진흙 미꾸라지": {
    name: "진흙 미꾸라지",
    image: "/images/monster/mudloach.webp",
    tags: ["beast"],
    hp: 120,
    atk: 10,
    def: 4,
    spd: 6,
    exp: 10,
    drops: [
      { kind: "material", materialId: "crab_shell", chance: 0.045 },
      // 유실된 명품 — 진창 속에서 끌고 다니던 낡은 인장반지.
      { kind: "equip", itemId: "drowned_signet", chance: 0.0002 },
    ],
  },
  "산호초 사이렌": {
    name: "산호초 사이렌",
    image: "/images/monster/coralmermaid.webp",
    tags: ["spirit"],
    hp: 175,
    atk: 21,
    def: 6,
    spd: 7,
    evasionPct: 20,
    exp: 20,
    drops: [
      { kind: "material", materialId: "deep_scale", chance: 0.06 },
      { kind: "recipe", recipeId: "siren_scale_robe", chance: 0.04 },
      // 사이렌 비늘 로브 → 사이렌 노래 망토 업그레이드 세공서.
      { kind: "recipe", recipeId: "siren_song_mantle", chance: 0.015 },
    ],
  },
  "갑각 약탈자": {
    name: "갑각 약탈자",
    image: "/images/monster/shellbandit.webp",
    tags: ["humanoid"],
    hp: 210,
    atk: 19,
    def: 9,
    spd: 6,
    exp: 21,
    skill: { kind: "heavy_blow", name: "작살 던지기", everyPhases: 3, multiplier: 1.8 },
    drops: [
      { kind: "material", materialId: "crab_shell", chance: 0.075 },
      { kind: "material", materialId: "coral_spine", chance: 0.03 },
      { kind: "recipe", recipeId: "coral_spine_dagger", chance: 0.04 },
      // 게딱지 손방패 → 갑각 보루방패 업그레이드 제작서.
      { kind: "recipe", recipeId: "crustacean_bulwark", chance: 0.02 },
    ],
  },
  "가시 산호 골렘": {
    name: "가시 산호 골렘",
    image: "/images/monster/coralgolem.webp",
    tags: ["golem"],
    hp: 250,
    atk: 17,
    def: 13,
    spd: 2,
    exp: 22,
    skill: { kind: "brace", name: "가시 산호 껍질", damageReduction: 4 },
    drops: [
      { kind: "material", materialId: "coral_spine", chance: 0.075 },
      { kind: "recipe", recipeId: "tideglass_charm", chance: 0.04 },
      // 산호 가시 단검 → 가시 산호 단검 업그레이드 제작서.
      { kind: "recipe", recipeId: "barbed_coral_dagger", chance: 0.02 },
      // 닳은 인장반지를 조수군주의 인장으로 끌어올리는 새김서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "tidelord_signet_engraving", chance: 0.003 },
    ],
  },
  // 산호초 섬 보스 — region.boss 도전 버튼으로만 진입. 자정 기준 일일 dailyEntryLimit 회.
  // 처치 시 the_deep_one_stilled flag (산호초 섬 fast-travel 게이트와 무관 — 이미 ferryman_reef_passage 로 열림).
  // 항상 심해 비늘·산호 가시 + 심연 무구 4종 중 1종 학습. 0.15 로 수심의 핵, 0.05 로 인장 새김서.
  "수심의 것": {
    name: "수심의 것",
    image: "/images/monster/deepseamonster.webp",
    tags: ["beast", "spirit"],
    hp: 800,
    atk: 30,
    def: 15,
    spd: 5,
    exp: 100,
    skill: { kind: "enrage", name: "소용돌이", hpFraction: 0.35, atkBonus: 8 },
    drops: [
      { kind: "material", materialId: "deep_scale", chance: 1, amount: 3 },
      { kind: "material", materialId: "coral_spine", chance: 1, amount: 3 },
      {
        kind: "recipe_one_of",
        recipeIds: ["abyssal_edge", "abyssal_ward", "abyssal_pike", "abyssal_clasp"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "abyssal_heart", chance: 0.15 },
      { kind: "recipe", recipeId: "tidelord_signet_engraving", chance: 0.05 },
    ],
    dropQualityBias: 3,
    phaseTrigger: {
      hpFraction: 0.3,
      defBonus: 5,
      message: "수심의 것이 몸을 둥글게 만다. 비늘이 겹친다.",
    },
    onDefeatFlag: "the_deep_one_stilled",
    bonusAttackChancePct: 160,
  },
  // ── 서편 옛길 (서편 옛길 / 옛 변경 성채) ─────────────────────────────────
  // 시작 마을 서쪽의 막다른 라인. 옛길 ≈ 동굴(Lv3) tier, 성채 ≈ 폐허~산기슭 사이(Lv13) tier.
  // 옛 폐허(고대·마법)와 달리 성채는 "한 세대 전 전쟁의 잔해" — 인간 탈영병 + 녹슨 전쟁기계 + 까마귀.
  "들까마귀 떼": {
    name: "들까마귀 떼",
    image: "/images/monster/flockofcrows.webp",
    tags: ["beast"],
    hp: 45,
    atk: 5,
    def: 1,
    spd: 8,
    evasionPct: 15,
    exp: 4,
    drops: [
      { kind: "material", materialId: "raven_feather", chance: 0.09 },
      // 초반 발판 — 까마귀깃 두건 제작서.
      { kind: "recipe", recipeId: "crow_feather_cap", chance: 0.04 },
      // 유실된 명품 — 까마귀가 둥지에 그러모은 잡동사니로 엮인 부적. (두더지왕의 드릴급 — 아주 이른 행운)
      { kind: "equip", itemId: "crows_hoard_charm", chance: 0.0002 },
    ],
  },
  "갈대 살쾡이": {
    name: "갈대 살쾡이",
    image: "/images/monster/reedcat.webp",
    tags: ["beast"],
    hp: 60,
    atk: 6,
    def: 2,
    spd: 6,
    exp: 5,
    drops: [
      { kind: "material", materialId: "wilddog_fang", chance: 0.045 },
      { kind: "material", materialId: "raven_feather", chance: 0.03 },
    ],
  },
  노상강도: {
    name: "노상강도",
    image: "/images/monster/highwayman.webp",
    tags: ["humanoid"],
    hp: 75,
    atk: 7,
    def: 3,
    spd: 5,
    exp: 6,
    drops: [
      { kind: "material", materialId: "wilddog_fang", chance: 0.045 },
      { kind: "recipe", recipeId: "roadbandit_shortsword", chance: 0.04 },
    ],
  },
  "폐성벽 까마귀": {
    name: "폐성벽 까마귀",
    image: "/images/monster/oldfortresscrow.webp",
    tags: ["beast"],
    hp: 130,
    atk: 15,
    def: 4,
    spd: 8,
    evasionPct: 20,
    exp: 13,
    drops: [
      { kind: "material", materialId: "raven_feather", chance: 0.075 },
      { kind: "recipe", recipeId: "tattered_standard_cloak", chance: 0.04 },
      // 낡은 군기 망토 → 변경 군기 망토 업그레이드 직조서.
      { kind: "recipe", recipeId: "frontier_standard_cloak", chance: 0.015 },
    ],
  },
  "탈영 약탈자": {
    name: "탈영 약탈자",
    image: "/images/monster/deserterbandit.webp",
    tags: ["humanoid"],
    hp: 180,
    atk: 16,
    def: 7,
    spd: 6,
    exp: 15,
    skill: { kind: "heavy_blow", name: "투창", everyPhases: 3, multiplier: 1.8 },
    drops: [
      { kind: "material", materialId: "war_banner_scrap", chance: 0.075 },
      { kind: "material", materialId: "scrap_iron", chance: 0.03 },
      { kind: "recipe", recipeId: "garrison_hauberk", chance: 0.04 },
      // 노상강도의 단검 → 노상강도의 활검 업그레이드 제작서.
      { kind: "recipe", recipeId: "roadbandit_falchion", chance: 0.02 },
    ],
  },
  "녹슨 자동인형": {
    name: "녹슨 자동인형",
    image: "/images/monster/automaton.webp",
    tags: ["golem"],
    hp: 230,
    atk: 14,
    def: 11,
    spd: 2,
    exp: 16,
    skill: { kind: "brace", name: "녹슨 장갑판", damageReduction: 4 },
    drops: [
      { kind: "material", materialId: "scrap_iron", chance: 0.075 },
      { kind: "recipe", recipeId: "geared_warpick", chance: 0.04 },
      // 수비대 사슬갑옷 → 보강한 수비대 사슬갑옷 업그레이드 제작서.
      { kind: "recipe", recipeId: "reinforced_garrison_hauberk", chance: 0.02 },
      // 까마귀 둥지의 부적을 까마귀 보물의 부적으로 끌어올리는 새김서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "crows_hoard_engraving", chance: 0.003 },
    ],
  },
  // 옛 변경 성채 보스 — region.boss 도전 버튼으로만 진입. 자정 기준 일일 dailyEntryLimit 회.
  // 처치 시 oldwall_keep_felled... 가 아니라 gatekeeper_felled flag (성채 fast-travel 게이트와 무관 —
  // 이미 oldwall_keep_unsealed 로 열림). 항상 녹슨 쇳조각·옛 군기 조각 + 수비대 무구 4종 중 1종 학습.
  // 0.15 로 성문지기의 핵, 0.05 로 까마귀 둥지 부적 새김서.
  "옛 성문지기": {
    name: "옛 성문지기",
    image: "/images/monster/oldgatekeeper.webp",
    tags: ["golem"],
    hp: 650,
    atk: 25,
    def: 16,
    spd: 3,
    exp: 85,
    skill: { kind: "heavy_blow", name: "성문 빗장 휘두르기", everyPhases: 3, multiplier: 1.8 },
    drops: [
      { kind: "material", materialId: "scrap_iron", chance: 1, amount: 4 },
      { kind: "material", materialId: "war_banner_scrap", chance: 1, amount: 3 },
      {
        kind: "recipe_one_of",
        recipeIds: ["garrison_blade", "garrison_bulwark", "garrison_glaive", "garrison_cudgel"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "gatekeeper_core", chance: 0.15 },
      { kind: "recipe", recipeId: "crows_hoard_engraving", chance: 0.05 },
    ],
    dropQualityBias: 3,
    phaseTrigger: {
      hpFraction: 0.3,
      defBonus: 5,
      message: "옛 성문지기가 빗장을 가로지른다. 강철판이 겹친다.",
    },
    onDefeatFlag: "gatekeeper_felled",
    bonusAttackChancePct: 170,
  },
};
