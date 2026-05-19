// 길드 회관 (Lodge) — 사회적 정체성 + sink, power-free.
// 봉납(별빛/골드) 누계가 임계 이상이면 마스터가 회관 등급을 ★1~★5 까지 승급.
// 전투력·자원율 등 어떤 능력 수치에도 영향이 없는 게 핵심 — 무소속 패널티 회피.
// 설계 보고서: docs/guild-lodge-plan.md

export type LodgeRank = 0 | 1 | 2 | 3 | 4 | 5;
export type LodgeUpgradableRank = 1 | 2 | 3 | 4 | 5;

export type DonationKind = "stardust" | "gold";

export type LodgeThreshold = { stardust: number; gold: number };

// 임계는 양쪽 통화 동시 만족이어야 승급 — 별빛 단독·골드 단독 누적은 부족.
// 두 통화 같이 흘러가는 사회적 협업을 자연스럽게 강제. ★4→★5 사이 4x 점프로
// 활동 길드와 한가한 길드의 격차 가시화 (운영 데이터 보고 조정 예정).
export const LODGE_RANK_THRESHOLD = {
  1: { stardust: 0, gold: 0 },
  2: { stardust: 200, gold: 5000 },
  3: { stardust: 800, gold: 20000 },
  4: { stardust: 2400, gold: 60000 },
  5: { stardust: 6400, gold: 150000 },
} as const satisfies Record<LodgeUpgradableRank, LodgeThreshold>;

export const LODGE_RANK_MAX: LodgeUpgradableRank = 5;
export const LODGE_SLOGAN_MAX = 80;

export type LodgeStateSnapshot = {
  stardustTotal: number;
  goldTotal: number;
};

// 현 등급에서 한 단계 승급 가능 여부 — 양쪽 통화 임계 모두 충족 + 현 rank < 5.
// 서버 /upgrade 와 클라 [승급] 버튼 활성화 양쪽에서 동일 판정에 쓰임.
export function rankReady(state: LodgeStateSnapshot, currentRank: number): boolean {
  if (currentRank >= LODGE_RANK_MAX) return false;
  const nextRank = (currentRank + 1) as LodgeUpgradableRank;
  const req = LODGE_RANK_THRESHOLD[nextRank];
  if (!req) return false;
  return state.stardustTotal >= req.stardust && state.goldTotal >= req.gold;
}

// 다음 등급 임계 (현 rank < 5 일 때만). UI 진행도 바·승급 버튼 게이트.
export function nextRankThreshold(
  currentRank: number,
): { rank: LodgeUpgradableRank; stardust: number; gold: number } | null {
  if (currentRank >= LODGE_RANK_MAX) return null;
  const next = (currentRank + 1) as LodgeUpgradableRank;
  const req = LODGE_RANK_THRESHOLD[next];
  return { rank: next, stardust: req.stardust, gold: req.gold };
}

export function isValidDonationKind(s: unknown): s is DonationKind {
  return s === "stardust" || s === "gold";
}

// 봉납자 단위 누계 — `이번주` 는 KST 자정 기준 직전 월요일 이후, `total` 은 회관 건립 이후 전체.
// 서버가 `guild_lodge_donations` GROUP BY userId 로 두 번 집계해 응답에 박는다.
export type LodgeContributor = {
  userId: string;
  name: string;
  weekStardust: number;
  weekGold: number;
  totalStardust: number;
  totalGold: number;
};

export type LodgeMyDonations = {
  weekStardust: number;
  weekGold: number;
  totalStardust: number;
  totalGold: number;
};

export type LodgeResponse = {
  rank: number;
  slogan: string | null;
  stardustTotal: number;
  goldTotal: number;
  lastDonationAt: string | null;
  nextRank:
    | {
        rank: LodgeUpgradableRank;
        stardustReq: number;
        goldReq: number;
        ready: boolean;
      }
    | null;
  myDonations: LodgeMyDonations;
  contributions: LodgeContributor[];
};

export type DonateBody = {
  kind: DonationKind;
  amount: number;
};

export type UpgradeResponse = {
  rank: number;
};

export type SloganBody = {
  slogan: string;
};
