// v2 공용 스킬 카탈로그 — 4직군 공용 액티브(직군당 5, 예기 패시브 제외 = 18종).
// 스킬 시스템 재설계(docs/v2-skill-system-plan.md). 평타 척추 + 소수 스킬.
//
// 데미지 = 플랫강화(스탯×~1.0 + 큰 flat) — 예측·off스탯 floor. 다단 = damage effect N개.
// DoT/디버프는 통합 프리셋(V2_DOT_PRESETS/V2_DEBUFF_PRESETS) spread — 다이얼 일관.
// procChance: 공격=30/40(저-proc·평타 위주, proc 가 게이트). 단, 마력탄은 마법 공격력 직군의
//   일반 공격 대체라 100%. 유틸/힐/버프=100(조건이 게이트 — HP<50·MP<40·버프 비활성 등.
//   2026-06-21 유저: 조건이 이미 throttle이라 proc 이중게이트 제거).
// mpCost = 설계 문서값. cooldown 0.
// 엔진 핸들러(shield/manaRestore/selfRegen/selfBuffPct/heal pctLostHp)는 PR2-B 배선.
//
// 학습/장착 게이팅(어느 직군이 무엇을)은 learn 라우트 = elementalSkillsForClass(V2_SKILLS_BY_JOB).

import type {
  V2SkillDefinition,
  V2SkillEffect,
  V2DamageScaling,
} from "./v2Skills";
import { V2_DOT_PRESETS, V2_DEBUFF_PRESETS } from "./statusEffects";

// 공용 스킬 id — 직군 prefix(v2c_<job>_<slug>). 예기는 패시브(derive)라 여기 없음.
export type V2CommonSkillId =
  // 전사
  | "v2c_warrior_strike" // 강타
  | "v2c_warrior_flurry" // 난격
  | "v2c_warrior_sunder" // 파쇄
  | "v2c_warrior_warcry" // 함성
  // 무도가
  | "v2c_martial_combo" // 연환 난타
  | "v2c_martial_chi" // 기공 순환
  | "v2c_martial_steelguard" // 하급 권법 (단일 딜 — 견습 무인 기본기)
  // 마법사
  | "v2c_mage_fireball" // 화염구
  | "v2c_mage_barrage" // 마력 탄막
  | "v2c_mage_shield" // 마나 보호막
  | "v2c_mage_meditate" // 명상
  | "v2c_mage_boltcast" // 마력탄 (0코스트 마법 — 직업 킷 재설계)
  // 도적 (예기 패시브 제외)
  | "v2c_rogue_poison" // 독침
  // 기본 직업 패시브 스킬(학습+SP 슬롯해야 효과 — 직업 킷 재설계)
  | "v2c_warrior_might" // 근력 (힘 +10%)
  | "v2c_martial_fortitude" // 강건 (활력 +10%)
  | "v2c_mage_acumen" // 총명 (지능 +10%)
  | "v2c_rogue_finesse" // 예기 (민첩이 공격력 보조)
  | "v2c_survivor_firstaid" // 응급 처치 (잃은 HP 회복)
  | "v2c_survivor_knowledge" // 생존 지식 (최대 HP)
  // 모험가(none) 킷 — 착용형 패시브 2종
  | "v2c_none_toughness" // 강인함 (최대 HP +10%)
  | "v2c_none_diligence" // 수련 (승리당 숙달 +1)
  // ── 상위 직업 킷(2026-06-17) — 액티브 1 + 고유 % 패시브 1 ──
  // 액티브
  | "v2c_shieldman_bash" // 방패 타격 (방어력 기반 단일)
  | "v2c_squire_cleave" // 돌격 (물리 단일·파고들기)
  | "v2c_boxer_combo" // 연권 (물리 다단)
  | "v2c_monk_palm" // 철포 (받피감 버프 — selfBuffPct·수도승 탱)
  | "v2c_caster_bolt" // 마탄 (마법 단일 강)
  | "v2c_acolyte_smite" // 치유 (자힐 — heal)
  | "v2c_assassin_ambush" // 처단 (처형 — executeDamage·LUK 비례)
  | "v2c_archer_volley" // 속박 사격 (딜 + 취약 enemyVuln)
  | "v2c_venomist_toxiccloud" // 독무 (중독 누적 + 중독 스택 비례딜)
  | "v2c_camper_camp" // 야영 (잃은 HP 회복)
  | "v2c_ironman_brace" // 버티기 (보호막)
  // 고유 패시브(% 가산 — 직업마다 서로 다른 축)
  | "v2c_shieldman_vitality" // 방벽 (방어 +10%)
  | "v2c_squire_might" // 근력 II (힘 +15%)
  | "v2c_boxer_fortitude" // 보법 (회피 +8%·권사)
  | "v2c_monk_spirit" // 강건 II (활력 +20%·수도승)
  | "v2c_caster_acumen" // 총명 II (지능 +20%)
  | "v2c_acolyte_mana" // 회복 (회복량 +20%·healPowerPct, 옛 마나에서 리스킨)
  | "v2c_assassin_fortune" // 행운 (행운 +10%)
  | "v2c_archer_agility" // 민첩 (민첩 +10%)
  | "v2c_venomist_corrosion" // 부식 (중독된 적 방어 감소)
  | "v2c_camper_ration" // 비상식량 (회복 + 최대 HP)
  | "v2c_ironman_body" // 단련된 몸 (최대 HP)
  // ── 고차 4직업 킷(tier 3, A 메타 PR-3) — 액티브 1(강) + III티어 % 패시브 ──
  // 액티브(강)
  | "v2c_paladin_cleave" // 심판 (물리 단일 + 무력 디버프)
  | "v2c_brawler_combo" // 벽력권 (물리 단일 강)
  | "v2c_magus_bolt" // 마력 작렬 (마법 단일)
  | "v2c_ranger_ambush" // 연사 (DEX 비례 3연사)
  // 고차 패시브(다양성 2차: paladin 만 효과 리스킨[공방], brawler/magus/ranger 는 직군 축 % 유지)
  | "v2c_paladin_might3" // 기사도 (힘 +10% & 방어 +10%)
  | "v2c_brawler_fortitude3" // 보법 II (회피 +12%·격투가)
  | "v2c_magus_acumen3" // 총명 III (지능 +30%)
  | "v2c_ranger_finesse3" // 민첩 II (DEX +20%·궁수 민첩의 상위판)
  // ── 고차 두 번째 갈래(tier 3·방패병/수도승/사제/자객 계승) — 액티브 1 + 고유 패시브 ──
  // 액티브
  | "v2c_guardian_bash" // 방패 강타 (방어기반 단일)
  | "v2c_berserker_bloodslash" // 사혈격 (HP 소모 물리 강타)
  | "v2c_shaman_hex" // 저주 (마법 피해 + 약화)
  | "v2c_warmonk_kick" // 연환각 (물리 다단)
  | "v2c_bishop_heal" // 대치유 (자힐 — heal)
  | "v2c_shadow_assassinate" // 암살 (처형 — executeDamage·LUK 비례)
  | "v2c_venomancer_miasma" // 맹독 확산 (중독 심화 + 중독 스택 비례딜)
  | "v2c_fieldmedic_treatment" // 현장 처치 (큰 자힐)
  | "v2c_extremesurvivor_struggle" // 사투 (회복 + 보호막)
  // 고유 패시브(형제와 다른 축: 받피감/회피/회복강화/치명피해)
  | "v2c_guardian_bulwark3" // 방벽 II (방어 +20%)
  | "v2c_berserker_madness3" // 광기 (잃은 HP 비례 공격력)
  | "v2c_shaman_omen3" // 흉조 (마법취약 누적)
  | "v2c_warmonk_evasion3" // 강건 III (활력 +30%·무승)
  | "v2c_bishop_blessing3" // 회복 II (회복량 +30%·사제 회복의 상위판)
  | "v2c_shadow_lethality3" // 그늘 (치명 피해 +25%)
  | "v2c_venomancer_corrosion3" // 침식 (중독된 적 방어 감소 II)
  | "v2c_fieldmedic_training" // 구급 숙련 (회복 + 최대 HP)
  | "v2c_extremesurvivor_adaptation" // 극한 적응 (최대 HP + 받피감)
  // ── 하이브리드 킷(tier 3·전사×마법) ──
  | "v2c_templar_smite" // 성기사: 심판의 빛 (물리 타격 + 자힐)
  | "v2c_templar_aegis" // 성기사: 신성한 가호 (방어 +10% & 회복 강화 +10%)
  | "v2c_spellblade_strike" // 마검사: 마검 일섬 (물리 + 마법 이중 타격)
  | "v2c_spellblade_unity" // 마검사: 마검 합일 (힘 +12% & 지능 +12%)
  | "v2c_bloodtemplar_stigma" // 혈성기사: 피의 성흔 (HP 소모 피해 + 회복)
  | "v2c_bloodtemplar_martyr" // 혈성기사: 순교의 광기 (광전 + 회복강화)
  | "v2c_darkpriest_reap" // 암흑사제: 영혼 수확 (처형 + 회복)
  | "v2c_darkpriest_blessing" // 암흑사제: 검은 축복 (회복강화 + 치명피해)
  // ── 심화 4직업 킷(tier 4) — 액티브 1(강) + 패시브(직군마다 다른 효과·기존 어휘) ──
  | "v2c_veteran_cleave" // 왕실 검술 (처형딜·STR 비례·적 HP15%↓ ×2)
  | "v2c_sensei_combo" // 권룡파 (방깎 단일 — 무력 디버프·권룡)
  | "v2c_sage_bolt" // 마력 폭사 (마법 단일)
  | "v2c_chief_strike" // 관통사 (DEX 비례 단일·관통 20% 방어무시 추가타)
  | "v2c_veteran_lethal" // 필살 (치명 피해 +30%)
  | "v2c_sensei_ironbody" // 패왕 (힘 +20%·권룡)
  | "v2c_sage_insight" // 간파 (치명 확률 +10%)
  | "v2c_chief_afterimage" // 매의 눈 (명중 +20)
  // ── 도적 4차 두 번째 갈래(암살자·그림자 계보) ──
  | "v2c_phantom_ambush" // 기습 (풀피 적에게 큰 오프너 — ambushDamage·LUK 비례)
  | "v2c_phantom_stealth" // 은신 (회피 +16%)
  // ── 도적 4차 세 번째 갈래(독왕·독술 계보) ──
  | "v2c_venomlord_plague" // 독왕진 (중독 폭발·LUK 비례)
  | "v2c_venomlord_sovereign" // 독왕 (중독된 적 방어 감소 III)
  // ── 마법 4차 두 번째 갈래(원소술사) ──
  | "v2c_elementalist_magic" // 속성 마법 (캐릭 속성별 효과 분기)
  | "v2c_elementalist_mastery" // 원소 통달 (상성 유리/불리 +15%p 양방향)
  // ── 마법 4차 세 번째 갈래(대주술사·주술사 계승) ──
  | "v2c_archshaman_rite" // 금단 의식 (마법취약 폭발)
  | "v2c_archshaman_curse" // 금기 주술 (마법취약 심화)
  // ── 마법 4차 네 번째 갈래(주교·대사제 계승) ──
  | "v2c_archbishop_sanctuary" // 성역 선포 (낮은 회복 + 받피감)
  | "v2c_archbishop_grace" // 성직 권위 (회복 + 최대 HP)
  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) ──
  | "v2c_warden_aegis" // 수호의 방벽 (보호막 — 최대HP 10%)
  | "v2c_warden_thorns" // 가시 방벽 (피격 시 방어력만큼 반사)
  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) ──
  | "v2c_warlord_bloodbath" // 혈전 (HP 소모 강타)
  | "v2c_warlord_slaughter" // 살육본능 (광기 상위)
  // ── 무도 4차 두 번째 갈래(투승·무승 계승) ──
  | "v2c_battlemonk_counter" // 반격 (피격 시 확률 반격 — 옛 절정 킷 상속)
  | "v2c_battlemonk_ironbody" // 철신 (최대 HP +20%)
  // ── 생존자 4차 갈래(구조 전문가·불굴의 생환자) ──
  | "v2c_rescueexpert_rescue" // 긴급 구조 (큰 자힐 + 보호막)
  | "v2c_rescueexpert_support" // 생환 지원 (회복 + 최대 HP)
  | "v2c_returner_survive" // 생환 (자힐 + 큰 보호막)
  | "v2c_returner_undying" // 불굴 (최대 HP + 받피감)
  // ── 5차 핵심 5직업 ──
  | "v2c_swordmaster_cut" // 검격 (안정 물리 피해 + 방깎)
  | "v2c_swordmaster_focus" // 검의 집중 (힘 + 치명피해)
  | "v2c_ironknight_guard" // 철벽 태세 (보호막 + 받피감)
  | "v2c_ironknight_wall" // 장벽술 (방어 + 반사)
  | "v2c_arcanist_burst" // 비전 폭발 (순수 마법 피해)
  | "v2c_arcanist_theory" // 비전 이론 (지능 + 치명확률)
  | "v2c_marksman_shot" // 정밀 사격 (DEX 관통 다단)
  | "v2c_marksman_aim" // 조준 (민첩 + 명중)
  | "v2c_nightshade_eclipse" // 월식 (오프너 + 처형)
  | "v2c_nightshade_cloak"; // 밤의 장막 (회피 + 치명피해)

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
    description: "전의를 끌어올려 공격력을 높인다.", mpCost: 24, cooldown: 0, procChance: 100,
    effects: [{ kind: "selfBuff", stat: "str", pct: 10, turns: 3 }],
  },

  // ═══ 무도가 (STR 딜 · VIT 앵커) — 콤보/지속/기동 ═══
  v2c_martial_combo: {
    id: "v2c_martial_combo", name: "연환 난타", stat: "str", category: "attack", tier: 1,
    description: "다섯 번 연속으로 두들긴다.", mpCost: 24, cooldown: 0, procChance: 40,
    effects: hits(5, 0.25, 36),
  },
  v2c_martial_chi: {
    id: "v2c_martial_chi", name: "기공 순환", stat: "vit", category: "heal", tier: 2,
    description: "기를 돌려 잃은 활력을 일부 되찾는다.", mpCost: 0, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 5 }],
  },

  // ═══ 마법사 (INT · 마법) — 캐스터 (마력탄 등 마법 스킬로 마법 공격) ═══
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
    description: "마나로 보호막을 두른다. 마나가 클수록 두껍다.", mpCost: 42, cooldown: 0, procChance: 100,
    effects: [{ kind: "shield", pctMaxHp: 10, pctMaxMp: 10, turns: 3 }],
  },
  v2c_mage_meditate: {
    id: "v2c_mage_meditate", name: "명상", stat: "int", category: "buff", tier: 2,
    description: "정신을 가다듬어 마나를 회복한다.", mpCost: 0, cooldown: 0, procChance: 100,
    effects: [{ kind: "manaRestore", pctMaxMp: 7 }],
  },

  // ═══ 도적 (STR 딜 · DEX 앵커 보조) — 정밀/크리/독 (예기 패시브로 DEX 보조) ═══
  v2c_rogue_poison: {
    id: "v2c_rogue_poison", name: "독침", stat: "str", category: "attack", tier: 2,
    description: "독을 바른 침으로 찔러 중독시킨다.", mpCost: 26, cooldown: 0, procChance: 30,
    effects: [
      dmg(0.6, 60),
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 18, stacks: 2 },
    ],
  },

  // ═══ 직업 킷 재설계 — 기본 직업 시그니처 액티브(2026-06-17) ═══
  // 무인 하급 권법(단일 딜)·마법사 마력탄(0코스트 마법). 강타/연격/독침은 기존 재사용.
  v2c_martial_steelguard: {
    // 견습 무인 기본기 — 무인 재설계(2026-06-22): 옛 철포(받피감 버프)에서 단일 딜로 교체(철포는 수도승
    //   monk_palm 으로 이전). id 유지(세이브 호환). 강타급 단일타(1.0/140). PvE/PvP 공용.
    id: "v2c_martial_steelguard", name: "하급 권법", stat: "str", category: "attack", tier: 1,
    description: "기본을 다진 주먹을 곧게 내지른다.", mpCost: 30, cooldown: 0, procChance: 30,
    effects: [dmg(1.0, 140)],
  },
  v2c_mage_boltcast: {
    id: "v2c_mage_boltcast", name: "마력탄", stat: "int", category: "attack", tier: 1,
    description: "마력을 뭉쳐 쏜다.", mpCost: 0, cooldown: 0, procChance: 100,
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
  v2c_survivor_firstaid: {
    id: "v2c_survivor_firstaid", name: "응급 처치", stat: "vit", category: "heal", tier: 1,
    description: "급한 상처부터 막아 잃은 체력을 일부 되찾는다.", mpCost: 24, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 20 }],
  },
  v2c_survivor_knowledge: {
    id: "v2c_survivor_knowledge", name: "생존 지식", stat: "vit", category: "passive", tier: 1,
    description: "위험한 환경에서 버티는 요령. 최대 체력이 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 10 },
  },

  // ── 모험가(none) 킷 — 착용형 패시브 2종(학습+SP 슬롯) ──
  v2c_none_toughness: {
    id: "v2c_none_toughness", name: "강인함", stat: "vit", category: "passive", tier: 1,
    description: "모험으로 단련된 몸. 최대 체력이 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 10 },
  },
  v2c_none_diligence: {
    id: "v2c_none_diligence", name: "수련", stat: "luk", category: "passive", tier: 1,
    description: "꾸준한 수행. 사냥에서 승리할 때마다 숙달 포인트를 +1 더 얻는다.", mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 3,
    learnCost: 8000,
    passive: { profPerKillBonus: 1 },
  },

  // ═══ 상위 직업 킷(2026-06-17) — 액티브 1 + 고유 % 패시브 1 ═══
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
    // 수도승 = 순수 탱(무인 재설계 2026-06-22) — 옛 선풍각(회피 버프)에서 철포(받피감 버프)로 교체.
    //   강건 II(활력%) 패시브와 합쳐 탱 정체성(회피는 권사 갈래 보법으로 이전). id 유지. 딜은 평타로. PvE/PvP 공용.
    id: "v2c_monk_palm", name: "철포", stat: "vit", category: "buff", tier: 2,
    description: "몸을 굳혀 한동안 받는 피해를 줄인다.", mpCost: 24, cooldown: 0, procChance: 100,
    effects: [{ kind: "selfBuffPct", target: "damageReduction", pct: 12, turns: 3 }],
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
    description: "신성한 힘으로 잃은 상처를 메운다.", mpCost: 30, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 10 }],
  },
  // ── 도적 갈래 ──
  v2c_assassin_ambush: {
    // 자객 = 행운/크리(dex10/luk10) — 처형 데미지가 행운(LUK)에 비례(scaling:"luk"). LUK 원시스탯이
    //   커서 계수 작게(0.2 ≈ str→atk 0.15급). LUK 빌드가 크리(확률·피해)+직접딜 양쪽 이득(행운직
    //   정체성). 적 HP 15%↓ ×2.0. id 유지. PvE/PvP 공용. (협동보스 등 대형 HP풀에서 30% 처형창이
    //   과도해 15%로 축소 — 마무리 한정으로 좁힘.)
    id: "v2c_assassin_ambush", name: "처단", stat: "luk", category: "attack", tier: 2,
    description: "행운이 이끄는 일격으로 숨통을 끊는다. 적이 위태로울수록 치명적이다.", mpCost: 34, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 0.2, baseFlatByTier: [185, 185, 185], hpThresholdPct: 15, bonusMult: 2.0, scaling: "luk" },
    ],
  },
  v2c_archer_volley: {
    // 궁수 = 물량/유틸(역할화 2차) — 딜 + 취약(enemyVuln, 적 받는 피해 +%). 디버프 지원으로 다른
    //   딜을 증폭. id 유지. enemyVuln 배선됨. PvE/PvP 공용.
    id: "v2c_archer_volley", name: "속박 사격", stat: "str", category: "attack", tier: 2,
    description: "약점을 꿰뚫어 한동안 받는 피해를 키운다.", mpCost: 30, cooldown: 0, procChance: 35,
    effects: [dmg(0.9, 90), { kind: "enemyVuln", pct: 20, turns: 3 }],
  },
  v2c_venomist_toxiccloud: {
    // 독술사 = 독 스택 운용. 첫 시전은 중독을 깊게 깔고, 이후 시전은 기존 중독 스택을 직접 피해로 회수한다.
    //   stackPayoffDamage 는 현재 적 상태의 중독 스택을 읽는다. LUK 비례로 자객과 같은 행운 축을 공유하되
    //   처형 대신 지속 누적·방어 약화 쪽으로 차별.
    id: "v2c_venomist_toxiccloud", name: "독무", stat: "luk", category: "attack", tier: 2,
    description: "독안개를 흩뿌려 중독을 깊게 누적시키고, 이미 중독된 적에게 더 아프게 파고든다.",
    mpCost: 32, cooldown: 0, procChance: 35,
    effects: [
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 14, stacks: 3 },
      { kind: "stackPayoffDamage", tag: "poison", statCoef: 0.12, baseFlatByTier: [70, 70, 70], perStackFlat: 18, scaling: "luk" },
    ],
  },
  v2c_camper_camp: {
    id: "v2c_camper_camp", name: "야영", stat: "vit", category: "heal", tier: 2,
    description: "짧게 숨을 고르고 몸을 추슬러 잃은 체력을 회복한다.",
    mpCost: 30, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 25 }],
  },
  v2c_ironman_brace: {
    id: "v2c_ironman_brace", name: "버티기", stat: "vit", category: "buff", tier: 2,
    description: "몸을 굳혀 한동안 피해를 받아낼 보호막을 만든다.",
    mpCost: 30, cooldown: 0, procChance: 100,
    effects: [{ kind: "shield", pctMaxHp: 10, turns: 3 }],
  },

  // ── 상위 직업 고유 패시브 — 학습 + SP 슬롯해야 상시 효과 ──
  //   다양성(A 메타): 스탯%뿐 아니라 회피·치명·흡혈 등 "작동 방식" 사이드그레이드. 직업 테마에 맞춤
  //   (수도승 회피·자객 치명·권사 흡혈·술사 치명피해). id 는 세이브 호환 위해 유지(효과만 리스킨).
  v2c_shieldman_vitality: {
    // 방패병 = 방어 탱(방패 타격이 방어기반 딜) — 방벽 진행의 1차(2026-06-22, 사용자 지정).
    //   진행: 방패병 방벽 +10% → 가디언(계승) 방벽 II +20%. 옛 "체력"(HP+12%)에서 방어%로 전환.
    id: "v2c_shieldman_vitality", name: "방벽", stat: "vit", category: "passive", tier: 2,
    description: "방패로 받아낸다. 물리 방어력이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 10 },
  },
  v2c_squire_might: {
    id: "v2c_squire_might", name: "근력 II", stat: "str", category: "passive", tier: 2,
    description: "거듭된 단련. 힘이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 15 } },
  },
  v2c_boxer_fortitude: {
    // 보법(권사) — 무인 재설계(2026-06-22): 옛 포식(흡혈)에서 회피로 전환. 권사→격투가 갈래의 회피
    //   정체성 1차(보법 +8% → 격투가 보법 II +12%). 흡혈은 과한 유틸이라 보류(후속 재사용). id 유지.
    //   회피는 PvE/PvP 양쪽 소비(명중 대결). stat 필드는 그룹 메타(vit).
    id: "v2c_boxer_fortitude", name: "보법", stat: "vit", category: "passive", tier: 2,
    description: "흐르는 듯한 발놀림. 회피가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 8 },
  },
  v2c_monk_spirit: {
    // 강건 II(수도승) — 무인 재설계(2026-06-22): 옛 허보(회피)에서 활력%로 전환. 수도승→무승 탱 갈래의
    //   활력 정체성(견습 강건 +10% → 수도승 강건 II +20% → 무승 강건 III +30%). 회피는 권사 갈래로 이전. id 유지.
    id: "v2c_monk_spirit", name: "강건 II", stat: "vit", category: "passive", tier: 2,
    description: "거듭 다진 몸. 활력이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { vit: 20 } },
  },
  v2c_caster_acumen: {
    // 마법 라인 총명 진행(2026-06-22): 견습 총명 +10% → 마법사 총명 II +20% → 마도사 총명 III +30%.
    //   순수 INT 스케일로 통일(옛 "맹공"=치명피해 크리축에서 전환 — 라인 정합). 크리축은 그림자/정예/현자가 담당.
    id: "v2c_caster_acumen", name: "총명 II", stat: "int", category: "passive", tier: 2,
    description: "통찰이 깊어져 지능이 더 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 20 } },
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
  v2c_venomist_corrosion: {
    id: "v2c_venomist_corrosion", name: "부식", stat: "luk", category: "passive", tier: 2,
    description: "독이 스며든 적의 방어를 무르게 한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 12 },
  },
  v2c_camper_ration: {
    id: "v2c_camper_ration", name: "비상식량", stat: "vit", category: "passive", tier: 2,
    description: "아껴둔 보급품과 처치 요령. 회복량과 최대 체력이 함께 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 10, maxHpPct: 5 },
  },
  v2c_ironman_body: {
    id: "v2c_ironman_body", name: "단련된 몸", stat: "vit", category: "passive", tier: 2,
    description: "고된 환경을 견딘 몸. 최대 체력이 크게 늘어난다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 15 },
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
    // 궁사 = 궁술/민첩(dex) — 기습(암살 느낌)→연사 리스킨(id 유지·궁수 라인 테마 정합). 화살을
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
    // 보법 II(격투가) — 무인 재설계(2026-06-22): 옛 강건 III(활력%)에서 회피로 전환. 권사 보법(+8%)의
    //   상위판(회피 갈래 심화). 활력 진행은 수도승 갈래(강건 II/III)로 이전. id 유지(세이브 호환).
    id: "v2c_brawler_fortitude3", name: "보법 II", stat: "vit", category: "passive", tier: 3,
    description: "한층 깊어진 보법. 회피가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 12 },
  },
  v2c_magus_acumen3: {
    id: "v2c_magus_acumen3", name: "총명 III", stat: "int", category: "passive", tier: 3,
    description: "극에 다다른 통찰. 지능이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 30 } },
  },
  v2c_ranger_finesse3: {
    // 궁사 = 궁수 계승 — 직군 축(민첩 dex%). 궁수 "민첩"(dex +10%)의 상위판이라 "민첩 II".
    //   형제 강건 III(vit+20%)·총명 III(int+20%)와 동일 구조(직군 주스탯 +20%). id 유지(세이브
    //   호환). 옛 명중(정밀) 효과에서 dex% 로 전환 — 대사제 회복 II(#1007)와 같은 상위판 통일.
    id: "v2c_ranger_finesse3", name: "민첩 II", stat: "dex", category: "passive", tier: 3,
    description: "극에 다다른 몸놀림. 민첩이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { dex: 20 } },
  },

  // ── 고차 두 번째 갈래 액티브(tier 3·방패병/수도승/사제/자객 계승) ──
  v2c_guardian_bash: {
    // 가디언 = 방어 탱 — 데미지가 방어력 기반(scaling:"def"). 방어%(방벽) 패시브와 시너지(방어=딜+탱).
    //   방패병 방패 타격과 같은 def 경로·tier-3 라 base 상향. DEF_PER_VIT<ATK_PER_STR 보정 계수 1.8.
    id: "v2c_guardian_bash", name: "방패 강타", stat: "vit", category: "attack", tier: 3,
    description: "방패를 앞세워 묵직하게 후려친다. 방어력이 높을수록 강하다.", mpCost: 36, cooldown: 0, procChance: 30,
    effects: [dmg(1.8, 220, "def")],
  },
  v2c_berserker_bloodslash: {
    // 광전사 = 견습 기사에서 갈라지는 유리대포 라인. 현재 HP를 일부 태워 그 소모량까지 피해로 돌린다.
    //   저HP 패시브(광기)와 자연스럽게 맞물리지만, 자동전투 눈덩이를 막기 위해 현재 HP 기준 소모로 둔다.
    id: "v2c_berserker_bloodslash", name: "사혈격", stat: "str", category: "attack", tier: 3,
    description: "제 피를 뿌리듯 베어낸다. 현재 체력을 일부 소모해 피해를 키운다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 8, statCoef: 1.25, baseFlatByTier: [220, 220, 220], soakRatio: 1.4 },
    ],
  },
  v2c_shaman_hex: {
    // 주술사 = 마법사 계보의 저주 특화. 직접 피해는 마도사보다 낮지만 약화와 마법취약 패시브로 후속 피해를 키운다.
    id: "v2c_shaman_hex", name: "저주", stat: "int", category: "attack", tier: 3,
    description: "불길한 주문으로 적을 옭아매고 약화시킨다.", mpCost: 42, cooldown: 0, procChance: 30,
    effects: [dmg(1.15, 185, "magic"), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.약화 }],
  },
  v2c_warmonk_kick: {
    // 무승(warmonk)=vit/spi 빌드인데 액티브가 atk(str) 스케일이라 정체성 불일치(str 안 키움→딜 죽음).
    //   vit 스케일로 교체(나한권 dmgT(1.5,..,"vit") 선례). ⚠️ coef 0.4 = 나한권 단일 1.5 의 4타 등가
    //   추정치 — vit 원시값이 atk≫ 라 계수 작게. **sim/오너 승인 필요**(미검증 밸런스 수치).
    id: "v2c_warmonk_kick", name: "연환각", stat: "vit", category: "attack", tier: 3,
    description: "물 흐르듯 네 번 연달아 차낸다.", mpCost: 32, cooldown: 0, procChance: 40,
    effects: hits(4, 0.4, 50, "vit"),
  },
  v2c_bishop_heal: {
    id: "v2c_bishop_heal", name: "대치유", stat: "int", category: "heal", tier: 3,
    description: "성스러운 빛으로 잃은 상처를 크게 메운다.", mpCost: 40, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 18 }],
  },
  v2c_shadow_assassinate: {
    // 그림자 = 자객 계승 — 처형 데미지가 행운(LUK)에 비례(scaling:"luk"·계수 작게). 자객 처단보다
    //   한 단계 강(계수·기본·배수↑). 적 HP 15%↓ ×2.2. PvE/PvP 공용. (처단과 동일 사유로 30%→15%.)
    id: "v2c_shadow_assassinate", name: "암살", stat: "luk", category: "attack", tier: 3,
    description: "그림자에서 솟아 단번에 숨통을 끊는다. 적이 위태로울수록 치명적이다.", mpCost: 38, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 0.22, baseFlatByTier: [210, 210, 210], hpThresholdPct: 15, bonusMult: 2.2, scaling: "luk" },
    ],
  },
  v2c_venomancer_miasma: {
    // 맹독술사 = 독술사 위 계보. 중독 스택을 더 깊게 쌓고, 이미 걸린 중독을 LUK 비례 피해로 회수한다.
    id: "v2c_venomancer_miasma", name: "맹독 확산", stat: "luk", category: "attack", tier: 3,
    description: "맹독을 퍼뜨려 중독을 깊게 만들고, 쌓인 독을 터뜨린다.",
    mpCost: 38, cooldown: 0, procChance: 35,
    effects: [
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 18, stacks: 3 },
      { kind: "stackPayoffDamage", tag: "poison", statCoef: 0.16, baseFlatByTier: [120, 120, 120], perStackFlat: 24, scaling: "luk" },
    ],
  },
  v2c_fieldmedic_treatment: {
    id: "v2c_fieldmedic_treatment", name: "현장 처치", stat: "vit", category: "heal", tier: 3,
    description: "전투 중에도 침착하게 상처를 정리해 잃은 체력을 크게 회복한다.",
    mpCost: 40, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 35 }],
  },
  v2c_extremesurvivor_struggle: {
    id: "v2c_extremesurvivor_struggle", name: "사투", stat: "vit", category: "heal", tier: 3,
    description: "숨이 끊기기 직전의 집중으로 상처를 막고 보호막을 세운다.",
    mpCost: 40, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 25 }, { kind: "shield", pctMaxHp: 8, turns: 3 }],
  },

  // ── 고차 두 번째 갈래 고유 패시브(tier 3·형제와 다른 축) ──
  v2c_guardian_bulwark3: {
    // 가디언 = 방패병 계승 — 순수 방어%(방패 강타가 방어기반이라 방어=딜+탱 시너지). 기사(공방 균형)·
    //   견습기사(힘%)와 다른 축. defPct 는 PvE/PvP 양쪽(def=damageBetween 공용).
    //   방벽 진행의 2차(방패병 방벽 +10% → 가디언 방벽 II +20%, 2026-06-22).
    id: "v2c_guardian_bulwark3", name: "방벽 II", stat: "vit", category: "passive", tier: 3,
    description: "온몸으로 받아낸다. 물리 방어력이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 20 },
  },
  v2c_berserker_madness3: {
    id: "v2c_berserker_madness3", name: "광기", stat: "str", category: "passive", tier: 3,
    description: "상처가 깊을수록 더 사납게 몰아친다. 잃은 체력 비율에 따라 공격력이 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { berserkAtkPctPerLostHpPct: 0.45 },
  },
  v2c_shaman_omen3: {
    id: "v2c_shaman_omen3", name: "흉조", stat: "int", category: "passive", tier: 3,
    description: "주문이 적의 혼을 흐트러뜨린다. 스킬 적중 시 마법취약을 누적시킨다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 5 },
  },
  v2c_warmonk_evasion3: {
    // 강건 III(무승) — 무인 재설계(2026-06-22): 옛 허공보(회피)에서 활력%로 전환. 수도승 강건 II(+20%)의
    //   상위판(탱 갈래 정점). 회피는 권사 갈래(보법)로 이전. id 유지(세이브 호환).
    id: "v2c_warmonk_evasion3", name: "강건 III", stat: "vit", category: "passive", tier: 3,
    description: "극에 다다른 내공. 활력이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { vit: 30 } },
  },
  v2c_bishop_blessing3: {
    // 대사제 = 사제 계승 — 회복 강화(healPowerPct·SPI 지원). 마도사(지능%)와 다른 축.
    id: "v2c_bishop_blessing3", name: "회복 II", stat: "int", category: "passive", tier: 3,
    description: "치유의 비결을 더 깊이 깨우쳐 회복량이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 30 },
  },
  v2c_shadow_lethality3: {
    id: "v2c_shadow_lethality3", name: "그늘", stat: "luk", category: "passive", tier: 3,
    description: "급소를 노리는 일격. 치명타 피해가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 25 }, // 크리축 차수 단조 — 그림자=3차(2차20<3차25<4차30).
  },
  v2c_venomancer_corrosion3: {
    id: "v2c_venomancer_corrosion3", name: "침식", stat: "luk", category: "passive", tier: 3,
    description: "맹독이 갑옷 틈을 파고든다. 중독된 적의 방어를 더 크게 낮춘다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 20 },
  },
  v2c_fieldmedic_training: {
    id: "v2c_fieldmedic_training", name: "구급 숙련", stat: "vit", category: "passive", tier: 3,
    description: "현장에서 익힌 처치법. 회복량과 최대 체력이 함께 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 15, maxHpPct: 8 },
  },
  v2c_extremesurvivor_adaptation: {
    id: "v2c_extremesurvivor_adaptation", name: "극한 적응", stat: "vit", category: "passive", tier: 3,
    description: "혹독한 환경에 몸을 맞춘다. 최대 체력이 늘고 받는 피해가 줄어든다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 20, damageTakenReductionPct: 5 },
  },

  // ── 하이브리드(tier 3·성기사 = 전사×마법) — 딜+자힐 탱 ──
  v2c_templar_smite: {
    // 성기사 = 기사의 타격 + 사제의 치유 결합. 물리 일격과 함께 잃은 체력 일부를 회복(가호 패시브
    //   healPowerPct 와 시너지). 힐을 동반하므로 단일 강타(심판 1.3/230)보다 계수 낮춤. 엔진 기존
    //   효과만 사용(damage + heal 혼합 — resolveV2SkillCast 가 effects 순회 처리·신규 배선 0). PvE/PvP 공용.
    id: "v2c_templar_smite", name: "심판의 빛", stat: "str", category: "attack", tier: 3,
    description: "성스러운 빛을 검에 실어 내리친다. 그 빛이 제 상처마저 어루만진다.", mpCost: 42, cooldown: 0, procChance: 30,
    // 자힐 = 잃은 HP 의 10%(옛 20% 는 과해 하향, 오너 2026-06-22). 가호 healPowerPct 와 곱연산.
    effects: [dmg(1.1, 190), { kind: "heal", pctLostHp: 10 }],
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
    passive: { statPct: { str: 12, int: 12 } }, // 8→12(오너 2026-06-22) — 이중 공격축 분산 세금 보상.
  },
  v2c_bloodtemplar_stigma: {
    id: "v2c_bloodtemplar_stigma", name: "피의 성흔", stat: "str", category: "attack", tier: 3,
    description: "피를 성흔처럼 새겨 적을 베고, 흘린 만큼 상처를 봉합한다.",
    mpCost: 44, cooldown: 0, procChance: 30,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 8, statCoef: 1.15, baseFlatByTier: [190, 190, 190], soakRatio: 1.2 },
      { kind: "heal", pctLostHp: 12 },
    ],
  },
  v2c_bloodtemplar_martyr: {
    id: "v2c_bloodtemplar_martyr", name: "순교의 광기", stat: "str", category: "passive", tier: 3,
    description: "상처와 신념이 뒤섞인다. 잃은 체력에 따라 공격력이 오르고 회복량도 늘어난다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { berserkAtkPctPerLostHpPct: 0.35, healPowerPct: 12 },
  },
  v2c_darkpriest_reap: {
    id: "v2c_darkpriest_reap", name: "영혼 수확", stat: "luk", category: "attack", tier: 3,
    description: "약해진 영혼을 거두어 들인다. 적이 위태로울수록 깊게 베고 제 상처를 메운다.",
    mpCost: 42, cooldown: 0, procChance: 35,
    effects: [
      { kind: "damage", statCoef: 0.18, baseFlat: 120, scaling: "luk" },
      { kind: "executeDamage", statCoef: 0.24, baseFlatByTier: [210, 210, 210], hpThresholdPct: 20, bonusMult: 2.4, scaling: "luk" },
      { kind: "heal", pctLostHp: 12 },
    ],
  },
  v2c_darkpriest_blessing: {
    id: "v2c_darkpriest_blessing", name: "검은 축복", stat: "luk", category: "passive", tier: 3,
    description: "어두운 축복이 치유와 급소 감각을 함께 날카롭게 한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 18, critDmgPct: 20 },
  },

  // ── 심화 4직업 액티브(tier 4) — 고차보다 한 단계 강한 공격. tier 필드는 3 유지(비용 동일·
  //   rubricSpCost 가 클램프) — 직업은 4차지만 스킬 파워버킷은 상급. ──
  v2c_veteran_cleave: {
    // 정예 기사 = 기사 라인 정점. 참격→왕실 검술 리스킨(id 유지). 처형 딜(공격력 기반·scaling 생략=
    //   atk) — 적 HP 낮을수록 치명(필살 치명피해 패시브와 시너지). 적 HP 15%↓ ×2.0(옛 30% 과해 하향,
    //   오너 2026-06-22). PvE/PvP 공용.
    id: "v2c_veteran_cleave", name: "왕실 검술", stat: "str", category: "attack", tier: 3,
    description: "왕실 검법의 정수를 담은 일격. 위태로운 적일수록 깊이 파고든다.", mpCost: 40, cooldown: 0, procChance: 30,
    effects: [
      { kind: "executeDamage", statCoef: 1.3, baseFlatByTier: [240, 240, 240], hpThresholdPct: 15, bonusMult: 2.0 },
    ],
  },
  v2c_sensei_combo: {
    // 권룡파(권룡 4차 액티브) — 무인 재설계(2026-06-22): 옛 반격(패시브)에서 방깎 단일 액티브로 교체.
    //   격투가 라인(회피·공격) 정점 — 용이 솟구치듯 내지르며 적 방어(무력=vit−15%)를 무너뜨린다.
    //   계보 파쇄(0.7/90)·심판(1.3/230) 위 t4 강단일(1.5/290)+무력. id 유지(세이브 호환). 반격은 투승으로 이전.
    id: "v2c_sensei_combo", name: "권룡파", stat: "str", category: "attack", tier: 3,
    description: "용이 솟구치듯 내지르는 일권. 적의 방어를 무너뜨린다.", mpCost: 42, cooldown: 0, procChance: 30,
    effects: [dmg(1.5, 290), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_sage_bolt: {
    id: "v2c_sage_bolt", name: "마력 폭사", stat: "int", category: "attack", tier: 3,
    description: "극대화한 마력을 터뜨린다.", mpCost: 46, cooldown: 0, procChance: 30,
    effects: [dmg(1.45, 235, "magic")],
  },
  v2c_chief_strike: {
    // 신궁(도적 4차·궁수 라인 정점) = 암격(암살 느낌·str)→관통사 리스킨(id 유지). 궁술 테마로
    //   민첩(dex) 비례 단일 강사(궁사 연사=다단과 차별). DEX 원시스탯이 커서 계수 작게.
    //   "관통사" 정체성 — pierceDamagePct 20: 0방어 피해의 20% 를 방어로 안 깎이는 추가분으로
    //   더해 고방어 적을 꿰뚫는다(저방어 적엔 ~+20%, 탱커엔 상대 페이오프↑).
    id: "v2c_chief_strike", name: "관통사", stat: "dex", category: "attack", tier: 3,
    description: "단 한 발에 모든 것을 실어 갑옷째 꿰뚫는다.", mpCost: 40, cooldown: 0, procChance: 30,
    effects: [{ kind: "damage", statCoef: 0.35, baseFlat: 250, scaling: "dex", pierceDamagePct: 20 }],
  },

  // ── 심화 4직업 패시브(tier 4) — 직군마다 다른 효과(라인 비포화·기존 어휘, PvP-안전) ──
  v2c_veteran_lethal: {
    // 전사 심화 — 치명 피해(중장갑 라인의 딜 마무리). str% 는 견습기사·방어%는 기사가 유지.
    id: "v2c_veteran_lethal", name: "필살", stat: "str", category: "passive", tier: 3,
    description: "한 방에 모든 것을 싣는다. 치명타 피해가 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 30 }, // 크리축 차수 단조 — 정예 기사=4차 최상(2차20<3차25<4차30·25→30).
  },
  v2c_sensei_ironbody: {
    // 패왕(권룡 4차 패시브) — 무인 재설계(2026-06-22): 옛 철신(최대 HP%)에서 힘%로 교체. 격투가 라인
    //   (STR딜·회피) 정점의 공격 정체성. t4 STR% 는 유일 축(고유성 유지). 최대 HP%(철신)는 투승으로 이전. id 유지.
    id: "v2c_sensei_ironbody", name: "패왕", stat: "str", category: "passive", tier: 3,
    description: "패왕의 기개. 힘이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 20 } },
  },
  v2c_sage_insight: {
    // 마법 심화 — 치명 확률(술사 치명피해와 시너지). int 라인에 crit 확률 추가.
    id: "v2c_sage_insight", name: "간파", stat: "int", category: "passive", tier: 3,
    description: "흐름을 꿰뚫는다. 치명타 확률이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    // 크리축 차수 단조(2026-06-22): 치명확률 4차 대마법사 > 2차 자객(8). 자객(크리 테마)은 8 유지·sage 8→10.
    passive: { critPct: 10 },
  },
  v2c_chief_afterimage: {
    // 도적 심화(궁수 라인 정점) — 명중(매의 눈). 궁사가 민첩 II 로 바뀌며 비운 명중 축을
    //   라인 정점으로 끌어올린 정조준. id 유지(세이브 호환). 명중은 PvE/PvP 양쪽 소비(회피 대결).
    id: "v2c_chief_afterimage", name: "매의 눈", stat: "dex", category: "passive", tier: 3,
    description: "매처럼 날카로운 눈. 명중이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { accuracyPct: 20 },
  },

  // ── 도적 4차 두 번째 갈래(암살자·그림자 계보) 킷 — 기습(오프너 액티브) + 은신(회피 패시브) ──
  v2c_phantom_ambush: {
    // 암살자(도적 4차·그림자 계보) = 처형의 역. 은신처에서 방심한(풀피) 적의 급소를 노리는 한 방.
    //   기본딜은 일부러 다른 4차 액티브보다 낮게(계수 0.14·flat 150 < 그림자 암살 0.22/210) 잡고,
    //   적 HP 90%↑(사실상 첫 턴)일 때만 ×3.0 알파. 그 외엔 약한 평타 이하라 "계속 쓰면 손해" — 첫 턴
    //   1회용. procChance 100(조건/패턴이 throttle). scaling:"luk"(행운 라인). tier 필드는 상급 버킷(3).
    //   ⚠️ combatShared 가 ambushDamage 를 패턴 빈도 throttle 에서 면제(오프너라 매턴 스팸 아님).
    id: "v2c_phantom_ambush", name: "기습", stat: "luk", category: "attack", tier: 3,
    description: "그림자에서 솟아 방심한 적의 급소를 단번에 노린다. 적이 멀쩡할수록 치명적이다.", mpCost: 40, cooldown: 0, procChance: 100,
    effects: [
      { kind: "ambushDamage", statCoef: 0.14, baseFlatByTier: [150, 150, 150], hpThresholdPct: 90, bonusMult: 3.0, scaling: "luk" },
    ],
  },
  v2c_phantom_stealth: {
    // 도적 심화 — 회피(은신 정체성). tier-4 라인 중 유일 회피 축(신궁 명중·정예 치명피해·현자 치명확률과 차별).
    //   글래스 캐넌 암살자에 생존 사이드그레이드. 회피는 PvE/PvP 양쪽 소비(명중 대결).
    id: "v2c_phantom_stealth", name: "은신", stat: "luk", category: "passive", tier: 3,
    description: "그림자에 몸을 감춰 적의 공격을 흘려보낸다. 회피가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { evasionPct: 16 },
  },
  v2c_venomlord_plague: {
    // 독왕 = 독술 계보 정점. 4차지만 스킬 tier 는 기존 심화 스킬과 같이 3으로 둔다.
    //   스택 페이오프가 커서 단독보다 독침/독무/맹독 확산 이후의 누적 상황에서 강하다.
    id: "v2c_venomlord_plague", name: "독왕진", stat: "luk", category: "attack", tier: 3,
    description: "독의 진을 펼쳐 중독을 폭발적으로 퍼뜨리고, 쌓인 독을 왕의 권능처럼 터뜨린다.",
    mpCost: 42, cooldown: 0, procChance: 35,
    effects: [
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 22, stacks: 4 },
      { kind: "stackPayoffDamage", tag: "poison", statCoef: 0.2, baseFlatByTier: [180, 180, 180], perStackFlat: 32, scaling: "luk" },
    ],
  },
  v2c_venomlord_sovereign: {
    id: "v2c_venomlord_sovereign", name: "독왕", stat: "luk", category: "passive", tier: 3,
    description: "독을 다스리는 정점. 중독된 적의 방어를 크게 무너뜨린다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 28 },
  },

  // ── 마법 4차 두 번째 갈래(원소술사) — 속성 마법(캐릭속성 분기) + 원소 통달 ──
  v2c_elementalist_magic: {
    // 속성 마법 — 시전자 캐릭터 속성에 따라 효과가 갈린다(combatShared 가 elementEffects[캐릭속성] 적용).
    //   로그엔 "불 마법/물 마법…" 동적 표기(elementNamed). 데미지는 전부 마법(int) 스케일.
    //   물=보호막·번개=취약·불=연소+치유감소·빛=실명(회피↓)·어둠=암흑(명중↓)·바람=ATB 가속·대지=ATB
    //   지연. selfHaste/enemyDelay 는 ATB 전용(legacy 에선 inert). enemyHealReduce 는 회복 스킬·재생만
    //   감소(흡혈 제외)·PvE 몹은 회복 드물어 주로 PvP. 무속성(폴백)=순수 마법 딜.
    id: "v2c_elementalist_magic", name: "속성 마법", stat: "int", category: "attack", tier: 3,
    description: "다스리는 원소를 끌어내 적에게 퍼붓는다. 속성에 따라 다른 권능이 깃든다.",
    mpCost: 46, cooldown: 0, procChance: 30,
    elementNamed: true,
    effects: [dmg(1.3, 200, "magic")], // 무속성 폴백
    elementEffects: {
      fire: [
        dmg(1.3, 200, "magic"),
        { kind: "dot", ...V2_DOT_PRESETS.연소 },
        { kind: "enemyHealReduce", pct: 50, turns: 3 }, // 화상 — 적 회복 −50%(3턴)
      ],
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

  // ── 마법 4차 세 번째 갈래(대주술사·주술사 계승) — 마법취약 누적과 폭발 ──
  v2c_archshaman_rite: {
    id: "v2c_archshaman_rite", name: "금단 의식", stat: "int", category: "attack", tier: 3,
    description: "금단의 의식으로 적의 혼을 찢는다. 누적된 마법취약이 많을수록 더 깊게 파고든다.",
    mpCost: 46, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.25, 210, "magic"),
      { kind: "stackPayoffDamage", tag: "magicVuln", statCoef: 0.28, baseFlatByTier: [120, 120, 120], perStackFlat: 36, scaling: "magic" },
    ],
  },
  v2c_archshaman_curse: {
    id: "v2c_archshaman_curse", name: "금기 주술", stat: "int", category: "passive", tier: 3,
    description: "금기를 새긴 주문이 적의 혼을 더 크게 흔든다. 마법취약 효과가 깊어진다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 8 },
  },
  v2c_archbishop_sanctuary: {
    id: "v2c_archbishop_sanctuary", name: "성역 선포", stat: "int", category: "heal", tier: 3,
    description: "성역을 펼쳐 상처를 조금 메우고 잠시 피해를 줄인다.",
    mpCost: 46, cooldown: 0, procChance: 100,
    effects: [
      { kind: "heal", pctLostHp: 12 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 8, turns: 3 },
    ],
  },
  v2c_archbishop_grace: {
    id: "v2c_archbishop_grace", name: "성직 권위", stat: "int", category: "passive", tier: 3,
    description: "성직자의 권위로 회복술을 보조하고 몸을 조금 더 오래 버티게 한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 12, maxHpPct: 8 },
  },

  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) — 액티브 보호막 + 반사 패시브 ──
  v2c_warden_aegis: {
    // 수호의 방벽 — 최대 HP 10% 보호막(기존 shield effect 재사용·마나 보호막 패턴). 방어 탱의
    //   생존기. tier 필드 3(비용 클램프). 보호막은 enemyPhase 가 dmg 흡수.
    id: "v2c_warden_aegis", name: "수호의 방벽", stat: "vit", category: "buff", tier: 3,
    description: "체력을 끌어모아 방벽을 두른다. 한동안 피해를 흡수한다.", mpCost: 40, cooldown: 0, procChance: 100,
    effects: [{ kind: "shield", pctMaxHp: 10, turns: 3 }],
  },
  v2c_warden_thorns: {
    // 가시 방벽(패시브) — 피격(적중) 시 내 방어력의 100%를 적에게 고정 반사("방어 계수만큼").
    //   엔진 thornsFlatFromDef 훅(derive 가 def×thornsDefPct% 환산·enemyPhase[PvE]·applyOnHitReflect[PvP]
    //   양쪽 가산). 방어=딜로 전환되는 탱딜 시너지(방벽 방어%와 결합).
    id: "v2c_warden_thorns", name: "가시 방벽", stat: "vit", category: "passive", tier: 3,
    description: "방벽에 돋은 가시. 공격을 받을 때마다 방어력만큼 되받아친다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { thornsDefPct: 100 },
  },

  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) — HP를 걸고 화력을 끌어올리는 순수 공격 라인 ──
  v2c_warlord_bloodbath: {
    id: "v2c_warlord_bloodbath", name: "혈전", stat: "str", category: "attack", tier: 3,
    description: "피로 길을 열듯 내리친다. 더 큰 체력을 걸고 더 크게 베어낸다.",
    mpCost: 42, cooldown: 0, procChance: 30,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 10, statCoef: 1.45, baseFlatByTier: [280, 280, 280], soakRatio: 1.8 },
    ],
  },
  v2c_warlord_slaughter: {
    id: "v2c_warlord_slaughter", name: "살육본능", stat: "str", category: "passive", tier: 3,
    description: "죽음에 가까울수록 전장이 선명해진다. 광기보다 더 크게 공격력이 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { berserkAtkPctPerLostHpPct: 0.65 },
  },

  // ── 무도 4차 두 번째 갈래(투승·무승 계승) 킷 — 반격(피격 카운터) + 철신(최대 HP) ──
  //   무인 재설계(2026-06-22): 옛 절정(sensei) 킷을 그대로 상속. 권룡(sensei)이 공격형(권룡파+패왕)으로
  //   바뀌며 탱 정체성(반격+철신)이 무승 계보 정점 투승으로 이동. 신규 전용 id(직업별 id 컨벤션).
  v2c_battlemonk_counter: {
    // 투승 반격(패시브) — 피격 생존 시 30% 확률로 적에게 ATK 반격(passiveCounterChancePct 훅·PvE
    //   enemyPhase). 투승은 VIT 탱이라 반격 데미지는 ATK 기준. 옛 절정 반격(v2c_sensei_combo)에서 상속.
    id: "v2c_battlemonk_counter", name: "반격", stat: "vit", category: "passive", tier: 3,
    description: "공격을 받아넘기며 즉시 되받아친다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { counterChancePct: 30 },
  },
  v2c_battlemonk_ironbody: {
    // 투승 철신(패시브) — 최대 HP(심층 탱). 옛 절정 철신(v2c_sensei_ironbody)에서 상속.
    id: "v2c_battlemonk_ironbody", name: "철신", stat: "vit", category: "passive", tier: 3,
    description: "강철 같은 몸. 최대 체력이 크게 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 20 },
  },
  v2c_rescueexpert_rescue: {
    id: "v2c_rescueexpert_rescue", name: "긴급 구조", stat: "vit", category: "heal", tier: 3,
    description: "치명적인 부상을 수습하고 곧바로 보호막을 덧댄다.",
    mpCost: 46, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 45 }, { kind: "shield", pctMaxHp: 8, turns: 3 }],
  },
  v2c_rescueexpert_support: {
    id: "v2c_rescueexpert_support", name: "생환 지원", stat: "vit", category: "passive", tier: 3,
    description: "살려내는 기술에 익숙해진다. 회복량과 최대 체력이 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 20, maxHpPct: 10 },
  },
  v2c_returner_survive: {
    id: "v2c_returner_survive", name: "생환", stat: "vit", category: "heal", tier: 3,
    description: "끝까지 숨을 붙잡아 잃은 체력을 되찾고 큰 보호막을 만든다.",
    mpCost: 46, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 35 }, { kind: "shield", pctMaxHp: 12, turns: 3 }],
  },
  v2c_returner_undying: {
    id: "v2c_returner_undying", name: "불굴", stat: "vit", category: "passive", tier: 3,
    description: "쓰러질 상황에서도 버틴다. 최대 체력이 크게 늘고 받는 피해가 줄어든다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 25, damageTakenReductionPct: 8 },
  },

  // ── 5차 핵심 5직업 — 새 엔진 효과 없이 기존 어휘 조합으로 구현 ──
  v2c_swordmaster_cut: {
    id: "v2c_swordmaster_cut", name: "검격", stat: "str", category: "attack", tier: 3,
    description: "흔들림 없이 베어 적의 자세를 무너뜨린다.",
    mpCost: 50, cooldown: 0, procChance: 35, learnCost: 8000,
    effects: [dmg(1.55, 300), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_swordmaster_focus: {
    id: "v2c_swordmaster_focus", name: "검의 집중", stat: "str", category: "passive", tier: 3,
    description: "칼끝을 흐트러뜨리지 않는다. 힘과 치명 피해가 오르고, 한계를 넘어선 속도가 공격력이 된다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { str: 18 }, critDmgPct: 25, spdOverflowToAtkPct: 25 },
  },
  v2c_ironknight_guard: {
    id: "v2c_ironknight_guard", name: "철벽 태세", stat: "vit", category: "buff", tier: 3,
    description: "방패를 고정해 피해를 흡수하고 잠시 받는 피해를 줄인다.",
    mpCost: 48, cooldown: 0, procChance: 100, learnCost: 8000,
    effects: [
      { kind: "shield", pctMaxHp: 14, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 10, turns: 3 },
    ],
  },
  v2c_ironknight_wall: {
    id: "v2c_ironknight_wall", name: "장벽술", stat: "vit", category: "passive", tier: 3,
    description: "단단한 장벽 운용에 익숙해진다. 방어와 반사가 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { defPct: 18, thornsDefPct: 80 },
  },
  v2c_arcanist_burst: {
    id: "v2c_arcanist_burst", name: "비전 폭발", stat: "int", category: "attack", tier: 3,
    description: "응축한 마력을 폭발시켜 큰 마법 피해를 준다.",
    mpCost: 54, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [dmg(1.7, 340, "magic")],
  },
  v2c_arcanist_theory: {
    id: "v2c_arcanist_theory", name: "비전 이론", stat: "int", category: "passive", tier: 3,
    description: "마력의 흐름을 계산해 주문의 위력을 끌어올린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { int: 18 }, critPct: 8 },
  },
  v2c_marksman_shot: {
    id: "v2c_marksman_shot", name: "정밀 사격", stat: "dex", category: "attack", tier: 3,
    description: "빈틈을 노려 두 발을 연속으로 꿰뚫는다.",
    mpCost: 50, cooldown: 0, procChance: 35, learnCost: 8000,
    effects: [
      { kind: "damage", statCoef: 0.42, baseFlat: 210, scaling: "dex", pierceDamagePct: 18 },
      { kind: "damage", statCoef: 0.42, baseFlat: 210, scaling: "dex", pierceDamagePct: 18 },
    ],
  },
  v2c_marksman_aim: {
    id: "v2c_marksman_aim", name: "조준", stat: "dex", category: "passive", tier: 3,
    description: "흔들림 없는 조준으로 민첩과 명중이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { dex: 18 }, accuracyPct: 16 },
  },
  v2c_nightshade_eclipse: {
    id: "v2c_nightshade_eclipse", name: "월식", stat: "luk", category: "attack", tier: 3,
    description: "어둠이 덮이는 순간 파고든다. 첫 일격과 마무리에 모두 강하다.",
    mpCost: 52, cooldown: 0, procChance: 100, learnCost: 8000,
    effects: [
      { kind: "ambushDamage", statCoef: 0.16, baseFlatByTier: [180, 180, 180], hpThresholdPct: 90, bonusMult: 3.0, scaling: "luk" },
      { kind: "executeDamage", statCoef: 0.18, baseFlatByTier: [180, 180, 180], hpThresholdPct: 35, bonusMult: 2.0, scaling: "luk" },
    ],
  },
  v2c_nightshade_cloak: {
    id: "v2c_nightshade_cloak", name: "밤의 장막", stat: "luk", category: "passive", tier: 3,
    description: "어둠 속에서 몸을 숨기고 급소를 더 깊게 찌른다. 치명 한계 초과분이 스킬에도 실린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { evasionPct: 18, critDmgPct: 20, skillCritOverflow: true },
  },
};

// 옛 V2_COMMON_SKILLS_BY_JOB(직군별 공용 스킬 풀)은 폐지됐다 — "직업 순회 수집" 설계로 풀이 전부
//   빈 배열이 된 뒤(2026-06-19) 어떤 라이브 코드도 읽지 않아 제거. 학습/장착 게이팅은 learn 라우트가
//   elementalSkillsForClass(= V2_SKILLS_BY_JOB)로 처리한다. 도달 불가 공용 정의(난격/파쇄/붕권/선풍각
//   /운기/일격/연격/약점 포착 등)도 함께 정리했다.
