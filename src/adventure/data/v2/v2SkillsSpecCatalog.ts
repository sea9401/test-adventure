// v2 계파 스킬 카탈로그 — 12계파 × 3 = 36종. 스킬 재설계(docs/v2-skill-system-plan.md).
//
// 계파 패시브(시그니처)·직업특성과 별개의 액티브 레이어. 원칙: 스킬은 패시브를 복제하지
// 않고 보완(버스트·제압·페이오프). 차수 성장 = 해금 1/차수(2/3/4) + baseFlatByTier flat 성장.
// procChance = §4 성능 밸런스 반영(강계파 낮음·약계파 높음·궁사 명중 플레이버).
// 신규 effect kind(def/vit scaling·hpCostDamage·healToDamage·executeDamage·
//   stackPayoffDamage·enemyVuln)는 엔진 PR2-B 배선. 수치는 가안(sim 캘리브).

import type { V2SkillDefinition, V2SkillEffect } from "./v2Skills";
import { V2_DOT_PRESETS } from "./statusEffects";

export type V2SpecSkillId =
  // 광검
  | "v2s_gwang_greatcleave" | "v2s_gwang_skysplit" | "v2s_gwang_resolve"
  // 기사
  | "v2s_knight_shieldbash" | "v2s_knight_bulwark" | "v2s_knight_taunt"
  // 검투사
  | "v2s_gladiator_frenzy" | "v2s_gladiator_laceration" | "v2s_gladiator_exsanguinate"
  // 금강
  | "v2s_cheolsan_arhat" | "v2s_cheolsan_stomp" | "v2s_cheolsan_smash"
  // 혈권
  | "v2s_gigong_drain" | "v2s_gigong_multistrike" | "v2s_gigong_bloodlet"
  // 연환
  | "v2s_yeonhwan_barrage" | "v2s_yeonhwan_focus" | "v2s_yeonhwan_skybreak"
  // 마도사
  | "v2s_arcane_meteor" | "v2s_arcane_burst" | "v2s_arcane_detonate"
  // 워메이지
  | "v2s_battlemage_rapidcast" | "v2s_battlemage_chain" | "v2s_battlemage_blast"
  // 사제
  | "v2s_cleric_smite" | "v2s_cleric_judgment" | "v2s_cleric_condemn"
  // 궁사
  | "v2s_archery_powershot" | "v2s_archery_explosivearrow" | "v2s_archery_bind"
  // 자객
  | "v2s_assassin_darkstrike" | "v2s_assassin_execute" | "v2s_assassin_twinstrike"
  // 독사
  | "v2s_venom_poisonslash" | "v2s_venom_poisoncloud" | "v2s_venom_detonate";

type Tri = readonly [number, number, number];
// 차수 flat 데미지(계파 스킬 — baseFlatByTier).
const dmgT = (statCoef: number, byTier: Tri, scaling?: "physical" | "magic" | "def" | "vit"): V2SkillEffect => ({
  kind: "damage", statCoef, baseFlatByTier: byTier, ...(scaling ? { scaling } : {}),
});
const hitsT = (n: number, statCoef: number, byTier: Tri, scaling?: "physical" | "magic"): V2SkillEffect[] =>
  Array.from({ length: n }, () => dmgT(statCoef, byTier, scaling));

export const V2_SPEC_SKILLS: Record<V2SpecSkillId, V2SkillDefinition> = {
  // ═══ 광검(극딜) — proc 낮음(강계파) ═══
  v2s_gwang_greatcleave: {
    id: "v2s_gwang_greatcleave", name: "대참격", stat: "str", category: "attack", tier: 3,
    description: "온 힘을 실어 내려친다.", mpCost: 38, cooldown: 0, procChance: 10,
    effects: [dmgT(1.0, [200, 280, 360])],
  },
  v2s_gwang_skysplit: {
    id: "v2s_gwang_skysplit", name: "파천검", stat: "str", category: "attack", tier: 3,
    description: "하늘을 가르는 두 번의 참격.", mpCost: 34, cooldown: 0, procChance: 22,
    effects: hitsT(2, 0.5, [65, 90, 115]),
  },
  v2s_gwang_resolve: {
    id: "v2s_gwang_resolve", name: "결전", stat: "str", category: "buff", tier: 3,
    description: "모든 것을 건 폭주 태세.", mpCost: 30, cooldown: 0, procChance: 47,
    effects: [{ kind: "selfBuff", stat: "str", pct: 20, turns: 2 }],
  },

  // ═══ 기사(딜탱) — proc 높음(약계파) ═══
  v2s_knight_shieldbash: {
    id: "v2s_knight_shieldbash", name: "방패 가격", stat: "vit", category: "attack", tier: 3,
    description: "방패로 짓이긴다. 방어가 단단할수록 아프다.", mpCost: 34, cooldown: 0, procChance: 38,
    effects: [dmgT(2.5, [150, 210, 270], "def")],
  },
  v2s_knight_bulwark: {
    id: "v2s_knight_bulwark", name: "방벽", stat: "vit", category: "buff", tier: 3,
    description: "철벽 태세로 버틴다.", mpCost: 28, cooldown: 0, procChance: 60,
    effects: [{ kind: "selfBuff", stat: "vit", pct: 25, turns: 3 }],
  },
  v2s_knight_taunt: {
    id: "v2s_knight_taunt", name: "도발", stat: "vit", category: "debuff", tier: 3,
    description: "적을 자극해 공격력을 떨어뜨린다.", mpCost: 26, cooldown: 0, procChance: 60,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 25, turns: 3 }],
  },

  // ═══ 검투사(출혈) — proc 낮음(강계파) ═══
  v2s_gladiator_frenzy: {
    id: "v2s_gladiator_frenzy", name: "난자", stat: "str", category: "attack", tier: 3,
    description: "세검으로 난자해 피를 본다.", mpCost: 32, cooldown: 0, procChance: 30,
    effects: [...hitsT(4, 0.3, [25, 35, 45]), { kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 2 }],
  },
  v2s_gladiator_laceration: {
    id: "v2s_gladiator_laceration", name: "자상", stat: "str", category: "attack", tier: 3,
    description: "깊은 자상으로 대량 출혈시킨다.", mpCost: 30, cooldown: 0, procChance: 35,
    effects: [{ kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 4, turns: 4 }],
  },
  v2s_gladiator_exsanguinate: {
    id: "v2s_gladiator_exsanguinate", name: "참절", stat: "str", category: "attack", tier: 3,
    description: "쌓인 출혈을 끊어 폭발시킨다.", mpCost: 34, cooldown: 0, procChance: 10,
    effects: [{ kind: "stackPayoffDamage", tag: "bleed", statCoef: 0.5, baseFlatByTier: [60, 80, 100], perStackFlat: 50 }],
  },

  // ═══ 금강(회피탱) — proc 높음(약계파) ═══
  v2s_cheolsan_arhat: {
    id: "v2s_cheolsan_arhat", name: "나한권", stat: "vit", category: "attack", tier: 3,
    description: "단단한 육체로 짓이긴다.", mpCost: 34, cooldown: 0, procChance: 42,
    effects: [dmgT(1.5, [180, 250, 320], "vit")],
  },
  v2s_cheolsan_stomp: {
    id: "v2s_cheolsan_stomp", name: "진각", stat: "vit", category: "debuff", tier: 3,
    description: "내딛어 적을 제압한다.", mpCost: 26, cooldown: 0, procChance: 60,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 30, turns: 3 }],
  },
  v2s_cheolsan_smash: {
    id: "v2s_cheolsan_smash", name: "금강쇄", stat: "str", category: "attack", tier: 3,
    description: "금강의 기운을 실은 강타.", mpCost: 36, cooldown: 0, procChance: 27,
    effects: [dmgT(1.0, [200, 280, 360])],
  },

  // ═══ 혈권(흡혈) — proc 보통 ═══
  v2s_gigong_drain: {
    id: "v2s_gigong_drain", name: "혈갈권", stat: "str", category: "attack", tier: 3,
    description: "강타. 흡혈 패시브가 피를 빨아들인다.", mpCost: 36, cooldown: 0, procChance: 15,
    effects: [dmgT(1.0, [200, 280, 360])],
  },
  v2s_gigong_multistrike: {
    id: "v2s_gigong_multistrike", name: "연혈격", stat: "str", category: "attack", tier: 3,
    description: "네 번 두들겨 피를 본다.", mpCost: 32, cooldown: 0, procChance: 40,
    effects: hitsT(4, 0.3, [40, 55, 70]),
  },
  v2s_gigong_bloodlet: {
    id: "v2s_gigong_bloodlet", name: "사혈격", stat: "str", category: "attack", tier: 3,
    description: "제 피를 태워 폭발적 일격을 날린다.", mpCost: 0, cooldown: 0, procChance: 15,
    effects: [{ kind: "hpCostDamage", pctCurrentHp: 10, statCoef: 1.0, baseFlatByTier: [150, 210, 270], soakRatio: 1.0 }],
  },

  // ═══ 연환(콤보) — proc 낮음(강계파) ═══
  v2s_yeonhwan_barrage: {
    id: "v2s_yeonhwan_barrage", name: "연환 폭격", stat: "str", category: "attack", tier: 3,
    description: "여섯 번 몰아치는 연환.", mpCost: 34, cooldown: 0, procChance: 32,
    effects: hitsT(6, 0.2, [25, 35, 45]),
  },
  v2s_yeonhwan_focus: {
    id: "v2s_yeonhwan_focus", name: "연환 집중", stat: "str", category: "buff", tier: 3,
    description: "정신을 집중해 치명률을 높인다.", mpCost: 30, cooldown: 0, procChance: 47,
    effects: [{ kind: "selfBuffPct", target: "crit", pct: 20, turns: 3 }],
  },
  v2s_yeonhwan_skybreak: {
    id: "v2s_yeonhwan_skybreak", name: "천붕권", stat: "str", category: "attack", tier: 3,
    description: "하늘을 무너뜨리는 일권.", mpCost: 38, cooldown: 0, procChance: 10,
    effects: [dmgT(1.2, [220, 300, 380])],
  },

  // ═══ 마도사(버스트 누커) — proc 보통 ═══
  v2s_arcane_meteor: {
    id: "v2s_arcane_meteor", name: "메테오", stat: "int", category: "attack", tier: 3,
    description: "운석을 떨어뜨린다.", mpCost: 44, cooldown: 0, procChance: 15,
    effects: [dmgT(1.0, [220, 300, 380], "magic")],
  },
  v2s_arcane_burst: {
    id: "v2s_arcane_burst", name: "마력 분출", stat: "int", category: "attack", tier: 3,
    description: "마력을 네 갈래로 분출한다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: hitsT(4, 0.35, [50, 70, 90], "magic"),
  },
  v2s_arcane_detonate: {
    id: "v2s_arcane_detonate", name: "비전 작렬", stat: "int", category: "attack", tier: 3,
    description: "적에 쌓인 마법취약을 터뜨린다.", mpCost: 40, cooldown: 0, procChance: 20,
    effects: [{ kind: "stackPayoffDamage", tag: "magicVuln", statCoef: 0.5, baseFlatByTier: [120, 160, 200], perStackFlat: 40, scaling: "magic" }],
  },

  // ═══ 워메이지(지속 연사) — proc 보통(+패시브 15) ═══
  v2s_battlemage_rapidcast: {
    id: "v2s_battlemage_rapidcast", name: "마력 속사", stat: "int", category: "attack", tier: 3,
    description: "저위력 마력탄을 난사한다.", mpCost: 16, cooldown: 0, procChance: 45,
    effects: [dmgT(0.5, [60, 85, 110], "magic")],
  },
  v2s_battlemage_chain: {
    id: "v2s_battlemage_chain", name: "연쇄 마탄", stat: "int", category: "attack", tier: 3,
    description: "마력탄이 네 번 연쇄한다.", mpCost: 28, cooldown: 0, procChance: 40,
    effects: hitsT(4, 0.3, [35, 50, 65], "magic"),
  },
  v2s_battlemage_blast: {
    id: "v2s_battlemage_blast", name: "마력 작렬", stat: "int", category: "attack", tier: 3,
    description: "응축한 마력을 작렬시킨다.", mpCost: 36, cooldown: 0, procChance: 30,
    effects: [dmgT(1.0, [200, 280, 360], "magic")],
  },

  // ═══ 사제(탱키 서포트) — proc 높음(약계파) ═══
  v2s_cleric_smite: {
    id: "v2s_cleric_smite", name: "신성 강타", stat: "int", category: "attack", tier: 3,
    description: "치유의 빛으로 자신을 회복하고 그만큼 적을 친다.", mpCost: 36, cooldown: 0, procChance: 42,
    effects: [{ kind: "healToDamage", healStatCoef: 0.35, healFlatByTier: [90, 120, 150], damageRatio: 1.0, scaling: "magic" }],
  },
  v2s_cleric_judgment: {
    id: "v2s_cleric_judgment", name: "천벌", stat: "int", category: "attack", tier: 3,
    description: "하늘의 벌을 내린다.", mpCost: 44, cooldown: 0, procChance: 27,
    effects: [dmgT(1.2, [200, 280, 360], "magic")],
  },
  v2s_cleric_condemn: {
    id: "v2s_cleric_condemn", name: "정죄", stat: "int", category: "attack", tier: 3,
    description: "죄를 묻는 빛으로 치고 약화시킨다.", mpCost: 32, cooldown: 0, procChance: 60,
    effects: [dmgT(0.7, [120, 160, 200], "magic"), { kind: "enemyDebuff", stat: "str", pct: 25, turns: 3 }],
  },

  // ═══ 궁사(다중사격) — 명중 플레이버 proc 높음 ═══
  v2s_archery_powershot: {
    id: "v2s_archery_powershot", name: "강궁", stat: "str", category: "attack", tier: 3,
    description: "활을 한껏 당겨 쏜다.", mpCost: 38, cooldown: 0, procChance: 27,
    effects: [dmgT(1.2, [220, 300, 380])],
  },
  v2s_archery_explosivearrow: {
    id: "v2s_archery_explosivearrow", name: "폭발 화살", stat: "str", category: "attack", tier: 3,
    description: "폭발하는 화살로 태운다.", mpCost: 36, cooldown: 0, procChance: 35,
    effects: [dmgT(1.0, [180, 250, 320]), { kind: "dot", ...V2_DOT_PRESETS.연소 }],
  },
  v2s_archery_bind: {
    id: "v2s_archery_bind", name: "속박 사격", stat: "str", category: "debuff", tier: 3,
    description: "발을 묶어 약점을 노출시킨다. 받는 피해가 늘어난다.", mpCost: 26, cooldown: 0, procChance: 30,
    effects: [{ kind: "enemyVuln", pct: 30, turns: 3 }],
  },

  // ═══ 자객(크리/암살) — proc 보통 ═══
  v2s_assassin_darkstrike: {
    id: "v2s_assassin_darkstrike", name: "암격", stat: "str", category: "attack", tier: 3,
    description: "어둠을 타고 급소를 친다.", mpCost: 38, cooldown: 0, procChance: 15,
    effects: [dmgT(1.2, [220, 300, 380])],
  },
  v2s_assassin_execute: {
    id: "v2s_assassin_execute", name: "처단", stat: "str", category: "attack", tier: 3,
    description: "빈사의 적을 처단한다.", mpCost: 36, cooldown: 0, procChance: 18,
    effects: [{ kind: "executeDamage", statCoef: 1.0, baseFlatByTier: [180, 250, 320], hpThresholdPct: 30, bonusMult: 2.0 }],
  },
  v2s_assassin_twinstrike: {
    id: "v2s_assassin_twinstrike", name: "쌍격", stat: "str", category: "attack", tier: 3,
    description: "쌍단검으로 두 번 찌른다.", mpCost: 32, cooldown: 0, procChance: 30,
    effects: hitsT(2, 0.6, [70, 95, 120]),
  },

  // ═══ 독사(중독) — proc 낮음(강계파) ═══
  v2s_venom_poisonslash: {
    id: "v2s_venom_poisonslash", name: "독참", stat: "str", category: "attack", tier: 3,
    description: "독 묻은 칼로 베어 중독시킨다.", mpCost: 32, cooldown: 0, procChance: 30,
    effects: [...hitsT(4, 0.3, [30, 40, 50]), { kind: "dot", ...V2_DOT_PRESETS.중독, stacks: 2 }],
  },
  v2s_venom_poisoncloud: {
    id: "v2s_venom_poisoncloud", name: "독무", stat: "str", category: "attack", tier: 3,
    description: "독 안개로 대량 중독시킨다.", mpCost: 30, cooldown: 0, procChance: 35,
    effects: [{ kind: "dot", ...V2_DOT_PRESETS.중독, stacks: 4 }],
  },
  v2s_venom_detonate: {
    id: "v2s_venom_detonate", name: "중독 폭발", stat: "str", category: "attack", tier: 3,
    description: "쌓인 독을 터뜨린다.", mpCost: 36, cooldown: 0, procChance: 10,
    effects: [{ kind: "stackPayoffDamage", tag: "poison", statCoef: 0.5, baseFlatByTier: [80, 110, 140], perStackFlat: 50 }],
  },
};

// 직군 → 그 직군 3계파의 스킬 9종 (학습 풀 — PR1-3 느슨 게이팅: 직군 단위 학습.
// "내 계파만 / 차수당 1해금" 엄격 게이팅은 후속 정제. spec id 는 v2JobSpecs 와 일치.
export const V2_SPEC_SKILLS_BY_JOB: Record<string, readonly V2SpecSkillId[]> = {
  warrior: [
    "v2s_gwang_greatcleave", "v2s_gwang_skysplit", "v2s_gwang_resolve",
    "v2s_knight_shieldbash", "v2s_knight_bulwark", "v2s_knight_taunt",
    "v2s_gladiator_frenzy", "v2s_gladiator_laceration", "v2s_gladiator_exsanguinate",
  ],
  martial: [
    "v2s_cheolsan_arhat", "v2s_cheolsan_stomp", "v2s_cheolsan_smash",
    "v2s_gigong_drain", "v2s_gigong_multistrike", "v2s_gigong_bloodlet",
    "v2s_yeonhwan_barrage", "v2s_yeonhwan_focus", "v2s_yeonhwan_skybreak",
  ],
  mage: [
    "v2s_arcane_meteor", "v2s_arcane_burst", "v2s_arcane_detonate",
    "v2s_battlemage_rapidcast", "v2s_battlemage_chain", "v2s_battlemage_blast",
    "v2s_cleric_smite", "v2s_cleric_judgment", "v2s_cleric_condemn",
  ],
  rogue: [
    "v2s_archery_powershot", "v2s_archery_explosivearrow", "v2s_archery_bind",
    "v2s_assassin_darkstrike", "v2s_assassin_execute", "v2s_assassin_twinstrike",
    "v2s_venom_poisonslash", "v2s_venom_poisoncloud", "v2s_venom_detonate",
  ],
};

// 계파 id → 계파 스킬 id 3종 (해금/학습 게이팅 — 차수당 1개 해금). spec id 는 v2JobSpecs 와 일치.
export const V2_SPEC_SKILLS_BY_SPEC: Record<string, readonly V2SpecSkillId[]> = {
  gwang: ["v2s_gwang_greatcleave", "v2s_gwang_skysplit", "v2s_gwang_resolve"],
  knight: ["v2s_knight_shieldbash", "v2s_knight_bulwark", "v2s_knight_taunt"],
  gladiator: ["v2s_gladiator_frenzy", "v2s_gladiator_laceration", "v2s_gladiator_exsanguinate"],
  cheolsan: ["v2s_cheolsan_arhat", "v2s_cheolsan_stomp", "v2s_cheolsan_smash"],
  gigong: ["v2s_gigong_drain", "v2s_gigong_multistrike", "v2s_gigong_bloodlet"],
  yeonhwan: ["v2s_yeonhwan_barrage", "v2s_yeonhwan_focus", "v2s_yeonhwan_skybreak"],
  arcane: ["v2s_arcane_meteor", "v2s_arcane_burst", "v2s_arcane_detonate"],
  battlemage: ["v2s_battlemage_rapidcast", "v2s_battlemage_chain", "v2s_battlemage_blast"],
  cleric: ["v2s_cleric_smite", "v2s_cleric_judgment", "v2s_cleric_condemn"],
  archery: ["v2s_archery_powershot", "v2s_archery_explosivearrow", "v2s_archery_bind"],
  assassin: ["v2s_assassin_darkstrike", "v2s_assassin_execute", "v2s_assassin_twinstrike"],
  venom: ["v2s_venom_poisonslash", "v2s_venom_poisoncloud", "v2s_venom_detonate"],
};
