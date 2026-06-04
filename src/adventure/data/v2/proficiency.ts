// v2 직업 숙련도 + 수행(스탯 cap). 설계: docs/v2-proficiency-redesign.md §3·§4.
//
// 직업군 키 = 그 직업군의 1차 직업 id (tier1ClassOf, 예: 검술=swordsman). none(무직) 적립 없음.
// 저장: proficiency.v2 = {
//   groups: { [tier1classId]: { points, cultivations, tier, cumLevel } },
//   caps:   { [stat]: number },                                    // 수행으로 올린 stat cap
// }
//   - points = 숙달 포인트(사용가능 잔액). 킬당 +V2_PROFICIENCY_PER_KILL, 수행·스킬학습에 소모.
//     (2026-06 통합: 옛 earned 누적/spent 분리 폐지 — floor·전직은 cumLevel 이 담당하므로 누적
//     추적 불필요. 단일 잔액으로 합침. 옛 세이브는 parse 가 earned−spent 로 마이그.)
//   - cultivations(수행 횟수) · tier(도달 차수) · cumLevel(직군 누적 레벨, floor·전직 입력).
//   - cap 미지정 = V2_STAT_CAP_BASE.

import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { tier1ClassOf, parseV2Class } from "./classes";

export type V2ProficiencyGroup = {
  // 숙달 포인트 — 사용가능 잔액(킬당 적립, 수행·스킬학습에 소모). 옛 earned/spent 통합(2026-06).
  points: number;
  cultivations: number;
  tier: number; // 그 직업군에서 도달한 최고 차수(1~4). floor tierMult 에 사용.
  // 직군 누적 레벨 — 레벨업마다 +1(전직 리셋에도 불변). floor·전직 게이트 입력(2026-06).
  // 레벨캡·차수 유한이라 ~200-250 에서 천장. (누적 추적은 cumLevel 이 담당 → points 는 단일 잔액.)
  cumLevel: number;
};
export type V2ProficiencyState = {
  groups: Record<string, V2ProficiencyGroup>;
  caps: Partial<Record<V2StatKey, number>>;
  grown: Partial<Record<V2StatKey, number>>; // 랜덤 레벨 성장 누적분(1차 스탯).
};

// §10 다이얼.
export const V2_PROFICIENCY_PER_KILL = 2;
// cap 은 floor 상대(저점 위 성장 여유). 유효 cap = floor + V2_CAP_HEADROOM_BASE + 수행이득.
// fresh(floor=base15) → 15+45 = 60(옛 시작 cap 과 동일). floor 가 높아져도 cap 이 항상 그 위라
// floor>cap 핀(수행 시 스탯 즉시 점프) 이 생기지 않는다 — 수행은 "여유(헤드룸)"만 늘리고
// 실제 스탯은 레벨업 랜덤성장(grown)이 floor→cap 사이를 채운다.
export const V2_CAP_HEADROOM_BASE = 45;
// 표시/폴백용 기본 cap(floor=base 가정). 실제 클램프는 effectiveStatCap 사용.
export const V2_STAT_CAP_BASE = 60;

// 수행 1회 cap 헤드룸 상승 — 4직군 프로필(합 4 고정 = 비용/economy 불변). 키 = job(tier1ClassOf).
// 각 직군의 계파 서브스탯을 함께 담아 자유 수행 없이도 계파별 스탯을 커버(예 도적 dex+luk = 궁수+암살).
export const V2_CULTIVATE_PROFILE: Record<
  string,
  Partial<Record<V2StatKey, number>>
> = {
  warrior: { str: 2, vit: 1, dex: 1 }, // 전사 — 광검(str)·철벽(vit)·혈풍(dex)
  martial: { vit: 2, str: 1, spi: 1 }, // 무도가 — 맷집(vit)·흡혈/기공
  mage: { int: 2, spi: 2 }, // 마법사 — 공격마법(int)·신성(spi)
  rogue: { dex: 2, luk: 2 }, // 도적 — 궁수(dex)·암살(luk)
};

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
  return { groups: {}, caps: {}, grown: {} };
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

// seed — cumLevel 필드가 없는 옛 세이브 마이그레이션용. 활성 직군(seed.group)은 현재 캐릭터
// 레벨(seed.level)을 더해 시드 = (tier-1)×50 + level (현 차수 진행분 반영). 그 외 직군은 (tier-1)×50.
// prof 를 write 하는 모든 라우트(hunt/advance/cultivate/learn-skill/grant)에 동일 seed 를 넘겨야
// 첫 write-back 이 올바른 cumLevel 을 박제한다(시드 없이 0 박제 → 전직 영구차단 방지).
export function parseProficiency(
  raw: unknown,
  seed?: { group: string; level: number },
): V2ProficiencyState {
  if (!raw || typeof raw !== "object") return emptyProficiency();
  const obj = raw as { groups?: unknown; caps?: unknown; grown?: unknown };
  const groups: Record<string, V2ProficiencyGroup> = {};
  if (obj.groups && typeof obj.groups === "object") {
    for (const [k, v] of Object.entries(obj.groups as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      // 그룹 리키 마이그(P4 6→4): 구 그룹키(swordsman/archer/priest/ninja…) → 4직군 job 키.
      // 같은 job 으로 합쳐지는 옛 그룹(궁술+인술→rogue, 마술+신술→mage)은 아래에서 머지.
      const key = parseV2Class(k);
      if (key === "none") continue; // 매핑 불가/none 그룹은 적립 없음.
      // 숙달 포인트(잔액) — 새 포맷은 points, 옛 포맷은 earned−spent 로 마이그(통합 2026-06).
      const rawPoints = (v as { points?: unknown }).points;
      const points =
        typeof rawPoints === "number" && Number.isFinite(rawPoints)
          ? Math.max(0, Math.floor(rawPoints))
          : Math.max(
              0,
              posInt((v as { earned?: unknown }).earned) -
                posInt((v as { spent?: unknown }).spent),
            );
      const cultivations = posInt((v as { cultivations?: unknown }).cultivations);
      // tier 1~4 클램프, 미지정(옛 세이브)=1.
      const tier = Math.min(4, Math.max(1, posInt((v as { tier?: unknown }).tier) || 1));
      // cumLevel(직군 누적 레벨) — 필드 있으면 그 값 그대로(이미 누적된 영구값).
      // 없으면 마이그레이션 시드 = 완료 차수 (tier-1)×50 + 활성 직군이면 현재 레벨(현 차수 진행분).
      // 비활성 직군은 과거 레벨을 알 수 없어 (tier-1)×50 만(보수적). 신규(tier1·미활성)=0.
      const rawCum = (v as { cumLevel?: unknown }).cumLevel;
      const seedLevel = seed && seed.group === key ? Math.max(0, seed.level) : 0;
      const cumLevel =
        typeof rawCum === "number" && Number.isFinite(rawCum) && rawCum >= 0
          ? Math.floor(rawCum)
          : (tier - 1) * V2_ADVANCE_MIN_LEVEL + seedLevel;
      // 의미 있는 데이터(잔액/누적레벨/수행/차수)가 있는 그룹만 보존. 전부 0·1차면 신규와 동일이라 생략.
      if (points > 0 || cumLevel > 0 || cultivations > 0 || tier > 1) {
        // 머지(여러 옛 그룹 → 같은 job): 차수·누적레벨은 max, 포인트·수행 횟수는 합.
        const prev = groups[key];
        groups[key] = prev
          ? {
              points: prev.points + points,
              cultivations: prev.cultivations + cultivations,
              tier: Math.max(prev.tier, tier),
              cumLevel: Math.max(prev.cumLevel, cumLevel),
            }
          : { points, cultivations, tier, cumLevel };
      }
    }
  }
  // caps[stat] = 수행으로 올린 cap 헤드룸 이득(floor+base 위 추가분). 양수만 저장.
  // 마이그레이션 가드(수행개편 2026-06): 옛 포맷은 "절대 cap"(항상 ≥ 60+이득 = ≥61)을 저장했다.
  // 새 이득은 실측상 < 60(t4 앵커 ~33). 60 이상 값은 옛 절대 cap 으로 보고 드롭(이득 0 리셋) —
  // 새 의미로 재해석돼 cap/비용이 부풀지 않게. (staging 한정, 두 포맷이 60 에서 깔끔히 갈림.)
  const caps: Partial<Record<V2StatKey, number>> = {};
  if (obj.caps && typeof obj.caps === "object") {
    const rawCaps = obj.caps as Record<string, unknown>;
    for (const stat of V2_STAT_KEYS) {
      const c = rawCaps[stat];
      if (
        typeof c === "number" &&
        Number.isFinite(c) &&
        c > 0 &&
        c < V2_STAT_CAP_BASE
      ) {
        caps[stat] = Math.floor(c);
      }
    }
  }
  return { groups, caps, grown: parseStatMap(obj.grown) };
}

// charSave({class, level})에서 활성 직군 + 현재 레벨을 뽑아 cumLevel 시드와 함께 파싱.
// prof 를 읽거나 write 하는 라우트는 bare parseProficiency 대신 이걸 써서, 옛 세이브의 cumLevel
// 마이그레이션 시드가 현 차수 진행 레벨을 포함하게 한다(전직 영구차단 방지). 모든 write 경로가
// 동일 시드를 쓰므로 어느 라우트가 먼저 write-back 하든 올바른 cumLevel 이 박제된다.
export function parseProficiencyForChar(
  raw: unknown,
  charSave: { class?: unknown; level?: unknown },
): V2ProficiencyState {
  const group = tier1ClassOf(parseV2Class(charSave.class));
  const level =
    typeof charSave.level === "number" && Number.isFinite(charSave.level)
      ? Math.max(1, Math.floor(charSave.level))
      : 1;
  return parseProficiency(raw, { group, level });
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
    points: 0,
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  if (cur.tier >= t) return p;
  return { ...p, groups: { ...p.groups, [group]: { ...cur, tier: t } } };
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
// 직업 프로필 floor 가중 — 앵커 1.0, 관련 0.4.
export const V2_FLOOR_ANCHOR_WEIGHT = 1.0;
export const V2_FLOOR_RELATED_WEIGHT = 0.4;

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

// 직군 누적 레벨 — floor·전직 게이트 입력. 레벨업당 +1, 전직 리셋에도 불변.
export function totalCumLevel(p: V2ProficiencyState): number {
  let t = 0;
  for (const v of Object.values(p.groups)) t += v.cumLevel;
  return t;
}

export function groupCumLevel(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.cumLevel ?? 0;
}

// 숙달 포인트 잔액(사용가능). 옛 earned−spent 통합 → 단일 points.
export function groupUsable(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.points ?? 0;
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

// 숙달 포인트 적립 — group 의 points += amount(킬당). 비파괴. none/빈 group/0 이하는 무변경.
export function addPoints(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || group === "none") return p;
  const cur = p.groups[group] ?? {
    points: 0,
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  return {
    ...p,
    groups: {
      ...p.groups,
      [group]: { ...cur, points: cur.points + amount },
    },
  };
}

// 직군 누적 레벨 적립 — group 의 cumLevel += amount(레벨업 수). 비파괴. none/빈 group/0 이하 무변경.
export function addCumLevel(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || group === "none") return p;
  const cur = p.groups[group] ?? {
    points: 0,
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
): { next: V2ProficiencyState; cost: number; mult: number } | null {
  const profile = V2_CULTIVATE_PROFILE[group];
  if (!profile) return null; // none/무효 직업군
  const cost = cultivationCost(totalCapGains(p));
  if (groupUsable(p, group) < cost) return null; // 사용가능 부족
  const mult = rng ? rollCultivationMult(rng) : 1;
  const cur = p.groups[group] ?? {
    points: 0,
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
      groups: {
        ...p.groups,
        [group]: {
          ...cur,
          points: cur.points - cost,
          cultivations: cur.cultivations + 1,
        },
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

// 숙달 포인트 소모(시그니처 학습용) — cap/cultivations 불변, points 만 차감.
// 비파괴. 잔액 부족이면 null. (수행과 달리 횟수 카운트 안 함 — 고정 비용.)
export function spendProficiency(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState | null {
  if (amount <= 0) return p;
  if (groupUsable(p, group) < amount) return null;
  const cur = p.groups[group] ?? {
    points: 0,
    cultivations: 0,
    tier: 1,
    cumLevel: 0,
  };
  return {
    ...p,
    groups: {
      ...p.groups,
      [group]: { ...cur, points: cur.points - amount },
    },
  };
}
