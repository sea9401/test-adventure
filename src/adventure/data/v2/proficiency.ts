import { V2_CORE_LOOP_V2, V2_LEVEL_CAP } from "./coreLoopConfig";

// v2 직업 숙련도 + 수행(스탯 cap). 설계: docs/v2-proficiency-redesign.md §3·§4.
//
// 직업군 키 = 그 직업군의 1차 직업 id (tier1ClassOf, 예: 검술=swordsman). none(무직) 적립 없음.
// 저장: proficiency.v2 = {
//   points: number,                                                // 숙달 포인트(캐릭터 단일 잔액)
//   groups: { [tier1classId]: { cultivations, tier, cumLevel } },
//   caps:   { [stat]: number },                                    // 수행으로 올린 stat cap
// }
//   - points = 숙달 포인트(사용가능 잔액). 킬당 +proficiencyPerKillAtDepth(깊이 밴드 비례 2~5),
//     수행·스킬학습에 소모. 🔑 caps/grown 처럼 캐릭터 전역(직군 무관) — 전직해도 유지.
//     (2026-06 통합: 옛 earned 누적/spent 분리 폐지 → 단일 잔액. 2026-06-27: 옛 직군별 points 를
//      전역으로 승격 — 재전직 시 잔액이 0 으로 보이던 문제 해소. parse 가 옛 직군별을 합산 이관.)
//   - cultivations(수행 횟수) · tier(도달 차수) · cumLevel(직군 누적 레벨, floor·전직 입력)은 직군별.
//   - cap 미지정 = V2_STAT_CAP_BASE.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { parseV2Class } from "./classes";
import { themeIndexForDepth } from "./dungeon";

export type V2ProficiencyGroup = {
  cultivations: number;
  tier: number; // 그 직업군에서 도달한 최고 차수(1~4). floor tierMult 에 사용.
  // 직군 누적 레벨 — 레벨업마다 +1(전직 리셋에도 불변). floor·전직 게이트 입력(2026-06).
  // 레벨캡·차수 유한이라 ~200-250 에서 천장.
  cumLevel: number;
};
export type V2ProficiencyState = {
  // 숙달 포인트 — 캐릭터 단일 잔액(킬당 적립, 수행·스킬학습에 소모). caps 처럼 전역(전직 무관).
  //   옛 직군별 points 는 parse 시 전부 합산해 이관(2026-06-27).
  points: number;
  groups: Record<string, V2ProficiencyGroup>;
  caps: Partial<Record<V2StatKey, number>>;
  grown: Partial<Record<V2StatKey, number>>; // 랜덤 레벨 성장 누적분(1차 스탯).
  // 직업별 누적 레벨 — 특정 직업(예: 기사·사제)에 머문 누적 레벨. groups(직군 누적)와 별개.
  //   하이브리드 직업 해금 게이트 입력(직군이 아니라 특정 상위 직업의 깊이를 요구). 레벨업당 +1.
  //   ⚠️ 소급 없음(도입 후부터 적립). totalCumLevel/floor 는 groups 만 보므로 이중계산 없음.
  jobCumLevel?: Record<string, number>;
  // 환생(재전직) 횟수 — advance-class 환생(같은/다른 직업 무관)마다 +1. cumLevel 과 별개의 "행동" 신호:
  //   윤회의 길 첫 퀘스트("다시 태어나다")가 cumLevel 임계(레벨캡+1) 대신 이 카운터로 "환생 1회"를
  //   판정해, 같은 직업 재전직만으로도 깨지게 한다(한 생애 cumLevel ~99 < 101 사각지대 해소).
  reincarnations?: number;
};

// §10 다이얼.
// 킬당 숙달 포인트 — 깊이 밴드 비례(2026-06-12 성장 페이스업, 옛 전구간 고정 2).
// 테마 2개당 +1: 들판·마른 협곡 2 / 얼음 호수·심층 동굴 3 / 잊힌 성소·리자드 늪지 4 /
// 짐승의 소굴 5. 마지막 테마가 무한(인덱스 클램프)이라 5 가 천장. (깊은 산 삭제 후에도 깊이당 값 불변.)
export const V2_PROFICIENCY_PER_KILL_BASE = 2;
export function proficiencyPerKillAtDepth(depth: number): number {
  return (
    V2_PROFICIENCY_PER_KILL_BASE + Math.floor(themeIndexForDepth(depth) / 2)
  );
}
// cap 은 floor 상대(저점 위 성장 여유). 유효 cap = floor + V2_CAP_HEADROOM_BASE + 수행이득.
// fresh(floor=base15) → 15+45 = 60(옛 시작 cap 과 동일). floor 가 높아져도 cap 이 항상 그 위라
// floor>cap 핀(수행 시 스탯 즉시 점프) 이 생기지 않는다 — 수행은 "여유(헤드룸)"만 늘리고
// 실제 스탯은 레벨업 랜덤성장(grown)이 floor→cap 사이를 채운다.
export const V2_CAP_HEADROOM_BASE = 45;
// 표시/폴백용 기본 cap(floor=base 가정). 실제 클램프는 effectiveStatCap 사용.
export const V2_STAT_CAP_BASE = 60;

// 수행 1회 cap 헤드룸 상승 — 직군 프로필(합 4 고정 = 비용/economy 불변). 키 = job(tier1ClassOf).
// 각 직군의 전문화 서브스탯을 함께 담아 자유 수행 없이도 전문화별 스탯을 커버(예 도적 dex+luk = 궁수+암살).
// 🔑 키가 4직군에 한정되지 않는다 — 직군 밖 직업(none 등, 향후 추가될 무소속 직업)도 여기 프로필만
//   있으면 수행 가능(수행 라우트/적립이 V2_CULTIVATE_PROFILE 존재로 게이트). 2026-06-22.
export const V2_CULTIVATE_PROFILE: Record<
  string,
  Partial<Record<V2StatKey, number>>
> = {
  warrior: { str: 2, vit: 1, dex: 1 }, // 전사 — 광검(str)·철벽(vit)·혈풍(dex)
  martial: { vit: 2, str: 1, spi: 1 }, // 무도가 — 맷집(vit)·흡혈/기공
  mage: { int: 2, spi: 2 }, // 마법사 — 공격마법(int)·신성(spi)
  rogue: { dex: 2, luk: 2 }, // 도적 — 궁수(dex)·암살(luk)
  // 모험가(무직) — 전직 전에도 균형 수행 가능(STR/VIT/DEX/INT 각 1, SPI/LUK 제외). cap 은 전역이라
  //   전직 후에도 유지. 전직은 별개(advance-class)·none 은 직군 정복/도감엔 미포함(cumLevel 미적립).
  none: { str: 1, vit: 1, dex: 1, int: 1 },
};

// 하이브리드(교차 직군) 직업의 수행 프로필 — 직업 id 키(직군 아님). 하이브리드는 저장 class 가
//   첫 prereq 의 직군(예: 마검사·성기사 둘 다 전사)이라, 직군 프로필(V2_CULTIVATE_PROFILE)만 쓰면
//   정체성 축을 수행으로 못 키운다(마검사는 검+마법인데 전사 프로필이라 INT 가 안 오르고, 성기사는
//   기사+사제인데 SPI 대신 DEX 가 오름). 직업 id 별 오버라이드로 정체성 축의 cap 을 올린다.
//   합 4 고정(= 비용 곡선·economy 불변). 값은 V2_JOB_CATALOG[id].cultivateProfile 와 동일해야 하며
//   v2JobCatalog.test 가 동기화를 보증한다.
export const V2_HYBRID_CULTIVATE_PROFILE: Record<
  string,
  Partial<Record<V2StatKey, number>>
> = {
  spellblade: { str: 2, int: 2 }, // 마검사 — 검(str) + 마법(int)
  templar: { str: 2, vit: 1, spi: 1 }, // 성기사 — 기사 힘·활력 + 사제 정신
};

// 캐릭터의 실효 수행 프로필 — 하이브리드 직업이면 직업 전용(정체성 축), 아니면 직군 프로필.
//   jobId 미상/비하이브리드면 직군(group) 폴백. 포인트·횟수 회계는 여전히 직군(group)으로 한다
//   (cap 만 직업 정체성대로 올린다 — 회계 그룹과 cap 프로필 분리).
export function effectiveCultivateProfile(
  group: string,
  jobId?: string | null,
): Partial<Record<V2StatKey, number>> | undefined {
  if (jobId && V2_HYBRID_CULTIVATE_PROFILE[jobId]) {
    return V2_HYBRID_CULTIVATE_PROFILE[jobId];
  }
  return V2_CULTIVATE_PROFILE[group];
}

// 수행 비용(숙달 포인트) — 횟수 비례가 아니라 "올린 cap 헤드룸 총합" 비례(§10 다이얼).
// 크리티컬 다중 수행이 더 많은 cap 을 한 번에 올리면 그만큼 다음 비용도 비싸진다(자연 throttle).
// PER_CAP 1.5→5(2026-06): earned 가 floor·전직게이트에서 분리(cumLevel 전환)되며 수행 연료로
// 과잉 → cap 인플레(t4 245). 비용계수 상향으로 diminishing 강화 → t4 cap ~169(옛 총cap 복귀).
export const V2_CULT_COST_BASE = 8;
export const V2_CULT_COST_PER_CAP = 5;
export function cultivationCost(totalCapGains: number): number {
  return Math.round(
    V2_CULT_COST_BASE + Math.max(0, totalCapGains) * V2_CULT_COST_PER_CAP,
  );
}

// 크리티컬 수행 — 낮은 확률로 1회 비용에 여러 배 cap 상승. 누적 임계(rng < p) 순.
export const V2_CULT_CRIT_TABLE: { p: number; mult: number }[] = [
  { p: 0.015, mult: 5 }, // 1.5% — ×5
  { p: 0.095, mult: 3 }, // +8% (누적 9.5%) — ×3
];
export function rollCultivationMult(rng: () => number): number {
  const r = rng();
  for (const { p, mult } of V2_CULT_CRIT_TABLE) {
    if (r < p) return mult;
  }
  return 1;
}

function posInt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : 0;
}

export function emptyProficiency(): V2ProficiencyState {
  return {
    points: 0,
    groups: {},
    caps: {},
    grown: {},
    jobCumLevel: {},
    reincarnations: 0,
  };
}

function parseStatMap(raw: unknown): Partial<Record<V2StatKey, number>> {
  const out: Partial<Record<V2StatKey, number>> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const stat of V2_STAT_KEYS) {
      const v = obj[stat];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[stat] = Math.floor(v);
      }
    }
  }
  return out;
}

export function parseProficiency(raw: unknown): V2ProficiencyState {
  if (!raw || typeof raw !== "object") return emptyProficiency();
  const obj = raw as {
    points?: unknown;
    groups?: unknown;
    caps?: unknown;
    grown?: unknown;
    jobCumLevel?: unknown;
    reincarnations?: unknown;
  };
  // 숙달 포인트(캐릭터 전역 잔액) — 신포맷=top-level points. 옛 포맷=직군별 points 라, 아래 루프에서
  //   각 직군의 points 를 전부 여기 합산해 이관한다(2026-06-27 전역 승격). 신포맷 그룹엔 points 가
  //   없어 posInt→0 이므로 이중계산 없음.
  let pointsTotal = posInt(obj.points);
  const groups: Record<string, V2ProficiencyGroup> = {};
  if (obj.groups && typeof obj.groups === "object") {
    for (const [k, v] of Object.entries(obj.groups as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      // 그룹키 검증 — 현재 직군 키(warrior/martial/mage/rogue/none)만 유효. parseV2Class 가 옛
      //   24-class 리매핑을 폐지(DB 초기화 전제)했으므로, 알 수 없는 키는 none 으로 떨어져 폐기된다.
      const key = parseV2Class(k);
      // 매핑 불가 키(parseV2Class→none)는 폐기. 단 진짜 "none" 그룹(모험가 수행 적립분)은 보존
      //   — 모험가도 수행 가능해졌고 cap 적립이 none 그룹 포인트를 소비하므로 로드 시 유지해야 한다.
      if (key === "none" && k !== "none") continue;
      // 옛 직군별 points → 전역 잔액으로 합산 이관(2026-06-27). 신포맷 그룹엔 points 없음(→0).
      pointsTotal += posInt((v as { points?: unknown }).points);
      const cultivations = posInt((v as { cultivations?: unknown }).cultivations);
      // tier 1~4 클램프, 미지정=1.
      const tier = Math.min(4, Math.max(1, posInt((v as { tier?: unknown }).tier) || 1));
      // cumLevel(직군 누적 레벨) — 모든 writer 가 항상 기록(DB 초기화 후 옛 시드 마이그 불필요).
      //   필드 없거나 비수면 0. 모험가(none)는 직군 정복/cumLevel 미사용이라 항상 0.
      const rawCum = (v as { cumLevel?: unknown }).cumLevel;
      const cumLevel =
        key !== "none" &&
        typeof rawCum === "number" &&
        Number.isFinite(rawCum) &&
        rawCum >= 0
          ? Math.floor(rawCum)
          : 0;
      // 의미 있는 데이터(누적레벨/수행/차수)가 있는 그룹만 보존. 전부 0·1차면 신규와 동일이라 생략.
      //   (points 는 전역으로 빠졌으므로 그룹 보존 판정에서 제외 — points 만 있던 그룹은 합산 후 폐기.)
      if (cumLevel > 0 || cultivations > 0 || tier > 1) {
        // 방어적 머지(같은 key 가 중복 등장할 때): 차수·누적레벨은 max, 수행 횟수는 합.
        const prev = groups[key];
        groups[key] = prev
          ? {
              cultivations: prev.cultivations + cultivations,
              tier: Math.max(prev.tier, tier),
              cumLevel: Math.max(prev.cumLevel, cumLevel),
            }
          : { cultivations, tier, cumLevel };
      }
    }
  }
  // caps[stat] = 수행으로 올린 cap 헤드룸 이득(floor+base 위 추가분). 양수·유한만 저장.
  //   (DB 초기화 후 옛 "절대 cap"(#275) 세이브가 없으므로 ≥60 드롭 가드/capFmt 표식 폐지.)
  const caps: Partial<Record<V2StatKey, number>> = {};
  if (obj.caps && typeof obj.caps === "object") {
    const rawCaps = obj.caps as Record<string, unknown>;
    for (const stat of V2_STAT_KEYS) {
      const c = rawCaps[stat];
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        caps[stat] = Math.floor(c);
      }
    }
  }
  // 직업별 누적 레벨(jobCumLevel) — 옛 세이브엔 없음(빈 맵). 양수만 보존(비파괴).
  const jobCumLevel: Record<string, number> = {};
  if (obj.jobCumLevel && typeof obj.jobCumLevel === "object") {
    for (const [k, v] of Object.entries(
      obj.jobCumLevel as Record<string, unknown>,
    )) {
      const n = posInt(v);
      if (n > 0 && k && k !== "none") jobCumLevel[k] = n;
    }
  }
  return {
    points: pointsTotal,
    groups,
    caps,
    grown: parseStatMap(obj.grown),
    jobCumLevel,
    reincarnations: posInt(obj.reincarnations),
  };
}

// prof 파싱 — 옛 cumLevel 시드 마이그레이션이 폐지(DB 초기화 전제)되면서 charSave 는 더는
// 쓰이지 않지만, 20여 곳 호출부 호환을 위해 시그니처(raw, charSave)는 유지한다.
export function parseProficiencyForChar(
  raw: unknown,
  charSave: { class?: unknown; level?: unknown },
): V2ProficiencyState {
  void charSave; // 시그니처 호환용(시드 마이그 폐지로 미사용)
  return parseProficiency(raw);
}

// 랜덤 레벨 성장분 교체(비파괴). 다른 필드 보존.
export function setGrown(
  p: V2ProficiencyState,
  grown: Partial<Record<V2StatKey, number>>,
): V2ProficiencyState {
  return { ...p, grown };
}

// 직업군 도달 최고 차수 갱신(전직 시). 기존 tier 와 max. 그룹 없으면 생성. 비파괴.
export function setGroupTier(
  p: V2ProficiencyState,
  group: string,
  tier: number,
): V2ProficiencyState {
  if (!group || group === "none") return p;
  const t = Math.min(4, Math.max(1, Math.floor(tier)));
  const cur = p.groups[group] ?? {
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  if (cur.tier >= t) return p;
  return { ...p, groups: { ...p.groups, [group]: { ...cur, tier: t } } };
}

// 코어루프 재전직 — 차수 폐지(flat tree). 모든 직업군 차수를 1로 정규화하고, ensureGroup
// (재전직 대상)은 없으면 1차로 생성한다. setGroupTier 와 달리 max-clamp 없이 무조건 하향 기록
// — tier 가 derive(앵커 보정 %)·floor(tierMult) 양쪽 입력이라 옛 차수가 남으면 보너스가 샌다.
// points/cultivations/cumLevel/caps/grown 은 전부 보존. 비파괴.
export function flattenGroupTiers(
  p: V2ProficiencyState,
  ensureGroup?: string,
): V2ProficiencyState {
  const groups: Record<string, V2ProficiencyGroup> = {};
  for (const [g, v] of Object.entries(p.groups)) {
    groups[g] = v.tier === 1 ? v : { ...v, tier: 1 };
  }
  if (ensureGroup && ensureGroup !== "none" && !groups[ensureGroup]) {
    groups[ensureGroup] = { cultivations: 0, tier: 1, cumLevel: 0 };
  }
  return { ...p, groups };
}

// floor(저점) 다이얼 — docs §5. 입력을 earned(킬 누적) → 직군 누적 레벨(cumLevel)로 전환(2026-06).
// cumLevel 은 레벨업당 +1 + 레벨캡·차수 유한이라 ~200-250 에서 천장 → 옛 earned 의 무한 선형
// runaway 가 구조적으로 사라진다(저점이 cap 의 ~30~50%에서 멈춤). 계수는 cumLevel 스케일에 맞춰
// 상향(earned 대비 ~1/15~1/40). 시작 다이얼 — sim 캘리브 대상.
export const V2_FLOOR_GLOBAL = 0.015; // 총 누적레벨 → 전 스탯 베이스.
export const V2_FLOOR_PER_PROF = 0.05; // 직군 누적레벨 → 프로필 스탯 floor.
// 차수가 높을수록 floor 가 더 오르되(설계 의도), cap 을 넘지 않게 완만히. {1.5,2,3} → {1.15,1.3,1.5}.
export const V2_TIER_FLOOR_MULT: Record<number, number> = {
  1: 1,
  2: 1.15,
  3: 1.3,
  4: 1.5,
};
// 직업 프로필 floor 가중 — 프로필 값 비례(최댓값 스탯=1.0, 나머지는 값 비율). cap(수행)과 동일
// 규칙. 옛 앵커-이진(1.0/0.4)은 mage {int:2,spi:2} 의 spi 를 0.4 로 홀대 → 값 비례로 통일.
export const V2_FLOOR_ANCHOR_WEIGHT = 1.0; // 프로필 최댓값 스탯(직군 주력)의 floor 가중.

// 환생 누적 성장 완화(2026-06-07) — cumLevel floor 가 선형 무한이라 환생할수록 스탯이 끝없이.
// 천장은 두지 않되 증가율을 ~10환생(cumLevel BAND)마다 한 단계씩 낮춘다(밴드 b: ×max(MIN,1−DECAY×b)).
// MIN 에서 멈춰 무한 유지(천장 X). 첫 밴드(b=0, ~0~10환생)는 ×1.0 = 현행 동일.
//   diminishedCumLevel = 선형 cumLevel 을 밴드별 감쇠율로 적분한 "유효 누적레벨" — floor 식의
//   cumLevel/total 자리에 대입하면 piecewise-concave(증가율↓, 천장 없음). EXP·레벨 곡선과 무관.
export const V2_FLOOR_DECAY_BAND = 3000; // ≈ 10환생(캠페인당 cumLevel ~291 × ~10).
export const V2_FLOOR_DECAY_PER_BAND = 0.12; // 밴드당 증가율 −12%.
export const V2_FLOOR_DECAY_MIN = 0.4; // 최소 증가율(천장 방지). 50환생+ 부터 이 비율 무한 유지.
export function diminishedCumLevel(cumLevel: number): number {
  if (!Number.isFinite(cumLevel) || cumLevel <= 0) return 0; // Infinity/NaN/0/음수 가드(무한루프 방지).
  let eff = 0;
  let remain = cumLevel;
  let band = 0;
  while (remain > 0) {
    const seg = Math.min(remain, V2_FLOOR_DECAY_BAND);
    const mult = Math.max(
      V2_FLOOR_DECAY_MIN,
      1 - V2_FLOOR_DECAY_PER_BAND * band,
    );
    eff += seg * mult;
    remain -= seg;
    band += 1;
  }
  return eff;
}

// 시그니처 학습 비용(숙달 포인트) — 그 차수 도달 + 비용 지불 시 습득(docs §6·§10).
export const V2_SIGNATURE_LEARN_COST: Record<number, number> = {
  1: 80,
  2: 150,
  3: 250,
  4: 400,
};
export function signatureLearnCost(tier: number): number {
  return V2_SIGNATURE_LEARN_COST[tier] ?? V2_SIGNATURE_LEARN_COST[1];
}

// 전직(차수 승급) 게이트 — 직군 누적 레벨(cumLevel) 임계. earned → cumLevel 전환(2026-06).
// key = 목표 차수. cumLevel 은 레벨업당 +1(전직 리셋 불변)이라 킬 기반 earned 보다 쌓기 어렵고
// EXP 곡선에 감속 → 전직이 "킬 수"가 아닌 "누적 레벨"로 게이트. Lv50 최소레벨과 이중(아래).
// 시작 다이얼 — sim/실측 캘리브 대상.
export const V2_ADVANCE_CUMLEVEL_REQ: Record<number, number> = {
  2: 55,
  3: 110,
  4: 170,
};
export function advanceCumLevelReq(tier: number): number {
  return V2_ADVANCE_CUMLEVEL_REQ[tier] ?? Infinity;
}
// 전직 최소 레벨 — 차수 승급 시 레벨이 1로 리셋되므로, 매 차수 사이 레벨 50 까지 키워야
// 다음 승급 가능(누적 레벨 게이트와 이중). 리셋 루프의 레벨 의미 부여(2026-06).
export const V2_ADVANCE_MIN_LEVEL = 50;

// 차수별 레벨 캡 — 환생(prestige) 설계 §3.1. 각 차수는 이 레벨까지만 오르고(applyExpGain
// maxLevel), 캡 도달 시에만 다음 차수 전직(4차 캡=환생). 캡 위로는 exp 버림(advance 전까지 정지).
// 1·2·3차 캡 < 만렙 100 이라 차수마다 레벨 의미 구간이 분리됨.
export const V2_TIER_LEVEL_CAP: Record<number, number> = {
  1: 50,
  2: 65,
  3: 80,
  4: 100,
};
// 차수 → 레벨 캡. 미정의 차수(클램프)는 4차(100) 취급.
export function tierLevelCap(tier: number): number {
  return V2_TIER_LEVEL_CAP[Math.min(4, Math.max(1, Math.floor(tier)))] ?? 100;
}

// 코어루프 단일 레벨 캡 — 차수 폐지 시 모든 직업이 단일 V2_LEVEL_CAP(100)까지만 오르고,
// 그 위는 재전직 루프로 전환. 순수 헬퍼(테스트용 flag 인자) + flag 자동판정 래퍼.
export function levelCapFor(tier: number, coreLoopOn: boolean): number {
  return coreLoopOn ? V2_LEVEL_CAP : tierLevelCap(tier);
}
// 라우트/derive 가 쓰는 유효 레벨 캡. flag off = 기존 차수 캡(무변경).
export function effectiveLevelCap(tier: number): number {
  return levelCapFor(tier, V2_CORE_LOOP_V2);
}

// 직군 누적 레벨 — floor·전직 게이트 입력. 레벨업당 +1, 전직 리셋에도 불변.
export function totalCumLevel(p: V2ProficiencyState): number {
  let t = 0;
  for (const v of Object.values(p.groups)) t += v.cumLevel;
  return t;
}

export function groupCumLevel(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.cumLevel ?? 0;
}

// 숙달 포인트 잔액(사용가능) — 캐릭터 전역(직군 무관). 옛 직군별 groupUsable 대체(2026-06-27).
export function usablePoints(p: V2ProficiencyState): number {
  return Math.max(0, p.points ?? 0);
}

export function cultivationCount(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.cultivations ?? 0;
}

// stat cap — 수행으로 올린 값, 미지정이면 기본 cap.
// 수행으로 올린 cap 헤드룸 이득(저점/base 위 추가 성장 여유). 미수행 = 0.
export function capGain(p: V2ProficiencyState, stat: V2StatKey): number {
  return p.caps[stat] ?? 0;
}

// 유효 cap = floor + 기본 헤드룸 + 수행 이득. floor 가 높아져도 cap 이 항상 그 위.
export function effectiveStatCap(floorVal: number, gain: number): number {
  return Math.floor(floorVal + V2_CAP_HEADROOM_BASE + Math.max(0, gain));
}

// 전 스탯 수행 이득 총합 — 수행 비용 산정(cap 비례)에 사용.
export function totalCapGains(p: V2ProficiencyState): number {
  let t = 0;
  for (const stat of V2_STAT_KEYS) t += p.caps[stat] ?? 0;
  return t;
}

// 숙달 포인트 적립 — 캐릭터 전역 points += amount(킬당). 비파괴. 0 이하·빈 group·수행 프로필 없는
//   group 은 무변경. 🔑 group 은 적립 "자격" 게이트일 뿐(잔액은 전역) — V2_CULTIVATE_PROFILE 가
//   있는 직업(4직군 + none 모험가 등)에서 사냥할 때만 적립(일반화, 2026-06-22).
export function addPoints(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || !V2_CULTIVATE_PROFILE[group]) return p;
  return { ...p, points: p.points + amount };
}

// 직군 누적 레벨 적립 — group 의 cumLevel += amount(레벨업 수). 비파괴. none/빈 group/0 이하 무변경.
export function addCumLevel(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || group === "none") return p;
  const cur = p.groups[group] ?? {
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  return {
    ...p,
    groups: {
      ...p.groups,
      [group]: { ...cur, cumLevel: cur.cumLevel + amount },
    },
  };
}

// 환생(재전직) 1회 기록 — reincarnations += 1. advance-class 환생 경로(같은/다른 직업 무관)에서 호출.
// 비파괴. cumLevel 과 독립(환생은 cumLevel 을 보존만 하고 더하지 않으므로, "환생했다"는 별도 신호 필요).
export function addReincarnation(p: V2ProficiencyState): V2ProficiencyState {
  return { ...p, reincarnations: (p.reincarnations ?? 0) + 1 };
}

// 직업별 누적 레벨 적립 — jobId 의 jobCumLevel += amount(레벨업 수). 비파괴. none/빈 jobId/0이하 무변경.
//   직군 누적(addCumLevel)과 짝지어 호출 — 같은 레벨업을 직군(groups.cumLevel)과 구체 직업
//   (jobCumLevel) 양쪽에 적립한다. totalCumLevel/floor 는 groups 만 보므로 이중계산 없음
//   (jobCumLevel 은 하이브리드 해금 게이트 전용).
export function addJobCumLevel(
  p: V2ProficiencyState,
  jobId: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !jobId || jobId === "none") return p;
  const cur = p.jobCumLevel ?? {};
  return {
    ...p,
    jobCumLevel: { ...cur, [jobId]: (cur[jobId] ?? 0) + amount },
  };
}

// 특정 직업의 누적 레벨(하이브리드 해금 게이트 조회). 미적립=0.
export function jobCumLevelOf(p: V2ProficiencyState, jobId: string): number {
  return p.jobCumLevel?.[jobId] ?? 0;
}

// 수행 1회 — 숙달 포인트 cost 소모 + 현 직업 프로필 stat cap 상승 + cultivations++.
// 잔액 부족/유효하지 않은 직업군이면 null. 비파괴.
// 수행 1회 — 숙달 포인트로 프로필 스탯 cap 헤드룸 상승. 비용 = 올린 cap 총합 비례.
// rng 주면 낮은 확률로 다중 수행(크리티컬, mult×) — 1회 비용에 여러 배 cap. rng 없으면 ×1.
export function applyCultivation(
  p: V2ProficiencyState,
  group: string,
  rng?: () => number,
  // 자유 수행(가이드형, docs/v2-job-spec-passives-plan.md §6) — 지정 시 프로필 분산 대신 선택 스탯
  // 한 곳에 동일 총량(profile 합 × mult) 투입(cap economy·비용 곡선 불변). 미지정 = 현 동작(분산).
  targetStat?: V2StatKey,
  // 현재 직업 id — 하이브리드(마검사·성기사)는 직군 대신 직업 정체성 프로필로 cap 을 올린다.
  // 미지정/비하이브리드면 직군(group) 프로필. 회계(group)는 그대로.
  jobId?: string | null,
): { next: V2ProficiencyState; cost: number; mult: number } | null {
  const profile = effectiveCultivateProfile(group, jobId);
  if (!profile) return null; // none/무효 직업군
  const cost = cultivationCost(totalCapGains(p));
  if (usablePoints(p) < cost) return null; // 사용가능 부족(전역 잔액)
  const mult = rng ? rollCultivationMult(rng) : 1;
  const cur = p.groups[group] ?? {
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  const nextCaps: Partial<Record<V2StatKey, number>> = { ...p.caps };
  if (targetStat) {
    // 선택 스탯 한 곳 — 프로필 분산과 동일 총량(합 × mult)이라 비용/economy 불변.
    const profileSum = V2_STAT_KEYS.reduce((s, k) => s + (profile[k] ?? 0), 0);
    const gain = profileSum * mult;
    if (gain > 0) nextCaps[targetStat] = (nextCaps[targetStat] ?? 0) + gain;
  } else {
    for (const stat of V2_STAT_KEYS) {
      const gain = (profile[stat] ?? 0) * mult;
      if (gain > 0) nextCaps[stat] = (nextCaps[stat] ?? 0) + gain;
    }
  }
  return {
    cost,
    mult,
    next: {
      ...p,
      points: p.points - cost, // 전역 잔액에서 차감
      groups: {
        ...p.groups,
        [group]: { ...cur, cultivations: cur.cultivations + 1 },
      },
      caps: nextCaps,
    },
  };
}

// UI 가이드(자유 수행, docs §6) — 직군 권장 수행 스탯(프로필 가중 내림차순). "막지 않되 권장 표시" 용.
// 자유 수행에서 플레이어가 아무 스탯이나 고를 수 있되, 이 목록을 추천으로 노출(트랩 빌드 완화).
export function recommendedCultivationStats(group: string): V2StatKey[] {
  const profile = V2_CULTIVATE_PROFILE[group];
  if (!profile) return [];
  return V2_STAT_KEYS.filter((k) => (profile[k] ?? 0) > 0).sort(
    (a, b) => (profile[b] ?? 0) - (profile[a] ?? 0),
  );
}

// 숙달 포인트 소모(시그니처 학습용) — 전역 잔액에서만 차감(cap/cultivations 불변).
// 비파괴. 잔액 부족이면 null. (수행과 달리 횟수 카운트 안 함 — 고정 비용.)
export function spendProficiency(
  p: V2ProficiencyState,
  amount: number,
): V2ProficiencyState | null {
  if (amount <= 0) return p;
  if (usablePoints(p) < amount) return null;
  return { ...p, points: p.points - amount };
}
