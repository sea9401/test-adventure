// v2 전투 튜닝 계수 상수 — derivePlayerCombatV2 의 derive 식이 쓰는 순수 숫자 다이얼.
// derivePlayerCombatV2.ts 에서 기계적으로 분리(값·이름·export 여부 불변, 동작 보존).
//
// PR-S1 5배 스케일 다이얼 — 각 계수 = 옛값 / 5.
// 모두 float — 합산은 derive 내부에서 누적 후 최종 floor 한 번만.

export const MP_PER_INT = 2; // 옛 10. 5×INT × 2 = 10 MP (동등)
export const HP_PER_VIT = 3;

export const DEF_PER_VIT = 0.35;
// 초반부 템포 완화(2026-06-28): LUK 의 치명 도달 속도가 장비 flat crit·패시브와 합쳐져
// 초반부터 높게 체감되어 0.15 → 0.12 로 소폭 하향. 치명피해(CRIT_DMG_PER_LUK)는 유지해
// LUK 빌드 정체성은 확률보다 누적 투자 보상 쪽에 남긴다.
export const CRIT_PER_LUK = 0.12;
export const ATK_PER_STR = 0.35;
// VIT→atk(DEX 재설계 lever-2·docs §0-C) — 순수/헤비 VIT 도 천천히 솔로 클리어 가능하게 하는 보조 딜.
// 과거 0.16은 HP·DEF까지 함께 붙은 VIT가 물리 공격 투자를 대체했다. 현재 값은 STR 0.35의
// 약 29%로 제한해 느린 탱커의 처치력을 돕되 주 공격 스탯을 대신하지 않는다.
export const VIT_ATK_COEF = 0.1;
// 도적 직군 패시브 "예기" — 공격력에 DEX×계수 가산(도적 한정). 죽은 축 DEX 부활.
// 스킬 재설계(docs/v2-skill-system-plan.md). 🔑 v2c_rogue_finesse(예기) passive.atkPerDexCoef 와 동기.
export const ROGUE_ATK_PER_DEX = 0.08;
// PR-2 strict §4 — 물리공격력 = 힘(STR) 단독. dex/spd/luk atk 보조 폐기(Codex 매핑).
// 무기 위력 = 모든 빌드 atk 바닥. DEX/SPD/LUK 데미지는 무기 위력 + 다중공격·크리·스킬로.
// PR-무기위력 재밸런스 — STR 빌드에선 무기가 atk 의 ~20% 뿐이라 무기 교체 체감이 약했고,
// atk 가 거의 무기뿐인 off-STR 빌드(중반 골짜기)도 빈약 → 무기 위력 ~2배 + 이 계수 0.2→0.15.
// 순수 STR/INT 는 정확히 중립(winT 불변), off-STR(DEX/LUK/SPI)·중반 골짜기는 상향(격차 압축).
// sim-v2-progression --skills + sim-v2-pvp-weapon 검증: 천장 빌드 불변, 신규 지배자 없음.

// 속도 = 민첩 파생 (1차 아님). 민첩 과효율 완화(2026-07-11): 1.5 → 0.95.
// EXTRA_ATTACK_PCT_PER_SPD=0.5 유지 시 DEX 1 = 추가공격 +0.475%p.
export const SPD_PER_DEX = 0.95;
// 무게 → 속도 페널티 (선형). 표시 무게(effectiveStats=scaledEquipWeight) 1 = 속도 −WEIGHT_SPD_PENALTY.
// 1.0→2.0 (2026-06-08): 전 장비 위력 ×2 됐는데 무게는 그대로라 "무게당 위력"이 2배 = 무거운
//   장비의 속도 대가가 상대적으로 절반으로 약해짐. 페널티 2.0 으로 ×2 위력에 맞춰 트레이드오프 복원.
//   weight 다이얼은 페널티 계수 그대로 두고, 무게 자체를 effectiveStats 에서 슬롯별 스케일
//   (일반 ×2·무기 ×4)로 키워 SPD 가치 대비 너무 미미하던 무게 트레이드오프를 강화(2026-06-20, 오너).
//   "표시 무게 1 = 속도 −2" 직관은 유지. 무게는 전투력 점수 미산입이라 순수 속도 트레이드오프.
//   2.0→0.5 (2026-06-25, 오너·sim): ATB 속도곡선 전환과 함께 중갑 탱(STR/VIT)이 속도열세로
//   전멸하던 걸 막기 위해 무게 속도페널티를 1/4 로 완화 — 6배에서 STR 67%·VIT 58% 생존(sim 검증).
export const WEIGHT_SPD_PENALTY = 0.5;
// 직접 피해 스킬 최소 데미지 — 물리는 힘 major+활력 minor, 마법은 지능 major+정신 minor.
export const MIN_DMG_PER_STR = 0.15;
export const MIN_DMG_PER_INT = 0.15;
export const MIN_DMG_PER_VIT = 0.05;
export const MIN_DMG_PER_SPI = 0.08;
// 적중도 — 힘·지능·정신 minor (민첩은 ACCURACY_PCT_PER_DEX).
// 회피도 — 행운 minor (민첩은 EVA_PER_DEX). 적중도는 상대의 회피 피해 경감을 낮춘다.
export const ACC_PER_STR = 0.1;
export const ACC_PER_INT = 0.1;
export const ACC_PER_SPI = 0.075;
// 플레이어 기본 적중도. 무투자 캐릭터도 민첩형 몬스터의 회피 경감을 일부 상쇄하며,
// 이후 스탯·장비·적중도 증가 패시브가 이 바닥값 위에 누적된다.
export const ACC_BASE_RATING = 25;
export const EVA_PER_LUK = 0.25;
// 치명타 피해 — 힘 minor (행운은 CRIT_DMG_PER_LUK major).
export const CRIT_DMG_PER_STR = 0.002;
// 마법 방어력 — 정신 major + 지능 minor. 마법 데미지 경감.
// 2026-07-04: 후반 마법몹 피해가 5천 단위로 올라간 반면 기존 마방은 장신구+SPI 합산이
// 낮아 방어/결계 패시브가 거의 체감되지 않았다. damageToDefender 는 비율감산이라 마방도
// 물리 방어처럼 충분한 절대값을 가져야 한다.
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
export const MAGIC_ATK_PER_INT = 0.35;
// 정신은 지능 이하에서도 마법 공격을 보조하고, 지능을 초과한 부분은 더 높은 비율로 전환한다.
// 초과 구간의 한계 계수는 0.1+0.6=0.7로 기존과 같아 순수 SPI 빌드의 성장 기울기를 보존한다.
// 기본 공격 전환은 derive에서 이 보너스를 포함한 마공이 물공보다 높을 때만 켜진다.
export const MAGIC_ATK_PER_SPI = 0.1;
export const MAGIC_ATK_PER_EXCESS_SPI = 0.6;
export const EVA_PER_DEX = 0.5;
export const ACCURACY_PCT_PER_DEX = 0.35;
// 레거시 표시용 상한. 실제 전투는 캡 없는 accRating을 사용한다.
export const ACCURACY_PCT_CAP = 35;
// 궁사 활 패시브 — 임계치를 넘긴 적중도를 공격력으로 일부 변환한다.
export const BOW_HIT_THRESHOLD = 50;
export const BOW_ACCURACY_TO_ATK_COEF = 0.45;
// 천궁 속도 전환 — 전체 SPD를 공격력으로 환원하되, 이 값에서 최대 보너스의 절반에 도달한다.
export const SPD_TO_ATK_HALF_SATURATION = 500;

export function speedToAttackBonusPct(spd: number, maxPct: number): number {
  const safeSpd = Math.max(0, Number(spd) || 0);
  const safeMaxPct = Math.max(0, Number(maxPct) || 0);
  return safeMaxPct * (safeSpd / (safeSpd + SPD_TO_ATK_HALF_SATURATION));
}

// v2 SPD → 레거시 다중공격 원시 확률. 실제 반환값은 아래 점감 곡선을 거친다. 라이브 ATB는
// extraAttackChancePct를 끄고 combatTimeline의 행동 빈도 곡선만 사용한다.
export const EXTRA_ATTACK_PCT_PER_SPD = 0.5;

// 레거시/비-ATB 전투의 속도 기반 추가 공격 점감. 직업·스킬로 얻는 고정 추가 공격 확률은
// 이 곡선 뒤에 더해 그대로 보존하고, 스탯 SPD에서 나온 부분만 100% 이후 완만해진다.
export const EXTRA_ATTACK_SOFTCAP_START_PCT = 100;
export const EXTRA_ATTACK_SOFTCAP_BONUS_PCT = 100;
export const EXTRA_ATTACK_SOFTCAP_SCALE_PCT = 200;

export function diminishingExtraAttackChancePct(rawChancePct: number): number {
  const raw = Math.max(0, Number(rawChancePct) || 0);
  if (raw <= EXTRA_ATTACK_SOFTCAP_START_PCT) return raw;
  return (
    EXTRA_ATTACK_SOFTCAP_START_PCT +
    EXTRA_ATTACK_SOFTCAP_BONUS_PCT *
      (1 -
        Math.exp(
          -(raw - EXTRA_ATTACK_SOFTCAP_START_PCT) /
            EXTRA_ATTACK_SOFTCAP_SCALE_PCT,
        ))
  );
}

// 초반 난이도 완화 — 4대 전투 스탯(공격력·마법공격력·방어력·마법방어력)에 더하는 플랫 보너스.
// 스탯이 작은 초반엔 비중이 커 체감 큰 완화, 후반엔 미미(Lv100 atk~75 대비 +5). 플레이어·아레나
// 봇 모두 같은 derive 를 거치므로 PvP 중립. 난이도 재튜닝은 이 한 숫자만 조정한다.
export const V2_BASE_COMBAT_BONUS = 5;
