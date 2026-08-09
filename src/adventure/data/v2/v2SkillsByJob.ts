// 직업 시스템 v2 — jobId 별 "학습 가능 시그니처 스킬셋".
// 직업 킷 재설계(2026-06-17): 시작 스킬(자동 보유)은 공통 베이스로 두고, 직업마다 작은 킷만
//   추가한다(액티브 1 + 패시브 1). 마법사는 비상용 마나 회복기 1개를 더 배운다.
//   옛 공용 풀(난격·파쇄 등)·계파 스킬은 코어루프 학습 풀에서
//   은퇴(이미 배운 건 보존). classes.ts:elementalSkillsForClass 가 코어루프에서 이 표를 jobId
//   로 조회. 차수 게이팅 없음.
// 상위 직업 패시브는 모두 서로 다른 축(고유) — 다른 직업을 순회해 다른 패시브를 모으는 메리트.
// 고차 4직업(tier 3, A 메타 PR-3)은 직군 축을 한 단계 더 깊게(III티어 % 가산) — 같은 축 심화(의도).

import type { V2Class } from "./classes";
import type { V2SkillId, V2SkillsState } from "./v2Skills";

// 직업 전투력이 사용하는 공격 축을 레벨 1부터 실제 공격에 연결하는 최소 기본기.
// 다른 직군은 공용 스타터에 물리 공격기가 있지만 마법사만 INT/magicAtk 공격 수단이 없어,
// 마력탄 학습비(1,500 숙달 포인트)를 모을 때까지 표시 전투력과 실전 성능이 분리되던 문제를 막는다.
export const V2_CORE_STARTER_SKILL_BY_CLASS: Partial<Record<V2Class, V2SkillId>> = {
  mage: "v2c_mage_boltcast",
};

export function grantCoreStarterSkill(
  skills: V2SkillsState,
  playerClass: V2Class,
): V2SkillsState {
  const starter = V2_CORE_STARTER_SKILL_BY_CLASS[playerClass];
  if (!starter || skills.learned.includes(starter)) return skills;
  return {
    ...skills,
    learned: [...skills.learned, starter],
    equipped: [...skills.equipped, starter],
  };
}

export const V2_SKILLS_BY_JOB: Record<string, readonly V2SkillId[]> = {
  // ── 모험가(none) — 착용형 패시브 2(학습+SP 슬롯). 상위직업과 달리 액티브 없이 패시브 2개. ──
  none: ["v2c_none_toughness", "v2c_none_diligence"],
  // ── 기본 직업 — 액티브 1 + 패시브 스킬 1(학습+SP 슬롯해야 효과) ──
  warrior: ["v2c_warrior_strike", "v2c_warrior_might"], // 강타 + 근력(힘+10%)
  martial: ["v2c_martial_steelguard", "v2c_martial_fortitude"], // 하급 권법(단일딜) + 강건(활력+10%)
  mage: ["v2c_mage_boltcast", "v2c_mage_acumen", "v2c_mage_meditate"], // 마력탄 + 총명(지능+10%) + 명상(비상 MP 회복)
  rogue: ["v2c_rogue_poison", "v2c_rogue_finesse"], // 독침 + 예기(민첩→공격력)
  survivor: ["v2c_survivor_firstaid", "v2c_survivor_knowledge", "v2c_survivor_baitcraft"], // 응급 처치 + 생존 지식 + 미끼 고르기
  // ── 상위 직업 — 액티브 1 + 고유 패시브 1(직업마다 다른 축/효과) ──
  shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"], // 방패 타격(방어력 기반) + 체력(HP+12%)
  squire: ["v2c_squire_cleave", "v2c_squire_might"], // 돌격 + 근력 II(힘+15%)
  boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"], // 연권 + 보법(회피+8%)
  monk: ["v2c_monk_palm", "v2c_monk_spirit"], // 철포(받피감버프) + 강건 II(활력+20%)
  caster: ["v2c_caster_bolt", "v2c_caster_acumen"], // 마탄 + 마나 실드(지능+20%·장벽)
  acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"], // 치유(자힐 active) + 회복(회복량+20%, SPI PR-4)
  warder: ["v2c_warder_barrier", "v2c_warder_ward"], // 결계(보호막) + 결계술(마법 방어)
  assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"], // 처단(처형·LUK 비례) + 행운(LUK+10%·치명확률)
  archer: ["v2c_archer_volley", "v2c_archer_agility"], // 속박 사격(딜+취약) + 민첩(민첩+10%)
  venomist: ["v2c_venomist_toxiccloud", "v2c_venomist_corrosion", "v2c_venomist_virulence"], // 독무 + 부식 I + 맹독 I
  camper: ["v2c_camper_camp", "v2c_camper_ration"], // 야영(자힐) + 비상식량(회복+최대 HP)
  ironman: ["v2c_ironman_brace", "v2c_ironman_body"], // 버티기(보호막) + 단련된 몸(최대 HP)
  fisher: ["v2c_camper_tidereading"], // 낚시꾼 — 물때 읽기
  healthtrainer: ["v2c_healthtrainer_routine"], // 헬스 트레이너 — 운동 루틴
  farmer: ["v2c_farmer_seedselection"], // 농부 — 씨앗 선별
  cook: ["v2c_cook_prepwork"], // 요리사 — 기초 손질
  lumberjack: ["v2c_lumberjack_woodreading"], // 나무꾼 — 나무결 읽기
  foresttechnician: ["v2c_foresttechnician_axecare"], // 산림 기술자 — 도끼날 세우기
  miner: ["v2c_miner_veinreading"], // 광부 — 광맥 읽기
  miningtechnician: ["v2c_miningtechnician_toolcare"], // 광산 기술자 — 곡괭이 손질
  // ── 고차 4직업(tier 3) — 액티브 1(강) + III티어 % 패시브(직군 축) ──
  paladin: ["v2c_paladin_cleave", "v2c_paladin_might3"], // 심판(단일+무력) + 기사도(힘10%·방어10%)
  brawler: ["v2c_brawler_combo", "v2c_brawler_fortitude3"], // 벽력연권(연격+취약) + 보법 II(회피+12%)
  magus: ["v2c_magus_bolt", "v2c_magus_acumen3"], // 마력 작렬 + 총명 III(지능+20%)
  shaman: ["v2c_shaman_hex", "v2c_shaman_omen3"], // 저주(마법+약화) + 흉조(마법취약 누적)
  ranger: ["v2c_ranger_ambush", "v2c_ranger_finesse3"], // 연사(DEX 3연사) + 민첩 II(DEX+20%)
  // ── 고차 두 번째 갈래(tier 3·방패병/수도승/사제/자객 계승) — 액티브 1 + 고유 패시브 ──
  guardian: ["v2c_guardian_bash", "v2c_guardian_bulwark3"], // 방패 강타(방어기반) + 방벽(방어+20%)
  berserker: ["v2c_berserker_bloodslash", "v2c_berserker_madness3"], // 사혈격(HP 소모 강타) + 광기(잃은 HP 비례 공격력)
  warmonk: ["v2c_warmonk_kick", "v2c_warmonk_evasion3"], // 연환각(다단) + 강건 III(활력+30%)
  bishop: ["v2c_bishop_heal", "v2c_bishop_blessing3"], // 대치유(자힐) + 회복 II(회복+30%)
  ritualist: ["v2c_ritualist_guardingarray", "v2c_ritualist_wardcraft"], // 호법진(받피감) + 진법술(마법 방어)
  shadow: ["v2c_shadow_assassinate", "v2c_shadow_shadowstep", "v2c_shadow_lethality3"], // 암살 + 그림자 도약(1회 확정 회피) + 필살
  venomancer: ["v2c_venomancer_miasma", "v2c_venomancer_corrosion3", "v2c_venomancer_virulence2"], // 맹독 확산 + 부식 II + 맹독 II
  fieldmedic: ["v2c_fieldmedic_treatment", "v2c_fieldmedic_training"], // 현장 처치 + 구급 숙련
  extremesurvivor: ["v2c_extremesurvivor_struggle", "v2c_extremesurvivor_adaptation"], // 사투 + 극한 적응
  angler: ["v2c_angler_pointreading"], // 명인 낚시꾼 — 포인트 짚기
  physicalcoach: ["v2c_physicalcoach_conditioning"], // 피지컬 코치 — 컨디셔닝 프로그램
  horticulturist: ["v2c_horticulturist_soilreading"], // 원예가 — 토양 읽기
  professionalcook: ["v2c_professionalcook_seasoning"], // 전문 요리사 — 섬세한 간
  masterlumberjack: ["v2c_masterlumberjack_recoverycut"], // 벌목 명인 — 위기 수습
  masterminer: ["v2c_masterminer_recoverystroke"], // 채광 명인 — 타격 교정
  // ── 하이브리드(tier 3·전사×마법) ──
  templar: ["v2c_templar_smite", "v2c_templar_aegis"], // 성기사: 심판의 빛(타격+자힐) + 신성한 가호(방어10%·회복강화10%)
  spellblade: ["v2c_spellblade_strike", "v2c_spellblade_unity"], // 마검사: 마검 일섬(검+마법 이중타) + 마검 합일(힘8%·지능8%)
  bloodtemplar: ["v2c_bloodtemplar_stigma", "v2c_bloodtemplar_martyr"], // 혈성기사: 피의 성흔(HP소모+방벽/약화) + 순교의 맹세
  darkpriest: ["v2c_darkpriest_reap", "v2c_darkpriest_blessing"], // 암흑사제: 영혼 수확(처형+회복) + 검은 축복
  // ── 심화 직업(tier 4) — 액티브 1(강) + 패시브(직군마다 다른 효과·라인 비포화) ──
  veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal", "v2c_veteran_armorinsight"], // 결전의 일격 + 필살 II + 갑주 간파 I
  sensei: ["v2c_sensei_combo", "v2c_sensei_ironbody", "v2c_sensei_formationbreak"], // 권룡연파 + 근력 III + 파진경 I
  sage: ["v2c_sage_bolt", "v2c_sage_insight", "v2c_sage_magicdismantle"], // 마력 폭사 + 치명 II + 마력 해체 I
  chief: ["v2c_chief_strike", "v2c_chief_afterimage"], // 관통사(DEX 궁술) + 매의 눈(명중+30%)
  phantom: ["v2c_phantom_ambush", "v2c_phantom_stealth", "v2c_phantom_weakpoint"], // 기습 + 은신 + 급소 노출 I
  venomlord: ["v2c_venomlord_plague", "v2c_venomlord_sovereign", "v2c_venomlord_virulence3"], // 독왕진 + 부식 III + 맹독 III
  // ── 마법 4차 두 번째 갈래(원소술사) — 속성 분기 액티브 + 원소 통달 패시브 ──
  firemage: ["v2c_firemage_inferno", "v2c_firemage_ember"],
  frostmage: ["v2c_frostmage_glacier", "v2c_frostmage_frozenheart"],
  lightningmage: ["v2c_lightningmage_thunderbolt", "v2c_lightningmage_overcharge"],
  windmage: ["v2c_windmage_tempest", "v2c_windmage_flow"],
  earthmage: ["v2c_earthmage_tectonic", "v2c_earthmage_bedrock"],
  // ── 마법 4차 세 번째 갈래(문장술사) — 저차 총명 패시브 장착 시 액티브 추가 효과 ──
  runecaster: ["v2c_runecaster_grandsigil", "v2c_runecaster_circuit"], // 대문장 해방 + 문장 회로
  // ── 마법 4차 네 번째 갈래(대주술사·주술사 계승) — 마법취약 누적과 폭발 ──
  archshaman: ["v2c_archshaman_rite", "v2c_archshaman_curse"], // 금단 의식(취약 폭발) + 흉조 II(취약 심화)
  archbishop: ["v2c_archbishop_sanctuary", "v2c_archbishop_grace"], // 성역 선포 + 성직 권위
  spellsealer: ["v2c_spellsealer_sealingfield", "v2c_spellsealer_greatward"], // 봉마진(공격·스킬 봉쇄) + 봉마대법
  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) — 도발 액티브 + 반사 패시브 ──
  warden: ["v2c_warden_aegis", "v2c_warden_thorns"], // 수호의 도발 + 가시 방벽(HP 피해 시 방어력만큼 반사)
  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) — HP를 걸고 화력으로 밀어붙이는 라인 ──
  warlord: ["v2c_warlord_bloodbath", "v2c_warlord_slaughter"], // 혈전(HP 소모 강타) + 광기 II
  // ── 무도 4차 두 번째 갈래(투승·무승 계승) — 옛 절정 킷(반격+철신) 상속 ──
  battlemonk: ["v2c_battlemonk_counter", "v2c_battlemonk_ironbody"], // 반격(피격 카운터) + 철신(최대HP+20%) — 둘 다 패시브
  rescueexpert: ["v2c_rescueexpert_rescue", "v2c_rescueexpert_support"], // 긴급 구조 + 생환 지원
  returner: ["v2c_returner_survive", "v2c_returner_undying"], // 생환 + 불굴
  masterangler: ["v2c_masterangler_bigcatchsense"], // 강태공 — 대물 감각
  mastertrainer: ["v2c_mastertrainer_elitetraining"], // 마스터 트레이너 — 엘리트 트레이닝
  masterfarmer: ["v2c_masterfarmer_composting"], // 숙련 농부 — 퇴비 배합
  headchef: ["v2c_headchef_batchcooking"], // 수석 요리사 — 효율적인 조리
  forestmaster: ["v2c_forestmaster_efficientwork"], // 산림 대가 — 능숙한 벌목
  minemaster: ["v2c_minemaster_efficientmining"], // 광산 대가 — 능숙한 채광
  crusader: ["v2c_crusader_judgment", "v2c_crusader_oath"], // 성전사: 성전의 심판 + 불굴의 맹세
  runeknight: ["v2c_runeknight_carve", "v2c_runeknight_inscription"], // 룬 기사: 룬 검격 + 룬 각인
  crimsontemplar: ["v2c_crimsontemplar_judgment", "v2c_crimsontemplar_oath"], // 진홍성기사: 진홍 심판(방어비례/회복억제) + 피의 서약
  // ── 5차 직업 — 기존 효과 어휘만 재사용한 상급 심화 킷 ──
  swordmaster: ["v2c_swordmaster_cut", "v2c_swordmaster_focus", "v2c_swordmaster_armorinsight2"], // 검호: 검격 + 검의 집중 + 갑주 간파 II
  ironknight: ["v2c_ironknight_guard", "v2c_ironknight_wall"], // 철벽기사: 철벽 태세 + 장벽술
  overlord: ["v2c_overlord_ruin", "v2c_overlord_throne"], // 패왕: 파멸 난무 + 광기의 왕좌
  arcanist: ["v2c_arcanist_burst", "v2c_arcanist_theory", "v2c_arcanist_magicdismantle2"], // 비전술사: 비전 폭발 + 비전 이론 + 마력 해체 II
  elementallord: ["v2c_elementallord_surge", "v2c_elementallord_resonance"], // 원소군주: 원소 폭주 + 원소 공명
  inscriber: ["v2c_inscriber_release", "v2c_inscriber_amplification"], // 각인술사: 각인 해방 + 각인 증폭
  marksman: ["v2c_marksman_shot", "v2c_marksman_aim"], // 명궁: 정밀 사격 + 조준
  nightshade: ["v2c_nightshade_eclipse", "v2c_nightshade_cloak", "v2c_nightshade_weakpoint2"], // 밤그림자: 월식 + 은신 II + 급소 노출 II
  saint: ["v2c_saint_miracle", "v2c_saint_benediction"], // 성자: 기적 + 축복
  plaguebringer: ["v2c_plaguebringer_outbreak", "v2c_plaguebringer_decay", "v2c_plaguebringer_virulence4"], // 역병 군주: 역병 창궐 + 부식 IV + 맹독 IV
  dragonfist: ["v2c_dragonfist_rupture", "v2c_dragonfist_footwork", "v2c_dragonfist_formationbreak2"], // 권황: 용린파쇄 + 무극보법 + 파진경 II
  adamantmonk: ["v2c_adamantmonk_stance", "v2c_adamantmonk_body"], // 금강승: 금강 자세 + 금강불괴
  immortal: ["v2c_immortal_lifestrike", "v2c_immortal_heart"], // 불멸자: 생명 강타 + 불멸의 심장
  championmaker: ["v2c_championmaker_championprogram"], // 챔피언 메이커 — 챔피언 프로그램
  fullcatchking: ["v2c_fullcatchking_bountyhaul"], // 만선왕 — 만선 조업
  harvestking: ["v2c_harvestking_abundance"], // 농업 장인 — 풍작 감각
  masterchef: ["v2c_masterchef_heatcontrol"], // 요리 명장 — 장인의 불 조절
  transcendent: ["v2c_transcendent_mandala", "v2c_transcendent_harmony"], // 초월자: 만상검 + 초월 조화
  bloodlord: ["v2c_bloodlord_brand", "v2c_bloodlord_martyrdom"], // 혈성군주: 왕혈 낙인(HP소모/처형) + 불사의 순교(흡혈)
  calamitycaller: ["v2c_calamitycaller_brand", "v2c_calamitycaller_omen"], // 재앙술사: 재앙의 낙인 + 흉조 III
  // ── 6차 직업 — 5차 직업 숙련도 기반 엔드 성장 ──
  fortressknight: ["v2c_fortressknight_ram", "v2c_fortressknight_citadel"], // 성채기사: 성채 충각 + 움직이는 성채
  swordsaint: ["v2c_swordsaint_flash", "v2c_swordsaint_transcendence", "v2c_swordsaint_armorinsight3"], // 검성: 무심검 + 일검필살 + 갑주 간파 III
  hegemon: ["v2c_hegemon_annihilation", "v2c_hegemon_dominion"], // 패황: 멸왕난무 + 패황의 지배
  archmage: ["v2c_archmage_collapse", "v2c_archmage_theory", "v2c_archmage_magicdismantle3"], // 대마도사: 비전 붕괴 + 대마도 이론 + 마력 해체 III
  primordialmage: ["v2c_primordialmage_return", "v2c_primordialmage_resonance"], // 태초술사: 태초회귀 + 근원공명
  savior: ["v2c_savior_judgment", "v2c_savior_grace"], // 구원자: 구원의 심판 + 구원의 은총
  doomprophet: ["v2c_doomprophet_sentence", "v2c_doomprophet_revelation"], // 종말예언자: 종말 선고 + 불길한 계시
  heavenlybow: ["v2c_heavenlybow_orbit", "v2c_heavenlybow_starpath"], // 천궁: 천궁궤적 + 성도 조준
  blackmoon: ["v2c_blackmoon_flurry", "v2c_blackmoon_dominion", "v2c_blackmoon_weakpoint3"], // 흑월: 암월난무 + 흑월지배 + 급소 노출 III
  myriadvenom: ["v2c_myriadvenom_mutation", "v2c_myriadvenom_body"], // 독황: 만독개화 + 만독지배
  celestialdragon: ["v2c_celestialdragon_combo", "v2c_celestialdragon_breath", "v2c_celestialdragon_formationbreak3"], // 천룡권성: 천룡난무 + 천룡의 호흡 + 파진경 III
  vajraarhat: ["v2c_vajraarhat_seal", "v2c_vajraarhat_body"], // 금강나한: 금강인 + 나한금신
  eternal: ["v2c_eternal_cycle", "v2c_eternal_body"], // 영겁자: 영겁 순환 + 영겁의 육신
  legendarytrainer: ["v2c_legendarytrainer_mentorship"], // 전설의 트레이너 — 전설의 지도
  seagod: ["v2c_seagod_deepcurrent"], // 해신 — 심해 해류
  earthartisan: ["v2c_earthartisan_landcare"], // 전설의 농부 — 대지 돌보기
  legendarychef: ["v2c_legendarychef_secretrecipe"], // 전설의 요리사 — 비전의 레시피
  legendarylumberjack: ["v2c_legendarylumberjack_bountifulcut"], // 전설의 나무꾼 — 전설의 벌목
  legendaryminer: ["v2c_legendaryminer_richvein"], // 전설의 광부 — 풍부한 광맥
  blooddemon: ["v2c_blooddemon_reign", "v2c_blooddemon_immortalblood"], // 혈마: 혈마군림 + 불사마혈
  absolute: ["v2c_absolute_unity", "v2c_absolute_harmony"], // 절대자: 만상귀일 + 절대 조화
};

/** 새 직업 id 의 학습 가능 시그니처 스킬셋. 미존재 jobId = 빈 배열(시작 스킬은 별도 자동 보유). */
export function skillsForJob(jobId: string): readonly V2SkillId[] {
  return V2_SKILLS_BY_JOB[jobId] ?? [];
}
