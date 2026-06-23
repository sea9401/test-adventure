import { STARFALL_CAVE_RECIPES, STARLIT_CANYON_RECIPES, STARLIT_REEF_RECIPES, STARLIT_KEEP_RECIPES } from "./types";
import type { Monster } from "./types";

export const STARLIT_MONSTERS: Record<string, Monster> = {
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
    archetype: "evasive",
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
    archetype: "caster",
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
  // 6막 「별을 잊은 것」 — 잊힌 봉인의 상시 협동(월드) 레이드 보스. coop maxHp 는 coop/data.ts.
  // 시그니처 기믹 = 한기(chill): 적중마다 한기 스택, threshold 이상이면 적 페이즈마다 스택당
  // 고정 피해(DEF·보호막 무시). 저HP(deepHpFraction) 에선 누적 2배 = "깊은 한기" 피날레.
  // 무한 탱킹을 막는 시간압 — 별빛도 온기도 잊은 것의 정체. 처치 플래그/칭호는 coop 경로
  // (COOP_BOSSES.onDefeatFlag + rewards.legend.titleId)로 처리하므로 monster 엔 안 둔다.
  // 수치는 잔영(Lv106) 위 한 칸 기준 초안 — 밸런스 튜닝 포인트. 이미지는 추후(생략 안전).
  "별을 잊은 것": {
    name: "별을 잊은 것",
    tags: ["golem"],
    hp: 24000,
    atk: 340,
    def: 180,
    spd: 5,
    exp: 4000,
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.28,
    phaseTrigger: {
      hpFraction: 0.5,
      defBonus: 20,
      message: "봉인의 결이 갈라지며, 잊힌 것이 처음으로 숨을 깊게 들이쉰다. 사위의 온기가 빨려 든다.",
    },
    skill: {
      kind: "chill",
      name: "망각의 한기",
      perHit: 1,
      dmgPerStack: 45,
      threshold: 4,
      deepHpFraction: 0.25,
      // 스택 상한 6 — 무한 누적 폭주 방지. DoT 최대 45×6=270/페이즈로 고정(4스택부터 발동).
      maxStacks: 6,
      // DEF 30% 부분감산 — 6스택 270 기준, DEF 200 이면 270-60=210(-22%). 탱에게 보람을 주되
      // 무효화(DEF ~900 필요)는 막아 시간압 취지 유지.
      defMitigationFraction: 0.3,
      // 슬로우 — 스택당 회피 -2%p (추울수록 굼떠짐). 6스택이면 -12%p. 조금만.
      evasionPenaltyPerStack: 2,
    },
    auraKind: "starfall",
    // 4대 확정(1 + 3) — 잔영(220, 3~4대) 위 한 칸. 타격마다 한기 +1 이라 한 페이즈에 +4 스택.
    bonusAttackChancePct: 300,
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
