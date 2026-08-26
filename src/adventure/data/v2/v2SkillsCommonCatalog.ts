// v2 공용 스킬 카탈로그 — 4직군 공용 액티브(직군당 5, 예기 패시브 제외 = 18종).
// 스킬 시스템 재설계(docs/v2-skill-system-plan.md). 평타 척추 + 소수 스킬.
//
// 데미지 = 플랫강화(스탯×~1.0 + 큰 flat) — 예측·off스탯 floor. 다단 = damage effect N개.
// DoT/디버프는 통합 프리셋(V2_DOT_PRESETS/V2_DEBUFF_PRESETS) spread — 다이얼 일관.
// procChance/피해 최종 리밸런싱은 v2Skills.ts 에서 실제 직업 차수를 기준으로 일괄 적용한다.
//   마력탄은 마법 공격력 직군의 기본 공격이라 100%·MP 0. 유틸/힐/버프=100(조건이 게이트 — HP<50·MP<40·버프 비활성 등.
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
  | "v2c_mage_boltcast" // 마력탄 (기본 주문 — 직업 킷 재설계)
  // 도적 (예기 패시브 제외)
  | "v2c_rogue_poison" // 독침
  // 기본 직업 패시브 스킬(학습+SP 슬롯해야 효과 — 직업 킷 재설계)
  | "v2c_warrior_might" // 근력 (힘 +10%)
  | "v2c_martial_fortitude" // 강건 (활력 +10%)
  | "v2c_mage_acumen" // 총명 (지능 +10%)
  | "v2c_rogue_finesse" // 예기 (민첩이 공격력 보조)
  | "v2c_survivor_firstaid" // 응급 처치 (잃은 HP 회복)
  | "v2c_survivor_knowledge" // 생존 지식 (최대 HP)
  | "v2c_survivor_baitcraft" // 미끼 고르기 (물고기 크기)
  | "v2c_angler_pointreading" // 포인트 짚기 (희귀 이상 물고기 크기)
  | "v2c_masterangler_bigcatchsense" // 대물 감각 (대물급 물고기 크기)
  | "v2c_fullcatchking_bountyhaul" // 만선 조업 (물고기 크기 + 대물급 물고기 크기)
  | "v2c_seagod_deepcurrent" // 심해 해류 (물때 한정 어종 + 희귀 이상 물고기 크기)
  | "v2c_healthtrainer_routine" // 운동 루틴 (길드 훈련장 보상)
  | "v2c_physicalcoach_conditioning" // 컨디셔닝 프로그램 (길드 훈련장 보상)
  | "v2c_mastertrainer_elitetraining" // 엘리트 트레이닝 (길드 훈련장 보상)
  | "v2c_championmaker_championprogram" // 챔피언 프로그램 (길드 훈련장 보상)
  | "v2c_legendarytrainer_mentorship" // 전설의 지도 (길드 훈련장 보상)
  | "v2c_farmer_seedselection" // 씨앗 선별 (농장 수확량)
  | "v2c_lumberjack_woodreading" // 나무결 읽기 (벌목 실패율 감소)
  | "v2c_foresttechnician_axecare" // 도끼날 세우기 (벌목 시간 단축)
  | "v2c_masterlumberjack_recoverycut" // 위기 수습 (실패 구제)
  | "v2c_forestmaster_efficientwork" // 능숙한 벌목 (추가 시간 단축)
  | "v2c_legendarylumberjack_bountifulcut" // 전설의 벌목 (추가 원목)
  | "v2c_miner_veinreading" // 광맥 읽기 (채광 실패율 감소)
  | "v2c_miningtechnician_toolcare" // 곡괭이 손질 (채광 시간 단축)
  | "v2c_masterminer_recoverystroke" // 타격 교정 (실패 구제)
  | "v2c_minemaster_efficientmining" // 능숙한 채광 (추가 시간 단축)
  | "v2c_legendaryminer_richvein" // 풍부한 광맥 (추가 광석)
  | "v2c_horticulturist_soilreading" // 토양 읽기 (희귀 수확)
  | "v2c_masterfarmer_composting" // 퇴비 배합 (수확량 + 희귀 수확)
  | "v2c_harvestking_abundance" // 풍작 감각 (수확량 + 희귀 수확)
  | "v2c_earthartisan_landcare" // 대지 돌보기 (수확량 + 희귀 수확)
  | "v2c_cook_prepwork" // 기초 손질 (요리 경험치)
  | "v2c_professionalcook_seasoning" // 섬세한 간 (정성작 확률)
  | "v2c_headchef_batchcooking" // 효율적인 조리 (묶음 재료 절약)
  | "v2c_masterchef_heatcontrol" // 장인의 불 조절 (걸작 확률)
  | "v2c_legendarychef_secretrecipe" // 비전의 레시피 (희귀 재료 보존)
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
  | "v2c_warder_barrier" // 결계 (보호막)
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
  | "v2c_caster_acumen" // 마나 실드 (지능 +20%·마력 장벽 활성화)
  | "v2c_acolyte_mana" // 회복 (회복량 +20%·healPowerPct, 옛 마나에서 리스킨)
  | "v2c_warder_ward" // 결계술 (마법 방어력 + 초반 마법 피해 감소)
  | "v2c_assassin_fortune" // 행운 (행운 +10%)
  | "v2c_archer_agility" // 민첩 (민첩 +10%)
  | "v2c_venomist_corrosion" // 부식 (중독된 적 방어 감소)
  | "v2c_venomist_virulence" // 맹독 I (중독 피해 증가)
  | "v2c_camper_ration" // 비상식량 (회복 + 최대 HP)
  | "v2c_camper_tidereading" // 물때 읽기 (물때 한정 어종 가중치)
  | "v2c_ironman_body" // 단련된 몸 (최대 HP)
  // ── 고차 4직업 킷(tier 3, A 메타 PR-3) — 액티브 1(강) + III티어 % 패시브 ──
  // 액티브(강)
  | "v2c_paladin_cleave" // 심판 (물리 단일 + 무력 디버프)
  | "v2c_brawler_combo" // 벽력연권 (물리 연격 + 취약)
  | "v2c_magus_bolt" // 마력 작렬 (마법 단일)
  | "v2c_ranger_ambush" // 연사 (DEX 비례 3연사)
  // 고차 패시브(다양성 2차: paladin 만 효과 리스킨[공방], brawler/magus/ranger 는 직군 축 % 유지)
  | "v2c_paladin_might3" // 기사도 (힘 +10% & 방어 +10%)
  | "v2c_duelist_declaration"
  | "v2c_duelist_balance"
  | "v2c_contender_insight"
  | "v2c_contender_precision"
  | "v2c_undefeated_momentum"
  | "v2c_undefeated_rhythm"
  | "v2c_grandchampion_hour"
  | "v2c_grandchampion_instinct"
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
  | "v2c_ritualist_guardingarray" // 호법진 (받는 피해 감소)
  | "v2c_shadow_assassinate" // 암살 (처형 — executeDamage·LUK 비례)
  | "v2c_shadow_shadowstep" // 그림자 도약 (전투당 1회·다음 공격 확정 회피)
  | "v2c_venomancer_miasma" // 맹독 확산 (중독 심화 + 중독 스택 비례딜)
  | "v2c_fieldmedic_treatment" // 현장 처치 (큰 자힐)
  | "v2c_extremesurvivor_struggle" // 사투 (회복 + 보호막)
  // 고유 패시브(형제와 다른 축: 받피감/회피/회복강화/치명피해)
  | "v2c_guardian_bulwark3" // 방벽 II (방어 +20%)
  | "v2c_berserker_madness3" // 광기 (잃은 HP 비례 공격력)
  | "v2c_shaman_omen3" // 흉조 (마법취약 누적)
  | "v2c_warmonk_evasion3" // 강건 III (활력 +30%·무승)
  | "v2c_bishop_blessing3" // 회복 II (회복량 +30%·사제 회복의 상위판)
  | "v2c_ritualist_wardcraft" // 진법술 (마법 방어력 + 초반 마법 피해 감소)
  | "v2c_shadow_lethality3" // 필살 (치명 피해 +25%)
  | "v2c_venomancer_corrosion3" // 부식 II (중독된 적 방어 감소)
  | "v2c_venomancer_virulence2" // 맹독 II (중독 피해 증가)
  | "v2c_fieldmedic_training" // 구급 숙련 (회복 + 최대 HP)
  | "v2c_extremesurvivor_adaptation" // 극한 적응 (최대 HP + 받피감)
  // ── 하이브리드 킷(tier 3·전사×마법) ──
  | "v2c_templar_smite" // 성기사: 심판의 빛 (물리 타격 + 자힐)
  | "v2c_templar_aegis" // 성기사: 신성한 가호 (방어 +10% & 회복 강화 +10%)
  | "v2c_spellblade_strike" // 마검사: 마검 일섬 (물리 + 마법 이중 타격)
  | "v2c_spellblade_unity" // 마검사: 마검 합일 (힘 +12% & 지능 +12%)
  | "v2c_bloodtemplar_stigma" // 혈성기사: 피의 성흔 (HP 소모 + 보호막/약화)
  | "v2c_bloodtemplar_martyr" // 혈성기사: 순교의 맹세 (최대 HP + 받피감)
  | "v2c_darkpriest_reap" // 암흑사제: 영혼 수확 (처형 + 회복)
  | "v2c_darkpriest_blessing" // 암흑사제: 검은 축복 (회복강화 + 치명피해)
  | "v2c_crusader_judgment" // 성전사: 성전의 심판 (물리 타격 + 자힐 + 받피감)
  | "v2c_crusader_oath" // 성전사: 불굴의 맹세 (방어 + 회복강화 + 받피감)
  | "v2c_runeknight_carve" // 룬 기사: 룬 검격 (물리 + 마법 이중 타격 + 취약)
  | "v2c_runeknight_inscription" // 룬 기사: 룬 각인 (힘 + 지능 + 치명확률)
  | "v2c_crimsontemplar_judgment" // 진홍성기사: 진홍 심판 (방어 비례 + 회복 억제/받피감)
  | "v2c_crimsontemplar_oath" // 진홍성기사: 피의 서약 (방어 + 최대 HP + 받피감)
  // ── 심화 직업 킷(tier 4) — 액티브 1(강) + 패시브(직군마다 다른 효과·기존 어휘) ──
  | "v2c_veteran_cleave" // 왕실 검술 (처형딜·STR 비례·적 HP15%↓ ×2)
  | "v2c_sensei_combo" // 권룡연파 (방깎 연격 — 무력 디버프·권룡)
  | "v2c_sage_bolt" // 마력 폭사 (마법 단일)
  | "v2c_chief_strike" // 관통사 (DEX 비례 단일·관통 20% 방어무시 추가타)
  | "v2c_veteran_lethal" // 필살 II (치명 피해 +30%)
  | "v2c_veteran_armorinsight" // 갑주 간파 I (적 물리 방어 -9%)
  | "v2c_sensei_ironbody" // 근력 III (힘 +20%·권룡)
  | "v2c_sensei_formationbreak" // 파진경 I (적 물리 방어 -8%)
  | "v2c_sage_insight" // 치명 II (치명 확률 +10%)
  | "v2c_sage_magicdismantle" // 마력 해체 I (적 마법 방어 -9%)
  | "v2c_runecaster_grandsigil" // 대문장 해방 (저차 마법 패시브 장착 시 추가 효과)
  | "v2c_runecaster_circuit" // 문장 회로 (최대 MP + 치명)
  | "v2c_chief_afterimage" // 매의 눈 (명중 +30%)
  // ── 도적 4차 두 번째 갈래(암살자·그림자 계보) ──
  | "v2c_phantom_ambush" // 기습 (풀피 적에게 큰 오프너 — ambushDamage·LUK 비례)
  | "v2c_phantom_stealth" // 은신 (회피 +16%)
  | "v2c_phantom_weakpoint" // 급소 노출 I (적 물리 방어 -8%)
  // ── 도적 4차 세 번째 갈래(독왕·독술 계보) ──
  | "v2c_venomlord_plague" // 독왕진 (중독 폭발·LUK 비례)
  | "v2c_venomlord_sovereign" // 부식 III (중독된 적 방어 감소)
  | "v2c_venomlord_virulence3" // 맹독 III (중독 피해 증가)
  // ── 마법 4차 두 번째 갈래(원소술사) ──
  | "v2c_elementalist_magic" // 속성 마법 (캐릭 속성별 효과 분기)
  | "v2c_elementalist_mastery" // 원소 통달 (상성 유리/불리 +15%p 양방향)
  // ── 마법 4차 원소별 직업 — 원소술사 통합 직업을 다섯 독립 계통으로 분리 ──
  | "v2c_firemage_inferno" // 화염 마법사: 홍련술
  | "v2c_firemage_ember" // 화염 마법사: 불씨의 지배
  | "v2c_frostmage_glacier" // 냉기 마법사: 빙하진
  | "v2c_frostmage_frozenheart" // 냉기 마법사: 얼어붙은 심장
  | "v2c_lightningmage_thunderbolt" // 전격 마법사: 천뢰격
  | "v2c_lightningmage_overcharge" // 전격 마법사: 과충전
  | "v2c_windmage_tempest" // 바람 마법사: 질풍술
  | "v2c_windmage_flow" // 바람 마법사: 바람의 흐름
  | "v2c_earthmage_tectonic" // 대지 마법사: 지각진
  | "v2c_earthmage_bedrock" // 대지 마법사: 기반암
  // ── 마법 4차 세 번째 갈래(대주술사·주술사 계승) ──
  | "v2c_archshaman_rite" // 금단 의식 (마법취약 폭발)
  | "v2c_archshaman_curse" // 흉조 II (마법취약 심화)
  // ── 마법 4차 네 번째 갈래(주교·대사제 계승) ──
  | "v2c_archbishop_sanctuary" // 성역 선포 (낮은 회복 + 받피감)
  | "v2c_archbishop_grace" // 성직 권위 (회복 + 최대 HP)
  | "v2c_spellsealer_sealingfield" // 봉마진 (적 공격·스킬 발동 봉쇄)
  | "v2c_spellsealer_greatward" // 봉마대법 (최상위 마법 방어)
  | "v2c_grandwarder_eightgate" // 팔문금쇄진 (보호막 + 받는 피해 감소)
  | "v2c_grandwarder_tripleward" // 삼중결계 (금강·봉마·정화 결계)
  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) ──
  | "v2c_warden_aegis" // 수호의 도발 (상대의 즉시 기본 공격 2회 유도)
  | "v2c_warden_thorns" // 충격 방벽 (직접 공격 피격 시 충격 축적)
  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) ──
  | "v2c_warlord_bloodbath" // 혈전 (HP 소모 강타)
  | "v2c_warlord_slaughter" // 광기 II (광기 상위)
  // ── 무도 4차 두 번째 갈래(투승·무승 계승) ──
  | "v2c_battlemonk_counter" // 반격 (피격 시 확률 반격 — 옛 절정 킷 상속)
  | "v2c_battlemonk_ironbody" // 철신 (최대 HP +20%)
  // ── 생존자 4차 갈래(구조 전문가·불굴의 생환자) ──
  | "v2c_rescueexpert_rescue" // 긴급 구조 (큰 자힐 + 보호막)
  | "v2c_rescueexpert_support" // 생환 지원 (회복 + 최대 HP)
  | "v2c_returner_survive" // 생환 (자힐 + 큰 보호막)
  | "v2c_returner_undying" // 불굴 (최대 HP + 받피감)
  // ── 5차 직업 ──
  | "v2c_swordmaster_cut" // 검격 (안정 물리 피해 + 방깎)
  | "v2c_swordmaster_focus" // 검의 집중 (힘 + 치명피해)
  | "v2c_swordmaster_armorinsight2" // 갑주 간파 II (적 물리 방어 -11%)
  | "v2c_ironknight_guard" // 철벽 태세 (다음 직접 공격 3회 경감 + 반사)
  | "v2c_ironknight_wall" // 장벽술 (방어 + 반사)
  | "v2c_overlord_ruin" // 파멸 난무 (HP 소모 + 처형)
  | "v2c_overlord_throne" // 광기의 왕좌 (광전 + 치명피해)
  | "v2c_arcanist_burst" // 비전 폭발 (순수 마법 피해)
  | "v2c_arcanist_theory" // 비전 이론 (지능 + 치명확률)
  | "v2c_arcanist_magicdismantle2" // 마력 해체 II (적 마법 방어 -11%)
  | "v2c_elementallord_surge" // 원소 폭주 (속성별 강화 마법)
  | "v2c_elementallord_resonance" // 원소 공명 (원소 폭주 보조 효과 강화)
  | "v2c_cryomancer_absolutezero" // 빙결술사: 절대영도
  | "v2c_cryomancer_freezingpoint" // 빙결술사: 빙점 지배
  | "v2c_inscriber_release" // 각인 해방 (장착 문장 조합형 마법)
  | "v2c_inscriber_amplification" // 각인 증폭 (각인 해방 시너지 강화)
  | "v2c_marksman_shot" // 정밀 사격 (DEX 관통 다단)
  | "v2c_marksman_aim" // 조준 (민첩 + 명중)
  | "v2c_nightshade_eclipse" // 월식 (오프너 + 처형)
  | "v2c_nightshade_cloak" // 은신 II (회피 + 치명확률·피해 + 명중)
  | "v2c_nightshade_weakpoint2" // 급소 노출 II (적 물리 방어 -10%)
  | "v2c_saint_miracle" // 기적 (회복 + 방벽)
  | "v2c_saint_benediction" // 축복 (회복 + 내구)
  | "v2c_plaguebringer_outbreak" // 역병 창궐 (중독 폭발)
  | "v2c_plaguebringer_decay" // 부식 IV (부식 심화)
  | "v2c_plaguebringer_virulence4" // 맹독 IV (중독 피해 증가)
  | "v2c_dragonfist_rupture" // 용린파쇄 (관통 연격 + 무력 + 보법)
  | "v2c_dragonfist_footwork" // 무극보법 (힘 + 회피 + 명중)
  | "v2c_dragonfist_formationbreak2" // 파진경 II (적 물리 방어 -10%)
  | "v2c_adamantmonk_stance" // 금강 자세 (피해 감소 + 반격)
  | "v2c_adamantmonk_body" // 금강불괴 (최대 HP + 반격)
  | "v2c_immortal_lifestrike" // 생명 강타 (최대 HP 비례)
  | "v2c_immortal_heart" // 불멸의 심장 (최대 HP + 받피감)
  | "v2c_transcendent_mandala" // 만상검 (올스탯 비례)
  | "v2c_transcendent_harmony" // 초월 조화 (올스탯 패시브)
  | "v2c_bloodlord_brand" // 왕혈 낙인 (HP 소모 + 처형)
  | "v2c_bloodlord_martyrdom" // 불사의 순교 (최대 HP + 받피감 + 흡혈)
  | "v2c_calamitycaller_brand" // 재앙의 낙인 (마법 피해 + 쇠약 + 금제)
  | "v2c_calamitycaller_omen" // 흉조 III (마법취약 심화)
  // ── 6차 직업 ──
  | "v2c_fortressknight_ram" // 성채 충각 (방어력 비례 피해 + 주는 피해 감소)
  | "v2c_fortressknight_citadel" // 움직이는 성채 (방어 + 받피감 + 반사)
  | "v2c_swordsaint_flash" // 무심검 (강한 일격 + 무력 + ATB 지연)
  | "v2c_swordsaint_transcendence" // 일검필살 (힘 + 치명피해 + 단일 타격 물리 스킬 피해 + 명중)
  | "v2c_swordsaint_armorinsight3" // 갑주 간파 III (적 물리 방어 -13%)
  | "v2c_hegemon_annihilation" // 멸왕일도 (잃은 HP 비례 + 혈전·사망 극복 강화)
  | "v2c_hegemon_dominion" // 패황의 지배 (광기 계승 + 사망 극복 + 멸왕일도 재충전)
  | "v2c_archmage_collapse" // 비전 붕괴 (순수 마법 피해 + ATB 지연)
  | "v2c_archmage_theory" // 대마도 이론 (지능 + 마법 스킬 피해)
  | "v2c_archmage_magicdismantle3" // 마력 해체 III (적 마법 방어 -13%)
  | "v2c_primordialmage_return" // 태초회귀 (근원 마법 피해 + 취약 + 지연)
  | "v2c_primordialmage_resonance" // 근원공명 (지능 + 정신 + 마법 운용)
  | "v2c_primordialmage_amplification" // 원초 증폭 (장비 치명타 배율 → 마법 스킬 치명타 배율)
  | "v2c_frostsovereign_eternalprison" // 빙천제: 영겁빙옥 (강한 마법 피해 + 한기 4)
  | "v2c_frostsovereign_permafrost" // 빙천제: 영구동토 (빙결 강화 + 한기 잔류)
  | "v2c_lawweaver_release" // 만상각인 해방 (전투 중 각인 전량 소비)
  | "v2c_lawweaver_inscription" // 법칙 각인 (문장 해방 시 각인 생성)
  | "v2c_savior_judgment" // 구원의 심판 (마법 피해 + 취약)
  | "v2c_savior_grace" // 구원의 은총 (회복 + 내구)
  | "v2c_lawguardian_inviolable" // 만법불침 (삼중 결계 갱신)
  | "v2c_lawguardian_domain" // 만법수호영역 (강화 삼중 결계)
  | "v2c_doomprophet_sentence" // 종말 선고 (마법취약 폭발 + 침식)
  | "v2c_doomprophet_revelation" // 불길한 계시 (마법취약 + 저주 디버프 강화)
  | "v2c_heavenlybow_orbit" // 천궁궤적 (관통 연사 + 취약 + 궤도 마무리)
  | "v2c_heavenlybow_starpath" // 성도 조준 (민첩 + 명중 + 스킬 치명타 피해 + 속도초과 전환)
  | "v2c_blackmoon_flurry" // 암월난무 (연격 + 명중 교란 + 회피)
  | "v2c_blackmoon_dominion" // 흑월지배 (행운 + 민첩 + 회피)
  | "v2c_blackmoon_weakpoint3" // 급소 노출 III (적 물리 방어 -12%)
  | "v2c_myriadvenom_mutation" // 만독개화 (중독 + 침식 + 중독 폭발)
  | "v2c_myriadvenom_body" // 만독지배 (부식 + 체력 + 회피)
  | "v2c_celestialdragon_combo" // 천룡난무 (연격 + 취약 + 보법 + ATB 지연)
  | "v2c_celestialdragon_breath" // 천룡의 호흡 (힘 + 민첩 + 회피)
  | "v2c_celestialdragon_formationbreak3" // 파진경 III (적 물리 방어 -12%)
  | "v2c_vajraarhat_seal" // 금강인 (보호막 + 받피감 + 반격 태세)
  | "v2c_vajraarhat_body" // 나한금신 (최대 HP + 받피감 + 반격)
  | "v2c_eternal_cycle" // 영겁 순환 (지속 재생 + 활력 증폭)
  | "v2c_eternal_body" // 영겁의 육신 (최대 HP + 활력 + 받피감)
  | "v2c_blooddemon_reign" // 혈마군림 (HP 소모 + 처형 + 피해 회복)
  | "v2c_blooddemon_immortalblood" // 불사마혈 (최대 HP + 흡혈 + 방어)
  | "v2c_absolute_unity" // 만상귀일 (올스탯 피해 + 취약 + 행동 가속)
  | "v2c_absolute_harmony" // 절대 조화 (올스탯 + HP·MP)
  // ── 변이자 수집형 킷 ──
  | "v2c_mutant_morphstrike"
  | "v2c_mutant_adaptation"
  | "v2c_beastkin_rend"
  | "v2c_beastkin_clawflurry"
  | "v2c_beastkin_bloodscent"
  | "v2c_beastwarrior_reopen"
  | "v2c_beastwarrior_keenscent"
  | "v2c_tracker_pounce"
  | "v2c_tracker_instinct"
  | "v2c_bloodtracker_trailslash"
  | "v2c_bloodtracker_reading"
  | "v2c_predator_devour"
  | "v2c_predator_bloodnourishment"
  | "v2c_primalpredator_primalfeast"
  | "v2c_primalpredator_apex"
  | "v2c_golem_rocksmash"
  | "v2c_golem_tectoniccollapse"
  | "v2c_golem_stoneskin"
  // ── 내부 7차 전투 패키지 — 직업 카탈로그 공개 전 전투 검증용 ──
  | "v2c_shadowblade_afterimage"
  | "v2c_shadowblade_traceless"
  | "v2c_shadowblade_swordshadow"
  | "v2c_ruinblade_limitstrike"
  | "v2c_ruinblade_oneintent"
  | "v2c_ruinblade_ruinsword"
  | "v2c_skyascendant_fallingstar"
  | "v2c_skyascendant_voidbreak"
  | "v2c_skyascendant_crossover"
  | "v2c_primordialsage_greatorb"
  | "v2c_primordialsage_optimization"
  | "v2c_primordialsage_completeformula";

// 다단 — 동일 damage effect N개.
const hits = (
  n: number,
  statCoef: number,
  baseFlat: number,
  scaling?: V2DamageScaling,
  primaryStatCoef?: number,
): V2SkillEffect[] =>
  Array.from({ length: n }, () => ({
    kind: "damage" as const,
    statCoef,
    baseFlat,
    ...(scaling ? { scaling } : {}),
    ...(primaryStatCoef != null ? { primaryStatCoef } : {}),
  }));

const dmg = (
  statCoef: number,
  baseFlat: number,
  scaling?: V2DamageScaling,
  pierceDamagePct?: number,
  primaryStatCoef?: number,
): V2SkillEffect => ({
  kind: "damage",
  statCoef,
  baseFlat,
  ...(scaling ? { scaling } : {}),
  ...(pierceDamagePct ? { pierceDamagePct } : {}),
  ...(primaryStatCoef != null ? { primaryStatCoef } : {}),
});

export const V2_COMMON_SKILLS: Record<V2CommonSkillId, V2SkillDefinition> = {
  // ═══ 변이자 — 배운 뒤 어느 직업에서도 장착하는 수집형 변이 ═══
  v2c_mutant_morphstrike: {
    id: "v2c_mutant_morphstrike", name: "불완전 변형", stat: "vit", category: "attack", tier: 1,
    description: "불안정하게 신체를 바꾸어 활력으로 적을 들이받는다.", mpCost: 24, cooldown: 0, procChance: 40,
    effects: [dmg(0.8, 100, "vit")],
  },
  v2c_mutant_adaptation: {
    id: "v2c_mutant_adaptation", name: "변이 적응", stat: "vit", category: "passive", tier: 1,
    description: "변화에 적응해 출혈·중독 같은 상태 피해를 줄인다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { statusDamageReductionPct: 8 },
  },
  v2c_beastkin_rend: {
    id: "v2c_beastkin_rend", name: "찢어발기기", stat: "str", category: "attack", tier: 1,
    description: "날카로운 발톱으로 상처를 벌려 출혈을 겹친다.", mpCost: 28, cooldown: 0, procChance: 40,
    effects: [
      dmg(0.9, 110),
      { kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 1 },
    ],
  },
  v2c_beastkin_clawflurry: {
    id: "v2c_beastkin_clawflurry", name: "연속 할퀴기", stat: "str", category: "attack", tier: 1,
    description: "세 번 연달아 할퀴고 깊은 출혈을 남긴다.", mpCost: 32, cooldown: 0, procChance: 38,
    effects: [
      ...hits(3, 0.36, 42),
      { kind: "dot", ...V2_DOT_PRESETS.출혈, stacks: 2 },
    ],
  },
  v2c_beastkin_bloodscent: {
    id: "v2c_beastkin_bloodscent", name: "피 냄새", stat: "str", category: "passive", tier: 1,
    description: "대상의 출혈이 짙을수록 직접 물리 스킬이 강해진다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { bleedPhysicalSkillDamagePctPerStack: 2 },
  },
  v2c_beastwarrior_reopen: {
    id: "v2c_beastwarrior_reopen", name: "상처 덧내기", stat: "str", category: "attack", tier: 2,
    description: "벌어진 상처를 다시 헤집어 출혈이 끊기지 않게 만든다.", mpCost: 34, cooldown: 0, procChance: 35, tempo: "control",
    effects: [dmg(2.65, 190)],
    bleedHunt: { minStacks: 5, hitBleedStacks: 1, hitBleedSetTurns: 4 },
  },
  v2c_beastwarrior_keenscent: {
    id: "v2c_beastwarrior_keenscent", name: "예민한 후각", stat: "dex", category: "passive", tier: 2,
    description: "짙어진 피 냄새를 놓치지 않고 상처 난 적을 정확히 노린다.", mpCost: 0, cooldown: 0,
    effects: [], passive: {},
    bleedHunt: { minStacks: 5, directPhysicalAccuracyPct: 8 },
  },
  v2c_tracker_pounce: {
    id: "v2c_tracker_pounce", name: "추격 도약", stat: "str", category: "attack", tier: 3,
    description: "피 냄새를 따라 단숨에 뛰어들어 적의 다음 움직임을 늦춘다.", mpCost: 46, cooldown: 0, procChance: 35, tempo: "control",
    effects: [dmg(1.45, 230)],
    bleedHunt: { minStacks: 5, skillAccuracyPct: 15, hitEnemyDelayPct: 20 },
  },
  v2c_tracker_instinct: {
    id: "v2c_tracker_instinct", name: "추격 본능", stat: "dex", category: "passive", tier: 3,
    description: "사냥감의 흔적을 읽어 몸을 앞당기고 추격의 흐름을 이어 간다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { statPct: { dex: 12 } },
    bleedHunt: { minStacks: 5, directPhysicalHastePct: 6 },
  },
  v2c_bloodtracker_trailslash: {
    id: "v2c_bloodtracker_trailslash", name: "혈흔 가르기", stat: "str", category: "attack", tier: 3,
    description: "완성된 혈흔을 깊게 갈라 최대 중첩의 출혈을 붙잡아 둔다.", mpCost: 50, cooldown: 0, procChance: 35, tempo: "payoff",
    effects: [dmg(2.82, 260)],
    bleedHunt: { minStacks: 10, hitBleedSetTurns: 4 },
  },
  v2c_bloodtracker_reading: {
    id: "v2c_bloodtracker_reading", name: "혈흔 감식", stat: "str", category: "passive", tier: 3,
    description: "피가 흐르는 결을 읽어 힘을 싣고 방어의 틈으로 파고든다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { statPct: { str: 18 } },
    bleedHunt: { minStacks: 10, directPhysicalPenetrationPct: 8 },
  },
  v2c_predator_devour: {
    id: "v2c_predator_devour", name: "포식", stat: "str", category: "attack", tier: 3,
    description: "피 흘리는 사냥감을 물어뜯어 실제로 앗은 생명만큼 상처를 메운다.", mpCost: 54, cooldown: 0, procChance: 35, tempo: "payoff",
    effects: [dmg(2.62, 320)],
    bleedHunt: { minStacks: 10, skillActualDamageHealPct: 14 },
  },
  v2c_predator_bloodnourishment: {
    id: "v2c_predator_bloodnourishment", name: "피의 양식", stat: "str", category: "passive", tier: 3,
    description: "최대 중첩의 출혈이 사냥감의 생명을 깎을 때마다 육신을 회복한다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { statPct: { str: 12 }, maxHpPct: 12 },
    bleedHunt: { minStacks: 10, bleedTickHealMaxHpPct: 1 },
  },
  v2c_primalpredator_primalfeast: {
    id: "v2c_primalpredator_primalfeast", name: "원시 포식", stat: "str", category: "attack", tier: 3,
    description: "본능만으로 약점을 꿰뚫고 사냥감의 생명을 빼앗아 다음 도약을 앞당긴다.", mpCost: 60, cooldown: 0, procChance: 35, tempo: "payoff",
    effects: [dmg(2.89, 380)],
    bleedHunt: { minStacks: 10, skillPenetrationPct: 12, skillActualDamageHealPct: 18, castHastePct: 15 },
  },
  v2c_primalpredator_apex: {
    id: "v2c_primalpredator_apex", name: "야수의 정점", stat: "str", category: "passive", tier: 3,
    description: "극대화된 본능으로 피 흘리는 사냥감을 몰아붙이고 혈흔을 놓치지 않는다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { statPct: { str: 24, dex: 18 }, maxHpPct: 16 },
    bleedHunt: {
      minStacks: 10,
      directPhysicalDamagePct: 12,
      directPhysicalHitBleedExtend: { chancePct: 30, turns: 1, maxTurns: 4 },
    },
  },
  v2c_golem_rocksmash: {
    id: "v2c_golem_rocksmash", name: "암석 강타", stat: "vit", category: "attack", tier: 1,
    description: "몸을 무겁게 굳혀 방어력으로 내리치고 중량을 얻는다.", mpCost: 28, cooldown: 0, procChance: 40,
    effects: [dmg(1.05, 110, "def")], mutationWeightGain: 1,
  },
  v2c_golem_tectoniccollapse: {
    id: "v2c_golem_tectoniccollapse", name: "지각 붕괴", stat: "vit", category: "attack", tier: 1,
    description: "쌓인 중량을 모두 소모해 지면과 함께 적을 무너뜨린다.", mpCost: 38, cooldown: 0, procChance: 34,
    effects: [dmg(1.35, 150, "def")], mutationWeightConsumePctPerStack: 20,
    defaultPattern: {
      priority: 500,
      condition: { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
    },
  },
  v2c_golem_stoneskin: {
    id: "v2c_golem_stoneskin", name: "돌가죽", stat: "vit", category: "passive", tier: 1,
    description: "중량이 쌓일수록 몸이 단단해져 방어력이 오른다.", mpCost: 0, cooldown: 0,
    effects: [], passive: { stoneskinDefPctPerWeight: 6 },
  },
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
    description: "불덩이를 던져 태운다.", mpCost: 38, fixedMpCost: 90, cooldown: 0, procChance: 30,
    effects: [dmg(1.25, 260, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }],
  },
  v2c_mage_barrage: {
    id: "v2c_mage_barrage", name: "마력 탄막", stat: "int", category: "attack", tier: 1,
    description: "마력탄을 세 발 쏜다.", mpCost: 32, fixedMpCost: 70, cooldown: 0, procChance: 40,
    effects: hits(3, 0.45, 55, "magic"),
  },
  v2c_mage_shield: {
    id: "v2c_mage_shield", name: "마나 보호막", stat: "int", category: "buff", tier: 2,
    description: "마나로 보호막을 두른다. 마나가 클수록 두껍다.", mpCost: 42, fixedMpCost: 105, cooldown: 0, procChance: 100,
    effects: [{ kind: "shield", pctMaxHp: 12, pctMaxMp: 14, turns: 3 }],
  },
  v2c_mage_meditate: {
    id: "v2c_mage_meditate", name: "명상", stat: "int", category: "buff", tier: 1,
    description: "정신을 가다듬어 마나를 조금 회복한다.", mpCost: 0, cooldown: 0, procChance: 100,
    effects: [{ kind: "manaRestore", pctMaxMp: 6 }],
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
  // 무인 하급 권법(단일 딜)·마법사 마력탄(기본 주문). 강타/연격/독침은 기존 재사용.
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
    spCostDiscount: 1,
    effects: [dmg(1.15, 150, "magic")],
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
    description: "급한 상처부터 막아 잃은 체력을 일부 되찾는다.", mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
    effects: [{ kind: "heal", pctLostHp: 20 }],
  },
  v2c_survivor_knowledge: {
    id: "v2c_survivor_knowledge", name: "생존 지식", stat: "vit", category: "passive", tier: 1,
    description: "위험한 환경에서 버티는 요령. 최대 체력이 늘어난다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 10 },
  },
  v2c_survivor_baitcraft: {
    id: "v2c_survivor_baitcraft", name: "미끼 고르기", stat: "luk", category: "passive", tier: 1,
    description: "상황에 맞는 미끼를 골라 낚은 물고기가 조금 더 크게 잡히게 한다.", mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingSizeBonusPct: 4 },
  },
  v2c_angler_pointreading: {
    id: "v2c_angler_pointreading", name: "포인트 짚기", stat: "luk", category: "passive", tier: 3,
    description: "흐름과 수심을 읽어 좋은 자리에 미끼를 넣는다. 희귀 이상 어종이 조금 더 크게 잡힌다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingRareSizeBonusPct: 3 },
  },
  v2c_masterangler_bigcatchsense: {
    id: "v2c_masterangler_bigcatchsense", name: "대물 감각", stat: "luk", category: "passive", tier: 3,
    description: "묵직한 입질을 놓치지 않는다. 큰 물고기가 걸렸을 때 마지막 한 끗을 더 끌어낸다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingBigCatchSizeBonusPct: 2 },
  },
  v2c_fullcatchking_bountyhaul: {
    id: "v2c_fullcatchking_bountyhaul", name: "만선 조업", stat: "luk", category: "passive", tier: 3,
    description: "잔입질을 살려 전체 어획 크기를 끌어올리고, 대물급 입질을 한 번 더 밀어붙인다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingSizeBonusPct: 3, fishingBigCatchSizeBonusPct: 2 },
  },
  v2c_seagod_deepcurrent: {
    id: "v2c_seagod_deepcurrent", name: "심해 해류", stat: "luk", category: "passive", tier: 3,
    description: "깊은 물길을 읽어 물때 한정 어종과 희귀 어종을 더 유리하게 끌어낸다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingSpecialWeightPct: 20, fishingRareSizeBonusPct: 4 },
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
    effects: [dmg(2.02, 167, "def")],
    consumesFortressImpact: true,
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
    description: "응축한 마력탄을 쏘아 박는다.", mpCost: 40, fixedMpCost: 90, cooldown: 0, procChance: 30,
    effects: [dmg(1.45, 240, "magic")],
  },
  v2c_acolyte_smite: {
    // 사제 = 자힐 탱 — 딜 대신 힐(컬렉션 유일 회복). kind:"heal" 배선됨. id 유지(세이브 호환).
    //   잃은 체력 비례를 낮추고 마법공격 계수를 붙여 극저HP 폭발 회복을 줄인다.
    id: "v2c_acolyte_smite", name: "치유", stat: "int", category: "heal", tier: 2,
    description: "신성한 힘으로 잃은 상처를 메운다.", mpCost: 30, fixedMpCost: 75, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 6, statCoef: 0.45, baseFlatByTier: [50, 50, 50], scaling: "magic" }],
  },
  v2c_warder_barrier: {
    id: "v2c_warder_barrier", name: "결계", stat: "int", category: "buff", tier: 2,
    description: "정신을 둘러 보호막을 세운다.", mpCost: 28, cooldown: 0, procChance: 100,
    effects: [{ kind: "shield", pctMaxHp: 8, turns: 3 }],
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
    mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
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
    description: "방패로 받아낸다. 물리·마법 방어력이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 10 },
  },
  v2c_squire_might: {
    id: "v2c_squire_might", name: "근력 II", stat: "str", category: "passive", tier: 2,
    description: "거듭된 단련. 힘이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [], spCost: 3,
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
    // 2차 마법사 생존 패시브. 기존 id와 INT +20%는 세이브·선행 조건 호환을 위해 유지하고,
    //   전 캐릭터에게 열려 있던 INT 마력 장벽을 이 패시브 장착 효과로 이동한다.
    id: "v2c_caster_acumen", name: "마나 실드", stat: "int", category: "passive", tier: 2,
    description: "지능이 크게 비례해 오른다. 전투 시작 시 INT와 최대 MP로 내구도·흡수율·경감률을 정해 마나 실드를 전개한다. 방어 전 적대 피해 일부를 막으며 현재 MP는 소모하지 않는다. DoT·반사·반격·일반 상태 피해에도 적용되지만 고정·처형·보호막 무시·자해·HP 비용은 막지 않는다. 일반 보호막은 HP에 들어오기 직전에 별도로 적용된다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 20 }, magicBarrier: true },
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
  v2c_warder_ward: {
    id: "v2c_warder_ward", name: "결계술", stat: "int", category: "passive", tier: 2,
    description: "마법을 흘려내는 결계를 익힌다. 마법 방어력이 오르고 전투 초반 마법 피해가 줄어든다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: {
      magicDefPct: 15,
      openingMagicDamageReductionPct: 10,
      openingMagicDamageReductionPhases: 3,
    },
  },
  v2c_assassin_fortune: {
    // LUK 비례 액티브의 성장축. 치명 확률 정체성은 유지하되 행운 자체도 함께 올린다.
    id: "v2c_assassin_fortune", name: "행운", stat: "luk", category: "passive", tier: 2,
    description: "행운을 끌어당겨 급소를 노린다. 행운과 치명타 확률이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { luk: 10 }, critPct: 8 },
  },
  v2c_archer_agility: {
    id: "v2c_archer_agility", name: "민첩", stat: "dex", category: "passive", tier: 2,
    description: "날랜 몸놀림. 민첩이 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { dex: 10 } },
  },
  v2c_venomist_corrosion: {
    id: "v2c_venomist_corrosion", name: "부식 I", stat: "luk", category: "passive", tier: 2,
    description: "행운을 높이고, 독이 스며든 적의 방어를 무르게 한다.",
    mpCost: 0, cooldown: 0, spCost: 4,
    effects: [],
    passive: { statPct: { luk: 10 }, poisonedEnemyDefReductionPct: 6 },
  },
  v2c_venomist_virulence: {
    id: "v2c_venomist_virulence", name: "맹독 I", stat: "luk", category: "passive", tier: 2,
    description: "독의 농도를 높여 중독 피해를 증폭한다.",
    mpCost: 0, cooldown: 0, spCost: 4, effects: [],
    passive: { poisonDamagePct: 12 },
  },
  v2c_camper_ration: {
    id: "v2c_camper_ration", name: "비상식량", stat: "vit", category: "passive", tier: 2,
    description: "아껴둔 보급품과 처치 요령. 회복량과 최대 체력이 함께 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 10, maxHpPct: 5 },
  },
  v2c_camper_tidereading: {
    id: "v2c_camper_tidereading", name: "물때 읽기", stat: "luk", category: "passive", tier: 2,
    description: "물살과 시간대를 읽어 현재 물때에 찾아오는 특별한 어종을 노리기 쉬워진다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { fishingSpecialWeightPct: 25 },
  },
  v2c_healthtrainer_routine: {
    id: "v2c_healthtrainer_routine", name: "운동 루틴", stat: "vit", category: "passive", tier: 2,
    description: "개인 훈련 루틴을 잡아 길드 훈련장 보상과 주간 훈련 보너스를 조금 높인다. 학습 즉시 적용되며 장착할 필요가 없다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { guildTrainingRewardBonusPct: 3, guildTrainingWeeklyBonusMastery: 3 },
  },
  v2c_physicalcoach_conditioning: {
    id: "v2c_physicalcoach_conditioning", name: "컨디셔닝 프로그램", stat: "vit", category: "passive", tier: 3,
    description: "훈련 강도와 회복 주기를 맞춰 길드 훈련장 보상과 주간 훈련 보너스를 높인다. 학습 즉시 적용되며 장착할 필요가 없다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { guildTrainingRewardBonusPct: 5, guildTrainingWeeklyBonusMastery: 5 },
  },
  v2c_mastertrainer_elitetraining: {
    id: "v2c_mastertrainer_elitetraining", name: "엘리트 트레이닝", stat: "vit", category: "passive", tier: 3,
    description: "상위 전직자를 위한 고강도 훈련 설계로 길드 훈련장 보상을 크게 끌어올린다. 학습 즉시 적용되며 장착할 필요가 없다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { guildTrainingRewardBonusPct: 6, guildTrainingWeeklyBonusMastery: 7 },
  },
  v2c_championmaker_championprogram: {
    id: "v2c_championmaker_championprogram", name: "챔피언 프로그램", stat: "vit", category: "passive", tier: 3,
    description: "최정상급 훈련 과정을 설계해 길드 훈련장 보상과 주간 훈련 보너스를 더욱 높인다. 학습 즉시 적용되며 장착할 필요가 없다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { guildTrainingRewardBonusPct: 7, guildTrainingWeeklyBonusMastery: 10 },
  },
  v2c_legendarytrainer_mentorship: {
    id: "v2c_legendarytrainer_mentorship", name: "전설의 지도", stat: "vit", category: "passive", tier: 3,
    description: "전설로 남은 지도법으로 길드 훈련장 보상과 주간 훈련 보너스를 최고 수준으로 끌어올린다. 학습 즉시 적용되며 장착할 필요가 없다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { guildTrainingRewardBonusPct: 9, guildTrainingWeeklyBonusMastery: 15 },
  },
  v2c_farmer_seedselection: {
    id: "v2c_farmer_seedselection", name: "씨앗 선별", stat: "luk", category: "passive", tier: 2,
    description: "심기 전 씨앗을 골라 수확량을 높이고 옥수수 재배법을 익힌다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { farmYieldBonusPct: 10 },
  },
  v2c_lumberjack_woodreading: {
    id: "v2c_lumberjack_woodreading", name: "나무결 읽기", stat: "str", category: "passive", tier: 2,
    description: "나무의 결이나 기울기를 미리 읽어 벌목에 실패할 가능성을 낮춘다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { woodcuttingFailureReductionPct: 20 },
  },
  v2c_foresttechnician_axecare: {
    id: "v2c_foresttechnician_axecare", name: "도끼날 세우기", stat: "dex", category: "passive", tier: 3,
    description: "도끼날과 타격 각도를 정교하게 다듬어 벌목 시간을 줄인다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { woodcuttingDurationReductionPct: 8 },
  },
  v2c_masterlumberjack_recoverycut: {
    id: "v2c_masterlumberjack_recoverycut", name: "위기 수습", stat: "str", category: "passive", tier: 3,
    description: "잘못 들어간 도끼질을 바로잡아 실패한 벌목을 성공으로 되돌릴 기회를 얻는다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { woodcuttingFailureRecoveryPct: 20 },
  },
  v2c_forestmaster_efficientwork: {
    id: "v2c_forestmaster_efficientwork", name: "능숙한 벌목", stat: "dex", category: "passive", tier: 3,
    description: "불필요한 동작을 없애 벌목 시간을 한 번 더 단축한다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { woodcuttingDurationReductionPct: 10 },
  },
  v2c_legendarylumberjack_bountifulcut: {
    id: "v2c_legendarylumberjack_bountifulcut", name: "전설의 벌목", stat: "luk", category: "passive", tier: 3,
    description: "나무를 온전히 쓰러뜨려 성공 시 추가 원목을 얻을 가능성을 만든다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { woodcuttingBonusLogChancePct: 30 },
  },
  v2c_miner_veinreading: {
    id: "v2c_miner_veinreading", name: "광맥 읽기", stat: "vit", category: "passive", tier: 2,
    description: "광맥의 결이나 균열을 미리 읽어 채광에 실패할 가능성을 낮춘다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { miningFailureReductionPct: 20 },
  },
  v2c_miningtechnician_toolcare: {
    id: "v2c_miningtechnician_toolcare", name: "곡괭이 손질", stat: "dex", category: "passive", tier: 3,
    description: "곡괭이와 타격 각도를 정교하게 다듬어 채광 시간을 줄인다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { miningDurationReductionPct: 8 },
  },
  v2c_masterminer_recoverystroke: {
    id: "v2c_masterminer_recoverystroke", name: "타격 교정", stat: "str", category: "passive", tier: 3,
    description: "빗나간 곡괭이질을 바로잡아 실패한 채광을 성공으로 되돌릴 기회를 얻는다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { miningFailureRecoveryPct: 20 },
  },
  v2c_minemaster_efficientmining: {
    id: "v2c_minemaster_efficientmining", name: "능숙한 채광", stat: "dex", category: "passive", tier: 3,
    description: "불필요한 동작을 없애 채광 시간을 한 번 더 단축한다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { miningDurationReductionPct: 10 },
  },
  v2c_legendaryminer_richvein: {
    id: "v2c_legendaryminer_richvein", name: "풍부한 광맥", stat: "luk", category: "passive", tier: 3,
    description: "광맥의 핵심을 정확히 캐내 성공 시 추가 광석을 얻을 가능성을 만든다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { miningBonusOreChancePct: 30 },
  },
  v2c_horticulturist_soilreading: {
    id: "v2c_horticulturist_soilreading", name: "토양 읽기", stat: "luk", category: "passive", tier: 3,
    description: "흙의 상태를 읽어 희귀 수확 가능성을 높이고 토마토와 딸기를 재배한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { farmRareChancePct: 3 },
  },
  v2c_masterfarmer_composting: {
    id: "v2c_masterfarmer_composting", name: "퇴비 배합", stat: "vit", category: "passive", tier: 3,
    description: "맞춤 퇴비로 수확량과 희귀 수확 가능성을 높이고 감자와 양파를 재배한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { farmYieldBonusPct: 8, farmRareChancePct: 2 },
  },
  v2c_harvestking_abundance: {
    id: "v2c_harvestking_abundance", name: "풍작 감각", stat: "luk", category: "passive", tier: 3,
    description: "밭의 흐름을 읽어 수확을 안정시키고 쌀과 콩을 재배한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { farmYieldBonusPct: 12, farmRareChancePct: 3 },
  },
  v2c_earthartisan_landcare: {
    id: "v2c_earthartisan_landcare", name: "대지 돌보기", stat: "luk", category: "passive", tier: 3,
    description: "밭의 힘을 보존해 수확을 크게 높이고 사탕수수와 카카오를 재배한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    spCost: 1,
    passive: { farmYieldBonusPct: 15, farmRareChancePct: 5 },
  },
  v2c_cook_prepwork: {
    id: "v2c_cook_prepwork", name: "기초 손질", stat: "int", category: "passive", tier: 2,
    description: "재료를 미리 손질하고 조리 순서를 정리해 요리 경험치를 더 얻는다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { cookingXpBonusPct: 5 },
  },
  v2c_professionalcook_seasoning: {
    id: "v2c_professionalcook_seasoning", name: "섬세한 간", stat: "luk", category: "passive", tier: 3,
    description: "맛의 미세한 차이를 살려 정성작으로 완성할 확률을 높인다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { cookingCarefulChancePct: 8 },
  },
  v2c_headchef_batchcooking: {
    id: "v2c_headchef_batchcooking", name: "효율적인 조리", stat: "dex", category: "passive", tier: 3,
    description: "묶음 조리의 동선을 다듬어 희귀 재료를 제외한 일반 재료 소모량을 줄인다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { cookingMaterialReductionPct: 10 },
  },
  v2c_masterchef_heatcontrol: {
    id: "v2c_masterchef_heatcontrol", name: "장인의 불 조절", stat: "int", category: "passive", tier: 3,
    description: "불의 세기와 조리 시간을 정교하게 맞춰 걸작으로 완성할 확률을 높인다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { cookingMasterpieceChancePct: 5 },
  },
  v2c_legendarychef_secretrecipe: {
    id: "v2c_legendarychef_secretrecipe", name: "비전의 레시피", stat: "luk", category: "passive", tier: 3,
    description: "희귀 재료의 풍미만 온전히 끌어내 일정 확률로 재료를 보존한다. 특선 효과는 그대로 적용된다.",
    mpCost: 0, cooldown: 0, effects: [], spCost: 1,
    passive: { cookingRareIngredientSaveChancePct: 25 },
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
  v2c_duelist_declaration: {
    id: "v2c_duelist_declaration", name: "결투 선언", stat: "str", category: "buff", tier: 3,
    description: "다음 평타 3회의 피해와 치명타 확률을 높인다.", mpCost: 32, cooldown: 5, procChance: 100, spCost: 7,
    effects: [], duelistDeclaration: { rank: 1, hits: 3, basicDamagePct: 15, basicCritChancePct: 15 },
  },
  v2c_duelist_balance: {
    id: "v2c_duelist_balance", name: "검의 균형", stat: "str", category: "passive", tier: 3,
    description: "힘·행운·민첩이 각각 8% 오른다.", mpCost: 0, cooldown: 0, spCost: 5,
    effects: [], passive: { statPct: { str: 8, luk: 8, dex: 8 } },
  },
  v2c_contender_insight: {
    id: "v2c_contender_insight", name: "빈틈 간파", stat: "luk", category: "buff", tier: 3,
    description: "다음 평타 3회가 대상 방어력을 추가로 관통한다.", mpCost: 36, cooldown: 5, procChance: 100, spCost: 8,
    effects: [], duelistDeclaration: { rank: 2, hits: 3, basicDefPenetrationPct: 15 },
  },
  v2c_contender_precision: {
    id: "v2c_contender_precision", name: "정밀한 일격", stat: "dex", category: "passive", tier: 3,
    description: "평타가 대상 방어력을 10% 추가 관통한다.", mpCost: 0, cooldown: 0, spCost: 6,
    effects: [], passive: { basicDefPenetrationPct: 10 },
  },
  v2c_undefeated_momentum: {
    id: "v2c_undefeated_momentum", name: "무패의 기세", stat: "str", category: "buff", tier: 3,
    description: "다음 평타 4회가 이어질수록 피해가 5%씩 오른다.", mpCost: 40, cooldown: 6, procChance: 100, spCost: 11,
    effects: [], duelistDeclaration: { rank: 3, hits: 4, rampPctPerPriorHit: 5 },
  },
  v2c_undefeated_rhythm: {
    id: "v2c_undefeated_rhythm", name: "승자의 박자", stat: "dex", category: "passive", tier: 3,
    description: "평타 치명타 발생 시 다음 행동 간격이 8% 짧아진다.", mpCost: 0, cooldown: 0, spCost: 6,
    effects: [], passive: { basicCritHastePct: 8 },
  },
  v2c_grandchampion_hour: {
    id: "v2c_grandchampion_hour", name: "챔피언의 시간", stat: "luk", category: "buff", tier: 3,
    description: "다음 평타 5회의 치명타 배율과 치명타 확률 상한을 높인다.", mpCost: 44, cooldown: 7, procChance: 100, spCost: 13,
    effects: [], duelistDeclaration: { rank: 4, hits: 5, basicCritMultAdd: 0.25, basicCritChanceCap: 95 },
  },
  v2c_grandchampion_instinct: {
    id: "v2c_grandchampion_instinct", name: "정점의 감각", stat: "luk", category: "passive", tier: 3,
    description: "평타 치명타 확률 상한이 85%로 오른다.", mpCost: 0, cooldown: 0, spCost: 8,
    effects: [], passive: { basicCritChanceCap: 85 },
  },
  v2c_brawler_combo: {
    // 격투가 = 권사 연타의 심화. 단타 강공격에서 "연격으로 빈틈을 만든다"로 전환해 권사→격투가→권룡
    //   계열 정체성을 통일한다. 취약은 낮게 짧게, 다음 연격/파티 딜을 살리는 정도.
    id: "v2c_brawler_combo", name: "벽력연권", stat: "str", category: "attack", tier: 3,
    description: "벼락처럼 이어지는 연권으로 적의 빈틈을 연다.", mpCost: 36, cooldown: 0, procChance: 35,
    effects: [...hits(3, 0.42, 105), { kind: "enemyVuln", pct: 10, turns: 2 }],
  },
  v2c_magus_bolt: {
    // 마도사 = 마법사(마탄) 위 갈래 — 마탄→마력 작렬 리스킨(id 유지·같은 "마탄" 이름 중복 해소).
    id: "v2c_magus_bolt", name: "마력 작렬", stat: "int", category: "attack", tier: 3,
    description: "응축한 마력을 적 안에서 터뜨린다.", mpCost: 44, fixedMpCost: 115, cooldown: 0, procChance: 30,
    effects: [dmg(1.65, 310, "magic")],
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
    description: "공방 균형의 기사도. 힘과 물리·마법 방어력이 함께 오른다.", mpCost: 0, cooldown: 0,
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
    effects: [dmg(2.12, 256, "def")],
    consumesFortressImpact: true,
  },
  v2c_berserker_bloodslash: {
    id: "v2c_berserker_bloodslash", name: "사혈격", stat: "str", category: "attack", tier: 3,
    description: "제 피를 뿌리듯 베어낸다. 명중하면 현재 체력을 10% 소모하고, 잃은 체력이 많을수록 강해진다.",
    mpCost: 38, fixedMpCost: 76, cooldown: 0, procChance: 30, spCost: 6,
    defaultPattern: {
      priority: 100,
      condition: { kind: "self_hp", op: "above", pct: 70 },
    },
    effects: [
      { kind: "missingHpDamage", attackCoef: 1, statCoef: 1, missingHpCoef: 0.4, selfCurrentHpCostPct: 10, scaling: "physical" },
    ],
  },
  v2c_shaman_hex: {
    // 주술사 = 마법사 계보의 저주 특화. 직접 피해는 마도사보다 낮지만 약화와 마법취약 패시브로 후속 피해를 키운다.
    id: "v2c_shaman_hex", name: "저주", stat: "int", category: "attack", tier: 3,
    description: "불길한 주문으로 적을 옭아매고 약화시킨다.", mpCost: 42, fixedMpCost: 105, cooldown: 0, procChance: 30,
    effects: [dmg(1.35, 260, "magic"), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.약화 }],
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
    description: "성스러운 빛으로 잃은 상처를 크게 메운다.", mpCost: 40, fixedMpCost: 110, cooldown: 0, procChance: 100,
    effects: [{ kind: "heal", pctLostHp: 9, statCoef: 0.75, baseFlatByTier: [120, 120, 120], scaling: "spi" }],
  },
  v2c_ritualist_guardingarray: {
    id: "v2c_ritualist_guardingarray", name: "호법진", stat: "int", category: "buff", tier: 3,
    description: "호신의 진을 펼쳐 한동안 받는 피해를 줄인다. 결계 보호막과 함께 유지할 수 있다.",
    mpCost: 36, cooldown: 0, procChance: 100,
    effects: [{ kind: "selfBuffPct", target: "damageReduction", pct: 14, turns: 3 }],
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
  v2c_shadow_shadowstep: {
    id: "v2c_shadow_shadowstep", name: "그림자 도약", stat: "luk", category: "buff", tier: 3,
    description: "그림자 속으로 몸을 감춘다. 전투당 한 번, 다음에 받는 공격을 반드시 회피한다.",
    mpCost: 0, cooldown: 0, procChance: 100, oncePerBattle: true,
    effects: [{ kind: "guaranteedEvade", count: 1 }],
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
    mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
    effects: [{ kind: "heal", pctLostHp: 35 }],
  },
  v2c_extremesurvivor_struggle: {
    id: "v2c_extremesurvivor_struggle", name: "사투", stat: "vit", category: "heal", tier: 3,
    description: "숨이 끊기기 직전의 집중으로 상처를 막고 보호막을 세운다.",
    mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
    effects: [{ kind: "heal", pctLostHp: 25 }, { kind: "shield", pctMaxHp: 8, turns: 3 }],
  },

  // ── 고차 두 번째 갈래 고유 패시브(tier 3·형제와 다른 축) ──
  v2c_guardian_bulwark3: {
    // 가디언 = 방패병 계승 — 순수 방어%(방패 강타가 방어기반이라 방어=딜+탱 시너지). 기사(공방 균형)·
    //   견습기사(힘%)와 다른 축. defPct 는 PvE/PvP 양쪽(def=damageBetween 공용).
    //   방벽 진행의 2차(방패병 방벽 +10% → 가디언 방벽 II +20%, 2026-06-22).
    id: "v2c_guardian_bulwark3", name: "방벽 II", stat: "vit", category: "passive", tier: 3,
    description: "온몸으로 받아낸다. 물리·마법 방어력이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 20 },
  },
  v2c_berserker_madness3: {
    id: "v2c_berserker_madness3", name: "광기", stat: "str", category: "passive", tier: 3,
    description: "체력이 절반 이하일 때 공격 스킬 발동률이 10%p 오른다.",
    mpCost: 0, cooldown: 0, spCost: 5,
    effects: [],
    exclusiveGroup: "berserker_madness",
    exclusiveRank: 1,
    passive: {},
  },
  v2c_shaman_omen3: {
    id: "v2c_shaman_omen3", name: "흉조", stat: "int", category: "passive", tier: 3,
    description: "장착 중 직접 피해 스킬 적중 시 70% 확률로 마법취약 +1스택(최대 10). 스택당 대상이 받는 스킬 피해 +5%.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 5, enemyMagicVulnApplyChancePct: 70 },
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
  v2c_ritualist_wardcraft: {
    id: "v2c_ritualist_wardcraft", name: "진법술", stat: "int", category: "passive", tier: 3,
    description: "마력을 흘려내는 진법을 완성한다. 마법 방어력이 오르고 전투 초반 마법 피해가 크게 줄어든다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: {
      magicDefPct: 25,
      openingMagicDamageReductionPct: 15,
      openingMagicDamageReductionPhases: 4,
    },
  },
  v2c_shadow_lethality3: {
    id: "v2c_shadow_lethality3", name: "필살", stat: "luk", category: "passive", tier: 3,
    description: "급소를 노리는 일격. 치명타 피해가 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { critDmgPct: 25 }, // 크리축 차수 단조 — 그림자=3차(2차20<3차25<4차30).
  },
  v2c_venomancer_corrosion3: {
    id: "v2c_venomancer_corrosion3", name: "부식 II", stat: "luk", category: "passive", tier: 3,
    description: "맹독이 갑옷 틈을 파고든다. 중독된 적의 방어와 중독 피해를 더 크게 흔든다.",
    mpCost: 0, cooldown: 0, spCost: 4,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 7 },
  },
  v2c_venomancer_virulence2: {
    id: "v2c_venomancer_virulence2", name: "맹독 II", stat: "luk", category: "passive", tier: 3,
    description: "정제한 맹독으로 중독 피해를 한층 증폭한다.",
    mpCost: 0, cooldown: 0, spCost: 4, effects: [],
    passive: { poisonDamagePct: 18 },
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
    description: "성스러운 빛을 검에 실어 내리친다. 그 빛이 제 상처마저 어루만진다.", mpCost: 42, fixedMpCost: 90, cooldown: 0, procChance: 30,
    // 자힐 = 잃은 HP 의 12%. 가호 healPowerPct 와 곱연산.
    effects: [dmg(1.2, 220), { kind: "heal", pctLostHp: 12 }],
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
    description: "검에 마력을 휘감아 베는 순간, 물리와 마법이 한꺼번에 작렬한다.", mpCost: 44, fixedMpCost: 110, cooldown: 0, procChance: 30,
    effects: [dmg(0.8, 150), dmg(0.8, 150, "magic")],
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
    description: "피를 성흔처럼 새겨 적을 베고, 맹세의 방벽으로 반격을 버틴다.",
    mpCost: 44, cooldown: 0, procChance: 30,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 8, soakCurrentHpFloorPct: 50, statCoef: 1.05, baseFlatByTier: [180, 180, 180], soakRatio: 1.14 },
      { kind: "enemyDamageDown", pct: 10, turns: 3 },
      { kind: "shield", pctMaxHp: 6, turns: 3 },
    ],
  },
  v2c_bloodtemplar_martyr: {
    id: "v2c_bloodtemplar_martyr", name: "순교의 맹세", stat: "vit", category: "passive", tier: 3,
    description: "상처를 광기로 삼지 않고 맹세로 붙든다. 최대 체력과 피해 저항이 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 8, damageTakenReductionPct: 3 },
  },
  v2c_crimsontemplar_judgment: {
    id: "v2c_crimsontemplar_judgment", name: "진홍 심판", stat: "vit", category: "attack", tier: 3,
    description: "진홍빛 심판으로 적을 짓누르고, 회복의 흐름과 반격의 기세를 끊는다.",
    mpCost: 48, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.8, 260, "def"),
      { kind: "enemyHealReduce", pct: 45, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 8, turns: 3 },
    ],
  },
  v2c_crimsontemplar_oath: {
    id: "v2c_crimsontemplar_oath", name: "피의 서약", stat: "str", category: "passive", tier: 3,
    description: "흘린 피가 방벽의 맹세가 된다. 더 단단하게 버티며 적의 공세를 받아낸다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 12, defPct: 10, damageTakenReductionPct: 6 },
  },
  v2c_darkpriest_reap: {
    id: "v2c_darkpriest_reap", name: "영혼 수확", stat: "luk", category: "attack", tier: 3,
    description: "약해진 영혼을 거두어 들인다. 적이 위태로울수록 깊게 베고 제 상처를 메운다.",
    mpCost: 42, cooldown: 0, procChance: 35,
    effects: [
      { kind: "damage", statCoef: 0.18, baseFlat: 120, scaling: "luk" },
      { kind: "executeDamage", statCoef: 0.24, baseFlatByTier: [210, 210, 210], hpThresholdPct: 20, bonusMult: 2.4, scaling: "luk" },
      { kind: "healFromDamage", pct: 14 },
    ],
  },
  v2c_darkpriest_blessing: {
    id: "v2c_darkpriest_blessing", name: "검은 축복", stat: "luk", category: "passive", tier: 3,
    description: "어두운 축복이 치유와 급소 감각을 함께 날카롭게 한다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { healPowerPct: 18, critDmgPct: 20 },
  },
  v2c_crusader_judgment: {
    id: "v2c_crusader_judgment", name: "성전의 심판", stat: "str", category: "attack", tier: 3,
    description: "성전의 맹세를 담아 내리친다. 빛이 상처를 메우고 몸을 단단히 붙든다.",
    mpCost: 46, fixedMpCost: 110, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.3, 270),
      { kind: "heal", pctLostHp: 14 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 6, turns: 3 },
    ],
  },
  v2c_crusader_oath: {
    id: "v2c_crusader_oath", name: "불굴의 맹세", stat: "vit", category: "passive", tier: 3,
    description: "성전사의 맹세가 물리·마법 방어력과 회복을 함께 끌어올리고 피해를 조금 누른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { defPct: 14, healPowerPct: 14, damageTakenReductionPct: 4 },
  },
  v2c_runeknight_carve: {
    id: "v2c_runeknight_carve", name: "룬 검격", stat: "str", category: "attack", tier: 3,
    description: "검로에 룬을 새겨 베는 순간, 물리와 마법의 균열을 동시에 터뜨린다.",
    mpCost: 48, fixedMpCost: 120, cooldown: 0, procChance: 30,
    effects: [
      dmg(0.95, 190),
      dmg(0.95, 190, "magic"),
      { kind: "enemyVuln", pct: 12, turns: 3 },
    ],
  },
  v2c_runeknight_inscription: {
    id: "v2c_runeknight_inscription", name: "룬 각인", stat: "str", category: "passive", tier: 3,
    description: "몸과 검에 룬을 새긴다. 힘과 지능이 함께 오르고 치명적인 빈틈을 더 잘 읽는다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { str: 14, int: 14 }, critPct: 5 },
  },

  // ── 심화 직업 액티브(tier 4) — 고차보다 한 단계 강한 공격. tier 필드는 3 유지하되
  //   실제 SP는 rubricSpCost 가 효과 성능에 따라 산정한다. ──
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
    // 권룡 4차 액티브 — 방깎 단타에서 방어를 찢는 연격으로 전환. 권룡은 순수 탱(투승)과 달리
    //   회피 보법으로 버티며 여러 타격을 꽂아 무력·취약을 만든다. id 유지(세이브 호환).
    id: "v2c_sensei_combo", name: "권룡연파", stat: "str", category: "attack", tier: 3,
    description: "용이 휘감듯 연속으로 파고들어 적의 방어와 자세를 무너뜨린다.", mpCost: 46, cooldown: 0, procChance: 30,
    effects: [
      ...hits(3, 0.48, 120),
      { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 },
      { kind: "enemyVuln", pct: 12, turns: 3 },
    ],
  },
  v2c_sage_bolt: {
    id: "v2c_sage_bolt", name: "마력 폭사", stat: "int", category: "attack", tier: 3,
    description: "극대화한 마력을 터뜨린다.", mpCost: 46, fixedMpCost: 130, cooldown: 0, procChance: 30,
    effects: [dmg(1.85, 380, "magic")],
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

  // ── 심화 직업 패시브(tier 4) — 직군마다 다른 효과(라인 비포화·기존 어휘, PvP-안전) ──
  v2c_veteran_lethal: {
    // 전사 심화 — 치명 피해(중장갑 라인의 딜 마무리). str% 는 견습기사·방어%는 기사가 유지.
    id: "v2c_veteran_lethal", name: "필살 II", stat: "str", category: "passive", tier: 3,
    description: "한 방에 모든 것을 싣는다. 치명타 피해가 오른다.", mpCost: 0, cooldown: 0,
    effects: [], spCost: 5,
    passive: { critDmgPct: 30 }, // 크리축 차수 단조 — 정예 기사=4차 최상(2차20<3차25<4차30·25→30).
  },
  v2c_veteran_armorinsight: {
    id: "v2c_veteran_armorinsight", name: "갑주 간파 I", stat: "str", category: "passive", tier: 3,
    description: "갑주의 결을 읽어 물리 공격이 적의 방어를 더 깊이 파고들게 한다.",
    mpCost: 0, cooldown: 0, spCost: 5, effects: [],
    passive: { enemyPhysicalDefReductionPct: 9 },
  },
  v2c_sensei_ironbody: {
    // 근력 III(권룡 4차 패시브) — 무인 재설계(2026-06-22): 옛 철신(최대 HP%)에서 힘%로 교체. 격투가 라인
    //   (STR딜·회피) 정점의 공격 정체성. t4 STR% 는 유일 축(고유성 유지). 최대 HP%(철신)는 투승으로 이전. id 유지.
    id: "v2c_sensei_ironbody", name: "근력 III", stat: "str", category: "passive", tier: 3,
    description: "극한의 단련. 힘이 크게 비례해 오른다.", mpCost: 0, cooldown: 0,
    effects: [], spCost: 4,
    passive: { statPct: { str: 20 } },
  },
  v2c_sensei_formationbreak: {
    id: "v2c_sensei_formationbreak", name: "파진경 I", stat: "str", category: "passive", tier: 3,
    description: "힘의 흐름을 비틀어 물리 공격이 적의 방어를 흔들게 한다.",
    mpCost: 0, cooldown: 0, spCost: 3, effects: [],
    passive: { enemyPhysicalDefReductionPct: 8 },
  },
  v2c_sage_insight: {
    // 마법 심화 — 치명 확률(술사 치명피해와 시너지). int 라인에 crit 확률 추가.
    id: "v2c_sage_insight", name: "치명타 II", stat: "int", category: "passive", tier: 3,
    description: "흐름을 꿰뚫는다. 치명타 확률이 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    // 크리축 차수 단조(2026-06-22): 치명확률 4차 대마법사 > 2차 자객(8). 자객(크리 테마)은 8 유지·sage 8→10.
    passive: { critPct: 10 },
  },
  v2c_sage_magicdismantle: {
    id: "v2c_sage_magicdismantle", name: "마력 해체 I", stat: "int", category: "passive", tier: 3,
    description: "마법 방어의 술식을 해석해 주문이 저항을 뚫게 한다.",
    mpCost: 0, cooldown: 0, spCost: 5, effects: [],
    passive: { enemyMagicDefReductionPct: 9 },
  },
  v2c_runecaster_grandsigil: {
    // 문장술사 — 저차 총명 패시브를 "문장"으로 해석하는 마도사 4차 갈래.
    //   총명 I/II/III 를 함께 장착하면 각각 추가타·마나 회수·마법취약 부여가 붙는다.
    //   보유만으로 켜지지 않고 로드아웃을 차지해야 하므로, 고차 화력과 슬롯 압박을 맞교환한다.
    id: "v2c_runecaster_grandsigil", name: "대문장 해방", stat: "int", category: "attack", tier: 3,
    description: "새겨 둔 문장을 한꺼번에 해방한다. 총명 계열 패시브를 함께 장착하면 문장이 더 깊게 열린다.",
    mpCost: 46, cooldown: 0, procChance: 30,
    effects: [dmg(1.2, 210, "magic")],
    equippedSynergies: [
      {
        requiredSkillId: "v2c_mage_acumen",
        effects: [dmg(0.22, 45, "magic")],
      },
      {
        requiredSkillId: "v2c_caster_acumen",
        effects: [{ kind: "manaRestore", pctMaxMp: 5 }],
      },
      {
        requiredSkillId: "v2c_magus_acumen3",
        effects: [{ kind: "enemyVuln", pct: 12, turns: 2 }],
      },
    ],
  },
  v2c_runecaster_circuit: {
    id: "v2c_runecaster_circuit", name: "문장 회로", stat: "int", category: "passive", tier: 3,
    description: "몸 안의 마력 흐름을 문장처럼 정렬한다. 최대 MP와 치명타 확률이 오른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxMpPct: 12, critPct: 5 },
  },
  v2c_chief_afterimage: {
    // 도적 심화(궁수 라인 정점) — 명중(매의 눈). 궁사가 민첩 II 로 바뀌며 비운 명중 축을
    //   라인 정점으로 끌어올린 정조준. id 유지(세이브 호환). 명중은 PvE/PvP 양쪽 소비(회피 대결).
    id: "v2c_chief_afterimage", name: "매의 눈", stat: "dex", category: "passive", tier: 3,
    description: "매처럼 날카로운 눈. 명중이 크게 오른다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { accuracyPct: 30 },
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
  v2c_phantom_weakpoint: {
    id: "v2c_phantom_weakpoint", name: "급소 노출 I", stat: "luk", category: "passive", tier: 3,
    description: "숨겨진 이음새를 찾아 물리 공격이 방어의 빈틈을 파고들게 한다.",
    mpCost: 0, cooldown: 0, spCost: 3, effects: [],
    passive: { enemyPhysicalDefReductionPct: 8 },
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
    id: "v2c_venomlord_sovereign", name: "부식 III", stat: "luk", category: "passive", tier: 3,
    description: "독을 다스리는 정점. 중독된 적의 방어와 독 피해 저항을 크게 무너뜨린다.",
    mpCost: 0, cooldown: 0, spCost: 4,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 9 },
  },
  v2c_venomlord_virulence3: {
    id: "v2c_venomlord_virulence3", name: "맹독 III", stat: "luk", category: "passive", tier: 3,
    description: "독왕의 맹독으로 중독 피해를 크게 증폭한다.",
    mpCost: 0, cooldown: 0, spCost: 4, effects: [],
    passive: { poisonDamagePct: 26 },
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
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    elementNamed: true,
    effects: [dmg(1.55, 300, "magic")], // 무속성 폴백
    elementEffects: {
      fire: [
        dmg(1.55, 300, "magic"),
        { kind: "dot", ...V2_DOT_PRESETS.연소 },
        { kind: "enemyHealReduce", pct: 50, turns: 3 }, // 화상 — 적 회복 −50%(3턴)
      ],
      water: [{ kind: "shield", pctMaxHp: 20, pctMaxMp: 0, turns: 3 }],
      wind: [dmg(1.55, 300, "magic"), { kind: "selfHaste", pct: 50 }], // 바람 — 내 다음 행동 ms −50%
      earth: [dmg(1.55, 300, "magic"), { kind: "enemyDelay", pct: 50 }], // 대지 — 적 다음 행동 ms +50%
      lightning: [dmg(1.55, 300, "magic"), { kind: "enemyVuln", pct: 20, turns: 3 }],
      starlight: [
        dmg(1.55, 300, "magic"),
        { kind: "enemyEvasionDown", pct: 20, turns: 3 }, // 실명 — 적 회피↓
      ],
      void: [
        dmg(1.55, 300, "magic"),
        { kind: "enemyAccuracyDown", pct: 20, turns: 3 }, // 암흑 — 적 명중↓
      ],
    },
  },
  v2c_elementalist_mastery: {
    id: "v2c_elementalist_mastery", name: "원소 통달", stat: "int", category: "passive", tier: 3,
    description: "원소의 이치를 꿰뚫어 지능과 공격 주문의 위력을 끌어올린다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: { statPct: { int: 12 }, magicSkillDamagePct: 6 },
  },

  // ── 마법 4차 원소별 직업 — 캐릭터 속성 상성이 아니라 스킬 자체의 전투 기믹으로 정체성을 만든다. ──
  v2c_firemage_inferno: {
    id: "v2c_firemage_inferno", name: "홍련술", stat: "int", category: "attack", tier: 3,
    description: "홍련의 불길을 터뜨려 적을 태우고 회복의 흐름을 끊는다.",
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.65, 320, "magic"),
      { kind: "dot", ...V2_DOT_PRESETS.연소 },
      { kind: "enemyHealReduce", pct: 50, turns: 3 },
    ],
  },
  v2c_firemage_ember: {
    id: "v2c_firemage_ember", name: "불씨의 지배", stat: "int", category: "passive", tier: 3,
    description: "꺼지지 않는 불씨로 지능과 공격 주문의 위력을 끌어올린다.",
    mpCost: 0, cooldown: 0, effects: [],
    passive: { statPct: { int: 12 }, magicSkillDamagePct: 6 },
  },
  v2c_frostmage_glacier: {
    id: "v2c_frostmage_glacier", name: "빙하진", stat: "int", category: "attack", tier: 3,
    description: "빙하의 마력을 폭발시켜 적에게 한기를 2중첩 쌓는다.",
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    spCost: 7,
    effects: [dmg(1.5, 290, "magic")],
    frostChillGain: 2,
  },
  v2c_frostmage_frozenheart: {
    id: "v2c_frostmage_frozenheart", name: "얼어붙은 심장", stat: "int", category: "passive", tier: 3,
    description: "차가운 정신으로 마나의 그릇과 마법 방어를 단단히 굳힌다.",
    mpCost: 0, cooldown: 0, effects: [],
    passive: { maxMpPct: 12, magicDefPct: 12 },
  },
  v2c_lightningmage_thunderbolt: {
    id: "v2c_lightningmage_thunderbolt", name: "천뢰격", stat: "int", category: "attack", tier: 3,
    description: "벼락을 한 점에 내리꽂아 큰 피해를 주고 적의 방어 흐름을 노출한다.",
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.8, 350, "magic"),
      { kind: "enemyVuln", pct: 18, turns: 3 },
    ],
  },
  v2c_lightningmage_overcharge: {
    id: "v2c_lightningmage_overcharge", name: "과충전", stat: "int", category: "passive", tier: 3,
    description: "마력 회로를 과충전해 치명적인 순간 화력을 높인다.",
    mpCost: 0, cooldown: 0, effects: [],
    passive: { critPct: 8, magicSkillDamagePct: 5 },
  },
  v2c_windmage_tempest: {
    id: "v2c_windmage_tempest", name: "질풍술", stat: "int", category: "attack", tier: 3,
    description: "압축한 바람을 쏘아 보내고 그 반동으로 다음 행동을 크게 앞당긴다.",
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    effects: [dmg(1.55, 300, "magic"), { kind: "selfHaste", pct: 50 }],
  },
  v2c_windmage_flow: {
    id: "v2c_windmage_flow", name: "바람의 흐름", stat: "int", category: "passive", tier: 3,
    description: "전장의 기류를 읽어 공격을 흘리고 주문의 궤도를 바로잡는다.",
    mpCost: 0, cooldown: 0, effects: [],
    passive: { evasionPct: 10, accuracyPct: 12 },
  },
  v2c_earthmage_tectonic: {
    id: "v2c_earthmage_tectonic", name: "지각진", stat: "int", category: "attack", tier: 3,
    description: "대지를 뒤틀어 적의 행동을 늦추고 솟아난 암반으로 자신을 보호한다.",
    mpCost: 46, fixedMpCost: 120, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.55, 300, "magic"),
      { kind: "enemyDelay", pct: 35 },
      { kind: "shield", pctMaxHp: 6, turns: 3 },
    ],
  },
  v2c_earthmage_bedrock: {
    id: "v2c_earthmage_bedrock", name: "기반암", stat: "int", category: "passive", tier: 3,
    description: "기반암처럼 흔들리지 않는 몸과 물리·마법 방어력을 갖춘다.",
    mpCost: 0, cooldown: 0, effects: [],
    passive: { maxHpPct: 10, defPct: 14 },
  },

  // ── 마법 4차 세 번째 갈래(대주술사·주술사 계승) — 마법취약 누적과 폭발 ──
  v2c_archshaman_rite: {
    id: "v2c_archshaman_rite", name: "금단 의식", stat: "int", category: "attack", tier: 3,
    description: "직접 마법 피해를 주고, 누적된 마법취약 스택 수에 따라 추가 피해를 준다.",
    mpCost: 46, fixedMpCost: 125, cooldown: 0, procChance: 30,
    effects: [
      dmg(1.45, 300, "magic"),
      { kind: "stackPayoffDamage", tag: "magicVuln", statCoef: 0.28, baseFlatByTier: [120, 120, 120], perStackFlat: 36, scaling: "magic" },
    ],
  },
  v2c_archshaman_curse: {
    id: "v2c_archshaman_curse", name: "흉조 II", stat: "int", category: "passive", tier: 3,
    description: "장착 중 직접 피해 스킬 적중 시 85% 확률로 마법취약 +1스택(최대 10). 스택당 대상이 받는 스킬 피해 +8%.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 8, enemyMagicVulnApplyChancePct: 85 },
  },
  v2c_calamitycaller_brand: {
    id: "v2c_calamitycaller_brand", name: "재앙의 낙인", stat: "int", category: "attack", tier: 3,
    description: "재앙의 낙인을 찍어 적의 힘과 주문 흐름을 함께 무너뜨린다.",
    mpCost: 54, fixedMpCost: 155, cooldown: 0, procChance: 32, learnCost: 8000,
    effects: [
      dmg(1.8, 420, "magic"),
      { kind: "enemyDamageDown", pct: 14, turns: 3 },
      { kind: "enemySkillProcDown", pct: 18, turns: 3 },
    ],
  },
  v2c_calamitycaller_omen: {
    id: "v2c_calamitycaller_omen", name: "흉조 III", stat: "int", category: "passive", tier: 3,
    description: "장착 중 직접 피해 스킬 적중 시 95% 확률로 마법취약 +1스택(최대 10). 스택당 대상이 받는 스킬 피해 +10%.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 10, enemyMagicVulnApplyChancePct: 95 },
  },
  v2c_archbishop_sanctuary: {
    id: "v2c_archbishop_sanctuary", name: "성역 선포", stat: "int", category: "heal", tier: 3,
    description: "성역을 펼쳐 상처를 조금 메우고 잠시 피해를 줄인다.",
    mpCost: 46, fixedMpCost: 125, cooldown: 0, procChance: 100,
    effects: [
      { kind: "heal", pctLostHp: 7, statCoef: 0.6, baseFlatByTier: [100, 100, 100], scaling: "spi" },
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
  v2c_spellsealer_sealingfield: {
    id: "v2c_spellsealer_sealingfield", name: "봉마진", stat: "int", category: "debuff", tier: 3,
    description: "적의 힘과 술식을 봉하는 진을 펼쳐 주는 피해와 스킬 발동률을 함께 낮춘다.",
    mpCost: 44, cooldown: 0, procChance: 100,
    effects: [
      { kind: "enemyDamageDown", pct: 12, turns: 3 },
      { kind: "enemySkillProcDown", pct: 22, turns: 3 },
    ],
  },
  v2c_spellsealer_greatward: {
    id: "v2c_spellsealer_greatward", name: "봉마대법", stat: "int", category: "passive", tier: 3,
    description: "적의 주문을 꺾는 봉마의 극의. 마법 방어력이 크게 오르고 전투 초반 마법 피해를 억누른다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: {
      magicDefPct: 35,
      openingMagicDamageReductionPct: 20,
      openingMagicDamageReductionPhases: 5,
    },
  },

  // ── 전사 4차 두 번째 갈래(수호자·가디언 계승) — 도발 액티브 + 반사 패시브 ──
  v2c_warden_aegis: {
    id: "v2c_warden_aegis", name: "수호의 도발", stat: "vit", category: "buff", tier: 3,
    description: "적의 시선을 끌어 즉시 자신을 두 번 공격하게 한다. 상대의 원래 다음 행동은 소모하지 않는다.",
    mpCost: 40, cooldown: 3, procChance: 100, spCost: 10,
    effects: [],
    provokeImmediateBasicAttacks: 2,
  },
  v2c_warden_thorns: {
    // 충격 방벽(패시브) — 적중한 직접 공격을 받을 때 충격 1스택(최대 3)을 축적한다.
    // 방패 직접 공격이 모든 스택을 소비하며, 움직이는 성채가 스택당 보너스를 강화한다.
    id: "v2c_warden_thorns", name: "충격 방벽", stat: "vit", category: "passive", tier: 3,
    description: "공격을 방벽으로 받아 충격을 축적한다. 모은 충격은 방패 계열 직접 공격을 강화한다.", mpCost: 0, cooldown: 0,
    effects: [],
    passive: {
      fortressImpactOnHit: true,
      fortressImpactDamagePctPerStack: 15,
    },
  },

  // ── 전사 4차 세 번째 갈래(광왕·광전사 계승) — HP를 걸고 화력을 끌어올리는 순수 공격 라인 ──
  v2c_warlord_bloodbath: {
    id: "v2c_warlord_bloodbath", name: "혈전", stat: "str", category: "attack", tier: 3,
    description: "피로 길을 연다. 명중하면 현재 체력을 15% 소모하고, 다음 파멸일격 또는 멸왕일도를 준비한다.",
    mpCost: 42, fixedMpCost: 76, cooldown: 0, procChance: 30, spCost: 7,
    defaultPattern: {
      priority: 200,
      condition: {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 70 },
          { kind: "self_buff_pct", target: "berserkerFinisher", active: false },
        ],
      },
    },
    effects: [
      { kind: "missingHpDamage", attackCoef: 1.1, statCoef: 1.2, missingHpCoef: 0.7, selfCurrentHpCostPct: 15, scaling: "physical" },
    ],
  },
  v2c_warlord_slaughter: {
    id: "v2c_warlord_slaughter", name: "광기 II", stat: "str", category: "passive", tier: 3,
    description: "광기의 효과를 계승한다. 혈전으로 준비한 필살기의 치명타 피해가 30% 오른다.",
    mpCost: 0, cooldown: 0, spCost: 7,
    effects: [],
    exclusiveGroup: "berserker_madness",
    exclusiveRank: 2,
    passive: {},
  },

  // ── 무도 4차 두 번째 갈래(투승·무승 계승) 킷 — 반격(피격 카운터) + 철신(최대 HP) ──
  //   무인 재설계(2026-06-22): 옛 절정(sensei) 킷을 그대로 상속. 권룡(sensei)이 공격형(권룡연파+근력 III)으로
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
    mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
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
    mpCost: 0, cooldown: 0, procChance: 100,
    oncePerBattle: true,
    effects: [{ kind: "heal", pctLostHp: 35 }, { kind: "shield", pctMaxHp: 12, turns: 3 }],
  },
  v2c_returner_undying: {
    id: "v2c_returner_undying", name: "불굴", stat: "vit", category: "passive", tier: 3,
    description: "쓰러질 상황에서도 버틴다. 최대 체력이 크게 늘고 받는 피해가 줄어든다.",
    mpCost: 0, cooldown: 0,
    effects: [],
    passive: { maxHpPct: 25, damageTakenReductionPct: 8 },
  },

  // ── 5차 직업 — 새 엔진 효과 없이 기존 어휘 조합으로 구현 ──
  v2c_swordmaster_cut: {
    id: "v2c_swordmaster_cut", name: "검격", stat: "str", category: "attack", tier: 3,
    description: "흔들림 없이 베어 적의 자세를 무너뜨린다.",
    mpCost: 50, cooldown: 0, procChance: 35, learnCost: 8000,
    effects: [dmg(1.55, 300), { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 }],
  },
  v2c_swordmaster_focus: {
    id: "v2c_swordmaster_focus", name: "검의 집중", stat: "str", category: "passive", tier: 3,
    description: "칼끝을 흐트러뜨리지 않는다. 힘과 치명타 피해가 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { str: 18 }, critDmgPct: 25 },
  },
  v2c_swordmaster_armorinsight2: {
    id: "v2c_swordmaster_armorinsight2", name: "갑주 간파 II", stat: "str", category: "passive", tier: 3,
    description: "숙련된 검로로 갑주의 결을 갈라 물리 방어를 더 크게 우회한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 7, effects: [],
    passive: { enemyPhysicalDefReductionPct: 11 },
  },
  v2c_ironknight_guard: {
    id: "v2c_ironknight_guard", name: "철벽 태세", stat: "vit", category: "buff", tier: 3,
    description: "철벽을 세워 다음 세 번의 직접 공격을 줄여 받고, 방어력에 비례한 피해를 되돌려준다.",
    mpCost: 48, cooldown: 3, procChance: 100, spCost: 10, learnCost: 8000,
    effects: [],
    ironWallReflect: { charges: 3, damageReductionPct: 30, reflectDefPct: 180 },
    defaultPattern: {
      priority: 400,
      condition: {
        kind: "self_resource",
        resource: "ironWallReflect",
        op: "none",
        value: 0,
      },
    },
  },
  v2c_ironknight_wall: {
    id: "v2c_ironknight_wall", name: "장벽술", stat: "vit", category: "passive", tier: 3,
    description: "단단한 장벽 운용에 익숙해진다. 물리·마법 방어력과 방어력 기반 직접 공격이 강해진다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { defPct: 18, fortressDefSkillStatCoefPct: 15 },
  },
  v2c_overlord_ruin: {
    id: "v2c_overlord_ruin", name: "파멸일격", stat: "str", category: "attack", tier: 3,
    description: "모든 힘을 한 번에 내리꽂는다. 잃은 체력이 많을수록 파괴력이 폭증한다.",
    mpCost: 54, fixedMpCost: 76, cooldown: 0, procChance: 30, learnCost: 8000, spCost: 10,
    defaultPattern: {
      priority: 300,
      condition: {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 50 },
          { kind: "self_buff_pct", target: "berserkerFinisher", active: true },
        ],
      },
    },
    effects: [
      { kind: "missingHpDamage", attackCoef: 1.5, statCoef: 1.8, missingHpCoef: 1.4, scaling: "physical" },
    ],
  },
  v2c_overlord_throne: {
    id: "v2c_overlord_throne", name: "광기의 왕좌", stat: "str", category: "passive", tier: 3,
    description: "광기 II를 계승한다. 전투당 한 번, 사망할 피해를 버티고 최대 체력의 40%로 회복한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 14,
    effects: [],
    exclusiveGroup: "berserker_madness",
    exclusiveRank: 3,
    passive: {},
  },
  v2c_arcanist_burst: {
    id: "v2c_arcanist_burst", name: "비전 폭발", stat: "int", category: "attack", tier: 3,
    description: "응축한 마력을 폭발시켜 큰 마법 피해를 준다.",
    mpCost: 54, fixedMpCost: 170, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [dmg(2.2, 520, "magic")],
  },
  v2c_arcanist_theory: {
    id: "v2c_arcanist_theory", name: "비전 이론", stat: "int", category: "passive", tier: 3,
    description: "마력의 흐름을 계산해 주문의 위력을 끌어올린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { int: 18 }, critPct: 8 },
  },
  v2c_arcanist_magicdismantle2: {
    id: "v2c_arcanist_magicdismantle2", name: "마력 해체 II", stat: "int", category: "passive", tier: 3,
    description: "비전 구조를 분해해 주문이 마법 방어를 더 깊이 무너뜨리게 한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 7, effects: [],
    passive: { enemyMagicDefReductionPct: 11 },
  },
  v2c_elementallord_surge: {
    id: "v2c_elementallord_surge", name: "오원소 폭주", stat: "int", category: "attack", tier: 3,
    description: "보유한 하위 원소 주문으로 술식을 해금하고, 함께 장착한 주문을 공명시켜 폭주의 이름과 효과를 바꾼다.",
    mpCost: 54, fixedMpCost: 155, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [dmg(2.2, 540, "magic")],
    castVariants: [
      {
        name: "개벽·오원소 폭주",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        effects: [
          dmg(3.1, 780, "magic"),
          { kind: "dot", ...V2_DOT_PRESETS.연소 },
          { kind: "enemyHealReduce", pct: 55, turns: 3 },
          { kind: "shield", pctMaxHp: 12, pctMaxMp: 6, turns: 3 },
          { kind: "selfHaste", pct: 40 },
          { kind: "enemyDelay", pct: 40 },
          { kind: "enemyVuln", pct: 18, turns: 3 },
        ],
      },
      {
        name: "화염폭풍",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_windmage_tempest"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_windmage_tempest"],
        effects: [dmg(2.45, 620, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyHealReduce", pct: 50, turns: 3 }, { kind: "selfHaste", pct: 35 }],
      },
      {
        name: "영구빙벽",
        requiredLearnedSkillIds: ["v2c_frostmage_glacier", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_frostmage_glacier", "v2c_earthmage_tectonic"],
        effects: [dmg(2.35, 590, "magic"), { kind: "shield", pctMaxHp: 12, pctMaxMp: 6, turns: 3 }, { kind: "enemyDelay", pct: 40 }],
      },
      {
        name: "뇌풍천격",
        requiredLearnedSkillIds: ["v2c_lightningmage_thunderbolt", "v2c_windmage_tempest"],
        requiredEquippedSkillIds: ["v2c_lightningmage_thunderbolt", "v2c_windmage_tempest"],
        effects: [dmg(2.55, 650, "magic"), { kind: "enemyVuln", pct: 18, turns: 3 }, { kind: "selfHaste", pct: 30 }],
      },
      {
        name: "용암대지",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_earthmage_tectonic"],
        effects: [dmg(2.45, 620, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyDelay", pct: 30 }],
      },
      {
        name: "빙뢰결계",
        requiredLearnedSkillIds: ["v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt"],
        requiredEquippedSkillIds: ["v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt"],
        effects: [dmg(2.4, 610, "magic"), { kind: "shield", pctMaxHp: 8, pctMaxMp: 4, turns: 3 }, { kind: "enemyVuln", pct: 14, turns: 3 }],
      },
      {
        name: "홍련 폭주",
        requiredLearnedSkillIds: ["v2c_firemage_inferno"], requiredEquippedSkillIds: ["v2c_firemage_inferno"],
        effects: [dmg(2.3, 570, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyHealReduce", pct: 55, turns: 3 }],
      },
      {
        name: "빙하 폭주",
        requiredLearnedSkillIds: ["v2c_frostmage_glacier"], requiredEquippedSkillIds: ["v2c_frostmage_glacier"],
        effects: [dmg(2.2, 550, "magic"), { kind: "shield", pctMaxHp: 12, pctMaxMp: 6, turns: 3 }, { kind: "enemyDelay", pct: 25 }],
      },
      {
        name: "천뢰 폭주",
        requiredLearnedSkillIds: ["v2c_lightningmage_thunderbolt"], requiredEquippedSkillIds: ["v2c_lightningmage_thunderbolt"],
        effects: [dmg(2.4, 610, "magic"), { kind: "enemyVuln", pct: 20, turns: 3 }],
      },
      {
        name: "질풍 폭주",
        requiredLearnedSkillIds: ["v2c_windmage_tempest"], requiredEquippedSkillIds: ["v2c_windmage_tempest"],
        effects: [dmg(2.25, 560, "magic"), { kind: "selfHaste", pct: 50 }],
      },
      {
        name: "지각 폭주",
        requiredLearnedSkillIds: ["v2c_earthmage_tectonic"], requiredEquippedSkillIds: ["v2c_earthmage_tectonic"],
        effects: [dmg(2.25, 560, "magic"), { kind: "enemyDelay", pct: 50 }, { kind: "shield", pctMaxHp: 6, turns: 3 }],
      },
      {
        name: "오원소 대폭주",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        effects: [dmg(2.45, 620, "magic"), { kind: "enemyVuln", pct: 12, turns: 3 }],
      },
    ],
    equippedSynergies: [
      {
        requiredSkillId: "v2c_elementallord_resonance",
        effects: [dmg(0.22, 80, "magic"), { kind: "manaRestore", pctMaxMp: 5 }],
      },
    ],
  },
  v2c_elementallord_resonance: {
    id: "v2c_elementallord_resonance", name: "원소 공명", stat: "int", category: "passive", tier: 3,
    description: "여러 원소의 주문식을 한 회로에 연결한다. 오원소 폭주에 추가 피해와 마나 환류가 더해진다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { elementResonance: true },
  },
  v2c_cryomancer_absolutezero: {
    id: "v2c_cryomancer_absolutezero", name: "절대영도", stat: "int", category: "attack", tier: 3,
    description: "극한의 냉기를 응축해 적에게 큰 마법 피해를 주고 한기를 3중첩 쌓는다.",
    mpCost: 0, fixedMpCost: 155, cooldown: 0, procChance: 30,
    learnCost: 8000, spCost: 7,
    effects: [dmg(2.2, 540, "magic")],
    frostChillGain: 3,
  },
  v2c_cryomancer_freezingpoint: {
    id: "v2c_cryomancer_freezingpoint", name: "빙점 지배", stat: "int", category: "passive", tier: 3,
    description: "빙점을 지배해 마나를 늘리고 한기에서 발생하는 빙결을 강화한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 6, effects: [],
    passive: { maxMpPct: 12, freezeDamagePct: 50, freezeDelayPct: 40 },
  },
  v2c_inscriber_release: {
    id: "v2c_inscriber_release", name: "각인 해방", stat: "int", category: "attack", tier: 3,
    description: "마력에 새긴 각인을 해방한다. 장착한 문장 재료에 따라 추가 효과가 열린다.",
    mpCost: 54, fixedMpCost: 150, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [dmg(1.75, 390, "magic")],
    equippedSynergies: [
      {
        requiredSkillId: "v2c_mage_acumen",
        effects: [dmg(0.28, 60, "magic")],
      },
      {
        requiredSkillId: "v2c_caster_acumen",
        effects: [{ kind: "manaRestore", pctMaxMp: 7 }],
      },
      {
        requiredSkillId: "v2c_magus_acumen3",
        effects: [{ kind: "enemyVuln", pct: 14, turns: 2 }],
      },
      {
        requiredSkillId: "v2c_runecaster_circuit",
        effects: [{ kind: "shield", pctMaxHp: 0, pctMaxMp: 10, turns: 3 }],
      },
      {
        requiredSkillIds: ["v2c_mage_acumen", "v2c_inscriber_amplification"],
        effects: [dmg(0.16, 35, "magic")],
      },
      {
        requiredSkillIds: ["v2c_caster_acumen", "v2c_inscriber_amplification"],
        effects: [{ kind: "manaRestore", pctMaxMp: 4 }],
      },
      {
        requiredSkillIds: ["v2c_magus_acumen3", "v2c_inscriber_amplification"],
        effects: [dmg(0.18, 40, "magic")],
      },
      {
        requiredSkillIds: ["v2c_runecaster_circuit", "v2c_inscriber_amplification"],
        effects: [{ kind: "shield", pctMaxHp: 0, pctMaxMp: 6, turns: 3 }],
      },
    ],
  },
  v2c_inscriber_amplification: {
    id: "v2c_inscriber_amplification", name: "각인 증폭", stat: "int", category: "passive", tier: 3,
    description: "각인의 흐름을 증폭한다. 각인 해방이 문장 재료와 반응할 때 추가 효과가 열린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { inscriptionAmplification: true },
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
    passive: { statPct: { dex: 18 }, accuracyPct: 24 },
  },
  v2c_nightshade_eclipse: {
    id: "v2c_nightshade_eclipse", name: "월식", stat: "luk", category: "attack", tier: 3,
    description: "두 번 연속 공격한다. 1타는 적 HP 90% 이상일 때 PvE 5배·PvP 4배, 2타는 35% 이하일 때 3배 피해를 준다.",
    // 기습·암살을 한 슬롯에 묶은 5차 상위기. 절충형 저가 스킬이 아니라 각 조건에서 하위기를
    // 확실히 넘도록 SP를 10으로 올리고 오프너·처형 배수를 강화한다. 오프너는 PvP에서 공격 횟수·
    // 스킬 치명타와 중첩되므로 PvE 5배와 달리 기존 4배를 유지한다.
    mpCost: 52, cooldown: 0, procChance: 100, learnCost: 8000, spCost: 10,
    effects: [
      { kind: "ambushDamage", statCoef: 0.22, baseFlatByTier: [180, 180, 180], hpThresholdPct: 90, bonusMult: 5.0, pvpBonusMult: 4.0, scaling: "luk" },
      { kind: "executeDamage", statCoef: 0.26, baseFlatByTier: [180, 180, 180], hpThresholdPct: 35, bonusMult: 3.0, scaling: "luk" },
    ],
  },
  v2c_nightshade_cloak: {
    id: "v2c_nightshade_cloak", name: "은신 II", stat: "luk", category: "passive", tier: 3,
    description: "어둠 속에서 몸을 숨기고 급소를 정확히 찌른다. 회피와 치명타 확률·피해, 명중이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { evasionPct: 18, critPct: 8, critDmgPct: 20, accuracyPct: 15 },
  },
  v2c_nightshade_weakpoint2: {
    id: "v2c_nightshade_weakpoint2", name: "급소 노출 II", stat: "luk", category: "passive", tier: 3,
    description: "어둠 속에서 방어의 접합부를 드러내 물리 공격이 더 깊이 파고들게 한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 5, effects: [],
    passive: { enemyPhysicalDefReductionPct: 10 },
  },
  v2c_saint_miracle: {
    id: "v2c_saint_miracle", name: "기적", stat: "int", category: "heal", tier: 3,
    description: "기적의 빛으로 상처를 메우고 잠시 몸을 보호한다.",
    mpCost: 54, fixedMpCost: 160, cooldown: 0, procChance: 100, learnCost: 8000,
    effects: [
      { kind: "heal", pctLostHp: 9, statCoef: 0.8, baseFlatByTier: [140, 140, 140], scaling: "spi" },
      { kind: "shield", pctMaxHp: 10, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 10, turns: 3 },
    ],
  },
  v2c_saint_benediction: {
    id: "v2c_saint_benediction", name: "축복", stat: "int", category: "passive", tier: 3,
    description: "축복이 치유와 생존을 함께 끌어올린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { healPowerPct: 25, maxHpPct: 12, damageTakenReductionPct: 5 },
  },
  v2c_grandwarder_eightgate: {
    id: "v2c_grandwarder_eightgate", name: "팔문금쇄진", stat: "int", category: "buff", tier: 3,
    description: "여덟 방위의 문을 잠가 보호막을 두르고, 3행동 동안 받는 피해를 줄인다.",
    mpCost: 56, fixedMpCost: 160, cooldown: 0, procChance: 100, learnCost: 8000,
    effects: [
      { kind: "shield", pctMaxHp: 18, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 14, turns: 3 },
    ],
  },
  v2c_grandwarder_tripleward: {
    id: "v2c_grandwarder_tripleward", name: "삼중결계", stat: "int", category: "passive", tier: 3,
    description: "전투 시작 시 직접 물리 피해를 막는 금강결계, 직접 마법 피해를 막는 봉마결계, 새 상태이상을 막는 정화결계를 각각 1회 전개한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    exclusiveGroup: "triple_ward",
    exclusiveRank: 1,
    passive: { tripleWardRank: 1 },
  },
  v2c_plaguebringer_outbreak: {
    id: "v2c_plaguebringer_outbreak", name: "역병 창궐", stat: "luk", category: "attack", tier: 3,
    description: "역병을 퍼뜨려 중독을 깊게 쌓고 한꺼번에 터뜨린다.",
    mpCost: 52, cooldown: 0, procChance: 35, learnCost: 8000,
    effects: [
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 26, stacks: 5 },
      { kind: "stackPayoffDamage", tag: "poison", statCoef: 0.24, baseFlatByTier: [220, 220, 220], perStackFlat: 55, spCostPerStackFlat: 40, scaling: "luk" },
    ],
  },
  v2c_plaguebringer_decay: {
    id: "v2c_plaguebringer_decay", name: "부식 IV", stat: "luk", category: "passive", tier: 3,
    description: "독이 갑옷과 살을 함께 무너뜨려 중독 피해를 더 깊게 남긴다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 6,
    effects: [],
    passive: { poisonedEnemyDefReductionPct: 12, critDmgPct: 10 },
  },
  v2c_plaguebringer_virulence4: {
    id: "v2c_plaguebringer_virulence4", name: "맹독 IV", stat: "luk", category: "passive", tier: 3,
    description: "역병의 독성을 극대화해 중독 피해를 크게 증폭한다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 6, effects: [],
    // I~IV 합산은 기존 97.6%와 거의 같은 98%로 유지하면서, SP 6인 최종 단계가
    // SP 4인 하위 단계보다 단일 효과와 SP 효율 모두 확실히 높게 한다.
    passive: { poisonDamagePct: 42 },
  },
  v2c_dragonfist_rupture: {
    id: "v2c_dragonfist_rupture", name: "용린파쇄", stat: "str", category: "attack", tier: 3,
    description: "용의 비늘을 깨듯 틈을 만들고, 보법을 되살려 다음 공방을 유리하게 가져간다.",
    mpCost: 54, cooldown: 0, procChance: 35, learnCost: 8000,
    effects: [
      { kind: "damage", statCoef: 0.45, baseFlat: 145, pierceDamagePct: 10 },
      { kind: "damage", statCoef: 0.45, baseFlat: 145, pierceDamagePct: 10 },
      { kind: "damage", statCoef: 0.45, baseFlat: 145, pierceDamagePct: 10 },
      { kind: "damage", statCoef: 0.45, baseFlat: 145, pierceDamagePct: 10 },
      { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 },
      { kind: "selfBuffPct", target: "evasion", pct: 8, turns: 3 },
    ],
  },
  v2c_dragonfist_footwork: {
    id: "v2c_dragonfist_footwork", name: "무극보법", stat: "str", category: "passive", tier: 3,
    description: "힘을 실으면서도 발이 멈추지 않는다. 힘, 회피, 명중이 함께 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { statPct: { str: 18 }, evasionPct: 16, accuracyPct: 12 },
  },
  v2c_dragonfist_formationbreak2: {
    id: "v2c_dragonfist_formationbreak2", name: "파진경 II", stat: "str", category: "passive", tier: 3,
    description: "응축한 경력을 흘려보내 물리 공격이 적의 방어를 더 크게 뒤튼다.",
    mpCost: 0, cooldown: 0, learnCost: 8000, spCost: 5, effects: [],
    passive: { enemyPhysicalDefReductionPct: 10 },
  },
  v2c_adamantmonk_stance: {
    id: "v2c_adamantmonk_stance", name: "금강 자세", stat: "vit", category: "buff", tier: 3,
    description: "금강처럼 버티는 막을 세우고 공격을 받아칠 태세를 갖춘다.",
    mpCost: 48, cooldown: 0, procChance: 100, learnCost: 8000,
    effects: [
      { kind: "shield", pctMaxHp: 14, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 10, turns: 3 },
    ],
  },
  v2c_adamantmonk_body: {
    id: "v2c_adamantmonk_body", name: "금강불괴", stat: "vit", category: "passive", tier: 3,
    description: "무너지지 않는 몸. 최대 체력과 반격 확률이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { maxHpPct: 25, counterChancePct: 35 },
  },
  v2c_immortal_lifestrike: {
    id: "v2c_immortal_lifestrike", name: "생명 강타", stat: "vit", category: "attack", tier: 3,
    description: "불멸의 생명력을 힘으로 바꾸어 적을 짓누른다.",
    mpCost: 54, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [dmg(0.04, 260, "maxHp")],
  },
  v2c_immortal_heart: {
    id: "v2c_immortal_heart", name: "불멸의 심장", stat: "vit", category: "passive", tier: 3,
    description: "꺼지지 않는 심장이 육체를 붙든다. 최대 체력과 피해 저항이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: { maxHpPct: 30, damageTakenReductionPct: 6 },
  },
  v2c_transcendent_mandala: {
    id: "v2c_transcendent_mandala", name: "만상검", stat: "str", category: "attack", tier: 3,
    description: "쌓아온 모든 능력을 한 검로에 모아 베어낸다.",
    // allStatTotal 스케일은 일반 ATK 계수 루브릭이 실제 위력을 낮게 평가하므로 상향 보정.
    mpCost: 56, cooldown: 0, procChance: 30, learnCost: 8000, spCost: 8,
    effects: [dmg(0.16, 260, "all")],
  },
  v2c_transcendent_harmony: {
    id: "v2c_transcendent_harmony", name: "초월 조화", stat: "int", category: "passive", tier: 3,
    description: "모든 능력의 균형이 한계를 밀어 올린다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: {
      statPct: { str: 8, vit: 8, dex: 8, int: 8, spi: 8, luk: 8 },
      maxHpPct: 8,
      maxMpPct: 8,
    },
  },
  v2c_bloodlord_brand: {
    id: "v2c_bloodlord_brand", name: "왕혈 낙인", stat: "str", category: "attack", tier: 3,
    description: "군주의 피로 낙인을 찍는다. 상처를 대가로 약해진 적에게 최후를 선고한다.",
    mpCost: 56, cooldown: 0, procChance: 30, learnCost: 8000,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 10, soakCurrentHpFloorPct: 50, statCoef: 1.35, baseFlatByTier: [310, 310, 310], soakRatio: 1.82 },
      { kind: "executeDamage", statCoef: 0.22, baseFlatByTier: [160, 160, 160], hpThresholdPct: 30, bonusMult: 2.2 },
    ],
  },
  v2c_bloodlord_martyrdom: {
    id: "v2c_bloodlord_martyrdom", name: "불사의 순교", stat: "vit", category: "passive", tier: 3,
    description: "순교는 끝나지 않는다. 빼앗은 생명으로 피의 대가를 메우며 버틴다.",
    mpCost: 0, cooldown: 0, learnCost: 8000,
    effects: [],
    passive: {
      maxHpPct: 20,
      lifestealPct: 2,
      damageTakenReductionPct: 8,
    },
  },

  // ── 6차 직업 — 직업 숙련도 기반 엔드 성장 ──
  v2c_fortressknight_ram: {
    id: "v2c_fortressknight_ram", name: "성채 충각", stat: "vit", category: "attack", tier: 3,
    description: "성채처럼 밀고 들어가 방어력으로 적을 짓누르고, 충격으로 적이 주는 피해를 감소시킨다.",
    mpCost: 58, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [dmg(2.16, 474, "def"), { kind: "enemyDamageDown", pct: 15, turns: 2 }],
    consumesFortressImpact: true,
    defaultPattern: {
      priority: 500,
      condition: {
        kind: "self_resource",
        resource: "impact",
        op: "atLeast",
        value: 3,
      },
    },
  },
  v2c_fortressknight_citadel: {
    id: "v2c_fortressknight_citadel", name: "움직이는 성채", stat: "vit", category: "passive", tier: 3,
    description: "갑옷과 방패가 하나의 성채가 된다. 방어와 피해 저항이 오르고, 충격을 소비하는 직접 공격이 더욱 강해진다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: {
      defPct: 30,
      damageTakenReductionPct: 8,
      fortressImpactDamagePctPerStack: 20,
    },
  },
  v2c_swordsaint_flash: {
    id: "v2c_swordsaint_flash", name: "무심검", stat: "str", category: "attack", tier: 3,
    description: "마음을 비운 한 검으로 적의 자세와 흐름을 동시에 끊는다.",
    mpCost: 60, cooldown: 0, procChance: 35, learnCost: 12000, spCostDiscount: 2,
    effects: [
      dmg(1.95, 460, undefined, 15, 5),
      { kind: "enemyDebuff", ...V2_DEBUFF_PRESETS.무력 },
      { kind: "enemyHealReduce", pct: 40, turns: 2 },
      { kind: "enemyDelay", pct: 45 },
    ],
  },
  v2c_swordsaint_transcendence: {
    id: "v2c_swordsaint_transcendence", name: "일검필살", stat: "str", category: "passive", tier: 3,
    description: "모든 기운을 한 검에 모은다. 힘과 치명타 피해가 오르고, 단 한 번의 물리 타격으로 끝내는 공격 스킬이 강해진다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 11,
    effects: [],
    passive: {
      statPct: { str: 24 },
      skillCritDmgPct: 35,
      singleHitPhysicalSkillDamagePct: 30,
      accuracyPct: 15,
    },
  },
  v2c_swordsaint_armorinsight3: {
    id: "v2c_swordsaint_armorinsight3", name: "갑주 간파 III", stat: "str", category: "passive", tier: 3,
    description: "완성된 검로로 모든 갑주의 결을 꿰뚫어 물리 방어를 크게 우회한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 9, effects: [],
    passive: { enemyPhysicalDefReductionPct: 13 },
  },
  v2c_hegemon_annihilation: {
    id: "v2c_hegemon_annihilation", name: "멸왕일도", stat: "str", category: "attack", tier: 3,
    description: "잃은 HP가 많을수록 강해지는 패황의 최종 일격. 혈전과 사망 극복으로 더욱 강해진다.",
    mpCost: 62, fixedMpCost: 76, cooldown: 0, procChance: 30, learnCost: 12000, spCost: 13,
    oncePerBattle: true,
    defaultPattern: {
      priority: 400,
      condition: {
        kind: "any",
        conditions: [
          { kind: "self_buff_pct", target: "berserkerDeathOvercome", active: true },
          { kind: "self_hp", op: "below", pct: 25 },
        ],
      },
    },
    effects: [
      { kind: "missingHpDamage", attackCoef: 2.2, statCoef: 2.64, missingHpCoef: 2, scaling: "physical" },
    ],
  },
  v2c_hegemon_dominion: {
    id: "v2c_hegemon_dominion", name: "패황의 지배", stat: "str", category: "passive", tier: 3,
    description: "광기 계열의 모든 하위 효과를 계승한다. 치명 피해를 한 번 극복한 뒤 다음 공격을 강화하고 멸왕일도를 재충전한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 15,
    effects: [],
    exclusiveGroup: "berserker_madness",
    exclusiveRank: 4,
    passive: {},
  },
  v2c_archmage_collapse: {
    id: "v2c_archmage_collapse", name: "비전 붕괴", stat: "int", category: "attack", tier: 3,
    description: "고도로 압축한 마력을 무너뜨려 순수한 마법 피해를 준다.",
    mpCost: 58, fixedMpCost: 190, cooldown: 0, procChance: 32, learnCost: 12000,
    effects: [
      dmg(2.45, 620, "magic", 12),
      { kind: "enemyHealReduce", pct: 40, turns: 2 },
      { kind: "enemyDelay", pct: 35 },
    ],
  },
  v2c_archmage_theory: {
    id: "v2c_archmage_theory", name: "대마도 이론", stat: "int", category: "passive", tier: 3,
    description: "마법식의 근본을 꿰뚫는다. 지능과 마법 스킬 피해가 오르고 마력 방벽으로 피해를 흘린다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    spCostDiscount: 1,
    effects: [],
    passive: {
      statPct: { int: 22 },
      magicSkillDamagePct: 16,
      maxHpPct: 20,
      damageTakenReductionPct: 8,
    },
  },
  v2c_archmage_magicdismantle3: {
    id: "v2c_archmage_magicdismantle3", name: "마력 해체 III", stat: "int", category: "passive", tier: 3,
    description: "마법식의 근원을 해체해 주문이 마법 방어를 크게 무너뜨리게 한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 9, effects: [],
    passive: { enemyMagicDefReductionPct: 13 },
  },
  v2c_primordialmage_return: {
    id: "v2c_primordialmage_return", name: "태초회귀", stat: "int", category: "attack", tier: 3,
    description: "하위 원소 주문의 보유·장착 조합을 태초의 술식으로 승격시켜 이름과 권능을 다시 쓴다. 근원공명과 함께 장착하면 추가 마법 피해를 주고 최대 MP의 8%를 회복하며 선택된 주문식 재료를 공명시킨다. 오원소 폭주는 태초회귀를 강화하는 촉매가 된다.",
    mpCost: 82, fixedMpCost: 180, cooldown: 0, procChance: 32, learnCost: 12000,
    effects: [dmg(2.45, 650, "magic"), { kind: "enemyVuln", pct: 14, turns: 3 }, { kind: "enemyDelay", pct: 30 }],
    castVariants: [
      {
        name: "개벽·오원소 회귀",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        effects: [
          dmg(3.5, 925, "magic"),
          { kind: "dot", ...V2_DOT_PRESETS.연소 },
          { kind: "enemyHealReduce", pct: 65, turns: 3 },
          { kind: "shield", pctMaxHp: 16, pctMaxMp: 8, turns: 3 },
          { kind: "selfHaste", pct: 50 },
          { kind: "enemyDelay", pct: 50 },
          { kind: "enemyVuln", pct: 24, turns: 3 },
        ],
      },
      {
        name: "태초의 화염폭풍",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_windmage_tempest"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_windmage_tempest"],
        effects: [dmg(2.8, 740, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyHealReduce", pct: 60, turns: 3 }, { kind: "selfHaste", pct: 45 }],
      },
      {
        name: "태초의 영구빙벽",
        requiredLearnedSkillIds: ["v2c_frostmage_glacier", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_frostmage_glacier", "v2c_earthmage_tectonic"],
        effects: [dmg(2.7, 710, "magic"), { kind: "shield", pctMaxHp: 16, pctMaxMp: 8, turns: 3 }, { kind: "enemyDelay", pct: 50 }],
      },
      {
        name: "태초의 천뢰폭풍",
        requiredLearnedSkillIds: ["v2c_lightningmage_thunderbolt", "v2c_windmage_tempest"],
        requiredEquippedSkillIds: ["v2c_lightningmage_thunderbolt", "v2c_windmage_tempest"],
        effects: [dmg(2.9, 770, "magic"), { kind: "enemyVuln", pct: 24, turns: 3 }, { kind: "selfHaste", pct: 40 }],
      },
      {
        name: "태초의 용암대지",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_earthmage_tectonic"],
        requiredEquippedSkillIds: ["v2c_firemage_inferno", "v2c_earthmage_tectonic"],
        effects: [dmg(2.8, 740, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyDelay", pct: 40 }],
      },
      {
        name: "태초의 빙뢰결계",
        requiredLearnedSkillIds: ["v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt"],
        requiredEquippedSkillIds: ["v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt"],
        effects: [dmg(2.75, 730, "magic"), { kind: "shield", pctMaxHp: 12, pctMaxMp: 6, turns: 3 }, { kind: "enemyVuln", pct: 20, turns: 3 }],
      },
      {
        name: "태초의 홍련", requiredLearnedSkillIds: ["v2c_firemage_inferno"], requiredEquippedSkillIds: ["v2c_firemage_inferno"],
        effects: [dmg(2.65, 690, "magic"), { kind: "dot", ...V2_DOT_PRESETS.연소 }, { kind: "enemyHealReduce", pct: 65, turns: 3 }],
      },
      {
        name: "태초의 빙하", requiredLearnedSkillIds: ["v2c_frostmage_glacier"], requiredEquippedSkillIds: ["v2c_frostmage_glacier"],
        effects: [dmg(2.55, 670, "magic"), { kind: "shield", pctMaxHp: 16, pctMaxMp: 8, turns: 3 }, { kind: "enemyDelay", pct: 35 }],
      },
      {
        name: "태초의 천뢰", requiredLearnedSkillIds: ["v2c_lightningmage_thunderbolt"], requiredEquippedSkillIds: ["v2c_lightningmage_thunderbolt"],
        effects: [dmg(2.75, 730, "magic"), { kind: "enemyVuln", pct: 24, turns: 3 }],
      },
      {
        name: "태초의 질풍", requiredLearnedSkillIds: ["v2c_windmage_tempest"], requiredEquippedSkillIds: ["v2c_windmage_tempest"],
        effects: [dmg(2.6, 680, "magic"), { kind: "selfHaste", pct: 60 }],
      },
      {
        name: "태초의 지각", requiredLearnedSkillIds: ["v2c_earthmage_tectonic"], requiredEquippedSkillIds: ["v2c_earthmage_tectonic"],
        effects: [dmg(2.6, 680, "magic"), { kind: "enemyDelay", pct: 60 }, { kind: "shield", pctMaxHp: 8, turns: 3 }],
      },
      {
        name: "태초 오원소 회귀",
        requiredLearnedSkillIds: ["v2c_firemage_inferno", "v2c_frostmage_glacier", "v2c_lightningmage_thunderbolt", "v2c_windmage_tempest", "v2c_earthmage_tectonic"],
        effects: [dmg(2.75, 730, "magic"), { kind: "enemyVuln", pct: 18, turns: 3 }, { kind: "enemyDelay", pct: 35 }],
      },
    ],
    equippedSynergies: [
      {
        requiredSkillId: "v2c_primordialmage_resonance",
        effects: [dmg(0.28, 110, "magic"), { kind: "manaRestore", pctMaxMp: 8 }],
      },
      {
        requiredSkillIds: ["v2c_primordialmage_resonance", "v2c_elementallord_surge"],
        // 6차 액티브 정규화(×0.95) 뒤 실제 촉매 증가량을 정확히 +0.28/+110으로 맞춘다.
        effects: [dmg(0.28 / 0.95, 110 / 0.95, "magic")],
      },
    ],
  },
  v2c_primordialmage_resonance: {
    id: "v2c_primordialmage_resonance", name: "근원공명", stat: "int", category: "passive", tier: 3,
    description: "원소의 근원을 몸에 새긴다. 지능 +24%, 정신 +12%, 마법 스킬 피해 +16%, 최대 MP +20%. 태초회귀와 함께 장착하면 추가 마법 피해를 주고 최대 MP의 8%를 회복하며 선택된 주문식 재료가 공명한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    spCostDiscount: 4,
    effects: [],
    passive: { statPct: { int: 24, spi: 12 }, magicSkillDamagePct: 16, maxMpPct: 20 },
  },
  v2c_primordialmage_amplification: {
    id: "v2c_primordialmage_amplification", name: "원초 증폭", stat: "int", category: "passive", tier: 3,
    description: "장비에서 얻은 치명타 배율을 모든 직접 마법 스킬 피해의 치명타 배율로 변환한다. 투자량이 커질수록 효율이 완만해지며 최대 +0.75배에 가까워진다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: { equipmentMagicSkillCritConversion: true },
  },
  v2c_frostsovereign_eternalprison: {
    id: "v2c_frostsovereign_eternalprison", name: "영겁빙옥", stat: "int", category: "attack", tier: 3,
    description: "영겁의 얼음 감옥을 닫아 큰 마법 피해를 주고 적에게 한기를 4중첩 쌓는다.",
    mpCost: 84, fixedMpCost: 195, cooldown: 0, procChance: 32, learnCost: 12000, spCost: 9,
    effects: [dmg(3, 760, "magic")],
    frostChillGain: 4,
  },
  v2c_frostsovereign_permafrost: {
    id: "v2c_frostsovereign_permafrost", name: "영구동토", stat: "int", category: "passive", tier: 3,
    description: "빙결 뒤에도 녹지 않는 한기를 남겨 다음 빙결을 앞당기고 그 위력과 지연을 강화한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 10,
    effects: [],
    passive: {
      maxMpPct: 16,
      freezeDamagePct: 35,
      freezeDelayPct: 50,
      freezeRetainStacks: 1,
    },
  },
  v2c_lawweaver_release: {
    id: "v2c_lawweaver_release", name: "만상각인 해방", stat: "int", category: "attack", tier: 3,
    description: "전투 중 쌓은 공격·환류·침식·수호 각인을 모두 해방해 개수와 조합에 따른 효과를 일으킨다.",
    mpCost: 86, fixedMpCost: 200, cooldown: 0, procChance: 100, learnCost: 12000, spCost: 13,
    effects: [],
    consumesLawInscriptions: true,
    defaultPattern: {
      priority: 600,
      condition: { kind: "self_resource", resource: "inscription", op: "atLeast", value: 4 },
    },
  },
  v2c_lawweaver_inscription: {
    id: "v2c_lawweaver_inscription", name: "법칙 각인", stat: "int", category: "passive", tier: 3,
    description: "대문장 해방과 각인 해방을 정상 시전하면 장착한 문장 재료에 대응하는 법칙 각인을 얻는다. 지능 +18%, 정신 +8%, 최대 MP +16%.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 13,
    effects: [],
    passive: { statPct: { int: 18, spi: 8 }, maxMpPct: 16, lawInscription: true },
  },
  v2c_savior_judgment: {
    id: "v2c_savior_judgment", name: "구원의 심판", stat: "int", category: "attack", tier: 3,
    description: "정신력을 구원의 빛으로 바꾸어 적을 태우고 빈틈을 드러낸다.",
    mpCost: 80, fixedMpCost: 185, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      { kind: "damage", statCoef: 1.4, baseFlat: 560, scaling: "spi" },
      { kind: "enemyVuln", pct: 16, turns: 3 },
    ],
  },
  v2c_savior_grace: {
    id: "v2c_savior_grace", name: "구원의 은총", stat: "int", category: "passive", tier: 3,
    description: "은총이 치유와 생존의 한계를 끌어올린다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: { healPowerPct: 35, maxHpPct: 18, damageTakenReductionPct: 8 },
  },
  v2c_lawguardian_inviolable: {
    id: "v2c_lawguardian_inviolable", name: "만법불침", stat: "int", category: "buff", tier: 3,
    description: "전투당 한 번, 모든 결계를 다시 세우고 강한 보호막과 피해 저항을 3행동 동안 얻는다.",
    mpCost: 84, fixedMpCost: 210, cooldown: 0, procChance: 100, learnCost: 12000,
    oncePerBattle: true,
    refreshTripleWards: true,
    effects: [
      { kind: "shield", pctMaxHp: 24, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 18, turns: 3 },
    ],
  },
  v2c_lawguardian_domain: {
    id: "v2c_lawguardian_domain", name: "만법수호영역", stat: "int", category: "passive", tier: 3,
    description: "삼중 결계를 각각 3회 전개한다. 결계가 소모될 때마다 전투 동안 영역 안정이 쌓여 받는 피해가 감소한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    exclusiveGroup: "triple_ward",
    exclusiveRank: 2,
    passive: { tripleWardRank: 2 },
  },
  v2c_doomprophet_sentence: {
    id: "v2c_doomprophet_sentence", name: "종말 선고", stat: "int", category: "attack", tier: 3,
    description: "종말을 예언해 적의 영혼을 침식시키고 쌓인 마법취약을 터뜨린다.",
    mpCost: 84, fixedMpCost: 190, cooldown: 0, procChance: 32, learnCost: 12000,
    effects: [
      dmg(2.1, 560, "magic"),
      { kind: "enemyDotVuln", pct: 24, turns: 3 },
      { kind: "stackPayoffDamage", tag: "magicVuln", statCoef: 0.42, baseFlatByTier: [220, 220, 220], perStackFlat: 58, scaling: "magic" },
    ],
  },
  v2c_doomprophet_revelation: {
    id: "v2c_doomprophet_revelation", name: "불길한 계시", stat: "int", category: "passive", tier: 3,
    description: "장착 중 직접 피해 스킬 적중 시 100% 확률로 마법취약 +1스택(최대 10). 스택당 대상이 받는 스킬 피해 +12%.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: { enemyMagicVulnPctPerStack: 12, enemyMagicVulnApplyChancePct: 100 },
  },
  v2c_heavenlybow_orbit: {
    id: "v2c_heavenlybow_orbit", name: "천궁궤적", stat: "dex", category: "attack", tier: 3,
    description: "하늘에 궤적을 그려 세 발을 순서대로 떨어뜨린다. 마지막 화살은 먼저 생긴 빈틈을 더 깊게 꿰뚫는다.",
    mpCost: 60, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      { kind: "damage", statCoef: 0.5, baseFlat: 190, scaling: "dex", pierceDamagePct: 22 },
      { kind: "damage", statCoef: 0.5, baseFlat: 190, scaling: "dex", pierceDamagePct: 22 },
      { kind: "damage", statCoef: 0.62, baseFlat: 230, scaling: "dex", pierceDamagePct: 34 },
      { kind: "enemyVuln", pct: 18, turns: 3 },
    ],
  },
  v2c_heavenlybow_starpath: {
    id: "v2c_heavenlybow_starpath", name: "성도 조준", stat: "dex", category: "passive", tier: 3,
    description: "화살이 별자리처럼 이어진다. 민첩과 명중, 스킬 치명타의 위력이 오르고, 속도에 비례해 공격력이 증가한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 11,
    effects: [],
    passive: {
      statPct: { dex: 22, luk: 8 },
      accuracyPct: 30,
      critPct: 8,
      skillCritDmgPct: 30,
      spdToAtkMaxPct: 30,
    },
  },
  v2c_blackmoon_flurry: {
    id: "v2c_blackmoon_flurry", name: "암월난무", stat: "luk", category: "attack", tier: 3,
    description: "검은 달빛 아래서 연격을 흩뿌린다. 적의 조준을 흐트러뜨리고 다시 어둠 속으로 미끄러진다.",
    mpCost: 60, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      { kind: "damage", statCoef: 0.55, baseFlat: 185, scaling: "luk", pierceDamagePct: 12 },
      { kind: "damage", statCoef: 0.46, baseFlat: 170, scaling: "luk", pierceDamagePct: 12 },
      { kind: "damage", statCoef: 0.62, baseFlat: 210, scaling: "luk", pierceDamagePct: 18 },
      { kind: "enemyAccuracyDown", pct: 28, turns: 3 },
      { kind: "selfBuffPct", target: "evasion", pct: 14, turns: 3 },
    ],
  },
  v2c_blackmoon_dominion: {
    id: "v2c_blackmoon_dominion", name: "흑월지배", stat: "luk", category: "passive", tier: 3,
    description: "달빛조차 숨기는 보법. 행운을 공격력과 속도로 바꾸고, 치명타 한계를 넘어 급소를 파고든다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 13,
    effects: [],
    passive: {
      statPct: { luk: 22, dex: 8 },
      evasionPct: 22,
      critDmgPct: 24,
      spdPerLukCoef: 0.75,
      atkPerLukCoef: 0.95,
      accuracyPct: 15,
      skillCritOverflow: true,
      skillCritAfterEvade: true,
    },
  },
  v2c_blackmoon_weakpoint3: {
    id: "v2c_blackmoon_weakpoint3", name: "급소 노출 III", stat: "luk", category: "passive", tier: 3,
    description: "흑월 아래 모든 빈틈을 드러내 물리 공격이 방어를 크게 우회하게 한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 7, effects: [],
    passive: { enemyPhysicalDefReductionPct: 12 },
  },
  v2c_myriadvenom_mutation: {
    id: "v2c_myriadvenom_mutation", name: "만독개화", stat: "luk", category: "attack", tier: 3,
    description: "몸속에 스민 독을 한꺼번에 피워 올린다. 중독을 심고, 독이 깊을수록 더 큰 붕괴를 일으킨다.",
    mpCost: 58, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      { kind: "dot", ...V2_DOT_PRESETS.중독, flatPerStack: 30, stacks: 6 },
      { kind: "enemyDotVuln", pct: 28, turns: 3 },
      { kind: "stackPayoffDamage", tag: "poison", statCoef: 0.3, baseFlatByTier: [260, 260, 260], perStackFlat: 65, spCostPerStackFlat: 48, scaling: "luk" },
    ],
  },
  v2c_myriadvenom_body: {
    id: "v2c_myriadvenom_body", name: "만독지배", stat: "luk", category: "passive", tier: 3,
    description: "행운과 모든 독의 흐름을 장악한다. 중독된 적의 방어를 무너뜨리고, 독성 순환으로 버티며 빈틈을 피한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 11,
    effects: [],
    passive: { statPct: { luk: 22 }, poisonedEnemyDefReductionPct: 14, poisonDamagePct: 24.4, maxHpPct: 12, evasionPct: 12, critDmgPct: 15 },
  },
  v2c_celestialdragon_combo: {
    id: "v2c_celestialdragon_combo", name: "천룡난무", stat: "str", category: "attack", tier: 3,
    description: "하늘로 솟구친 뒤 다섯 번 내리꽂아 적의 흐름을 끊고 전장을 장악한다.",
    mpCost: 60, cooldown: 0, procChance: 35, learnCost: 12000, spCostDiscount: 4,
    effects: [
      ...hits(5, 0.36, 150, undefined, 1.2),
      { kind: "enemyVuln", pct: 20, turns: 3 },
      { kind: "selfBuffPct", target: "evasion", pct: 12, turns: 3 },
      { kind: "enemyDelay", pct: 40 },
    ],
  },
  v2c_celestialdragon_breath: {
    id: "v2c_celestialdragon_breath", name: "천룡의 호흡", stat: "str", category: "passive", tier: 3,
    description: "호흡과 보법이 하나가 된다. 힘과 민첩, 회피가 크게 오르고 네 번째 적중마다 힘을 폭발시킨다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: {
      statPct: { str: 22, dex: 10 },
      evasionPct: 20,
      accuracyPct: 18,
      comboFinisherBonusPct: 30,
    },
  },
  v2c_celestialdragon_formationbreak3: {
    id: "v2c_celestialdragon_formationbreak3", name: "파진경 III", stat: "str", category: "passive", tier: 3,
    description: "천룡의 경력으로 방어의 흐름을 끊어 물리 공격이 크게 파고들게 한다.",
    mpCost: 0, cooldown: 0, learnCost: 12000, spCost: 7, effects: [],
    passive: { enemyPhysicalDefReductionPct: 12 },
  },
  v2c_vajraarhat_seal: {
    id: "v2c_vajraarhat_seal", name: "금강인", stat: "vit", category: "buff", tier: 3,
    description: "금강의 인을 맺어 보호막을 얻고 받는 피해를 줄인다. 지속 중 모든 반사 피해와 나한금신의 반격 피해가 증가한다.",
    mpCost: 58, cooldown: 0, procChance: 100, learnCost: 12000,
    effects: [
      { kind: "shield", pctMaxHp: 18, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 14, turns: 3 },
      { kind: "selfBuffPct", target: "reflectDamage", pct: 45, turns: 3 },
    ],
  },
  v2c_vajraarhat_body: {
    id: "v2c_vajraarhat_body", name: "나한금신", stat: "vit", category: "passive", tier: 3,
    description: "나한의 금빛 몸으로 버틴다. 최대 체력과 피해 저항, 반격 확률이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: {
      maxHpPct: 32,
      damageTakenReductionPct: 8,
      counterChancePct: 30,
      counterDamageUsesReflectBoost: true,
    },
  },
  v2c_eternal_cycle: {
    id: "v2c_eternal_cycle", name: "영겁 순환", stat: "vit", category: "buff", tier: 3,
    description: "끊어지지 않는 생명의 순환을 열어, 행동마다 육신을 되살린다.",
    mpCost: 64, cooldown: 0, procChance: 100, learnCost: 12000,
    effects: [
      { kind: "selfRegen", pctMaxHpPerTurn: 10, turns: 4 },
      { kind: "selfBuff", stat: "vit", pct: 18, turns: 4 },
    ],
  },
  v2c_eternal_body: {
    id: "v2c_eternal_body", name: "영겁의 육신", stat: "vit", category: "passive", tier: 3,
    description: "시간에 닳지 않는 육신. 체력의 그릇과 버티는 힘이 깊어진다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: { maxHpPct: 34, statPct: { vit: 12 }, damageTakenReductionPct: 9 },
  },
  v2c_blooddemon_reign: {
    id: "v2c_blooddemon_reign", name: "혈마군림", stat: "str", category: "attack", tier: 3,
    description: "명중 시 현재 HP 14%를 소모한다. 보호막과 HP에 실제로 준 피해의 20%를 회복한다.",
    mpCost: 62, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      { kind: "hpCostDamage", pctCurrentHp: 14, soakCurrentHpFloorPct: 50, statCoef: 1.85, baseFlatByTier: [430, 430, 430], soakRatio: 2.62 },
      { kind: "executeDamage", statCoef: 0.32, baseFlatByTier: [220, 220, 220], hpThresholdPct: 35, bonusMult: 2.3 },
      { kind: "healFromDamage", pct: 20, basis: "actual" },
    ],
  },
  v2c_blooddemon_immortalblood: {
    id: "v2c_blooddemon_immortalblood", name: "불사마혈", stat: "vit", category: "passive", tier: 3,
    description: "마혈이 상처를 삼키고 육신을 다시 일으킨다. 생명력과 물리·마법 방어력, 피해 저항과 흡혈이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: { maxHpPct: 28, lifestealPct: 4, damageTakenReductionPct: 9, defPct: 12 },
  },
  v2c_absolute_unity: {
    id: "v2c_absolute_unity", name: "만상귀일", stat: "str", category: "attack", tier: 3,
    description: "흩어진 모든 능력을 하나의 절대적인 흐름으로 모아 적을 꿰뚫고 전장의 주도권을 장악한다.",
    mpCost: 64, cooldown: 0, procChance: 35, learnCost: 12000,
    effects: [
      dmg(0.22, 480, "all"),
      { kind: "enemyVuln", pct: 14, turns: 3 },
      { kind: "selfHaste", pct: 25 },
    ],
  },
  v2c_absolute_harmony: {
    id: "v2c_absolute_harmony", name: "절대 조화", stat: "int", category: "passive", tier: 3,
    description: "육신과 정신, 운과 기예가 완전한 균형을 이룬다. 모든 능력과 생명력, 마력이 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 12000,
    effects: [],
    passive: {
      statPct: { str: 10, vit: 10, dex: 10, int: 10, spi: 10, luk: 10 },
      maxHpPct: 10,
      maxMpPct: 10,
    },
  },
  // ═══ 내부 7차 전투 패키지 — 해금 경제/직업 보너스 확정 전 선택 불가 ═══
  v2c_shadowblade_afterimage: {
    id: "v2c_shadowblade_afterimage", name: "잔영", stat: "luk", category: "attack", tier: 3,
    description: "찰나의 참격 뒤 검영을 남긴다. 검영을 익혔다면 최종 피해의 70%를 기록하고 무흔으로 정련한 검영은 85%를 기록한다.",
    mpCost: 65, cooldown: 0, procChance: 45, learnCost: 20000, spCost: 14,
    effects: [dmg(1.665, 393, "luk", 20)],
    skillCritChancePct: 25,
    tier7Mechanic: { kind: "shadowStrike", recordPct: 70, refinedRecordPct: 85 },
  },
  v2c_shadowblade_traceless: {
    id: "v2c_shadowblade_traceless", name: "무흔", stat: "luk", category: "attack", tier: 3,
    description: "흔적 없이 다섯 번 베어 기존 검영을 한 번 정련한다. 정련된 검영이 발동하면 다음 행동이 20% 빨라진다.",
    mpCost: 65, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 12,
    effects: hits(5, 0.326, 108, "luk"),
    tier7Mechanic: { kind: "shadowRefine", refinePctPoints: 15, hastePct: 20 },
  },
  v2c_shadowblade_swordshadow: {
    id: "v2c_shadowblade_swordshadow", name: "검영", stat: "luk", category: "passive", tier: 3,
    description: "단일 물리 공격의 최종 피해를 검영으로 남겨 적의 다음 행동 뒤 실현한다. 발동 뒤 다음 단일 물리 공격이 강해진다.",
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 20,
    effects: [], passive: {},
    tier7Mechanic: { kind: "shadowCore", recordPct: 50, refinedRecordPct: 65, nextSingleDamagePct: 15, pvpScalePct: 80 },
  },
  v2c_ruinblade_limitstrike: {
    id: "v2c_ruinblade_limitstrike", name: "극한일격", stat: "str", category: "attack", tier: 3,
    description: "궁지에서 더 강해지는 일격이다. 잃은 체력에 따라 최종 피해가 최대 60% 증가하고 체력이 40% 이하면 검의를 두 개 얻는다.",
    mpCost: 65, cooldown: 0, procChance: 45, learnCost: 20000, spCost: 10, spCostDiscount: 4,
    effects: [dmg(1.57, 371, undefined, 20)],
    tier7Mechanic: { kind: "intentStrike", missingHpBonusCapPct: 60, lowHpThresholdPct: 40 },
  },
  v2c_ruinblade_oneintent: {
    id: "v2c_ruinblade_oneintent", name: "일념", stat: "str", category: "passive", tier: 3,
    description: "단일 물리 공격으로 검의를 최대 세 개 모은다. 검의마다 단일 물리 피해가 8% 오르고 멸검은 검의마다 15% 강해진다.",
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 12,
    effects: [], passive: { statPct: { str: 18 }, accuracyPct: 15 },
    tier7Mechanic: { kind: "intentCore", maxStacks: 3, damagePctPerStack: 8, finisherPctPerStack: 15 },
  },
  v2c_ruinblade_ruinsword: {
    id: "v2c_ruinblade_ruinsword", name: "멸검", stat: "str", category: "attack", tier: 3,
    description: "현재 행동을 충전에 쓰고 다음 행동 기회에 자동으로 해방하는 전투당 한 번의 필살검이다.",
    mpCost: 100, cooldown: 0, procChance: 100, learnCost: 20000, spCost: 24,
    defaultPattern: {
      priority: 350,
      condition: {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 60 },
          { kind: "enemy_hp", op: "above", pct: 25 },
        ],
      },
    },
    effects: [dmg(3.33, 787, undefined, 45)], oncePerBattle: true,
    tier7Mechanic: { kind: "chargedFinisher", currentMissingHpCapPct: 75, chargeLostHpCapPct: 75, pvpCapPct: 40, pvpPenetrationPct: 30 },
  },
  v2c_skyascendant_fallingstar: {
    id: "v2c_skyascendant_fallingstar", name: "낙성", stat: "dex", category: "attack", tier: 3,
    description: "별처럼 떨어지는 화살로 적을 꿰뚫는다. 체술 뒤 사용하면 포획이 발동해 피해·명중·관통이 강화된다.",
    mpCost: 65, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 13, spCostDiscount: 3,
    effects: [dmg(1.85, 437, "dex", 30)],
    accuracyBonusPct: 25, skillCritChancePct: 15,
    tier7Mechanic: { kind: "crossStrike", family: "ranged" },
  },
  v2c_skyascendant_voidbreak: {
    id: "v2c_skyascendant_voidbreak", name: "파공", stat: "dex", category: "attack", tier: 3,
    description: "세 번의 연타 뒤 두 배 위력의 마지막 타격으로 허공을 깨뜨린다. 원거리 기술 뒤 사용하면 추격이 발동한다.",
    mpCost: 65, cooldown: 0, procChance: 50, learnCost: 20000, spCost: 13,
    effects: [
      dmg(0.357, 150, "dex"), dmg(0.357, 150, "dex"),
      dmg(0.357, 150, "dex"), dmg(0.714, 300, "dex"),
    ],
    tier7Mechanic: { kind: "crossStrike", family: "martial" },
  },
  v2c_skyascendant_crossover: {
    id: "v2c_skyascendant_crossover", name: "교차", stat: "dex", category: "passive", tier: 3,
    description: "원거리와 체술을 번갈아 적중시키면 포획 또는 추격이 발동하고 다음 행동이 빨라진다.",
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 20,
    effects: [], passive: { statPct: { dex: 20, str: 12 }, critPct: 8, accuracyPct: 20 },
    tier7Mechanic: {
      kind: "crossCore", captureDamagePct: 20, captureAccuracyPct: 25, capturePenetrationPct: 45,
      pursuitDamagePct: 40, pursuitEnemyDelayPct: 20, hastePct: 15,
      pvpCaptureDamagePct: 12, pvpCapturePenetrationPct: 10,
      pvpPursuitDamagePct: 25, pvpPursuitEnemyDelayPct: 10, pvpHastePct: 10,
    },
  },
  v2c_primordialsage_greatorb: {
    id: "v2c_primordialsage_greatorb", name: "대마력구", stat: "int", category: "attack", tier: 3,
    description: "거대한 마력구를 압축해 던진다. 새로운 주문식 한 단계를 쌓고 완전식을 완성하면 다음 행동이 15% 빨라진다.",
    mpCost: 41, fixedMpCost: 133, cooldown: 0, procChance: 60, learnCost: 20000, spCost: 12, spCostDiscount: 3,
    effects: [dmg(1.98, 501, "magic", 15)],
    tier7Mechanic: { kind: "formulaStrike", stages: 1, completionHastePct: 15 },
  },
  v2c_primordialsage_optimization: {
    id: "v2c_primordialsage_optimization", name: "마력 최적화", stat: "int", category: "passive", tier: 3,
    description: "최대 마력이 20% 늘고 모든 액티브 스킬의 MP 소모가 20% 줄어든다. 완전식은 MP가 부족해도 시전하고 최대 MP의 10%를 회복한다.",
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 12,
    effects: [], passive: { maxMpPct: 20, mpCostReductionPct: 20 },
    tier7Mechanic: { kind: "manaOptimization", restoreMaxMpPct: 10, allowCompletionOverdraft: true },
  },
  v2c_primordialsage_completeformula: {
    id: "v2c_primordialsage_completeformula", name: "완전식", stat: "int", category: "passive", tier: 3,
    description: "서로 다른 직접 마법으로 세 단계를 완성한 현재 주문을 강화한다. 직접 피해·관통·다음 행동 속도가 오른다.",
    mpCost: 0, cooldown: 0, learnCost: 20000, spCost: 22,
    effects: [], passive: { statPct: { int: 20, spi: 10 }, magicSkillDamagePct: 24 },
    tier7Mechanic: { kind: "completeFormula", directDamagePct: 50, penetrationPct: 35, hastePct: 20, pvpDamagePct: 30, pvpPenetrationPct: 20, pvpHastePct: 12 },
  },
};

// 옛 V2_COMMON_SKILLS_BY_JOB(직군별 공용 스킬 풀)은 폐지됐다 — "직업 순회 수집" 설계로 풀이 전부
//   빈 배열이 된 뒤(2026-06-19) 어떤 라이브 코드도 읽지 않아 제거. 학습/장착 게이팅은 learn 라우트가
//   elementalSkillsForClass(= V2_SKILLS_BY_JOB)로 처리한다. 도달 불가 공용 정의(난격/파쇄/붕권/선풍각
//   /운기/일격/연격/약점 포착 등)도 함께 정리했다.
