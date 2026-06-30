// 직업 시스템 v2 — jobId 별 "학습 가능 시그니처 스킬셋".
// 직업 킷 재설계(2026-06-17): 시작 스킬(자동 보유)은 공통 베이스로 두고, 직업마다 작은 킷만
//   추가한다(액티브 1 + 패시브 1). 옛 공용 풀(난격·파쇄 등)·계파 스킬은 코어루프 학습 풀에서
//   은퇴(이미 배운 건 보존). classes.ts:elementalSkillsForClass 가 코어루프에서 이 표를 jobId
//   로 조회. 차수 게이팅 없음.
// 상위 직업 패시브는 모두 서로 다른 축(고유) — 다른 직업을 순회해 다른 패시브를 모으는 메리트.
// 고차 4직업(tier 3, A 메타 PR-3)은 직군 축을 한 단계 더 깊게(III티어 % 가산) — 같은 축 심화(의도).

import type { V2SkillId } from "./v2Skills";

export const V2_SKILLS_BY_JOB: Record<string, readonly V2SkillId[]> = {
  // ── 모험가(none) — 착용형 패시브 2(학습+SP 슬롯). 상위직업과 달리 액티브 없이 패시브 2개. ──
  none: ["v2c_none_toughness", "v2c_none_diligence"],
  // ── 기본 직업 — 액티브 1 + 패시브 스킬 1(학습+SP 슬롯해야 효과) ──
  warrior: ["v2c_warrior_strike", "v2c_warrior_might"], // 강타 + 근력(힘+10%)
  martial: ["v2c_martial_steelguard", "v2c_martial_fortitude"], // 하급 권법(단일딜) + 강건(활력+10%)
  mage: ["v2c_mage_boltcast", "v2c_mage_acumen"], // 마력탄 + 총명(지능+10%)
  rogue: ["v2c_rogue_poison", "v2c_rogue_finesse"], // 독침 + 예기(민첩→공격력)
  survivor: ["v2c_survivor_firstaid", "v2c_survivor_knowledge", "v2c_survivor_baitcraft"], // 응급 처치 + 생존 지식 + 미끼 고르기
  // ── 상위 직업 — 액티브 1 + 고유 패시브 1(직업마다 다른 축/효과) ──
  shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"], // 방패 타격(방어력 기반) + 체력(HP+12%)
  squire: ["v2c_squire_cleave", "v2c_squire_might"], // 돌격 + 근력 II(힘+15%)
  boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"], // 연권 + 보법(회피+8%)
  monk: ["v2c_monk_palm", "v2c_monk_spirit"], // 철포(받피감버프) + 강건 II(활력+20%)
  caster: ["v2c_caster_bolt", "v2c_caster_acumen"], // 마탄 + 총명 II(지능+20%)
  acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"], // 치유(자힐 active) + 회복(회복량+20%, SPI PR-4)
  assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"], // 처단(처형·LUK 비례) + 치명(치명확률+8%)
  archer: ["v2c_archer_volley", "v2c_archer_agility"], // 속박 사격(딜+취약) + 민첩(민첩+10%)
  venomist: ["v2c_venomist_toxiccloud", "v2c_venomist_corrosion"], // 독무(중독 누적+스택딜) + 부식(중독 적 방어↓)
  camper: ["v2c_camper_camp", "v2c_camper_ration"], // 야영(자힐) + 비상식량(회복+최대 HP)
  ironman: ["v2c_ironman_brace", "v2c_ironman_body"], // 버티기(보호막) + 단련된 몸(최대 HP)
  fisher: ["v2c_camper_tidereading"], // 낚시꾼 — 물때 읽기
  // ── 고차 4직업(tier 3) — 액티브 1(강) + III티어 % 패시브(직군 축) ──
  paladin: ["v2c_paladin_cleave", "v2c_paladin_might3"], // 심판(단일+무력) + 기사도(힘10%·방어10%)
  brawler: ["v2c_brawler_combo", "v2c_brawler_fortitude3"], // 벽력권(강타) + 보법 II(회피+12%)
  magus: ["v2c_magus_bolt", "v2c_magus_acumen3"], // 마력 작렬 + 총명 III(지능+20%)
  shaman: ["v2c_shaman_hex", "v2c_shaman_omen3"], // 저주(마법+약화) + 흉조(마법취약 누적)
  ranger: ["v2c_ranger_ambush", "v2c_ranger_finesse3"], // 연사(DEX 3연사) + 정밀(명중+12)
  // ── 고차 두 번째 갈래(tier 3·방패병/수도승/사제/자객 계승) — 액티브 1 + 고유 패시브 ──
  guardian: ["v2c_guardian_bash", "v2c_guardian_bulwark3"], // 방패 강타(방어기반) + 방벽(방어+20%)
  berserker: ["v2c_berserker_bloodslash", "v2c_berserker_madness3"], // 사혈격(HP 소모 강타) + 광기(잃은 HP 비례 공격력)
  warmonk: ["v2c_warmonk_kick", "v2c_warmonk_evasion3"], // 연환각(다단) + 강건 III(활력+30%)
  bishop: ["v2c_bishop_heal", "v2c_bishop_blessing3"], // 대치유(자힐) + 회복 II(회복+30%)
  shadow: ["v2c_shadow_assassinate", "v2c_shadow_lethality3"], // 암살(처형·LUK) + 그늘(치명피해+30%)
  venomancer: ["v2c_venomancer_miasma", "v2c_venomancer_corrosion3"], // 맹독 확산(중독 심화) + 침식(중독 적 방어↓)
  fieldmedic: ["v2c_fieldmedic_treatment", "v2c_fieldmedic_training"], // 현장 처치 + 구급 숙련
  extremesurvivor: ["v2c_extremesurvivor_struggle", "v2c_extremesurvivor_adaptation"], // 사투 + 극한 적응
  angler: ["v2c_angler_pointreading"], // 명인 낚시꾼 — 포인트 짚기
  // ── 하이브리드(tier 3·전사×마법) ──
  templar: ["v2c_templar_smite", "v2c_templar_aegis"], // 성기사: 심판의 빛(타격+자힐) + 신성한 가호(방어10%·회복강화10%)
  spellblade: ["v2c_spellblade_strike", "v2c_spellblade_unity"], // 마검사: 마검 일섬(검+마법 이중타) + 마검 합일(힘8%·지능8%)
  bloodtemplar: ["v2c_bloodtemplar_stigma", "v2c_bloodtemplar_martyr"], // 혈성기사: 피의 성흔(HP소모+회복) + 순교의 광기
  darkpriest: ["v2c_darkpriest_reap", "v2c_darkpriest_blessing"], // 암흑사제: 영혼 수확(처형+회복) + 검은 축복
  // ── 심화 4직업(tier 4) — 액티브 1(강) + 패시브(직군마다 다른 효과·라인 비포화) ──
  veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal"], // 결전의 일격(처형딜) + 필살(치명피해+25%)
  sensei: ["v2c_sensei_combo", "v2c_sensei_ironbody"], // 권룡: 권룡파(방깎 단일) + 패왕(힘+20%) — 옛 절정·공격형 정점
  sage: ["v2c_sage_bolt", "v2c_sage_insight"], // 마력 폭사 + 간파(치명확률+8%)
  chief: ["v2c_chief_strike", "v2c_chief_afterimage"], // 관통사(DEX 궁술) + 잔영(회피+12%)
  phantom: ["v2c_phantom_ambush", "v2c_phantom_stealth"], // 기습(풀피 오프너·LUK) + 은신(회피+16%)
  venomlord: ["v2c_venomlord_plague", "v2c_venomlord_sovereign"], // 독왕진(중독 폭발) + 독왕(부식 심화)
  // ── 마법 4차 두 번째 갈래(원소술사) — 속성 분기 액티브 + 원소 통달 패시브 ──
  elementalist: ["v2c_elementalist_magic", "v2c_elementalist_mastery"], // 속성 마법(캐릭속성 분기) + 원소 통달(상성 양방향↑)
  // ── 마법 4차 세 번째 갈래(대주술사·주술사 계승) — 마법취약 누적과 폭발 ──
  archshaman: ["v2c_archshaman_rite", "v2c_archshaman_curse"], // 금단 의식(취약 폭발) + 금기 주술(취약 심화)
  archbishop: ["v2c_archbishop_sanctuary", "v2c_archbishop_grace"], // 성역 선포 + 성직 권위
  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) — 보호막 액티브 + 반사 패시브 ──
  warden: ["v2c_warden_aegis", "v2c_warden_thorns"], // 수호의 방벽(보호막·최대HP10%) + 가시 방벽(피격 시 방어력만큼 반사)
  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) — HP를 걸고 화력으로 밀어붙이는 라인 ──
  warlord: ["v2c_warlord_bloodbath", "v2c_warlord_slaughter"], // 혈전(HP 소모 강타) + 살육본능(광기 상위)
  // ── 무도 4차 두 번째 갈래(투승·무승 계승) — 옛 절정 킷(반격+철신) 상속 ──
  battlemonk: ["v2c_battlemonk_counter", "v2c_battlemonk_ironbody"], // 반격(피격 카운터) + 철신(최대HP+20%) — 둘 다 패시브
  rescueexpert: ["v2c_rescueexpert_rescue", "v2c_rescueexpert_support"], // 긴급 구조 + 생환 지원
  returner: ["v2c_returner_survive", "v2c_returner_undying"], // 생환 + 불굴
  masterangler: ["v2c_masterangler_bigcatchsense"], // 강태공 — 대물 감각
  // ── 5차 직업 — 기존 효과 어휘만 재사용한 상급 심화 킷 ──
  swordmaster: ["v2c_swordmaster_cut", "v2c_swordmaster_focus"], // 검호: 검격 + 검의 집중
  ironknight: ["v2c_ironknight_guard", "v2c_ironknight_wall"], // 철벽기사: 철벽 태세 + 장벽술
  arcanist: ["v2c_arcanist_burst", "v2c_arcanist_theory"], // 비전술사: 비전 폭발 + 비전 이론
  marksman: ["v2c_marksman_shot", "v2c_marksman_aim"], // 명궁: 정밀 사격 + 조준
  nightshade: ["v2c_nightshade_eclipse", "v2c_nightshade_cloak"], // 밤그림자: 월식 + 밤의 장막
  saint: ["v2c_saint_miracle", "v2c_saint_benediction"], // 성자: 기적 + 축복
  plaguebringer: ["v2c_plaguebringer_outbreak", "v2c_plaguebringer_decay"], // 역병 군주: 역병 창궐 + 붕괴
  adamantmonk: ["v2c_adamantmonk_stance", "v2c_adamantmonk_body"], // 금강승: 금강 자세 + 금강불괴
};

/** 새 직업 id 의 학습 가능 시그니처 스킬셋. 미존재 jobId = 빈 배열(시작 스킬은 별도 자동 보유). */
export function skillsForJob(jobId: string): readonly V2SkillId[] {
  return V2_SKILLS_BY_JOB[jobId] ?? [];
}
