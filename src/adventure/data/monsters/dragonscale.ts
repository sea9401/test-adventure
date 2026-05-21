import type { Monster } from "./types";

export const DRAGONSCALE_MONSTERS: Record<string, Monster> = {
  // ── 용비늘 라인 (뼈무덤 황야 / 용비늘 묘지) ──────────────────────────────
  // 바람골 역참 남쪽 막다른 라인 — 황야 잡몹(Lv47) → 묘지 잡몹(Lv75) → 솔로 보스 뼈비늘 노룡.
  // 황야 잡몹은 봉황령~화산 지대 사이(Lv40~55) 구간이라 stat 도 그 사이로 맞춘다.
  // 묘지 잡몹은 별빛 회랑(Lv75) 라인과 같은 stat 영역이지만 방어 비중이 더 두텁다.
  "용골 광신도": {
    name: "용골 광신도",
    tags: ["humanoid"],
    hp: 380,
    atk: 36,
    def: 14,
    spd: 7,
    exp: 52,
    skill: { kind: "heavy_blow", name: "광신의 일격", everyPhases: 3, multiplier: 1.6 },
    drops: [
      { kind: "material", materialId: "scrap_iron", chance: 0.06 },
      { kind: "material", materialId: "scale_dust", chance: 0.045 },
      // 뼈비늘 손방패 제작서 — 황야 입문 방패.
      { kind: "recipe", recipeId: "bonescale_buckler", chance: 0.03 },
    ],
  },
  "역병 하이에나": {
    name: "역병 하이에나",
    tags: ["beast"],
    hp: 320,
    atk: 34,
    def: 10,
    spd: 11,
    evasionPct: 22,
    exp: 50,
    drops: [
      { kind: "material", materialId: "tough_hide", chance: 0.06 },
      { kind: "material", materialId: "scale_dust", chance: 0.045 },
      // 황야 행자 갑옷 제작법 — 황야 입문 갑옷.
      { kind: "recipe", recipeId: "barrow_traveler_armor", chance: 0.03 },
    ],
  },
  "묘지 그렘린": {
    name: "묘지 그렘린",
    tags: ["humanoid"],
    hp: 280,
    atk: 30,
    def: 8,
    spd: 13,
    evasionPct: 25,
    exp: 46,
    skill: { kind: "pierce", name: "그렘린의 송곳니", armorPierce: 4 },
    drops: [
      { kind: "material", materialId: "scrap_iron", chance: 0.05 },
      { kind: "material", materialId: "scale_dust", chance: 0.06 },
    ],
  },
  // ── 용비늘 묘지 (Lv75) — 솔로 보스 뼈비늘 노룡. 별빛 회랑과 같은 stat 영역. ─────
  "타락한 묘지기사": {
    name: "타락한 묘지기사",
    tags: ["humanoid", "undead"],
    hp: 850,
    atk: 76,
    def: 38,
    spd: 7,
    exp: 138,
    skill: { kind: "heavy_blow", name: "묘지기사의 일격", everyPhases: 3, multiplier: 1.55 },
    drops: [
      { kind: "material", materialId: "scrap_iron", chance: 0.05 },
      { kind: "material", materialId: "dragonscale_shard", chance: 0.03 },
      { kind: "material", materialId: "bone_rune_steel", chance: 0.006 },
      // 뼈각인 투구 제작서 — 묘지 잡몹산 액세서리.
      { kind: "recipe", recipeId: "bonerune_helm", chance: 0.03 },
    ],
    bonusAttackChancePct: 130,
  },
  "잿빛 와이번": {
    name: "잿빛 와이번",
    tags: ["beast", "dragon"],
    hp: 920,
    atk: 78,
    def: 36,
    spd: 10,
    exp: 148,
    skill: { kind: "pierce", name: "와이번 송곳니", armorPierce: 5 },
    drops: [
      { kind: "material", materialId: "tough_hide", chance: 0.045 },
      { kind: "material", materialId: "dragonscale_shard", chance: 0.035 },
      { kind: "material", materialId: "scale_dust", chance: 0.04 },
      // 비늘 보호갑 제작법 — 묘지 잡몹산 갑주.
      { kind: "recipe", recipeId: "scaleguard_plate", chance: 0.03 },
    ],
    bonusAttackChancePct: 200,
  },
  "용골 리치": {
    name: "용골 리치",
    tags: ["spirit", "undead"],
    hp: 1000,
    atk: 80,
    def: 42,
    spd: 8,
    exp: 158,
    skill: { kind: "enrage", name: "리치의 옛 결", hpFraction: 0.4, atkBonus: 10 },
    drops: [
      { kind: "material", materialId: "dragonscale_shard", chance: 0.045 },
      { kind: "material", materialId: "bone_rune_steel", chance: 0.0075 },
      { kind: "material", materialId: "scale_dust", chance: 0.045 },
      // 용골 카이트 방패 제작서 — 묘지 잡몹산 방패.
      { kind: "recipe", recipeId: "dragonbone_kite_shield", chance: 0.03 },
    ],
    bonusAttackChancePct: 200,
  },
  // 용비늘 묘지 보스 — region.boss 도전 버튼으로만 진입. 자정 기준 일일 dailyEntryLimit 회.
  // 처치 시 wyrm_warden_felled flag. 항상 용비늘 조각·뼈각인 강철·용비늘 가루 + 보스 보상 4종 중
  // 1종 학습. 0.15 로 용지기의 망토 제작법. 정석 방어 장비면 적정 시간 안에 잡히게 노브 적용.
  "뼈비늘 노룡": {
    name: "뼈비늘 노룡",
    tags: ["dragon", "undead"],
    hp: 2400,
    atk: 92,
    def: 60,
    spd: 5,
    exp: 620,
    skill: { kind: "heavy_blow", name: "노룡의 꼬리치기", everyPhases: 3, multiplier: 1.7 },
    drops: [
      { kind: "material", materialId: "dragonscale_shard", chance: 1, amount: 5 },
      { kind: "material", materialId: "bone_rune_steel", chance: 1, amount: 3 },
      { kind: "material", materialId: "scale_dust", chance: 1, amount: 6 },
      {
        kind: "recipe_one_of",
        recipeIds: [
          "dragonscale_aegis",
          "dragonscale_plate",
          "dragonscale_helm",
          "boneking_greatsword",
        ],
        chance: 1,
      },
      { kind: "recipe", recipeId: "wyrm_warden_cloak", chance: 0.15 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 10,
      message: "뼈비늘 노룡이 잿빛 비늘을 곤두세우며 다시 일어선다.",
    },
    onDefeatFlag: "wyrm_warden_felled",
    bonusAttackChancePct: 190,
  },
  // ── 용의 둥지 (dragon_nest) — 월드 보스. coop/data.ts 의 COOP_BOSSES 로 등장. ─────
  // 다인 누적 데미지로만 잡힐 만큼 압도적 스펙 + 처치 후 7일 휴면.
  // solo stat 은 시뮬·테스트 용도 (coop maxHp 는 coop/data.ts 의 500000).
  "태고의 노룡": {
    name: "태고의 노룡",
    tags: ["dragon", "undead"],
    hp: 12000,
    atk: 180,
    def: 110,
    spd: 6,
    exp: 5000,
    drops: [
      { kind: "material", materialId: "dragonscale_shard", chance: 1, amount: 20 },
      { kind: "material", materialId: "bone_rune_steel", chance: 1, amount: 10 },
      { kind: "material", materialId: "scale_dust", chance: 1, amount: 25 },
    ],
    dropQualityBias: 5,
    armorVulnerable: 0.25,
    playerDefVulnerable: 0.3,
    phaseTrigger: {
      hpFraction: 0.5,
      defBonus: 15,
      message: "태고의 노룡이 잿빛 비늘 너머로 옛 시대의 불씨를 다시 켠다.",
    },
    // 시그니처 — 무게 자체로 갑주를 가른다. 매 공격이 플레이어 DEF 14 만큼 무시.
    skill: { kind: "pierce", name: "태고의 무게", armorPierce: 14 },
    onDefeatFlag: "primordial_dragon_felled",
    bonusAttackChancePct: 250,
  },
};
