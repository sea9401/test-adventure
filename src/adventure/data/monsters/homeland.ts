import type { Monster } from "./types";

export const HOMELAND_MONSTERS: Record<string, Monster> = {
  주정뱅이: {
    name: "주정뱅이",
    tags: ["humanoid"],
    image: "/images/monster/hobo.webp",
    hp: 22,
    atk: 1,
    def: 0,
    spd: 1,
    exp: 1,
    drops: [
      { kind: "material", materialId: "rusty_nail", chance: 0.15 },
      { kind: "recipe", recipeId: "nailed_baseball_bat", chance: 0.003 },
    ],
  },
  슬라임: {
    name: "슬라임",
    tags: ["slime"],
    image: "/images/monster/slime.webp",
    hp: 33,
    atk: 2,
    def: 1,
    spd: 1,
    exp: 2,
    drops: [
      { kind: "material", materialId: "slime_chunk", chance: 0.15 },
      { kind: "material", materialId: "slime_core", chance: 0.015 },
    ],
  },
  들개: {
    name: "들개",
    tags: ["beast"],
    image: "/images/monster/wilddog.webp",
    hp: 38,
    atk: 3,
    def: 1,
    spd: 4,
    exp: 3,
    drops: [
      { kind: "material", materialId: "wilddog_hide", chance: 0.045 },
      { kind: "material", materialId: "wilddog_fang", chance: 0.0225 },
      // 초반 발판 — 낡은 가죽갑옷(볼드 무료 지급) → 덧댄 가죽갑옷. Lv 한 자릿수 안에 받게 드랍률 ↑.
      { kind: "recipe", recipeId: "reinforced_leather_armor", chance: 0.04 },
    ],
  },
  두더지: {
    name: "두더지",
    tags: ["beast"],
    image: "/images/monster/mole.webp",
    hp: 27,
    atk: 2,
    def: 0,
    spd: 3,
    exp: 2,
    drops: [
      { kind: "equip", itemId: "mole_king_drill", chance: 0.0002 },
    ],
  },
  박쥐: {
    name: "박쥐",
    tags: ["beast"],
    image: "/images/monster/bat.webp",
    hp: 49,
    atk: 5,
    def: 2,
    spd: 7,
    exp: 4,
    drops: [
      { kind: "material", materialId: "bat_eye", chance: 0.03 },
      { kind: "recipe", recipeId: "bat_hood", chance: 0.004 },
      // 유실된 명품 — 두더지왕의 드릴과 같은 부류(unique). 잡몹이 떡상 장신구를 떨군다.
      { kind: "equip", itemId: "bat_swarm_charm", chance: 0.0002 },
      // bat_swarm_charm 을 한 단계 끌어올리는 개조서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "bat_swarm_guide", chance: 0.003 },
    ],
  },
  동굴뱀: {
    name: "동굴뱀",
    tags: ["beast"],
    image: "/images/monster/cavesnake.webp",
    hp: 57,
    atk: 6,
    def: 2,
    spd: 5,
    exp: 5,
    drops: [
      { kind: "material", materialId: "hard_crystal", chance: 0.06 },
      { kind: "recipe", recipeId: "crystal_dagger", chance: 0.004 },
    ],
  },
  거미: {
    name: "거미",
    tags: ["beast"],
    image: "/images/monster/spider.webp",
    hp: 72,
    atk: 7,
    def: 3,
    spd: 6,
    exp: 6,
    drops: [
      { kind: "material", materialId: "spider_silk", chance: 0.045 },
      { kind: "recipe", recipeId: "sticky_cloak", chance: 0.003 },
      // 유실된 명품(unique) — 행운 +7 갑옷. "운으로 성장하는" 손맛 전용.
      { kind: "equip", itemId: "spider_queen_silk_robe", chance: 0.0002 },
      // 그 비단갑을 한 단계 끌어올리는 직조서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "spider_queen_silk_plate", chance: 0.002 },
      // 거미줄에 휘감긴 사냥 비전 — 둔화 스킬북.
      { kind: "skill_book", bookId: "book_slow", chance: 0.003 },
    ],
  },
  산적: {
    name: "산적",
    tags: ["humanoid"],
    image: "/images/monster/bandit.webp",
    hp: 98,
    atk: 9,
    def: 3,
    spd: 4,
    exp: 8,
    drops: [
      { kind: "gold", amount: 1, chance: 0.0777 },
      // 초반 발판 — 산적의 단검 → 두목의 단검 체인. 베이스/제작서 둘 다 드랍률 ↑.
      { kind: "equip", itemId: "bandit_dagger", chance: 0.015 },
      { kind: "recipe", recipeId: "bandit_chief_dagger", chance: 0.04 },
      // 너덜너덜한 보법서 — 산적이 회피 보법을 익혔던 흔적. 한 번만 학습되면 충분하므로 낮은 확률.
      { kind: "skill_book", bookId: "book_extra_evade", chance: 0.003 },
    ],
    // PR-5b — 인프라 검증 샘플. 강타 발동 (str 계 데미지 + cd 2턴 + 작은 mp 풀).
    v2Skills: { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
    v2MaxMp: 100,
  },
  "호수 님프": {
    name: "호수 님프",
    tags: ["spirit"],
    archetype: "caster",
    image: "/images/monster/lakenymph.webp",
    hp: 117,
    atk: 11,
    def: 4,
    spd: 5,
    exp: 10,
    // caster — 물 정령답게 서릿바람(마법딜 + 둔화) 시전(옛 PR-5b 샘플 대체).
    v2Skills: { learned: ["mob_frostwind"], equipped: ["mob_frostwind"] },
    v2MaxMp: 90,
    drops: [
      { kind: "material", materialId: "fairy_dust", chance: 0.03 },
      { kind: "equip", itemId: "nymph_ring", chance: 0.005 },
      { kind: "recipe", recipeId: "fairy_blessing", chance: 0.002 },
      { kind: "recipe", recipeId: "nymph_blessing", chance: 0.002 },
    ],
  },
  "부서진 골렘": {
    name: "부서진 골렘",
    tags: ["golem"],
    image: "/images/monster/brokengolem.webp",
    hp: 180,
    atk: 13,
    def: 6,
    spd: 2,
    exp: 14,
    drops: [
      { kind: "material", materialId: "ruin_fragment", chance: 0.075 },
      { kind: "recipe", recipeId: "golem_armor", chance: 0.02 },
      { kind: "equip", itemId: "golem_hammer", chance: 0.001 },
      { kind: "recipe", recipeId: "reforged_golem_hammer", chance: 0.015 },
    ],
  },
  "떠도는 망령": {
    name: "떠도는 망령",
    tags: ["undead", "spirit"],
    archetype: "caster",
    image: "/images/monster/wraith.webp",
    hp: 95,
    atk: 14,
    def: 3,
    spd: 8,
    evasionPct: 20,
    exp: 13,
    drops: [
      { kind: "material", materialId: "soul_crystal", chance: 0.015 },
      { kind: "equip", itemId: "wraith_cloak", chance: 0.002 },
      { kind: "recipe", recipeId: "wraithking_cloak", chance: 0.002 },
      // 빛바랜 호흡법 — 정화 스킬북. 망령이 남긴 결.
      { kind: "skill_book", bookId: "book_purify", chance: 0.004 },
    ],
  },
  "작은 광물 골렘": {
    name: "작은 광물 골렘",
    tags: ["golem"],
    image: "/images/monster/minigolem.webp",
    hp: 110,
    atk: 9,
    def: 5,
    spd: 3,
    exp: 9,
    drops: [
      { kind: "material", materialId: "mana_crystal", chance: 0.0015 },
    ],
  },
  // 깊은 동굴 보스 — region.boss 도전 버튼으로만 진입. 일반 인카운터 풀에선 제외.
  // 일일 도전 횟수 제한이 region.boss.dailyEntryLimit 으로 정해진다.
  // 처치 시 항상 마정석 1 + 마정석 무기 제작서 4종 중 1종 학습 (이미 안다면 무시).
  "광맥의 수호자": {
    name: "광맥의 수호자",
    tags: ["golem"],
    image: "/images/monster/oreguardian.webp",
    hp: 380,
    atk: 18,
    def: 10,
    spd: 3,
    exp: 60,
    drops: [
      { kind: "material", materialId: "mana_crystal", chance: 1, amount: 2 },
      {
        kind: "recipe_one_of",
        recipeIds: ["mana_sword", "mana_shield", "mana_spear", "mana_knuckle"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "mana_bracelet", chance: 0.15 },
      // 두더지왕의 드릴(유실된 명품)을 한 단계 끌어올리는 개조서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "mole_king_borer", chance: 0.05 },
    ],
    dropQualityBias: 3,
    armorVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.3,
      defBonus: 4,
      message: "수호자가 단단해지기 시작했다.",
    },
    bonusAttackChancePct: 170,
  },
  "폐허 늑대": {
    name: "폐허 늑대",
    tags: ["beast", "undead"],
    image: "/images/monster/ruinwolf.webp",
    hp: 130,
    atk: 12,
    def: 4,
    spd: 6,
    exp: 11,
    drops: [
      { kind: "material", materialId: "wilddog_fang", chance: 0.045 },
      // 유실된 명품(unique) — 폐허에 박혀 있던 옛 영웅검의 윗동강. atk +8 / def -2.
      { kind: "equip", itemId: "hero_broken_sword", chance: 0.00015 },
    ],
  },
};
