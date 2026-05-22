// PvP 보상 화폐 「투기장 코인」 — 매치 결과로 지급, 일일 캡(무제한 도전 + 영속 화폐의 인플레
// 방지). 잔액은 saves_kv 의 PVP_WALLET_KEY 에 영속(시즌 무관 누적 — 철회 전용 테마).
// 일일 누적/리셋 추적은 pvp_ratings.dailyEarned/dailyResetAt (KST 자정 리셋).
//
// 상점(코인 사용처)은 후속 PR — 이 PR 은 지급/잔액만.

export const PVP_WALLET_KEY = "pvp-wallet.v1";

export type PvpWallet = { coins: number };

// 매치당 지급(2026-05-23 결정): 승 10 / 무 4 / 패 2. 봇 상대는 ×0.5(농사 디스카운트).
// 일일 캡 100. 수치는 상점 가격과 함께 후속 튜닝 다이얼.
export const PVP_COIN_WIN = 10;
export const PVP_COIN_DRAW = 4;
export const PVP_COIN_LOSS = 2;
export const PVP_BOT_COIN_MULT = 0.5;
export const PVP_DAILY_COIN_CAP = 100;

export type PvpDbOutcome = "a_win" | "d_win" | "draw";

/** 챌린저(attacker) 관점 결과 → 기본 코인. 봇 상대면 ×0.5 floor. 캡 적용 전 raw. */
export function coinRewardFor(outcome: PvpDbOutcome, isBot: boolean): number {
  const base =
    outcome === "a_win"
      ? PVP_COIN_WIN
      : outcome === "draw"
        ? PVP_COIN_DRAW
        : PVP_COIN_LOSS; // d_win = 챌린저 패배
  return isBot ? Math.floor(base * PVP_BOT_COIN_MULT) : base;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 YYYY-MM-DD 키 — 일일 캡 경계 비교용(자정 리셋). */
export function kstDayKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/**
 * 일일 캡 적용 — 순수 함수. dailyResetAt 이 오늘(KST)과 다른 날이면 누적을 0 으로 리셋.
 * 반환: 실제 지급액(awarded) + 갱신할 dailyEarned/dailyResetAt.
 */
export function applyDailyCappedCoins(
  dailyEarned: number,
  dailyResetAt: Date | null,
  base: number,
  now: Date = new Date(),
): { awarded: number; newDailyEarned: number; newResetAt: Date } {
  const today = kstDayKey(now);
  const sameDay = dailyResetAt != null && kstDayKey(dailyResetAt) === today;
  const effEarned = sameDay ? dailyEarned : 0;
  const remaining = Math.max(0, PVP_DAILY_COIN_CAP - effEarned);
  const awarded = Math.max(0, Math.min(base, remaining));
  return {
    awarded,
    newDailyEarned: effEarned + awarded,
    newResetAt: sameDay && dailyResetAt ? dailyResetAt : now,
  };
}
