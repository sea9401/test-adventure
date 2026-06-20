// v2 공용 스킬 카탈로그 — 4직군 공용 액티브(직군당 5, 마력구·예기 패시브 제외 = 18종).
// 스킬 시스템 재설계(docs/v2-skill-system-plan.md). 평타 척추 + 소수 스킬.
//
// 데미지 = 플랫강화(스탯×~1.0 + 큰 flat) — 예측·off스탯 floor. 다단 = damage effect N개.
// DoT/디버프는 통합 프리셋(V2_DOT_PRESETS/V2_DEBUFF_PRESETS) spread — 다이얼 일관.
// procChance·mpCost 는 설계 문서값(저-proc = 평타 위주). cooldown 0(proc 가 게이트).
// 엔진 핸들러(shield/manaRestore/selfRegen/selfBuffPct/heal pctLostHp)는 PR2-B 배선.
//
// 학습/장착 게이팅(어느 직군이 무엇을)은 learn 라우트 + V2_COMMON_SKILLS_BY_JOB(아래).

import type {
  V2SkillDefinition,
  V2SkillEffect,
  V2DamageScaling,
} from "./v2Skills";
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
  | "v2c_rogue_poison" // 독침
  // 기본 직업 패시브 스킬(학습+SP 슬롯해야 효과 — 직업 킷 재설계)
  | "v2c_warrior_might" // 근력 (힘 +10%)
  | "v2c_martial_fortitude" // 강건 (활력 +10%)
  | "v2c_mage_acumen" // 총명 (지능 +10%)
  | "v2c_rogue_finesse" // 예기 (민첩이 공격력 보조)
  // ── 상위 8직업 킷(2026-06-17) — 액티브 1 + 고유 % 패시브 1 ──
  // 액티브
  | "v2c_shieldman_bash" // 방패 타격 (방어력 기반 단일)
  | "v2c_squire_cleave" // 돌격 (물리 단일·파고들기)
  | "v2c_boxer_combo" // 연권 (물리 다단)
  | "v2c_monk_palm" // 선풍각 (회피 버프 — selfBuffPct)
  | "v2c_caster_bolt" // 마탄 (마법 단일 강)
  | "v2c_acolyte_smite" // 치유 (자힐 — heal)
  | "v2c_assassin_ambush" // 처단 (처형 — executeDamage·LUK 비례)
  | "v2c_archer_volley" // 속박 사격 (딜 + 취약 enemyVuln)
  // 고유 패시브(% 가산 — 직업마다 서로 다른 축)
  | "v2c_shieldman_vitality" // 체력 (최대 HP +12%)
  | "v2c_squire_might" // 근력 II (힘 +15%)
  | "v2c_boxer_fortitude" // 강건 II (활력 +15%)
  | "v2c_monk_spirit" // 정신 (정신 +15%)
  | "v2c_caster_acumen" // 총명 II (지능 +15%)
  | "v2c_acolyte_mana" // 회복 (회복량 +20%·healPowerPct, 옛 마나에서 리스킨)
  | "v2c_assassin_fortune" // 행운 (행운 +10%)
  | "v2c_archer_agility" // 민첩 (민첩 +10%)
  // ── 고차 4직업 킷(tier 3, A 메타 PR-3) — 액티브 1(강) + III티어 % 패시브 ──
  // 액티브(강)
  | "v2c_paladin_cleave" // 심판 (물리 단일 + 무력 디버프)
  | "v2c_brawler_combo" // 벽력권 (물리 단일 강)
  | "v2c_magus_bolt" // 마력 작렬 (마법 단일)
  | "v2c_ranger_ambush" // 연사 (DEX 비례 3연사)
  // 고차 패시브(다양성 2차: paladin/ranger 는 효과 리스킨, brawler/magus 는 직군 축 % 유지)
  | "v2c_paladin_might3" // 기사도 (힘 +10% & 방어 +10%)
  | "v2c_brawler_fortitude3" // 강건 III (활력 +20%)
  | "v2c_magus_acumen3" // 총명 III (지능 +20%)
  | "v2c_ranger_finesse3" // 정밀 (명중 +12)
  // ── 고차 두 번째 갈래(tier 3·방패병/수도승/사제/자객 계승) — 액티브 1 + 고유 패시브 ──
  // 액티브
  | "v2c_guardian_bash" // 방패 강타 (방어기반 단일)
  | "v2c_warmonk_kick" // 연환각 (물리 다단)
  | "v2c_bishop_heal" // 대치유 (자힐 — heal)
  | "v2c_shadow_assassinate" // 암살 (처형 — executeDamage·LUK 비례)
  // 고유 패시브(형제와 다른 축: 받피감/회피/회복강화/치명피해)
  | "v2c_guardian_bulwark3" // 방벽 (방어 +20%)
  | "v2c_warmonk_evasion3" // 허공보 (회피 +14%)
  | "v2c_bishop_blessing3" // 축복 (회복량 +30%)
  | "v2c_shadow_lethality3" // 그늘 (치명 피해 +30%)
  // ── 하이브리드 킷(tier 3·전사×마법) ──
  | "v2c_templar_smite" // 성기사: 심판의 빛 (물리 타격 + 자힐)
  | "v2c_templar_aegis" // 성기사: 신성한 가호 (방어 +10% & 회복 강화 +10%)
  | "v2c_spellblade_strike" // 마검사: 마검 일섬 (물리 + 마법 이중 타격)
  | "v2c_spellblade_unity" // 마검사: 마검 합일 (힘 +8% & 지능 +8%)
  // ── 심화 4직업 킷(tier 4) — 액티브 1(강) + 패시브(직군마다 다른 효과·기존 어휘) ──
  | "v2c_veteran_cleave" // 결전의 일격 (처형딜·STR 비례)
  | "v2c_sensei_combo" // 난무 (물리 다단)
  | "v2c_sage_bolt" // 마력 폭사 (마법 단일)
  | "v2c_chief_strike" // 관통사 (DEX 비례 단일·궁술)
  | "v2c_veteran_lethal" // 필살 (치명 피해 +25%)
  | "v2c_sensei_ironbody" // 철신 (최대 HP +12%)
  | "v2c_sage_insight" // 간파 (치명 확률 +8%)
  | "v2c_chief_afterimage" // 잔영 (회피 +12%)
  // ── 마법 4차 두 번째 갈래(원소술사) ──
  | "v2c_elementalist_magic" // 속성 마법 (캐릭 속성별 효과 분기)
  | "v2c_elementalist_mastery"; // 원소 통달 (상성 유리/불리 +15%p 양방향)

// 다단 — 동일 damage effect N개.
const hits = (
  n: number,
  statCoef: number,
  baseFlat: number,
  scaling?: V2DamageScaling,
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
  scaling?: V2DamageScaling,
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

  // ═══ 기본 직업 패시브 스킬(2026-06-17) — 학습 + SP 슬롯해야 상시 효과(캐스트 아님) ═══
  v2c_warrior_might: {
    id: "v2c_warrior_might", name: "근력", stat: "str", category: "passive", tier: 1,
    description: "단련된 힘. 힘이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 10 } },
  },
  v2c_martial_fortitude: {
    id: "v2c_martial_fortitude", name: "강건", stat: "vit", category: "passive", tier: 1,
    description: "단단한 몸. 활력이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { vit: 10 } },
  },
  v2c_mage_acumen: {
    id: "v2c_mage_acumen", name: "총명", stat: "int", category: "passive", tier: 1,
    description: "맑은 정신. 지능이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 10 } },
  },
  v2c_rogue_finesse: {
    id: "v2c_rogue_finesse", name: "예기", stat: "dex", category: "passive", tier: 1,
    description: "벼린 감각. 민첩이 공격력을 보조한다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { atkPerDexCoef: 0.08 }, // = derive ROGUE_ATK_PER_DEX
  },

  // ═══ 상위 8직업 킷(2026-06-17) — 액티브 1 + 고유 % 패시브 1 ═══
  // 액티브는 군더더기 없는 순수 공격(간단 기조). 패시브는 직업마다 서로 다른 축(고유) — 다른
  //   직업을 순회해 다른 패시브를 모으는 메리트. % 가산(여러 패시브 % 는 합산).
  // ── 전사 갈래 ──
  v2c_shieldman_bash: {
    // 방패병 = 방어 탱 — 데미지가 공격력이 아니라 방어력 기반(scaling:"def", combatShared 배선).
    //   단단할수록 강타. DEF_PER_VIT(0.1)<ATK_PER_STR(0.15)라 계수를 높여 보정. PvE/PvP 공용.
    id: "v2c_shieldman_bash", name: "방패 타격", stat: "vit", category: "attack", tier: 2,
    description: "방어로 다져진 몸으로 들이받는다. 방어력이 높을수록 강하다.", mpCost: 30, cooldown: 0, procChance: 30,
    effects: [dmg(1.8, 140, "def")],
  },
  v2c_squire_cleave: {
    // 견습 기사 = 기사 라인 입문. 베기→돌격 리스킨(id 유지). 단숨에 파고드는 첫 기사 기술.
    id: "v2c_squire_cleave", name: "돌격", stat: "str", category: "attack", tier: 2,
    description: "말을 몰듯 단숨에 파고들어 베어낸다.", mpCost: 34, cooldown: 0, procChance: 30,
    effects: [dmg(1.3, 190)],
  },
  // ── 무도가 갈래 ──
  v2c_boxer_combo: {
    id: "v2c_boxer_combo", name: "연권", stat: "str", category: "attack", tier: 2,
    description: "주먹을 네 번 연달아 내지른다.", mpCost: 28, cooldown: 0, procChance: 40,
    effects: hits(4, 0.4, 42),
  },
  v2c_monk_palm: {
    // 수도승 = 회피 지속탱(역할화 2차) — 딜 대신 회피 버프(selfBuffPct evasion, 배선됨). 패시브
    //   허보(상시 회피)와 합쳐 회피 정체성. id 유지(세이브 호환). 딜은 평타로. PvE/PvP 공용.
    id: "v2c_monk_palm", name: "선풍각", stat: "vit", category: "buff", tier: 2,
    description: "바람을 타듯 흘리는 보법. 한동안 회피가 크게 오른다.", mpCost: 24, cooldown: 0, procChance: 55,
    effects: [{ kind: "selfBuffPct", target: "evasion", pct: 15, turns: 3 }],
  },
  // ── 마법사 갈래 ──
  v2c_caster_bolt: {
    id: "v2c_caster_bolt", name: "마탄", stat: "int", category: "attack", tier: 2,
    description: "응축한 마력탄을 쏘아 박는다.", mpCost: 40, cooldown: 0, procChance: 30,
    effects: [dmg(1.2, 175, "magic")],
  },
  v2c_acolyte_smite: {
    // 사제 = 자힐 탱 — 딜 대신 힐(컬렉션 유일 회복). kind:"heal" 배선됨. id 유지(세이브 호환).
    //   pctLostHp=잃은 체력 비례(낮을수록 강·고HP 낭비 없음). 스마트 패턴이 HP<50%에서 자동 발동.
    id: "v2c_acolyte_smite", name: "치유", stat: "int", category: "heal", tier: 2,
    description: "신성한 힘으로 잃은 상처를 메운다.", mpCost: 30, cooldown: 0, procChance: 55,
    effects: [{ kind: "heal", pctLostHp: 30 }],
  },
  // ── 도적 갈래 ──
  v2c_assassin_ambush: {
    // 자객 = 행운/크리(dex10/luk10) — 처형 데미지가 행운(LUK)에 비례(scaling:"luk"). LUK 원시스탯이
    //   커서 계수 작게(0.2 ≈ str→atk 0.15급). LUK 빌드가 크리(확률·피해)+직접딜 양쪽 이득(행운직
    //   정체성). 적 HP 30%↓ ×2.0. id 유지. PvE/PvP 공용.
    id: "v2c_assassin_ambush", name: "처단", stat: "luk", category: "attack", tier: 2,
    description: "행운이 이끄는 일격으로 숨통을 끊는다. 적이 위태로울수록 치명적이다.", mpCost: 34, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 0.2, baseFlatByTier: [185, 185, 185], hpThresholdPct: 30, bonusMult: 2.0, scaling: "luk" },
    ],
  },
  v2c_archer_volley: {
    // 궁수 = 물량/유틸(역할화 2차) — 딜 + 취약(enemyVuln, 적 받는 피해 +%). 디버프 지원으로 다른
    //   딜을 증폭. id 유지. enemyVuln 배선됨. PvE/PvP 공용.
    id: "v2c_archer_volley", name: "속박 사격", stat: "str", category: "attack", tier: 2,
    description: "약점을 꿰뚫어 한동안 받는 피해를 키운다.", mpCost: 30, cooldown: 0, procChance: 35,
    effects: [dmg(0.9, 90), { kind: "enemyVuln", pct: 20, turns: 3 }],
  },

  // ── 상위 8직업 고유 패시브 — 학습 + SP 슬롯해야 상시 효과 ──
  //   다양성(A 메타): 스탯%뿐 아니라 회피·치명·흡혈 등 "작동 방식" 사이드그레이드. 직업 테마에 맞춤
  //   (수도승 회피·자객 치명·권사 흡혈·술사 치명피해). id 는 세이브 호환 위해 유지(효과만 리스킨).
  v2c_shieldman_vitality: {
    id: "v2c_shieldman_vitality", name: "체력", stat: "vit", category: "passive", tier: 2,
    description: "두터운 몸. 최대 체력이 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 12 },
  },
  v2c_squire_might: {
    id: "v2c_squire_might", name: "근력 II", stat: "str", category: "passive", tier: 2,
    description: "거듭된 단련. 힘이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 15 } },
  },
  v2c_boxer_fortitude: {
    // 흡혈 브루저(권사) — 옛 활력%에서 흡혈로 리스킨. 자동전투 눈덩이 방지로 의도적 저수치(4%).
    //   🔑 흡혈(enchantLifestealPct)은 현재 PvE 엔진만 소비 — PvP(engine.pvpPhase)는 별도 훅
    //   (lifestealCritHealPct)만 적용해 이 패시브는 PvP 에서 inert. PvP 흡혈은 밸런스 민감이라
    //   의도적 보류(미러 여부는 후속 결정). crit/critDmg/evasion 리스킨은 PvE/PvP 양쪽 적용.
    id: "v2c_boxer_fortitude", name: "포식", stat: "vit", category: "passive", tier: 2,
    description: "가한 피해의 일부를 체력으로 흡수한다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { lifestealPct: 4 },
  },
  v2c_monk_spirit: {
    // 회피 지속탱(수도승) — 옛 정신%에서 회피로 리스킨. stat 필드는 그룹 메타(vit)만.
    id: "v2c_monk_spirit", name: "허보", stat: "vit", category: "passive", tier: 2,
    description: "바람처럼 흘려 피한다. 회피가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 10 },
  },
  v2c_caster_acumen: {
    // 버스트 원소(술사) — 옛 지능%에서 치명 피해로 리스킨(옛 arcane_burst 계보).
    id: "v2c_caster_acumen", name: "맹공", stat: "int", category: "passive", tier: 2,
    description: "치명타가 더 깊게 박힌다. 치명타 피해가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 30 },
  },
  v2c_acolyte_mana: {
    // SPI 부활 PR-4 — 사제 = 힐러. 마나(maxMP%)→회복강화(healPowerPct)로 리스킨(id 유지=세이브 호환).
    //   사제 치유(active)와 합쳐 힐러 정체성 완성. healMult(정신 비례, PR-1)에 곱연산 ×(1+%/100).
    //   딜 아님 → INT(마공)과 역할 분리. stat="int" 유지(사제 직군).
    id: "v2c_acolyte_mana", name: "회복", stat: "int", category: "passive", tier: 2,
    description: "치유의 비결. 회복량이 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 20 },
  },
  v2c_assassin_fortune: {
    // 크리 폭발(자객) — 옛 행운%에서 치명 확률로 리스킨.
    id: "v2c_assassin_fortune", name: "치명", stat: "luk", category: "passive", tier: 2,
    description: "급소를 노린다. 치명타 확률이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critPct: 8 },
  },
  v2c_archer_agility: {
    id: "v2c_archer_agility", name: "민첩", stat: "dex", category: "passive", tier: 2,
    description: "날랜 몸놀림. 민첩이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { dex: 10 } },
  },

  // ── 고차 4직업 액티브(tier 3) — 같은 계열 tier-2 보다 한 단계 강한 공격 ──
  v2c_paladin_cleave: {
    // 기사(성기사) = 정의의 일격. 베기→심판 리스킨(id 유지). 단일 강타 + 무력(적 방어 약화).
    id: "v2c_paladin_cleave", name: "심판", stat: "str", category: "attack", tier: 3,
    description: "정의의 검이 죄를 내리친다. 적의 기세를 꺾는다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: [dmg(1.3, 230), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_brawler_combo: {
    // 격투가 = 권사(연타) 위 갈래 — 연권→벽력권 리스킨(id 유지). 권사는 연타, 격투가는 한 방 강타로
    //   메커니즘도 차별(같은 "연권" 이름·다단 중복 해소). "벽력권"은 고아 붕권(martial_burst)과도 비충돌.
    id: "v2c_brawler_combo", name: "벽력권", stat: "str", category: "attack", tier: 3,
    description: "온몸의 무게를 실어 단 한 번에 부숴버린다.", mpCost: 32, cooldown: 0, procChance: 40,
    effects: [dmg(1.4, 250)],
  },
  v2c_magus_bolt: {
    // 마도사 = 마법사(마탄) 위 갈래 — 마탄→마력 작렬 리스킨(id 유지·같은 "마탄" 이름 중복 해소).
    id: "v2c_magus_bolt", name: "마력 작렬", stat: "int", category: "attack", tier: 3,
    description: "응축한 마력을 적 안에서 터뜨린다.", mpCost: 44, cooldown: 0, procChance: 30,
    effects: [dmg(1.35, 210, "magic")],
  },
  v2c_ranger_ambush: {
    // 유격수 = 궁술/민첩(dex) — 기습(암살 느낌)→연사 리스킨(id 유지·궁수 라인 테마 정합). 화살을
    //   세 번 연달아 쏘는 다단(dex 비례). DEX 원시스탯이 커서 hit당 계수 작게. PvE/PvP 공용.
    id: "v2c_ranger_ambush", name: "연사", stat: "dex", category: "attack", tier: 3,
    description: "활시위를 빠르게 세 번 당겨 연달아 쏘아붙인다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: hits(3, 0.1, 75, "dex"),
  },

  // ── 고차 4직업 III티어 패시브(% 가산 — 직군 축, tier-2 II 위 단계) ──
  v2c_paladin_might3: {
    // 기사 = 균형형 — 공격(힘%)·방어(방어%) 동시 향상, 각 수치는 낮게. id 유지(세이브 호환).
    //   순수 방어는 가디언(방어 20%)이, 공격 힘%는 견습기사가 더 높게. 기사는 둘을 겸비.
    id: "v2c_paladin_might3", name: "기사도", stat: "str", category: "passive", tier: 3,
    description: "공방 균형의 기사도. 힘과 방어력이 함께 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 10 }, defPct: 10 },
  },
  v2c_brawler_fortitude3: {
    id: "v2c_brawler_fortitude3", name: "강건 III", stat: "vit", category: "passive", tier: 3,
    description: "극에 다다른 내공. 활력이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { vit: 20 } },
  },
  v2c_magus_acumen3: {
    id: "v2c_magus_acumen3", name: "총명 III", stat: "int", category: "passive", tier: 3,
    description: "극에 다다른 통찰. 지능이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 20 } },
  },
  v2c_ranger_finesse3: {
    // 유격수 = 정밀 사격(다양성 2차) — 옛 민첩%에서 명중으로 리스킨. id 유지(세이브 호환). dex% 는
    //   궁수가 유지. 명중은 PvE/PvP 양쪽 소비(고회피 상대 카운터).
    id: "v2c_ranger_finesse3", name: "정밀", stat: "dex", category: "passive", tier: 3,
    description: "흔들림 없는 조준. 명중이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { accuracyPct: 12 },
  },

  // ── 고차 두 번째 갈래 액티브(tier 3·방패병/수도승/사제/자객 계승) ──
  v2c_guardian_bash: {
    // 가디언 = 방어 탱 — 데미지가 방어력 기반(scaling:"def"). 방어%(방벽) 패시브와 시너지(방어=딜+탱).
    //   방패병 방패 타격과 같은 def 경로·tier-3 라 base 상향. DEF_PER_VIT<ATK_PER_STR 보정 계수 1.8.
    id: "v2c_guardian_bash", name: "방패 강타", stat: "vit", category: "attack", tier: 3,
    description: "방패를 앞세워 묵직하게 후려친다. 방어력이 높을수록 강하다.", mpCost: 36, cooldown: 0, procChance: 30,
    effects: [dmg(1.8, 220, "def")],
  },
  v2c_warmonk_kick: {
    id: "v2c_warmonk_kick", name: "연환각", stat: "vit", category: "attack", tier: 3,
    description: "물 흐르듯 네 번 연달아 차낸다.", mpCost: 32, cooldown: 0, procChance: 40,
    effects: hits(4, 0.5, 50),
  },
  v2c_bishop_heal: {
    id: "v2c_bishop_heal", name: "대치유", stat: "int", category: "heal", tier: 3,
    description: "성스러운 빛으로 잃은 상처를 크게 메운다.", mpCost: 40, cooldown: 0, procChance: 55,
    effects: [{ kind: "heal", pctLostHp: 45 }],
  },
  v2c_shadow_assassinate: {
    // 그림자 = 자객 계승 — 처형 데미지가 행운(LUK)에 비례(scaling:"luk"·계수 작게). 자객 처단보다
    //   한 단계 강(계수·기본·배수↑). 적 HP 30%↓ ×2.2. PvE/PvP 공용.
    id: "v2c_shadow_assassinate", name: "암살", stat: "luk", category: "attack", tier: 3,
    description: "그림자에서 솟아 단번에 숨통을 끊는다. 적이 위태로울수록 치명적이다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 0.22, baseFlatByTier: [210, 210, 210], hpThresholdPct: 30, bonusMult: 2.2, scaling: "luk" },
    ],
  },

  // ── 고차 두 번째 갈래 고유 패시브(tier 3·형제와 다른 축) ──
  v2c_guardian_bulwark3: {
    // 가디언 = 방패병 계승 — 순수 방어%(방패 강타가 방어기반이라 방어=딜+탱 시너지). 기사(공방 균형)·
    //   견습기사(힘%)와 다른 축. defPct 는 PvE/PvP 양쪽(def=damageBetween 공용).
    id: "v2c_guardian_bulwark3", name: "방벽", stat: "vit", category: "passive", tier: 3,
    description: "온몸으로 받아낸다. 물리 방어력이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 20 },
  },
  v2c_warmonk_evasion3: {
    id: "v2c_warmonk_evasion3", name: "허공보", stat: "vit", category: "passive", tier: 3,
    description: "흐르는 듯한 보법. 회피가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 14 },
  },
  v2c_bishop_blessing3: {
    // 대사제 = 사제 계승 — 회복 강화(healPowerPct·SPI 지원). 마도사(지능%)와 다른 축.
    id: "v2c_bishop_blessing3", name: "축복", stat: "int", category: "passive", tier: 3,
    description: "성스러운 가호. 회복량이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 30 },
  },
  v2c_shadow_lethality3: {
    id: "v2c_shadow_lethality3", name: "그늘", stat: "luk", category: "passive", tier: 3,
    description: "급소를 노리는 일격. 치명타 피해가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 30 },
  },

  // ── 하이브리드(tier 3·성기사 = 전사×마법) — 딜+자힐 탱 ──
  v2c_templar_smite: {
    // 성기사 = 기사의 타격 + 사제의 치유 결합. 물리 일격과 함께 잃은 체력 일부를 회복(가호 패시브
    //   healPowerPct 와 시너지). 힐을 동반하므로 단일 강타(심판 1.3/230)보다 계수 낮춤. 엔진 기존
    //   효과만 사용(damage + heal 혼합 — resolveV2SkillCast 가 effects 순회 처리·신규 배선 0). PvE/PvP 공용.
    id: "v2c_templar_smite", name: "심판의 빛", stat: "str", category: "attack", tier: 3,
    description: "성스러운 빛을 검에 실어 내리친다. 그 빛이 제 상처마저 어루만진다.", mpCost: 42, cooldown: 0, procChance: 30,
    effects: [dmg(1.1, 190), { kind: "heal", pctLostHp: 20 }],
  },
  v2c_templar_aegis: {
    // 어느 단일 직업도 안 가진 조합(방어%+회복강화%) — 순회 수집 메리트. 탱(방어)과 자힐(가호) 결합.
    //   healPowerPct 가 심판의 빛 자힐을 증폭(시너지). stat 은 표시 메타(vit) — 효과는 passive 맵.
    id: "v2c_templar_aegis", name: "신성한 가호", stat: "vit", category: "passive", tier: 3,
    description: "성스러운 가호가 몸을 지키고 상처의 회복을 북돋운다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 10, healPowerPct: 10 },
  },
  v2c_spellblade_strike: {
    // 마검사 = 기사의 검(str·물리) + 마도사의 마법(int) 결합. 한 번에 물리 일격 + 마법 작렬을 동시에
    //   터뜨리는 이중 데미지. 물리 효과는 atk(str)·마법 효과는 matk(int) 비례라 두 축에 다 투자해야
    //   양쪽 딜이 산다(자연 throttle). 합 ~1.4/240 을 둘로 쪼갬 — 단일 3차 1타보다 단일축 의존 낮음.
    //   resolveV2SkillCast 가 effects 순회로 두 데미지 모두 처리(신규 배선 0). PvE/PvP 공용.
    id: "v2c_spellblade_strike", name: "마검 일섬", stat: "str", category: "attack", tier: 3,
    description: "검에 마력을 휘감아 베는 순간, 물리와 마법이 한꺼번에 작렬한다.", mpCost: 44, cooldown: 0, procChance: 30,
    effects: [dmg(0.7, 120), dmg(0.7, 120, "magic")],
  },
  v2c_spellblade_unity: {
    // 검+마법 이중 공격축(힘%+지능%) — 어느 단일 직업도 안 가진 조합(순회 수집 메리트). 마검 일섬의
    //   두 데미지를 동시에 키운다. stat 은 표시 메타(str) — 효과는 passive 맵.
    id: "v2c_spellblade_unity", name: "마검 합일", stat: "str", category: "passive", tier: 3,
    description: "검과 마법을 하나로 다룬다. 힘과 지능이 함께 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 8, int: 8 } },
  },

  // ── 심화 4직업 액티브(tier 4) — 고차보다 한 단계 강한 공격. tier 필드는 3 유지(비용 동일·
  //   rubricSpCost 가 클램프) — 직업은 4차지만 스킬 파워버킷은 상급. ──
  v2c_veteran_cleave: {
    // 정예 기사 = 기사 라인 정점. 참격→결전의 일격 리스킨(id 유지). 처형 딜(공격력 기반·scaling 생략=
    //   atk) — 적 HP 낮을수록 치명(필살 치명피해 패시브와 시너지). 적 HP 30%↓ ×2.0. PvE/PvP 공용.
    id: "v2c_veteran_cleave", name: "결전의 일격", stat: "str", category: "attack", tier: 3,
    description: "승부를 가르는 최후의 일격. 위태로운 적일수록 깊이 파고든다.", mpCost: 40, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 1.3, baseFlatByTier: [240, 240, 240], hpThresholdPct: 30, bonusMult: 2.0 },
    ],
  },
  v2c_sensei_combo: {
    id: "v2c_sensei_combo", name: "난무", stat: "str", category: "attack", tier: 3,
    description: "물 흐르듯 다섯 번 몰아친다.", mpCost: 34, cooldown: 0, procChance: 40,
    effects: hits(5, 0.45, 54),
  },
  v2c_sage_bolt: {
    id: "v2c_sage_bolt", name: "마력 폭사", stat: "int", category: "attack", tier: 3,
    description: "극대화한 마력을 터뜨린다.", mpCost: 46, cooldown: 0, procChance: 30,
    effects: [dmg(1.45, 235, "magic")],
  },
  v2c_chief_strike: {
    // 신궁(도적 4차·궁수 라인 정점) = 암격(암살 느낌·str)→관통사 리스킨(id 유지). 궁술 테마로
    //   민첩(dex) 비례 단일 강사(유격수 연사=다단과 차별). DEX 원시스탯이 커서 계수 작게.
    id: "v2c_chief_strike", name: "관통사", stat: "dex", category: "attack", tier: 3,
    description: "단 한 발에 모든 것을 실어 꿰뚫는다.", mpCost: 40, cooldown: 0, procChance: 30,
    effects: [dmg(0.35, 250, "dex")],
  },

  // ── 심화 4직업 패시브(tier 4) — 직군마다 다른 효과(라인 비포화·기존 어휘, PvP-안전) ──
  v2c_veteran_lethal: {
    // 전사 심화 — 치명 피해(중장갑 라인의 딜 마무리). str% 는 견습기사·방어%는 기사가 유지.
    id: "v2c_veteran_lethal", name: "필살", stat: "str", category: "passive", tier: 3,
    description: "한 방에 모든 것을 싣는다. 치명타 피해가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 25 },
  },
  v2c_sensei_ironbody: {
    // 무도 심화 — 최대 HP(심층 탱). vit 라인(흡혈/회피/활력%)에 없던 축.
    id: "v2c_sensei_ironbody", name: "철신", stat: "vit", category: "passive", tier: 3,
    description: "강철 같은 몸. 최대 체력이 크게 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 12 },
  },
  v2c_sage_insight: {
    // 마법 심화 — 치명 확률(술사 치명피해와 시너지). int 라인에 crit 확률 추가.
    id: "v2c_sage_insight", name: "간파", stat: "int", category: "passive", tier: 3,
    description: "흐름을 꿰뚫는다. 치명타 확률이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critPct: 8 },
  },
  v2c_chief_afterimage: {
    // 도적 심화 — 회피(잔영). dex 라인(예기/민첩%/치명/명중)에 없던 축.
    id: "v2c_chief_afterimage", name: "잔영", stat: "dex", category: "passive", tier: 3,
    description: "잔상을 남기며 흘린다. 회피가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 12 },
  },

  // ── 마법 4차 두 번째 갈래(원소술사) — 속성 마법(캐릭속성 분기) + 원소 통달 ──
  v2c_elementalist_magic: {
    // 속성 마법 — 시전자 캐릭터 속성에 따라 효과가 갈린다(combatShared 가 elementEffects[캐릭속성] 적용).
    //   로그엔 "불 마법/물 마법…" 동적 표기(elementNamed). 데미지는 전부 마법(int) 스케일.
    //   물=보호막·번개=취약·불=연소·빛=실명(회피↓)·어둠=암흑(명중↓)·바람=ATB 가속·대지=ATB 지연.
    //   잔여(후속 PR-E2): 불 화상 치유감소. selfHaste/enemyDelay 는 ATB 전용(legacy 에선 inert).
    //   무속성(폴백)=순수 마법 딜.
    id: "v2c_elementalist_magic", name: "속성 마법", stat: "int", category: "attack", tier: 3,
    description: "다스리는 원소를 끌어내 적에게 퍼붓는다. 속성에 따라 다른 권능이 깃든다.",
    mpCost: 46, cooldown: 0, procChance: 30,
    elementNamed: true,
    effects: [dmg(1.3, 200, "magic")], // 무속성 폴백
    elementEffects: {
      fire: [dmg(1.3, 200, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }],
      water: [{ kind: "shield", pctMaxHp: 12, pctMaxMp: 0, turns: 3 }],
      wind: [dmg(1.3, 200, "magic"), { kind: "selfHaste", pct: 50 }], // 바람 — 내 다음 행동 ms −50%
      earth: [dmg(1.3, 200, "magic"), { kind: "enemyDelay", pct: 50 }], // 대지 — 적 다음 행동 ms +50%
      lightning: [dmg(1.3, 200, "magic"), { kind: "enemyVuln", pct: 20, turns: 3 }],
      starlight: [
        dmg(1.3, 200, "magic"),
        { kind: "enemyEvasionDown", pct: 20, turns: 3 }, // 실명 — 적 회피↓
      ],
      void: [
        dmg(1.3, 200, "magic"),
        { kind: "enemyAccuracyDown", pct: 20, turns: 3 }, // 암흑 — 적 명중↓
      ],
    },
  },
  v2c_elementalist_mastery: {
    // 원소 통달 — 속성 상성 양방향 강화(유리 +15%p·불리 받피 감소 +15%p). derive 가 player 의
    //   elementAdvPctBonus/DisPctBonus 로 합산 → cast elementAdvPct/disPct 에 가산. 속성 빌드의 정점.
    id: "v2c_elementalist_mastery", name: "원소 통달", stat: "int", category: "passive", tier: 3,
    description: "원소의 이치를 꿰뚫는다. 상성의 이점도, 저항도 한층 깊어진다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { elementAdvPctBonus: 15, elementDisPctBonus: 15 },
  },
};

// 직군 → 공용 스킬 id 목록 (학습/장착 게이팅 — learn 라우트 참조).
export const V2_COMMON_SKILLS_BY_JOB: Record<
  Exclude<V2Class, "none">,
  readonly V2CommonSkillId[]
> = {
  // 전사 공용 풀 폐지(2026-06-19) — "직업 순회 수집" 설계상 공용 스킬 제거. 전사계는 직업별
  //   시그니처(V2_SKILLS_BY_JOB)만 학습. 강타는 견습 병사 시그니처로 잔존. 난격/파쇄/함성/불굴
  //   (v2c_warrior_flurry/sunder/warcry/endure) 정의는 보존(비파괴)·추후 재배치/정리 대상.
  warrior: [],
  // 무인/마법/도적 공용 풀도 폐지(2026-06-19) — 전사와 동일("직업 순회 수집" 설계). 직업별
  //   시그니처(V2_SKILLS_BY_JOB)만 학습. 견습직 액티브(철포·마력탄·독침)는 시그니처라 잔존.
  //   나머지 공용 정의(연격/난타/회선/기공/운기·화염구/연발/마법보호/명상·찌르기/난자/허점)는
  //   보존(비파괴·추후 재배치/정리 대상).
  martial: [],
  mage: [],
  rogue: [],
};
