import type { MaterialId } from "./materials";
import type { ItemId } from "./items";
import type { SkillBookId } from "./skillBooks";

export type MonsterTag =
  | "humanoid"
  | "beast"
  | "slime"
  | "golem"
  | "spirit"
  | "undead"
  | "dragon";

// 드롭은 일곱 가지 — 재료 / 골드 / 장비 / 장비 풀(랜덤 1) / 제작서 / 제작서 풀(랜덤 1) / 스킬북.
// chance 는 0~1.
// "recipe" 드롭은 해당 제작법을 학습 (이미 알고 있으면 무시).
// "recipe_one_of" 는 chance 가 통과하면 recipeIds 중 하나를 균등 추첨해 학습 시도.
// "equip_one_of" 는 chance 가 통과하면 itemIds 중 하나를 균등 추첨해 인벤에 추가.
//    별빛 사냥터처럼 30종 풀에서 한 자루 떨어지는 패턴용 — 30 entry 박지 않고 풀로.
// "skill_book" 은 책 그 자체가 인벤에 들어간다 — 학습은 사용 시점.
export type MonsterDrop =
  | { kind: "material"; materialId: MaterialId; chance: number; amount?: number }
  | { kind: "gold"; amount: number; chance: number }
  | { kind: "equip"; itemId: ItemId; chance: number }
  | { kind: "equip_one_of"; itemIds: ItemId[]; chance: number }
  | { kind: "recipe"; recipeId: string; chance: number }
  | { kind: "recipe_one_of"; recipeIds: string[]; chance: number }
  | { kind: "skill_book"; bookId: SkillBookId; chance: number };

// 몬스터 페이즈 트리거 — HP가 hpFraction(0~1) 미만으로 떨어지면 1회 발동.
// defBonus 만큼 적의 DEF 가 영구 증가, 로그에 message 가 출력된다. 보스용.
export type MonsterPhaseTrigger = {
  hpFraction: number;
  defBonus: number;
  message: string;
};

// 잡몹 스킬 — 몬스터당 최대 1개(옵셔널). 전투 엔진의 적 페이즈에서 처리.
//  - heavy_blow: everyPhases 번째 적 페이즈마다 그 공격 데미지 ×multiplier (강타).
//  - enrage:     적 HP 가 maxHp×hpFraction 미만으로 떨어지는 순간 1회 발동, ATK +atkBonus (전투 종료까지 유지).
//  - brace:      플레이어가 이 적을 공격할 때 데미지 -damageReduction (최소 1로 클램프).
//  - pierce:     이 적의 공격이 플레이어 DEF 를 armorPierce 만큼 무시.
// name 은 전투 로그에 [name] 으로 찍힌다.
export type MonsterSkill =
  | { kind: "heavy_blow"; name: string; everyPhases: number; multiplier: number }
  | { kind: "enrage"; name: string; hpFraction: number; atkBonus: number }
  | { kind: "brace"; name: string; damageReduction: number }
  | { kind: "pierce"; name: string; armorPierce: number };

export type Monster = {
  name: string;
  tags: MonsterTag[];
  image?: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** 0~100. 플레이어 공격을 % 확률로 회피. 0/undefined = 항상 피격. */
  evasionPct?: number;
  exp: number;
  drops?: MonsterDrop[];
  phaseTrigger?: MonsterPhaseTrigger;
  /** 잡몹 스킬 — 적 페이즈에서 처리되는 단순 능력 1개. */
  skill?: MonsterSkill;
  /**
   * 드랍 장비 품질 등급(정교한/빼어난) 가중치 배수. 기본 1. 미니보스 ≈2 / 지역 보스 ≈3 /
   * 레이드급 ≈4 권장 — 비-기본 등급 가중치(raw 4/1)에 곱해진 뒤 정규화된다(dropQuality.ts).
   */
  dropQualityBias?: number;
  /**
   * 0~1. 이 몬스터를 공격할 때 무시되는 자신의 DEF 비율 (페이즈로 오른 DEF 포함). 미지정/0 = 정상 감산.
   * "스펀지 보스" 방지 노브 — 그 시대 정석 장비면 적정 시간 안에 잡히게. 보스 ≈ 0.25~0.35 권장.
   * 정확 스킬(armorPierceFraction) 과 곱셈으로 겹치고, 분쇄(고정 감산)는 이 뒤에 적용된다.
   */
  armorVulnerable?: number;
  /**
   * 0~1. 이 몬스터의 공격이 무시하는 플레이어 DEF 비율. 잡몹 pierce 스킬(고정값)과 별개 — 풀탱이
   * 보스를 무피격으로 농락하지 못하게. 미지정/0 = 정상. 보스 ≈ 0.2~0.3 권장.
   */
  playerDefVulnerable?: number;
  /** 처치 시 set 할 storyFlag id — 보스용. 두 번째 처치부터는 useStoryFlags.set 이 idempotent 라 무시. */
  onDefeatFlag?: string;
  /**
   * 보스에 도전(첫 일격)하는 순간 set 할 storyFlag id — 처치까진 안 가도 set 되는 "참여" 플래그.
   * 옛 coop 시절 onAttackFlag 를 솔로 region.boss 로 옮긴 것. 진입로가 "맞붙으면 열림" 인
   * 길목(canyon→unhyang)을 위해 BossSubView.onBossAttempt 가 도전 클릭 시 set.
   */
  onEngageFlag?: string;
  /**
   * 처치 시 grant 할 titleId — 솔로 region.boss 의 legend 칭호 자동 부여용
   * (옛 coop 시절의 50% 데미지 임계 대신, 솔로 처치 = 칭호 획득).
   * grantTitle 자체가 idempotent — 두 번째 처치부터 무시.
   */
  onDefeatTitleId?: string;
  /**
   * 5막 「빈 옥좌의 시대」 별빛 변종 표식. "starfall" — 황제가 쓰러진 뒤 별빛이 떨어진
   * 자리에서 깨어난 변종. 향후 별빛 깃든 기예 발동 조건·드랍 풀 식별·도감 그룹화 등에
   * 쓰일 분류 태그. PR-A 시점에서는 메타데이터로만 보존(전투 로직에 영향 없음).
   */
  auraKind?: "starfall";
  /**
   * 몬스터 추가 공격 확률(%). 100% 초과는 정수 부분만큼 확정 추가타 (engine.ts enemy phase).
   * 0/undefined = 1대 고정(잡몹). 100 = +1대 확정, 200 = +2대 확정, 300 = +3대 확정.
   * 플레이어 회피 100% 무적 빌드 견제 + 보스전 압박감을 위한 다대시 수단.
   */
  bonusAttackChancePct?: number;
};

// ── 5막 별빛 사냥터 drop 풀 상수 — 일반 몹 12종에 inline 으로 반복 박지 않도록 추출 ──
// 사냥터별 30종을 8/7/8/7 묶음으로 분배 (메인스탯 X 무기/방어구 골고루).
// 부여서 5종/보스는 inline (5장이라 충분히 짧다).
const STARFALL_CAVE_RECIPES: readonly string[] = [
  "starlit_greatsword_str", "starlit_greatsword_dex", "starlit_lance_str",
  "starlit_lance_dex", "starlit_shield_str", "starlit_twinblades_str",
  "starlit_dagger_str", "starlit_armor_str",
];
const STARLIT_CANYON_RECIPES: readonly string[] = [
  "starlit_greatsword_vit", "starlit_lance_vit", "starlit_shield_dex",
  "starlit_shield_vit", "starlit_twinblades_dex", "starlit_dagger_dex",
  "starlit_armor_dex", "starlit_armor_vit",
];
const STARLIT_REEF_RECIPES: readonly string[] = [
  "starlit_greatsword_spd", "starlit_lance_spd", "starlit_shield_spd",
  "starlit_twinblades_vit", "starlit_twinblades_spd", "starlit_dagger_vit",
  "starlit_armor_spd",
];
const STARLIT_KEEP_RECIPES: readonly string[] = [
  "starlit_greatsword_luk", "starlit_lance_luk", "starlit_shield_luk",
  "starlit_twinblades_luk", "starlit_dagger_spd", "starlit_dagger_luk",
  "starlit_armor_luk",
];

export const MONSTERS: Record<string, Monster> = {
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
  },
  "호수 님프": {
    name: "호수 님프",
    tags: ["spirit"],
    image: "/images/monster/lakenymph.webp",
    hp: 117,
    atk: 11,
    def: 4,
    spd: 5,
    exp: 10,
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
  // ── 버려진 채석장 (quarry) — 폐허(Lv9)와 북풍 산기슭(Lv18) 사이 중간 구간 ──────────
  // atk 16~19 / hp 150~210 / def 4~9 / exp 13~16 — 폐허↔산기슭 곡선을 매끄럽게.
  "채석터 들개": {
    name: "채석터 들개",
    image: "/images/monster/stonewolf.webp",
    tags: ["beast"],
    hp: 150,
    atk: 19,
    def: 4,
    spd: 6,
    exp: 13,
    drops: [
      { kind: "material", materialId: "wilddog_hide", chance: 0.06 },
      { kind: "material", materialId: "wilddog_fang", chance: 0.03 },
      { kind: "recipe", recipeId: "reinforced_leather_armor", chance: 0.012 },
    ],
  },
  "버려진 광부": {
    name: "버려진 광부",
    image: "/images/monster/undeadminer.webp",
    tags: ["humanoid", "undead"],
    hp: 155,
    atk: 18,
    def: 5,
    spd: 5,
    exp: 13,
    drops: [
      { kind: "material", materialId: "soul_crystal", chance: 0.03 },
      { kind: "material", materialId: "hard_crystal", chance: 0.06 },
      { kind: "gold", amount: 1, chance: 0.08 },
    ],
  },
  "돌부스러기 골렘": {
    name: "돌부스러기 골렘",
    image: "/images/monster/debrisgolem.webp",
    tags: ["golem"],
    hp: 210,
    atk: 16,
    def: 9,
    spd: 3,
    exp: 16,
    drops: [
      { kind: "material", materialId: "ruin_fragment", chance: 0.075 },
      { kind: "material", materialId: "hard_crystal", chance: 0.08 },
      { kind: "recipe", recipeId: "golem_armor", chance: 0.012 },
    ],
  },
  // ── 운향 라인 (highland / canyon) ───────────────────────────────────────
  산양: {
    name: "산양",
    tags: ["beast"],
    hp: 180,
    atk: 22,
    def: 7,
    spd: 5,
    exp: 18,
    image: "/images/monster/mountaingoat.webp",
    drops: [
      { kind: "material", materialId: "sancho_blossom", chance: 0.03 },
      { kind: "material", materialId: "tough_hide", chance: 0.045 },
    ],
  },
  "바위 두꺼비": {
    name: "바위 두꺼비",
    tags: ["beast"],
    hp: 240,
    atk: 19,
    def: 12,
    spd: 3,
    exp: 22,
    image: "/images/monster/stonefrog.webp",
    drops: [
      { kind: "material", materialId: "unbong_ore", chance: 0.03 },
    ],
  },
  "절벽 늑대": {
    name: "절벽 늑대",
    tags: ["beast"],
    hp: 240,
    atk: 22,
    def: 9,
    spd: 7,
    exp: 22,
    image: "/images/monster/mountainwolf.webp",
    drops: [
      { kind: "material", materialId: "wilddog_fang", chance: 0.075 },
      { kind: "material", materialId: "sancho_blossom", chance: 0.045 },
    ],
  },
  "돌풍 정령": {
    name: "돌풍 정령",
    tags: ["spirit"],
    hp: 190,
    atk: 21,
    def: 9,
    spd: 8,
    evasionPct: 20,
    exp: 24,
    image: "/images/monster/icespirit.webp",
    drops: [
      { kind: "material", materialId: "fairy_dust", chance: 0.06 },
      { kind: "material", materialId: "wind_mana_stone", chance: 0.03 },
      { kind: "recipe", recipeId: "windmana_charm", chance: 0.004 },
    ],
  },
  "늑대 무리장": {
    name: "늑대 무리장",
    tags: ["beast"],
    hp: 240,
    atk: 22,
    def: 12,
    spd: 8,
    exp: 32,
    image: "/images/monster/wolfchieftain.webp",
    drops: [
      { kind: "material", materialId: "wolf_king_fang", chance: 0.0075 },
      { kind: "material", materialId: "giant_scale", chance: 0.12 },
      // 무리장이 익혔던 연환의 결 — 연환격 스킬북.
      { kind: "skill_book", bookId: "book_combo_strike", chance: 0.005 },
    ],
  },
  // 운향 협곡 보스 — region.boss 도전 버튼으로만 진입. 일반 인카운터 풀에선 제외.
  // 처치 시 거인 비늘 ×3 + 운봉석 ×2 확정 + 운봉 무기 4종 중 1 + 견갑 15% 학습 + 운봉령 2%.
  // 진입로(canyon→unhyang)는 처치가 아니라 onEngageFlag(peak_giant_engaged) — 한 번 맞붙으면
  // 열린다. 운향 의뢰 라인이 "맞붙어 진입 → 마을에서 레벨업 → 거인 처치" 순서로 짜여 있기 때문.
  // onDefeatFlag(peak_giant_defeated) 는 만월/백운 후속 대사·의뢰 게이트와 Chapter 룰용.
  "운봉의 거인": {
    name: "운봉의 거인",
    tags: ["golem"],
    image: "/images/monster/frostgiant.webp",
    hp: 420,
    atk: 25,
    def: 14,
    spd: 4,
    exp: 200,
    drops: [
      { kind: "material", materialId: "giant_scale", chance: 1, amount: 3 },
      { kind: "material", materialId: "unbong_ore", chance: 1, amount: 2 },
      {
        kind: "recipe_one_of",
        recipeIds: ["peak_sword", "peak_shield", "peak_spear", "peak_claw"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "peak_mantle", chance: 0.15 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "peak_relic", chance: 0.02 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.25,
    playerDefVulnerable: 0.2,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 3,
      message: "거인이 두 발을 단단히 박아 넣는다.",
    },
    onDefeatFlag: "peak_giant_defeated",
    onEngageFlag: "peak_giant_engaged",
    onDefeatTitleId: "giant_slayer",
    bonusAttackChancePct: 250,
  },
  // ── 다리 구간 — 운저 평원 (cloud_plain) ─────────────────────────────────
  들소: {
    name: "들소",
    tags: ["beast"],
    image: "/images/monster/bison.webp",
    hp: 320,
    atk: 25,
    def: 14,
    spd: 4,
    exp: 30,
    drops: [
      { kind: "material", materialId: "bison_hide", chance: 0.0225 },
      { kind: "equip", itemId: "bison_hide_armor", chance: 0.003 },
    ],
    skill: { kind: "heavy_blow", name: "들이받기", everyPhases: 3, multiplier: 1.5 },
  },
  "초원 매": {
    name: "초원 매",
    tags: ["beast"],
    image: "/images/monster/plainfalcon.webp",
    hp: 230,
    atk: 27,
    def: 8,
    spd: 11,
    evasionPct: 25,
    exp: 26,
    drops: [
      { kind: "material", materialId: "hawk_feather", chance: 0.03 },
      // 유실된 명품(unique) — 매의 발에 끼워져 있던 발톱 모양 쇳조각. atk +9 / dex +5.
      { kind: "equip", itemId: "sky_render_talon", chance: 0.00015 },
      // 그 발톱을 한 단계 끌어올리는 세공서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "azure_talon", chance: 0.003 },
    ],
    skill: { kind: "pierce", name: "급강하", armorPierce: 2 },
  },
  "떠돌이 약탈자": {
    name: "떠돌이 약탈자",
    tags: ["humanoid"],
    image: "/images/monster/rogue.webp",
    hp: 280,
    atk: 24,
    def: 11,
    spd: 6,
    exp: 28,
    drops: [
      { kind: "gold", amount: 1, chance: 0.08 },
      { kind: "material", materialId: "wilddog_fang", chance: 0.015 },
      // 핏물 절은 노트 — 광기 스킬북. 약탈자가 광폭화 호흡을 익혔던 흔적.
      { kind: "skill_book", bookId: "book_madness", chance: 0.003 },
    ],
    skill: { kind: "pierce", name: "급소 노리기", armorPierce: 3 },
  },
  // ── 다리 구간 — 잿빛 협로 (ashen_pass) ──────────────────────────────────
  "재먼지 골렘": {
    name: "재먼지 골렘",
    tags: ["golem"],
    image: "/images/monster/ashegolem.webp",
    hp: 420,
    atk: 30,
    def: 20,
    spd: 3,
    exp: 48,
    drops: [
      { kind: "material", materialId: "ash_stone", chance: 0.03 },
      { kind: "material", materialId: "ruin_fragment", chance: 0.0225 },
      { kind: "recipe", recipeId: "ashforged_blade", chance: 0.015 },
    ],
    skill: { kind: "brace", name: "잿가루 장막", damageReduction: 2 },
  },
  "잿빛 들개": {
    name: "잿빛 들개",
    tags: ["beast"],
    image: "/images/monster/ashewolf.webp",
    hp: 330,
    atk: 32,
    def: 12,
    spd: 8,
    exp: 43,
    drops: [
      { kind: "material", materialId: "ash_stone", chance: 0.015 },
      { kind: "material", materialId: "wilddog_fang", chance: 0.0225 },
    ],
    skill: { kind: "heavy_blow", name: "물어뜯기", everyPhases: 3, multiplier: 1.5 },
  },
  "불씨 도롱뇽": {
    name: "불씨 도롱뇽",
    tags: ["beast"],
    image: "/images/monster/embersalamander.webp",
    hp: 300,
    atk: 31,
    def: 14,
    spd: 9,
    exp: 41,
    drops: [
      { kind: "material", materialId: "ash_stone", chance: 0.015 },
      { kind: "material", materialId: "flame_scale", chance: 0.0075 },
    ],
    skill: { kind: "enrage", name: "발화", hpFraction: 0.5, atkBonus: 4 },
  },
  // ── 봉황령 (phoenix_ridge) ───────────────────────────────────────────────
  "불꽃 독수리": {
    name: "불꽃 독수리",
    tags: ["beast"],
    image: "/images/monster/flamehawk.webp",
    hp: 350,
    atk: 34,
    def: 12,
    spd: 12,
    evasionPct: 25,
    exp: 50,
    drops: [
      { kind: "material", materialId: "phoenix_feather", chance: 0.03 },
      { kind: "equip", itemId: "flame_eagle_cape", chance: 0.003 },
      { kind: "recipe", recipeId: "phoenix_flight_cape", chance: 0.004 },
    ],
    skill: { kind: "pierce", name: "강하 일격", armorPierce: 4 },
  },
  "화염 도마뱀": {
    name: "화염 도마뱀",
    tags: ["beast"],
    image: "/images/monster/firelizard.webp",
    hp: 420,
    atk: 32,
    def: 18,
    spd: 8,
    exp: 48,
    drops: [
      { kind: "material", materialId: "flame_scale", chance: 0.0225 },
    ],
    skill: { kind: "enrage", name: "화염 비늘 폭발", hpFraction: 0.4, atkBonus: 6 },
  },
  "산악 기사": {
    name: "산악 기사",
    tags: ["humanoid"],
    image: "/images/monster/mountainknight.webp",
    hp: 500,
    atk: 40,
    def: 22,
    spd: 6,
    exp: 60,
    drops: [
      { kind: "material", materialId: "flame_scale", chance: 0.0075 },
      { kind: "material", materialId: "giant_scale", chance: 0.006 },
    ],
    skill: { kind: "brace", name: "방패 막기", damageReduction: 3 },
  },
  // ── 화산 지대 (volcanic_badlands) ───────────────────────────────────────
  "용암 슬라임": {
    name: "용암 슬라임",
    tags: ["slime"],
    image: "/images/monster/lavaslime.webp",
    hp: 540,
    atk: 45,
    def: 24,
    spd: 4,
    exp: 69,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0045 },
      // 유실된 명품(unique) — 미처 못 녹인 거대 용암 핵. atk +11 / spd -2. 가장 희귀한 한 자루.
      { kind: "equip", itemId: "lava_core_maul", chance: 0.0001 },
      // 그 망치를 한 단계 끌어올리는 단조서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "lava_core_greatmaul", chance: 0.005 },
    ],
    skill: { kind: "heavy_blow", name: "용암 비산", everyPhases: 4, multiplier: 1.5 },
  },
  "화산 두꺼비": {
    name: "화산 두꺼비",
    tags: ["beast"],
    image: "/images/monster/flamefrog.webp",
    hp: 620,
    atk: 50,
    def: 30,
    spd: 3,
    exp: 78,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0075 },
    ],
    skill: { kind: "enrage", name: "용암 분출", hpFraction: 0.4, atkBonus: 8 },
  },
  "불꽃 골렘": {
    name: "불꽃 골렘",
    tags: ["golem"],
    image: "/images/monster/moltengolem.webp",
    hp: 680,
    atk: 54,
    def: 26,
    spd: 5,
    exp: 88,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0135 },
      { kind: "material", materialId: "ruin_fragment", chance: 0.0375 },
    ],
    skill: { kind: "heavy_blow", name: "과열 가동", everyPhases: 3, multiplier: 1.5 },
  },
  // 화산 지대 보스 — 처치 시 volcano_heart_defeated flag → 천공 성지 개방.
  "화산의 심장": {
    name: "화산의 심장",
    tags: ["golem"],
    image: "/images/monster/volcanicheart.webp",
    hp: 1200,
    atk: 72,
    def: 32,
    spd: 6,
    exp: 400,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 1, amount: 4 },
      { kind: "material", materialId: "phoenix_feather", chance: 1, amount: 3 },
      { kind: "material", materialId: "flame_scale", chance: 1, amount: 5 },
      {
        kind: "recipe_one_of",
        recipeIds: ["volcano_sword", "volcano_shield", "volcano_spear", "volcano_claw"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "volcano_armor", chance: 0.15 },
      { kind: "recipe", recipeId: "volcano_core", chance: 0.15 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 6,
      message: "화산의 심장이 붉게 달아오른다.",
    },
    onDefeatFlag: "volcano_heart_defeated",
    bonusAttackChancePct: 300,
  },
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
  // ── 5막 「빈 옥좌의 시대」 — 별빛 변종 (starfall_cave Lv100) ────────────────
  // 황제가 쓰러진 뒤 별빛이 옛 광맥으로 떨어진 자리. 깊은 동굴의 잡몹들이 별빛에 데워져
  // 변형된 채 다시 깨어났다. 각 변종은 base 몹 대비 hp/atk 대폭 강화 + 별빛 조각 드랍.
  // auraKind: "starfall" 분류는 5막 후속 PR(별빛 깃든 기예·도감 그룹) 에서 활용된다.
  "별빛 박쥐": {
    name: "별빛 박쥐",
    image: "/images/monster/starlitbat.webp",
    tags: ["beast"],
    hp: 2450,
    atk: 191,
    def: 78,
    spd: 11,
    evasionPct: 15,
    exp: 240,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.08 },
      { kind: "recipe_one_of", recipeIds: [...STARFALL_CAVE_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 20,
  },
  "별빛 동굴뱀": {
    name: "별빛 동굴뱀",
    image: "/images/monster/starlitcavesnake.webp",
    tags: ["beast"],
    hp: 2950,
    atk: 199,
    def: 91,
    spd: 8,
    exp: 250,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.09 },
      { kind: "recipe_one_of", recipeIds: [...STARFALL_CAVE_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 25,
  },
  "별빛 광물 골렘": {
    name: "별빛 광물 골렘",
    tags: ["golem"],
    hp: 3950,
    atk: 182,
    def: 121,
    spd: 4,
    exp: 270,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.12 },
      { kind: "recipe_one_of", recipeIds: [...STARFALL_CAVE_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 30,
  },
  // 별빛 광맥 수호자 — Ch 2 「깊은 동굴」 의 광맥 수호자가 별빛에 다시 데워져 되살아난
  // 5막 도입 보스. region.boss 도전 버튼으로 진입. 처치 시 Ch 26 「별이 떨어진 자리」 완료.
  // PR-A 시점에서는 별빛 조각 드랍만 — 별빛 깃든 기예 / 별빛 무구 라인은 후속 PR.
  "별빛 광맥 수호자": {
    name: "별빛 광맥 수호자",
    tags: ["golem"],
    hp: 7150,
    atk: 202,
    def: 116,
    spd: 5,
    exp: 1400,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 1, amount: 4 },
      { kind: "material", materialId: "mana_crystal", chance: 1, amount: 3 },
      // 부여서 분배 — 폭주/채집/보호막/각성/흡혈 (셔플 결과 고정).
      { kind: "material", materialId: "enchant_berserk", chance: 0.04 },
      { kind: "material", materialId: "enchant_harvest", chance: 0.04 },
      { kind: "material", materialId: "enchant_barrier", chance: 0.04 },
      { kind: "material", materialId: "enchant_awaken", chance: 0.04 },
      { kind: "material", materialId: "enchant_lifesteal", chance: 0.04 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 14,
      message: "수호자의 광맥 안쪽에서 별빛이 한 점 더 점화된다.",
    },
    skill: { kind: "pierce", name: "별빛 결", armorPierce: 8 },
    auraKind: "starfall",
    onDefeatFlag: "starfall_warden_felled",
    bonusAttackChancePct: 180,
  },
  // ── 5막 PR-B1 — 별빛 협곡 (starlit_canyon Lv102) ──────────────────────────
  // Ch 25 직후 별빛이 운무 협곡에도 떨어졌다. 절벽 늑대·돌풍 정령·무리장이 별빛에
  // 데워져 다시 깨어났고, 협곡 깊은 자리에 운봉의 거인의 *잔영* 이 잠들어 있다.
  // 잔영은 협동 보스로만 등장 (운봉의 거인 패턴 유지) — region.boss 미설정.
  "별빛 절벽 늑대": {
    name: "별빛 절벽 늑대",
    tags: ["beast"],
    hp: 2800,
    atk: 218,
    def: 87,
    spd: 10,
    evasionPct: 15,
    exp: 250,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.08 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_CANYON_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 25,
  },
  "별빛 돌풍 정령": {
    name: "별빛 돌풍 정령",
    tags: ["spirit"],
    hp: 3050,
    atk: 228,
    def: 82,
    spd: 9,
    evasionPct: 18,
    exp: 260,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.09 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_CANYON_RECIPES], chance: 0.03 },
    ],
    skill: { kind: "pierce", name: "별빛 결풍", armorPierce: 6 },
    auraKind: "starfall",
    bonusAttackChancePct: 30,
  },
  "별빛 늑대 무리장": {
    name: "별빛 늑대 무리장",
    tags: ["beast"],
    hp: 3850,
    atk: 225,
    def: 114,
    spd: 7,
    exp: 280,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.12 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_CANYON_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 40,
  },
  // 별빛 거인 잔영 — 운봉의 거인의 별빛 잔영. region.boss 도전 버튼으로 진입 (starlit_canyon).
  // 처치 시 별빛 조각 ×6 + 거인 비늘 ×4 + 운봉석 ×3 + 거인의 멍에 1% 굴림.
  "별빛 거인 잔영": {
    name: "별빛 거인 잔영",
    tags: ["golem"],
    hp: 9000,
    atk: 231,
    def: 129,
    spd: 6,
    exp: 1800,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 1, amount: 6 },
      { kind: "material", materialId: "giant_scale", chance: 1, amount: 4 },
      { kind: "material", materialId: "unbong_ore", chance: 1, amount: 3 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "giant_yoke", chance: 0.01 },
      // 부여서 분배 — 반사/독공/가드/강타/관통 (셔플 결과 고정).
      { kind: "material", materialId: "enchant_reflect", chance: 0.04 },
      { kind: "material", materialId: "enchant_venom", chance: 0.04 },
      { kind: "material", materialId: "enchant_guard", chance: 0.04 },
      { kind: "material", materialId: "enchant_might", chance: 0.04 },
      { kind: "material", materialId: "enchant_pierce", chance: 0.04 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.45,
      defBonus: 14,
      message: "잔영이 별빛 한 점을 가슴에 끌어들이며 두 발을 박아 넣는다.",
    },
    skill: { kind: "heavy_blow", name: "별빛 짓밟기", everyPhases: 3, multiplier: 1.7 },
    auraKind: "starfall",
    onDefeatFlag: "starlit_giant_quelled",
    onDefeatTitleId: "starlit_giant_breaker",
    bonusAttackChancePct: 300,
  },
  // ── 5막 PR-B2 — 별빛 산호초 (starlit_reef Lv104) ─────────────────────────
  // Ch 25 직후 별빛이 산호초 섬에도 떨어졌다. 사이렌·약탈자·산호 골렘이 별빛에 데워져
  // 다시 깨어났고, 수심의 것의 *메아리* 가 별빛을 두른 채 협동 보스로 등장.
  "별빛 산호초 사이렌": {
    name: "별빛 산호초 사이렌",
    tags: ["spirit"],
    hp: 3000,
    atk: 238,
    def: 83,
    spd: 8,
    evasionPct: 22,
    exp: 260,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.09 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_REEF_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 25,
  },
  "별빛 갑각 약탈자": {
    name: "별빛 갑각 약탈자",
    tags: ["humanoid"],
    hp: 3600,
    atk: 245,
    def: 100,
    spd: 7,
    exp: 270,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.10 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_REEF_RECIPES], chance: 0.03 },
    ],
    skill: { kind: "heavy_blow", name: "별빛 작살", everyPhases: 3, multiplier: 1.7 },
    auraKind: "starfall",
    bonusAttackChancePct: 35,
  },
  "별빛 가시 산호 골렘": {
    name: "별빛 가시 산호 골렘",
    tags: ["golem"],
    hp: 4450,
    atk: 223,
    def: 132,
    spd: 4,
    exp: 290,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.12 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_REEF_RECIPES], chance: 0.03 },
    ],
    skill: { kind: "brace", name: "별빛 가시 껍질", damageReduction: 6 },
    auraKind: "starfall",
    bonusAttackChancePct: 40,
  },
  // 수심의 메아리 — 수심의 것의 별빛 잔영. region.boss 도전 버튼으로 진입 (starlit_reef).
  // 처치 시 별빛 조각 ×6 + 심해 비늘 ×4 + 산호 가시 ×4 + 수심의 메아리 보주 1% 굴림.
  "수심의 메아리": {
    name: "수심의 메아리",
    tags: ["beast", "spirit"],
    hp: 10250,
    atk: 252,
    def: 126,
    spd: 6,
    exp: 1900,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 1, amount: 6 },
      { kind: "material", materialId: "deep_scale", chance: 1, amount: 4 },
      { kind: "material", materialId: "coral_spine", chance: 1, amount: 4 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "deep_orb", chance: 0.01 },
      // 부여서 분배 — 회피/통찰/치명타/행운/처형 (셔플 결과 고정).
      { kind: "material", materialId: "enchant_dodge", chance: 0.04 },
      { kind: "material", materialId: "enchant_insight", chance: 0.04 },
      { kind: "material", materialId: "enchant_critical", chance: 0.04 },
      { kind: "material", materialId: "enchant_fortune", chance: 0.04 },
      { kind: "material", materialId: "enchant_execute", chance: 0.04 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 14,
      message: "메아리가 한 번 더 몸을 둥글게 만다. 별빛이 비늘 사이로 새어 든다.",
    },
    skill: { kind: "enrage", name: "별빛 소용돌이", hpFraction: 0.35, atkBonus: 16 },
    auraKind: "starfall",
    onDefeatFlag: "starlit_deep_quelled",
    onDefeatTitleId: "starlit_depth_breaker",
    bonusAttackChancePct: 220,
  },
  // ── 5막 PR-B2 — 별빛 성채 (starlit_keep Lv106) ───────────────────────────
  // Ch 25 직후 별빛이 옛 변경 성채에도 떨어졌다. 까마귀·약탈자·자동인형이 별빛에
  // 데워져 다시 깨어났고, 성문지기 자동인형의 *잔영* 이 별빛을 두른 채 협동 보스로 등장.
  "별빛 폐성벽 까마귀": {
    name: "별빛 폐성벽 까마귀",
    tags: ["beast"],
    hp: 2850,
    atk: 260,
    def: 86,
    spd: 11,
    evasionPct: 20,
    exp: 270,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.08 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_KEEP_RECIPES], chance: 0.03 },
    ],
    auraKind: "starfall",
    bonusAttackChancePct: 25,
  },
  "별빛 탈영 약탈자": {
    name: "별빛 탈영 약탈자",
    tags: ["humanoid"],
    hp: 3500,
    atk: 269,
    def: 106,
    spd: 7,
    exp: 285,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.10 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_KEEP_RECIPES], chance: 0.03 },
    ],
    skill: { kind: "heavy_blow", name: "별빛 투창", everyPhases: 3, multiplier: 1.7 },
    auraKind: "starfall",
    bonusAttackChancePct: 35,
  },
  "별빛 녹슨 자동인형": {
    name: "별빛 녹슨 자동인형",
    tags: ["golem"],
    hp: 4950,
    atk: 231,
    def: 150,
    spd: 3,
    exp: 305,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 0.12 },
      { kind: "recipe_one_of", recipeIds: [...STARLIT_KEEP_RECIPES], chance: 0.03 },
    ],
    skill: { kind: "brace", name: "별빛 장갑판", damageReduction: 6 },
    auraKind: "starfall",
    bonusAttackChancePct: 40,
  },
  // 성문지기 잔영 — 옛 성문지기의 별빛 잔영. region.boss 도전 버튼으로 진입 (starlit_keep).
  // 처치 시 별빛 조각 ×7 + 녹슨 쇳조각 ×5 + 옛 군기 조각 ×4 + 성문의 빗장 1% 굴림.
  "성문지기 잔영": {
    name: "성문지기 잔영",
    image: "/images/monster/gateguard.webp",
    tags: ["golem"],
    hp: 11700,
    atk: 267,
    def: 145,
    spd: 5,
    exp: 2000,
    drops: [
      { kind: "material", materialId: "starfall_shard", chance: 1, amount: 7 },
      { kind: "material", materialId: "scrap_iron", chance: 1, amount: 5 },
      { kind: "material", materialId: "war_banner_scrap", chance: 1, amount: 4 },
      // 옛 coop legend 1% 시절 unique — 솔로 region.boss 전환 후 그대로 유지.
      { kind: "equip", itemId: "gate_bar", chance: 0.01 },
      // 부여서 분배 — 재생/파괴/인내/신속/풍요 (셔플 결과 고정).
      { kind: "material", materialId: "enchant_regen", chance: 0.04 },
      { kind: "material", materialId: "enchant_breaker", chance: 0.04 },
      { kind: "material", materialId: "enchant_endure", chance: 0.04 },
      { kind: "material", materialId: "enchant_swift", chance: 0.04 },
      { kind: "material", materialId: "enchant_bounty", chance: 0.04 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.45,
      defBonus: 15,
      message: "잔영이 별빛 한 점을 가슴 갑주에 끌어들이며 빗장을 한 번 더 들어 올린다.",
    },
    skill: { kind: "heavy_blow", name: "별빛 빗장", everyPhases: 3, multiplier: 1.7 },
    auraKind: "starfall",
    onDefeatFlag: "starlit_gate_quelled",
    onDefeatTitleId: "starlit_gate_breaker",
    bonusAttackChancePct: 220,
  },
  // 훈련용 더미 — 일반 인카운터 풀에 들어가지 않는 스파링 전용 몬스터.
  // 보상/패널티 모두 우회 (SparringView 가 onBattleEnd 를 호출하지 않음).
  "훈련용 허수아비": {
    name: "훈련용 허수아비",
    tags: ["humanoid"],
    image: "/images/monster/scarecrow.webp",
    hp: 500000,
    atk: 4,
    def: 2,
    spd: 1,
    exp: 0,
  },
};

export const SPAR_DUMMY_ID = "훈련용 허수아비" as const;
