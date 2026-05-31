// v2 직업 숙련도 — 직업군별 적립(earned)/소모(spent). 총 숙련도 = Σ earned.
// 설계: docs/v2-proficiency-redesign.md §3. 직업을 플레이로 마스터하며 영구 성장.
//
// 직업군 키 = 그 직업군의 1차 직업 id (tier1ClassOf, 예: 검술=swordsman). 안정적이라
// display 문자열("검술") 대신 사용. none(무직)은 적립 없음(키 없음).
// 저장: proficiency.v2 = { groups: { [tier1classId]: { earned, spent } } }.
//   - earned: 누적(영구). spent: 수행·시그니처 학습에 쓴 합.
//   - 직업 사용가능 = earned − spent. 총 숙련도 = Σ earned.

export type V2ProficiencyGroup = { earned: number; spent: number };
export type V2ProficiencyState = {
  groups: Record<string, V2ProficiencyGroup>;
};

// 전투(킬/승리) 1회당 적립량. §10 다이얼.
export const V2_PROFICIENCY_PER_KILL = 2;

export function emptyProficiency(): V2ProficiencyState {
  return { groups: {} };
}

export function parseProficiency(raw: unknown): V2ProficiencyState {
  if (!raw || typeof raw !== "object") return emptyProficiency();
  const g = (raw as { groups?: unknown }).groups;
  const out: Record<string, V2ProficiencyGroup> = {};
  if (g && typeof g === "object") {
    for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const rawE = (v as { earned?: unknown }).earned;
      const rawS = (v as { spent?: unknown }).spent;
      const earned =
        typeof rawE === "number" && Number.isFinite(rawE)
          ? Math.max(0, Math.floor(rawE))
          : 0;
      const spent =
        typeof rawS === "number" && Number.isFinite(rawS)
          ? Math.max(0, Math.floor(rawS))
          : 0;
      // earned > 0 인 그룹만 보존. spent 는 earned 초과 불가(손상 방어).
      if (earned > 0) {
        out[k] = { earned, spent: Math.min(spent, earned) };
      }
    }
  }
  return { groups: out };
}

// 총 숙련도 = 모든 직업군 earned 합.
export function totalEarned(p: V2ProficiencyState): number {
  let t = 0;
  for (const v of Object.values(p.groups)) t += v.earned;
  return t;
}

export function groupEarned(p: V2ProficiencyState, group: string): number {
  return p.groups[group]?.earned ?? 0;
}

// 직업 사용가능 = earned − spent.
export function groupUsable(p: V2ProficiencyState, group: string): number {
  const g = p.groups[group];
  return g ? Math.max(0, g.earned - g.spent) : 0;
}

// 적립 — group 의 earned += amount. 비파괴(새 객체 반환). none/빈 group/0 이하는 무변경.
export function addEarned(
  p: V2ProficiencyState,
  group: string,
  amount: number,
): V2ProficiencyState {
  if (amount <= 0 || !group || group === "none") return p;
  const cur = p.groups[group] ?? { earned: 0, spent: 0 };
  return {
    groups: {
      ...p.groups,
      [group]: { earned: cur.earned + amount, spent: cur.spent },
    },
  };
}
