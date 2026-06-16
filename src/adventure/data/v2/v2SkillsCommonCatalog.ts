// v2 공용 스킬 카탈로그 — 4직군 공용 액티브(직군당 5, 마력구·예기 패시브 제외 = 18종).
// 스킬 시스템 재설계(docs/v2-skill-system-plan.md). 평타 척추 + 소수 스킬.
//
// 데미지 = 플랫강화(스탯×~1.0 + 큰 flat) — 예측·off스탯 floor. 다단 = damage effect N개.
// DoT/디버프는 통합 프리셋(V2_DOT_PRESETS/V2_DEBUFF_PRESETS) spread — 다이얼 일관.
// procChance·mpCost 는 설계 문서값(저-proc = 평타 위주). cooldown 0(proc 가 게이트).
// 엔진 핸들러(shield/manaRestore/selfRegen/selfBuffPct/heal pctLostHp)는 PR2-B 배선.
//
// 학습/장착 게이팅(어느 직군이 무엇을)은 learn 라우트 + V2_COMMON_SKILLS_BY_JOB(아래).

import type { V2SkillDefinition, V2SkillEffect } from "./v2Skills";
import type { V2Class } from "./classes";
import { V2_DOT_PRESETS, V2_DEBUFF_PRESETS } from "./statusEffects";

// 공용 스킬 id — 직군 prefix(v2c_<job>_<slug>). 마력구/예기는 패시브(derive)라 여기 없음.
export type V2CommonSkillId =
  // 전사
  | "v2c_warrior_strike" // 강타
  | "v2c_warrior_flurry" // 난격
  | "v2c_warrior_sunder" // 파쇄
  | "v2c_warrior_warcry" // 함성
  | "v2c_warrior_endure" // 불굴
  // 무도가
  | "v2c_martial_burst" // 붕권
  | "v2c_martial_combo" // 연환 난타
  | "v2c_martial_whirl" // 선풍각
  | "v2c_martial_chi" // 기공 순환
  | "v2c_martial_circulate" // 운기
  | "v2c_martial_steelguard" // 철포 (받피감 버프 — 직업 킷 재설계)
  // 마법사 (마력구 패시브 제외)
  | "v2c_mage_fireball" // 화염구
  | "v2c_mage_barrage" // 마력 탄막
  | "v2c_mage_shield" // 마나 보호막
  | "v2c_mage_meditate" // 명상
  | "v2c_mage_boltcast" // 마력탄 (0코스트 마법 — 직업 킷 재설계)
  // 도적 (예기 패시브 제외)
  | "v2c_rogue_strike" // 일격
  | "v2c_rogue_flurry" // 연격
  | "v2c_rogue_expose" // 약점 포착
  | "v2c_rogue_poison"; // 독침

// 다단 — 동일 damage effect N개.
const hits = (
  n: number,
  statCoef: number,
  baseFlat: number,
  scaling?: "physical" | "magic",
): V2SkillEffect[] =>
  Array.from({ length: n }, () => ({
    kind: "damage" as const,
    statCoef,
    baseFlat,
    ...(scaling ? { scaling } : {}),
  }));

const dmg = (
  statCoef: number,
  baseFlat: number,
  scaling?: "physical" | "magic",
): V2SkillEffect => ({
  kind: "damage",
  statCoef,
  baseFlat,
  ...(scaling ? { scaling } : {}),
});

export const V2_COMMON_SKILLS: Record<V2CommonSkillId, V2SkillDefinition> = {
  // ═══ 전사 (STR · 물리) — 정직한 파워 ═══
  v2c_warrior_strike: {
    id: "v2c_warrior_strike", name: "강타", stat: "str", category: "attack", tier: 1,
    description: "묵직한 일격을 꽂는다.", mpCost: 30, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 140)],
  },
  v2c_warrior_flurry: {
    id: "v2c_warrior_flurry", name: "난격", stat: "str", category: "attack", tier: 1,
    description: "빠르게 세 번 후려친다.", mpCost: 26, cooldown: 0, procChance: 40,
    effects: hits(3, 0.4, 40),
  },
  v2c_warrior_sunder: {
    id: "v2c_warrior_sunder", name: "파쇄", stat: "str", category: "attack", tier: 2,
    description: "방어를 부수며 타격한다.", mpCost: 28, cooldown: 0, procChance: 30,
    effects: [dmg(0.7, 90), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_warrior_warcry: {
    id: "v2c_warrior_warcry", name: "함성", stat: "str", category: "buff", tier: 2,
    description: "전의를 끌어올려 공격력을 높인다.", mpCost: 24, cooldown: 0, procChance: 55,
    effects: [{ kind: "selfBuff", stat: "str", pct: 10, turns: 3 }],
  },
  v2c_warrior_endure: {
    id: "v2c_warrior_endure", name: "불굴", stat: "str", category: "buff", tier: 2,
    description: "버티는 자세로 생존력을 높인다.", mpCost: 24, cooldown: 0, procChance: 55,
    effects: [{ kind: "selfBuff", stat: "vit", pct: 15, turns: 3 }],
  },

  // ═══ 무도가 (STR 딜 · VIT 앵커) — 콤보/지속/기동 ═══
  // 역할 분리(스킬 감사 1차 가안 — sim 재캘리브 사용자 몫): 붕권 = flat 무거운 단일타(저-atk
  //   구간/대-DEF 버스트), 연환 난타 = 계수형 다단(고-atk 스케일 + 5타 크리 + 더 쌈). 둘이 닮아
  //   연환난타가 붕권을 완전 지배하던 것(계수·flat·코스트 전부 우위)을 교차 구간으로 분리.
  v2c_martial_burst: {
    id: "v2c_martial_burst", name: "붕권", stat: "str", category: "attack", tier: 1,
    description: "기를 모아 내지르는 묵직한 일권.", mpCost: 30, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 230)],
  },
  v2c_martial_combo: {
    id: "v2c_martial_combo", name: "연환 난타", stat: "str", category: "attack", tier: 1,
    description: "다섯 번 연속으로 두들긴다.", mpCost: 24, cooldown: 0, procChance: 40,
    effects: hits(5, 0.25, 36),
  },
  v2c_martial_whirl: {
    id: "v2c_martial_whirl", name: "선풍각", stat: "str", category: "attack", tier: 2,
    description: "회전 발차기로 치고 빠진다.", mpCost: 28, cooldown: 0, procChance: 40,
    effects: [...hits(3, 0.4, 40), { kind: "selfBuffPct", target: "evasion", pct: 12, turns: 2 }],
  },
  v2c_martial_chi: {
    id: "v2c_martial_chi", name: "기공 순환", stat: "vit", category: "heal", tier: 2,
    description: "기를 돌려 잃은 활력을 일부 되찾는다.", mpCost: 0, cooldown: 0, procChance: 55,
    effects: [{ kind: "heal", pctLostHp: 5 }],
  },
  v2c_martial_circulate: {
    id: "v2c_martial_circulate", name: "운기", stat: "vit", category: "buff", tier: 2,
    description: "호흡을 고르며 단단해지고 꾸준히 회복한다.", mpCost: 26, cooldown: 0, procChance: 55,
    effects: [
      { kind: "selfBuff", stat: "vit", pct: 15, turns: 3 },
      { kind: "selfRegen", pctMaxHpPerTurn: 3, turns: 3 },
    ],
  },

  // ═══ 마법사 (INT · 마법) — 캐스터 (마력구 패시브로 평타 마법화) ═══
  v2c_mage_fireball: {
    id: "v2c_mage_fireball", name: "화염구", stat: "int", category: "attack", tier: 1,
    description: "불덩이를 던져 태운다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 180, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }],
  },
  v2c_mage_barrage: {
    id: "v2c_mage_barrage", name: "마력 탄막", stat: "int", category: "attack", tier: 1,
    description: "마력탄을 세 발 쏜다.", mpCost: 32, cooldown: 0, procChance: 40,
    effects: hits(3, 0.4, 40, "magic"),
  },
  v2c_mage_shield: {
    id: "v2c_mage_shield", name: "마나 보호막", stat: "int", category: "buff", tier: 2,
    description: "마나로 보호막을 두른다. 마나가 클수록 두껍다.", mpCost: 42, cooldown: 0, procChance: 55,
    effects: [{ kind: "shield", pctMaxHp: 10, pctMaxMp: 10, turns: 3 }],
  },
  v2c_mage_meditate: {
    id: "v2c_mage_meditate", name: "명상", stat: "int", category: "buff", tier: 2,
    description: "정신을 가다듬어 마나를 회복한다.", mpCost: 0, cooldown: 0, procChance: 55,
    effects: [{ kind: "manaRestore", pctMaxMp: 7 }],
  },

  // ═══ 도적 (STR 딜 · DEX 앵커 보조) — 정밀/크리/독 (예기 패시브로 DEX 보조) ═══
  v2c_rogue_strike: {
    id: "v2c_rogue_strike", name: "일격", stat: "str", category: "attack", tier: 1,
    description: "급소를 노린 한 방.", mpCost: 30, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 140)],
  },
  v2c_rogue_flurry: {
    id: "v2c_rogue_flurry", name: "연격", stat: "str", category: "attack", tier: 1,
    description: "세 번 빠르게 베고 찌른다.", mpCost: 26, cooldown: 0, procChance: 40,
    effects: hits(3, 0.4, 40),
  },
  v2c_rogue_expose: {
    id: "v2c_rogue_expose", name: "약점 포착", stat: "str", category: "attack", tier: 2,
    description: "허점을 노려 방어를 깎는다.", mpCost: 28, cooldown: 0, procChance: 30,
    effects: [dmg(0.7, 90), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_rogue_poison: {
    id: "v2c_rogue_poison", name: "독침", stat: "str", category: "attack", tier: 2,
    description: "독을 바른 침으로 찔러 중독시킨다.", mpCost: 26, cooldown: 0, procChance: 30,
    // 중독 = 고정 수치(턴당 flat). 최대HP% 가 아니라 flat 으로(직업 킷 재설계 — 도적 시그니처).
    effects: [
      dmg(0.6, 60),
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 12, pctMaxHpPerStack: 0, stacks: 2 },
    ],
  },

  // ═══ 직업 킷 재설계 — 기본 직업 시그니처 액티브(2026-06-17) ═══
  // 무인 철포(받피감 버프)·마법사 마력탄(0코스트 마법). 강타/연격/독침은 기존 재사용.
  v2c_martial_steelguard: {
    id: "v2c_martial_steelguard", name: "철포", stat: "vit", category: "buff", tier: 1,
    description: "몸을 굳혀 한동안 받는 피해를 줄인다.", mpCost: 24, cooldown: 0, procChance: 55,
    effects: [{ kind: "selfBuffPct", target: "damageReduction", pct: 12, turns: 3 }],
  },
  v2c_mage_boltcast: {
    id: "v2c_mage_boltcast", name: "마력탄", stat: "int", category: "attack", tier: 1,
    description: "마력을 뭉쳐 쏜다.", mpCost: 0, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 120, "magic")],
  },
};

// 직군 → 공용 스킬 id 목록 (학습/장착 게이팅 — learn 라우트 참조).
export const V2_COMMON_SKILLS_BY_JOB: Record<
  Exclude<V2Class, "none">,
  readonly V2CommonSkillId[]
> = {
  warrior: [
    "v2c_warrior_strike", "v2c_warrior_flurry", "v2c_warrior_sunder",
    "v2c_warrior_warcry", "v2c_warrior_endure",
  ],
  martial: [
    "v2c_martial_burst", "v2c_martial_combo", "v2c_martial_whirl",
    "v2c_martial_chi", "v2c_martial_circulate",
  ],
  mage: [
    "v2c_mage_fireball", "v2c_mage_barrage", "v2c_mage_shield", "v2c_mage_meditate",
  ],
  rogue: [
    "v2c_rogue_strike", "v2c_rogue_flurry", "v2c_rogue_expose", "v2c_rogue_poison",
  ],
};
