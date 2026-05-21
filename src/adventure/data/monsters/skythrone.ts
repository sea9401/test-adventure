import type { Monster } from "./types";

export const SKYTHRONE_MONSTERS: Record<string, Monster> = {
  // ── 별의 첨탑 (starspire) — 천공 성지 위 Lv70 구간. 협동 보스 별을 지키는 자. ─────
  "별점술사 잔영": {
    name: "별점술사 잔영",
    image: "/images/monster/starseer_shade.webp",
    tags: ["spirit"],
    hp: 785,
    atk: 70,
    def: 33,
    spd: 12,
    evasionPct: 25,
    exp: 110,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.012 },
      // 유실된 명품(legendary) — 정찰자들이 한 자루씩 들고 다닌다는 가느다란 활. ultra-rare.
      { kind: "equip", itemId: "starlight_bow", chance: 0.0002 },
      // 빌드 정의 unique — 한쪽 눈에 끼우던 별빛 렌즈 (DEX accessory).
      { kind: "equip", itemId: "starlight_lens", chance: 0.0004 },
    ],
    skill: { kind: "pierce", name: "별빛 일섬", armorPierce: 4 },
    bonusAttackChancePct: 30,
  },
  "구름 사냥꾼": {
    name: "구름 사냥꾼",
    image: "/images/monster/cloudhunter.webp",
    tags: ["beast"],
    hp: 980,
    atk: 74,
    def: 41,
    spd: 7,
    exp: 120,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.018 },
      // 빌드 정의 unique — 어깨에 메고 다니던 가느다란 활 (DEX weapon).
      { kind: "equip", itemId: "cloud_hunter_string", chance: 0.0004 },
    ],
    skill: { kind: "heavy_blow", name: "구름 가르기", everyPhases: 3, multiplier: 1.5 },
    bonusAttackChancePct: 40,
  },
  "운명 직조자": {
    name: "운명 직조자",
    image: "/images/monster/destinyweaver.webp",
    tags: ["spirit"],
    hp: 925,
    atk: 85,
    def: 35,
    spd: 8,
    exp: 130,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.015 },
      { kind: "material", materialId: "sky_alloy", chance: 0.0075 },
      // 빌드 정의 unique — 끝까지 풀지 못한 별빛 실타래 (LUK accessory).
      { kind: "equip", itemId: "fate_weaver_skein", chance: 0.0004 },
    ],
    skill: { kind: "enrage", name: "운명의 실", hpFraction: 0.4, atkBonus: 10 },
    bonusAttackChancePct: 40,
  },
  // 별의 첨탑 보스 — region.boss 도전 버튼으로 진입. starspire 지역 솔로 보스.
  // 처치 시 별먼지 ×6 + 천공 합금 ×2 확정 + 별 무구 4종 중 1 + 망토 15% + 별빛 두루마기 1%.
  "별을 지키는 자": {
    name: "별을 지키는 자",
    image: "/images/monster/stellarguardian.webp",
    tags: ["spirit"],
    hp: 1855,
    atk: 100,
    def: 49,
    spd: 7,
    exp: 500,
    drops: [
      { kind: "material", materialId: "stardust", chance: 1, amount: 6 },
      { kind: "material", materialId: "sky_alloy", chance: 1, amount: 2 },
      {
        kind: "recipe_one_of",
        recipeIds: ["star_blade", "star_aegis", "star_lance", "star_grip"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "star_mantle", chance: 0.15 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "star_robe", chance: 0.01 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 8,
      message: "별을 지키는 자의 갑주가 별빛으로 빛난다.",
    },
    // 시그니처 — 느리지만 무거운 별빛 일격. 4 페이즈마다 ×1.6.
    skill: { kind: "heavy_blow", name: "별빛 일섬", everyPhases: 4, multiplier: 1.6 },
    onDefeatFlag: "starspire_keeper_defeated",
    onDefeatTitleId: "star_keeper",
    bonusAttackChancePct: 220,
  },
  // ── 별빛 회랑 (star_corridor) — 별의 첨탑 → 선인의 폐도 사이 Lv75 사냥터. 보스 없음. ───
  "떠도는 시녀": {
    name: "떠도는 시녀",
    image: "/images/monster/wandering_maid.webp",
    tags: ["spirit"],
    hp: 895,
    atk: 78,
    def: 37,
    spd: 12,
    evasionPct: 20,
    exp: 135,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.015 },
      { kind: "material", materialId: "corridor_relic", chance: 0.03 },
      // 빌드 정의 unique — 별빛 결을 한 가닥 더 매어 둔 활 (DEX weapon).
      { kind: "equip", itemId: "corridor_string", chance: 0.0004 },
    ],
    skill: { kind: "pierce", name: "회랑 일섬", armorPierce: 4 },
    bonusAttackChancePct: 30,
  },
  "별빛 망령": {
    name: "별빛 망령",
    image: "/images/monster/starlightshade.webp",
    tags: ["spirit"],
    hp: 1035,
    atk: 83,
    def: 39,
    spd: 8,
    exp: 145,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.018 },
      { kind: "material", materialId: "corridor_relic", chance: 0.0375 },
      // 빌드 정의 unique — 마지막까지 쥐고 있던 별점 부적 (LUK accessory).
      { kind: "equip", itemId: "wraith_omen_charm", chance: 0.0004 },
      // 빌드 정의 unique — 한 줌의 경갑 (DEX armor).
      { kind: "equip", itemId: "starlight_dust_armor", chance: 0.0004 },
    ],
    skill: { kind: "enrage", name: "망령의 잔영", hpFraction: 0.4, atkBonus: 9 },
    bonusAttackChancePct: 35,
  },
  "별궤도 자율기": {
    name: "별궤도 자율기",
    image: "/images/monster/orbital_automaton.webp",
    tags: ["golem"],
    hp: 1175,
    atk: 85,
    def: 48,
    spd: 6,
    exp: 155,
    drops: [
      { kind: "material", materialId: "stardust", chance: 0.0195 },
      { kind: "material", materialId: "corridor_relic", chance: 0.045 },
      { kind: "material", materialId: "stellar_essence", chance: 0.006 },
      // 빌드 정의 unique — 골렘의 잔해를 두른 두꺼운 갑주 (순수 DEF armor).
      { kind: "equip", itemId: "corridor_carapace", chance: 0.0004 },
    ],
    skill: { kind: "heavy_blow", name: "회랑 충격", everyPhases: 3, multiplier: 1.5 },
    bonusAttackChancePct: 40,
  },
  // ── 선인의 폐도 (skyfolk_ruins) — 별의 첨탑 위 Lv80 구간. 협동 보스 천공인의 왕. ─────
  "천공인 사관": {
    name: "천공인 사관",
    image: "/images/monster/celestialpriest.webp",
    tags: ["spirit"],
    hp: 1035,
    atk: 87,
    def: 41,
    spd: 13,
    evasionPct: 25,
    exp: 160,
    drops: [
      { kind: "material", materialId: "stellar_essence", chance: 0.012 },
      // 빌드 정의 unique — 신고 다녔다는 별빛 짚신 (SPD accessory).
      { kind: "equip", itemId: "ruin_scout_sandals", chance: 0.0004 },
      // 빌드 정의 unique — 환영처럼 휘둘렀다는 가벼운 칼 (SPD weapon).
      { kind: "equip", itemId: "ruin_phantom_blade", chance: 0.0004 },
    ],
    skill: { kind: "pierce", name: "예봉", armorPierce: 5 },
    bonusAttackChancePct: 120,
  },
  "천공인 전사": {
    name: "천공인 전사",
    image: "/images/monster/celestialwarrior.webp",
    tags: ["humanoid"],
    hp: 1310,
    atk: 91,
    def: 52,
    spd: 8,
    exp: 175,
    drops: [
      { kind: "material", materialId: "stellar_essence", chance: 0.018 },
      // 유실된 명품(legendary) — 전사가 폐도 끝에서 두고 떠난 옛 천공인의 칼. ultra-rare.
      { kind: "equip", itemId: "ancient_sky_blade", chance: 0.0002 },
      // 빌드 정의 unique — 두르고 있던 두꺼운 갑주 (순수 DEF armor).
      { kind: "equip", itemId: "skyfolk_warden_plate", chance: 0.0004 },
    ],
    skill: { kind: "heavy_blow", name: "천공 강타", everyPhases: 3, multiplier: 1.5 },
    bonusAttackChancePct: 130,
  },
  "폐허의 거상": {
    name: "폐허의 거상",
    image: "/images/monster/acientgolem.webp",
    tags: ["golem"],
    hp: 1525,
    atk: 100,
    def: 60,
    spd: 5,
    exp: 195,
    drops: [
      { kind: "material", materialId: "stellar_essence", chance: 0.015 },
      { kind: "material", materialId: "aether_alloy", chance: 0.0075 },
      // 빌드 정의 unique — 한 손에 들고 있던 양손검 (순수 ATK weapon).
      { kind: "equip", itemId: "skyfolk_greatsword", chance: 0.0004 },
    ],
    skill: { kind: "enrage", name: "옛 가동", hpFraction: 0.4, atkBonus: 12 },
    bonusAttackChancePct: 140,
  },
  // 선인의 폐도 보스 — region.boss 도전 버튼으로 진입. skyfolk_ruins 지역 솔로 보스.
  // 처치 시 별의 정수 ×8 + 에테르 합금 ×3 확정 + 에테르 무구 4종 중 1 + 망토 15% + 천공인의 관 1%.
  "천공인의 왕": {
    name: "천공인의 왕",
    image: "/images/monster/celestialking.webp",
    tags: ["humanoid"],
    hp: 2615,
    atk: 120,
    def: 65,
    spd: 7,
    exp: 700,
    drops: [
      { kind: "material", materialId: "stellar_essence", chance: 1, amount: 8 },
      { kind: "material", materialId: "aether_alloy", chance: 1, amount: 3 },
      {
        kind: "recipe_one_of",
        recipeIds: ["aether_blade", "aether_aegis", "aether_lance", "aether_grip"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "aether_mantle", chance: 0.15 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "skyfolk_crown", chance: 0.01 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 10,
      message: "천공인의 왕이 옛 별빛을 두른다.",
    },
    // 시그니처 — phase trigger(40%) 와 동시 발동: DEF 도 오르고 ATK 도 +15. 두 번째 페이즈 deadly.
    skill: { kind: "enrage", name: "왕의 진노", hpFraction: 0.4, atkBonus: 15 },
    onDefeatFlag: "skyfolk_king_defeated",
    onDefeatTitleId: "skyfolk_slayer",
    bonusAttackChancePct: 300,
  },
  // ── 옥좌의 길 (throne_road) — 선인의 폐도 → 창공의 옥좌 사이 Lv85 사냥터. 보스 없음. ───
  "황성 의장기수": {
    name: "황성 의장기수",
    image: "/images/monster/imperialbannerknight.webp",
    tags: ["humanoid"],
    hp: 1415,
    atk: 109,
    def: 54,
    spd: 13,
    evasionPct: 20,
    exp: 200,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.015 },
      { kind: "material", materialId: "road_relic", chance: 0.03 },
      // 빌드 정의 unique — 옥좌의 길에서 다듬은 가느다란 단검 (DEX weapon).
      { kind: "equip", itemId: "road_flash_dagger", chance: 0.0004 },
    ],
    skill: { kind: "pierce", name: "정찰관 일섬", armorPierce: 5 },
    bonusAttackChancePct: 40,
  },
  "황성 호위병": {
    name: "황성 호위병",
    tags: ["humanoid"],
    hp: 1635,
    atk: 114,
    def: 65,
    spd: 8,
    exp: 220,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.018 },
      { kind: "material", materialId: "road_relic", chance: 0.0375 },
      // 빌드 정의 unique — 옛 결의 칼 (순수 ATK weapon).
      { kind: "equip", itemId: "road_resolve_blade", chance: 0.0004 },
      // 빌드 정의 unique — 옥좌의 길을 달렸다는 가벼운 짚신 (SPD armor).
      { kind: "equip", itemId: "road_sandals", chance: 0.0004 },
    ],
    skill: { kind: "heavy_blow", name: "호위 일격", everyPhases: 3, multiplier: 1.55 },
    bonusAttackChancePct: 120,
  },
  "봉인 파편": {
    name: "봉인 파편",
    image: "/images/monster/sealedfragment.webp",
    tags: ["golem"],
    hp: 1795,
    atk: 120,
    def: 74,
    spd: 5,
    exp: 240,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.0195 },
      { kind: "material", materialId: "road_relic", chance: 0.045 },
      { kind: "material", materialId: "primordial_essence", chance: 0.006 },
      // 빌드 정의 unique — 옛 봉인의 결정을 두른 갑주 (순수 DEF armor).
      { kind: "equip", itemId: "shard_seal_plate", chance: 0.0004 },
    ],
    skill: { kind: "enrage", name: "파편 폭주", hpFraction: 0.4, atkBonus: 13 },
    bonusAttackChancePct: 140,
  },
  // 옥좌의 길(throne_road) 솔로 보스 — 순례자 미상의 분신. Ch.23 — 옥좌의 길.
  // 후드를 벗자 그 안에 얼굴이 없다(빛만). 검을 든 손만 남은, 본체로 돌아가기 전의 마지막 시험.
  "순례자의 분신": {
    name: "순례자의 분신",
    tags: ["humanoid", "spirit"],
    image: "/images/npc/pilgrim.webp",
    hp: 3800,
    atk: 138,
    def: 78,
    spd: 11,
    exp: 720,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 1, amount: 5 },
      { kind: "material", materialId: "primordial_essence", chance: 1, amount: 3 },
      { kind: "material", materialId: "road_relic", chance: 1, amount: 4 },
      { kind: "equip", itemId: "starbound_charm", chance: 0.05 },
      { kind: "equip", itemId: "apostle_shard_blade", chance: 0.05 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.35,
      defBonus: 8,
      message: "후드가 흘러내리자, 그 안의 빛이 형태를 거두기 시작한다.",
    },
    skill: { kind: "heavy_blow", name: "모아온 빛 일섬", everyPhases: 3, multiplier: 1.8 },
    onDefeatFlag: "pilgrim_avatar_defeated",
    bonusAttackChancePct: 180,
  },
  // ── 창공의 옥좌 (apex_throne) — 선인의 폐도 깊은 곳 Lv90 마지막 구간. 협동 보스 창공의 주재.
  // 처치 시 endgame_apex_defeated flag → 6번째 일반 슬롯 + 2번째 특기 슬롯 해금.
  "별빛 사도": {
    name: "별빛 사도",
    image: "/images/monster/celestialapostle.webp",
    tags: ["spirit"],
    hp: 1415,
    atk: 120,
    def: 54,
    spd: 14,
    evasionPct: 25,
    exp: 230,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.012 },
      // 유실된 명품(legendary) — 사도들이 마지막까지 품에 두고 있었다는 작은 부적. ultra-rare.
      { kind: "equip", itemId: "starbound_charm", chance: 0.0002 },
      // 빌드 정의 unique — 끝까지 부러뜨리지 못한 잔검 (LUK weapon).
      { kind: "equip", itemId: "apostle_shard_blade", chance: 0.0004 },
    ],
    skill: { kind: "pierce", name: "사도의 일섬", armorPierce: 6 },
    bonusAttackChancePct: 120,
  },
  "옥좌의 검신": {
    name: "옥좌의 검신",
    image: "/images/monster/swordmasterofthrone.webp",
    tags: ["humanoid"],
    hp: 1795,
    atk: 125,
    def: 71,
    spd: 9,
    exp: 255,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.018 },
      // 빌드 정의 unique — 옥좌 둘레를 돌았다는 가벼운 짚신 (SPD accessory).
      { kind: "equip", itemId: "throne_pursuer_sandals", chance: 0.0004 },
    ],
    skill: { kind: "heavy_blow", name: "호위 강타", everyPhases: 3, multiplier: 1.6 },
    bonusAttackChancePct: 300,
  },
  "잠든 황좌 거인": {
    name: "잠든 황좌 거인",
    image: "/images/monster/sleepinggiant.webp",
    tags: ["golem"],
    hp: 2070,
    atk: 136,
    def: 82,
    spd: 5,
    exp: 280,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 0.015 },
      { kind: "material", materialId: "primordial_essence", chance: 0.0075 },
      // 유실된 명품(legendary) — 골렘 내부에 함께 잠들어 있던 옛 호위병 갑주. ultra-rare.
      { kind: "equip", itemId: "enthrone_plate", chance: 0.00015 },
      // 빌드 정의 unique — 옛 황성에서 두고 떠난 별책 (LUK accessory).
      { kind: "equip", itemId: "throne_starbook", chance: 0.0004 },
    ],
    skill: { kind: "enrage", name: "봉인 해제", hpFraction: 0.4, atkBonus: 15 },
    bonusAttackChancePct: 300,
  },
  // 창공의 옥좌 보스 — region.boss 도전 버튼으로 진입. apex_throne 지역 솔로 보스.
  // 처치 시 endgame_apex_defeated flag 설정 → 6번째 일반 슬롯 / 2번째 특기 슬롯 동시 해금.
  // 처치 시 창공 조각 ×10 + 태초의 정수 ×4 + 창공 무구 4종 중 1 + 망토 15% + 창공의 옥새 1%.
  "창공의 주재": {
    name: "창공의 주재",
    image: "/images/monster/lordofsky.webp",
    tags: ["humanoid"],
    hp: 3815,
    atk: 147,
    def: 87,
    spd: 7,
    exp: 1000,
    drops: [
      { kind: "material", materialId: "empyrean_shard", chance: 1, amount: 10 },
      { kind: "material", materialId: "primordial_essence", chance: 1, amount: 4 },
      {
        kind: "recipe_one_of",
        recipeIds: ["empyrean_blade", "empyrean_aegis", "empyrean_lance", "empyrean_grip"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "empyrean_mantle", chance: 0.15 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "apex_regalia", chance: 0.01 },
    ],
    dropQualityBias: 5,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 12,
      message: "창공의 주재가 별빛을 끌어내려 옥좌 둘레에 두른다.",
    },
    // 시그니처 — 만렙 보스. 갑주를 가르는 옥좌의 빛: 매 공격이 플레이어 DEF 10 만큼 무시.
    skill: { kind: "pierce", name: "옥좌의 결", armorPierce: 10 },
    onDefeatFlag: "endgame_apex_defeated",
    onDefeatTitleId: "apex_slayer",
    bonusAttackChancePct: 300,
  },
};
