// v2 전투 튜닝 계수 상수 — derivePlayerCombatV2 의 derive 식이 쓰는 순수 숫자 다이얼.
// derivePlayerCombatV2.ts 에서 기계적으로 분리(값·이름·export 여부 불변, 동작 보존).
//
// PR-S1 5배 스케일 다이얼 — 각 계수 = 옛값 / 5.
// 모두 float — 합산은 derive 내부에서 누적 후 최종 floor 한 번만.

export const MP_PER_INT = 2; // 옛 10. 5×INT × 2 = 10 MP (동등)
export const HP_PER_VIT = 1; // 옛 5.  5×VIT × 1 = 5 HP (동등)

export const DEF_PER_VIT = 0.1; // 옛 0.5. 5×VIT × 0.1 = 0.5 DEF (동등)
// 초반부 템포 완화(2026-06-28): LUK 의 치명 도달 속도가 장비 flat crit·패시브와 합쳐져
// 초반부터 높게 체감되어 0.15 → 0.12 로 소폭 하향. 치명피해(CRIT_DMG_PER_LUK)는 유지해
// LUK 빌드 정체성은 확률보다 누적 투자 보상 쪽에 남긴다.
export const CRIT_PER_LUK = 0.12;
export const ATK_PER_STR = 0.15; // 무기 위력 ×0.8 하향과 함께 스탯 비중 상대적↑(계수는 불변 — 올리면 엔드 폭증).
// VIT→atk(DEX 재설계 lever-2·docs §0-C) — 순수/헤비 VIT 도 천천히 솔로 클리어 가능하게. lever-1(비대칭
//   감산)으로 생존은 살았으나 VIT 는 공격력 0 라 못 죽였음(sim). STR 0.15 의 ⅔ = 탱의 보조 딜(천천히 범·
//   DEX #1 불변). 2026-06-21 0.10→0.16 상향(sim: VIT d50 wr ~45%→~90% = 무리 패리티·DEX 100 불변·
//   부수피해 0). docs/v2-dex-rebalance-plan.md. 더 올리면 광역 물리버프 과함(d50 과조정 주의).
export const VIT_ATK_COEF = 0.16;
// 도적 직군 패시브 "예기" — 공격력에 DEX×계수 가산(도적 한정). 죽은 축 DEX 부활.
// 스킬 재설계(docs/v2-skill-system-plan.md). 🔑 v2c_rogue_finesse(예기) passive.atkPerDexCoef 와 동기.
export const ROGUE_ATK_PER_DEX = 0.08;
// PR-2 strict §4 — 물리공격력 = 힘(STR) 단독. dex/spd/luk atk 보조 폐기(Codex 매핑).
// 무기 위력 = 모든 빌드 atk 바닥. DEX/SPD/LUK 데미지는 무기 위력 + 다중공격·크리·스킬로.
// PR-무기위력 재밸런스 — STR 빌드에선 무기가 atk 의 ~20% 뿐이라 무기 교체 체감이 약했고,
// atk 가 거의 무기뿐인 off-STR 빌드(중반 골짜기)도 빈약 → 무기 위력 ~2배 + 이 계수 0.2→0.15.
// 순수 STR/INT 는 정확히 중립(winT 불변), off-STR(DEX/LUK/SPI)·중반 골짜기는 상향(격차 압축).
// sim-v2-progression --skills + sim-v2-pvp-weapon 검증: 천장 빌드 불변, 신규 지배자 없음.

// 속도 = 민첩 파생 (1차 아님). 초반부 템포 완화(2026-06-28): 2.0 → 1.5.
// EXTRA_ATTACK_PCT_PER_SPD=0.5 유지 시 DEX 1 = 추가공격 +0.75%p 로 낮아진다.
export const SPD_PER_DEX = 1.5;
// 무게 → 속도 페널티 (선형). 표시 무게(effectiveStats=scaledEquipWeight) 1 = 속도 −WEIGHT_SPD_PENALTY.
// 1.0→2.0 (2026-06-08): 전 장비 위력 ×2 됐는데 무게는 그대로라 "무게당 위력"이 2배 = 무거운
//   장비의 속도 대가가 상대적으로 절반으로 약해짐. 페널티 2.0 으로 ×2 위력에 맞춰 트레이드오프 복원.
//   weight 다이얼은 페널티 계수 그대로 두고, 무게 자체를 effectiveStats 에서 슬롯별 스케일
//   (일반 ×2·무기 ×4)로 키워 SPD 가치 대비 너무 미미하던 무게 트레이드오프를 강화(2026-06-20, 오너).
//   "표시 무게 1 = 속도 −2" 직관은 유지. 무게는 전투력 점수 미산입이라 순수 속도 트레이드오프.
//   2.0→0.5 (2026-06-25, 오너·sim): ATB 속도곡선 ~6배 전환과 함께 중갑 탱(STR/VIT)이 속도열세로
//   전멸하던 걸 막기 위해 무게 속도페널티를 1/4 로 완화 — 6배에서 STR 67%·VIT 58% 생존(sim 검증).
export const WEIGHT_SPD_PENALTY = 0.5;
// 최소 데미지(데미지 하한) — 힘·지능 major, 활력 minor.
export const MIN_DMG_PER_STR = 0.1;
export const MIN_DMG_PER_INT = 0.05;
export const MIN_DMG_PER_VIT = 0.03;
// 명중 — 힘·지능·정신 minor (민첩은 ACCURACY_PCT_PER_DEX). 회피 — 행운 minor (민첩은 EVA_PER_DEX).
//   지능(ACC_PER_INT)=마법사 명중 바닥: 명중 기여 스탯이 없던 순수 INT 빌드가 회피·기본미스를
//   홀로 떠안던 문제 해소(STR 과 대칭). 마법도 빗나가지 않게.
export const ACC_PER_STR = 0.02;
export const ACC_PER_INT = 0.02; // 마법사 명중 바닥(STR 대칭).
export const ACC_PER_SPI = 0.015;
// 회피 대결형 Slice 2 — 플레이어 기본 명중레이팅(accRating 에만 가산, 표시 accuracyPct 는 제외).
//   대결식 dodgeChance(eva, acc) 는 공격자 명중 0 에서 회피몹/PvP탱이 75% 로 퇴화하는데, 플레이어
//   명중은 minor 스탯(보통 accR 2~5)이라 회피몹(eva 15~25)이 거의 안 맞게 됨. Slice 1 의 몹
//   floorAccuracy(MOB_ACC_BASE) 대칭 — 플레이어에 기본 명중을 줘 회피몹 미스를 옛 모델(10+eva−acc)에
//   맞추고(투자0 = eva20 미스 30% 로 거의 동일) PvP 무적탱도 추가 완화(eva60탱 65%→~39% 미스).
//   일반몹(eva0)은 dodgeChance=0 이라 불변(10% 플랫). 다이얼 — docs/v2-evasion-rating-plan.md §Slice2.
export const ACC_BASE_RATING = 7;
export const EVA_PER_LUK = 0.08;
// 치명타 피해 — 힘 minor (행운은 CRIT_DMG_PER_LUK major).
export const CRIT_DMG_PER_STR = 0.002;
// 마법 방어력 — 정신 major + 지능 minor. 마법 데미지 경감.
// 2026-07-04: 후반 마법몹 피해가 5천 단위로 올라간 반면 기존 마방은 장신구+SPI 합산이
// 200 안팎에 머물러 방어% 패시브가 거의 체감되지 않았다. damageToDefender 는 비율감산이라
// 마방도 물리 방어처럼 충분한 절대값을 가져야 한다.
export const MAGIC_DEF_PER_SPI = 0.52;
export const MAGIC_DEF_PER_INT = 0.1;
// 치명타 저항 — 정신. 피격 시 상대 치명 확률 차감(%p). SPI 부활 PR-3b: 치명형 몹/PvP 치명을
//   완전 봉인하지 못하게 cap(고-spi 도 치명 위협 일부 잔존·과투자 무력화 방지, eva/acc cap 패턴).
export const CRIT_RESIST_PER_SPI = 0.1;
export const CRIT_RESIST_PCT_CAP = 50;
// 회복량 배수 — 정신(주력)·활력(보조) (1.0 기준 + 비례). SPI 부활(#spi PR-1): spi 가 힐 주축
// 스탯이 되도록 0.0025→0.006(vit 0.004 의 1.5배). vit 는 maxHp(=pctMaxHp/pctLostHp 힐의 분모)로도
// 힐에 기여하므로 healMult 직접항은 보조. 신술 지원 라인(사제) 힐이 정신으로 스케일.
export const HEAL_MULT_PER_VIT = 0.004;
export const HEAL_MULT_PER_SPI = 0.006;
// PR-luk-critdmg — LUK → 크리 데미지 배수. v2 는 그동안 luk 를 크리 확률(CRIT_PER_LUK)에만
// 쓰고 크리 데미지는 CRIT_MULT_BASE(2.0×) 고정이었다. 그래서 LUK 빌드는 atk 가 낮아(luk×0.04)
// 크리가 터져도 약했다(sim: 전 빌드 중 최약). luk 가 크리 데미지도 키우게 해 '크리 빌드'
// 정체성에 투자 비례 보상. 크리율 낮은 STR/BAL 등은 크리 발동이 드물어 영향 미미(타겟팅).
// sim-v2-progression --skills 캘리브 0.006: LUK Lv75 67→75%·Lv100 85→89%(DEX/BAL 동률,
// 파크 진입), winT 대폭↓(킬 속도 개선). Lv50 은 크리율 29% 로 낮아 보너스 발동이 적어 67%
// 유지(DEX 동률 — 크리/피네스 빌드의 중반 변동성, LUK 단독 문제 아님).
// 0.006→0.007 상향(2026-06-08): CRIT_MULT_BASE 2.0→1.4 동반 하향의 LUK 보전 — 바닥(무투자
//   크리)은 내리고 LUK 투자분은 per-luk 로 되살려 "크리 데미지=LUK 투자 보상"으로. (2026-06-21 PR-2:
//   옛 cap(5.0) → 점감 곡선 critMultCurve 로 교체, 아래. 이 per-luk 는 곡선 bonus 입력값.)
export const CRIT_DMG_PER_LUK = 0.007;
// 치명타 피해 배율 — 점감 곡선(하드캡 폐기, 2026-06-21 DEX 재밸런스 PR-2). 옛 모델 = base 1.4 +
//   선형가산, cap 5.0 → 엔드 LUK 이 3.8~5.0× 로 과함 + 캡 도달 후 추가 투자 죽음(포화). 대신 CEIL 로
//   점근하는 지수 곡선: bonus=0 → BASE(무투자 floor), bonus↑ → CEIL 점근(절대 도달X = 죽은 투자 없음).
//   천장만 완만히 통제. 엔드 LUK(bonus~8) ≈ 2.5·중투자(bonus~2.4, 옛 3.8) ≈ 2.06. 전역 크리 딜↓라
//   몹 HP 상쇄(monsterScale)와 짝. docs/v2-dex-rebalance-plan.md. 다이얼 = CEIL(천장)·SCALE(완만도).
export const CRIT_MULT_CEIL = 2.6;
export const CRIT_MULT_SCALE = 3.0;

// PR-magic — 마법 공격력(magicAtk = INT 환산 + 무기 위력). scaling="magic" 스킬만 이 값으로
// 스케일(combatShared.v2DamageAmount). INT 0 빌드는 magicAtk 0(+무기 위력) → 마법 경로 비활성.
// PR-8 캘리브 — 0.35 → **0.2 (= ATK_PER_STR 대칭)**. PR-4a 에서 무기 위력이 magicAtk 에 합산되며
// "무기+지능" 데미지가 물리 "무기+힘"을 압도(sim --skills: INT winT 2.8~3.7 로 STR 7~9 의 2~3배)
// → 문서 §8 의도대로 지능 단독계수를 힘과 대칭으로 낮춤. 재측정: INT winT Lv50 4.8·Lv75 6.5·
// Lv100 6.6 으로 STR(7~9)과 동률대, wr 도 STR 동률(Lv75 89%). 마법 버스트 정체성은 스킬 coef
// 프리미엄(메테오 2.8 등)으로 유지. 알려진 공백: Lv18 전 마법 공격 스킬 부재(상수 무관, 후속).
// 2026-06-21 0.15→0.22: DEX 독주 재밸런스에서 INT 솔로 viability 부양(sim: INT d50 wr 62%→95%).
//   STR 대칭(0.15)을 의도적으로 깸 — 마법 버스트축 회복. docs/v2-dex-rebalance-plan.md.
export const MAGIC_ATK_PER_INT = 0.22;
export const EVA_PER_DEX = 0.1; // 옛 0.5. 5×DEX × 0.1 = 0.5% (동등)
export const ACCURACY_PCT_PER_DEX = 0.05; // 옛 0.25. 5×DEX × 0.05 = 0.25%p (동등)
// 명중 상한 — 명중이 스탯(STR·INT·SPI·DEX) 비례라 후반엔 수백까지 치솟아 몬스터 회피를
//   무조건 상쇄했다(회피축 무력화). cap 으로 제한 → 명중을 cap 까지 채우면 회피를 상쇄,
//   덜 채운/저명중 빌드는 회피만큼 빗나감 → 회피가 유효한 축이 된다. sim 캘리브 대상.
export const ACCURACY_PCT_CAP = 35;
// 궁사 활 패시브 — 적중 임계(=base miss 10, 명중 이만큼이면 0-회피 적중 100%) 초과 명중을 공격력
//   으로 변환. 활 한정. cap(35)은 hit 에만 적용 — 궁사는 명중 특화라 명중을 hit+딜 양쪽으로 활용
//   (의도된 이중 활용; 다른 빌드는 hit 한 번만). coef·임계는 sim 캘리브 대상.
export const BOW_HIT_THRESHOLD = 10;
export const BOW_ACCURACY_TO_ATK_COEF = 3;
// 5차 물리 캡스톤 — 명궁 "초월 사격": 행동빈도 포화 데드존(combatTimeline: spd≳292 부터 actionRate
//   거의 불변) 초과 속도를 점근 곡선으로 공격력 환원. 활 명중→딜의 속도판. 점근=죽은 투자 없음.
export const SPD_OVERFLOW_THRESHOLD = 292;
export const SPD_OVERFLOW_SCALE = 200; // 점근 완만도(클수록 천천히 상한 접근).

// v2 SPD → 다중공격. SPD 1 당 +0.5%p 추가공격 확률 (옛 2 — 전 빌드 타수 과다로 0.5 하향).
// SPD = DEX×2 라 추가확률 = DEX×1 %p. DEX 100 → 100%(확정 +1타) · DEX 200 → 200%(확정 +2타).
// 다중공격을 DEX 특화 빌드의 강점으로 — 일반 빌드(DEX 15~60)는 1~1.6타.
// rollAttackCount(combatShared) 가 100%↑를 정수부 확정 + 소수부 확률로 처리. cap 없음.
export const EXTRA_ATTACK_PCT_PER_SPD = 0.5;

// 초반 난이도 완화 — 4대 전투 스탯(공격력·마법공격력·방어력·마법방어력)에 더하는 플랫 보너스.
// 스탯이 작은 초반엔 비중이 커 체감 큰 완화, 후반엔 미미(Lv100 atk~75 대비 +5). 플레이어·아레나
// 봇 모두 같은 derive 를 거치므로 PvP 중립. 난이도 재튜닝은 이 한 숫자만 조정한다.
export const V2_BASE_COMBAT_BONUS = 5;
