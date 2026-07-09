// 낚시 캐스팅 세션 + 반응 판정 — 서버 권위 로직의 순수 코어.
//
// 설계: docs/fishing-content-plan.md §2 §7
// cast 가 세션(입질 시각·예정 어획)을 savesKv 에 적고, reel 이 이 순수 함수로 판정한다.
// 클라(FishingView)는 상수만 가져다 윈도우 연출에 쓴다.
//
// 봇 방지 철학(§7): 어종·사이즈는 cast 때 서버에서만 굴려 세션에 박제 → 클라가 결과를
// 못 만든다. 반응은 사이즈와 무관하므로 자동화해도 이득 0. reel 은 (a) 서버 시계로 "입질
// 전에 챘는지"(=대기를 안 했는지)와 (b) 세션 만료를 검증해 즉시-reel/replay 를 막고,
// 클라 보고 reactionMs 는 성공/실패 연출 게이트로만 쓴다.

import { isFishId, type FishId } from "@/adventure/data/v2/fish";
import {
  isFishingSpotId,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";

export const FISHING_SESSION_KEY = "fishing-session.v1";

// 입질까지의 대기(서버가 무작위로 정함). 벽시계 레이트 제한의 근원.
export const BITE_MIN_MS = 2500;
export const BITE_MAX_MS = 7000;

// 입질 후 챔질 윈도우(클라 보고 reactionMs 기준). 이 안에 눌러야 성공.
export const REACTION_WINDOW_MS = 900;
// 사람이 낼 수 없는 반응 속도 — 프리파이어/봇 신호로 보고 실패 처리.
export const REACTION_MIN_MS = 60;

// 세션 만료 여유 — biteAt + 윈도우 이후로도 넉넉히 둔다. replay/stale 차단이 목적이라 넓게.
export const SESSION_GRACE_MS = 15000;

export type FishingSession = {
  castId: string;
  /** 입질 시각(서버 시계, epoch ms). */
  biteAt: number;
  /** 이 시각 이후 reel 은 무효(만료). */
  expiresAt: number;
  /** cast 때 굴려 박제한 예정 어획 — reel 성공 시 그대로 지급. */
  fishId: FishId;
  size: number;
  fishingSpotId?: FishingSpotId;
};

export function expiresAtFor(biteAt: number): number {
  return biteAt + REACTION_WINDOW_MS + SESSION_GRACE_MS;
}

// rng() ∈ [0, 1). 입질 대기(ms).
export function rollBiteDelayMs(rng: () => number): number {
  return Math.round(BITE_MIN_MS + rng() * (BITE_MAX_MS - BITE_MIN_MS));
}

// 손상/빈 입력은 null(=열린 세션 없음). consume 후엔 빈 객체로 덮어쓰므로 여기서 null.
export function parseFishingSession(raw: unknown): FishingSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.castId !== "string" || r.castId.length === 0) return null;
  if (typeof r.fishId !== "string" || !isFishId(r.fishId)) return null;
  const biteAt = r.biteAt;
  const expiresAt = r.expiresAt;
  const size = r.size;
  if (typeof biteAt !== "number" || !Number.isFinite(biteAt)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (typeof size !== "number" || !Number.isFinite(size)) return null;
  const fishingSpotId =
    typeof r.fishingSpotId === "string" && isFishingSpotId(r.fishingSpotId)
      ? r.fishingSpotId
      : undefined;
  return { castId: r.castId, biteAt, expiresAt, fishId: r.fishId, size, fishingSpotId };
}

export type CatchJudgment = {
  caught: boolean;
  reason: "ok" | "expired" | "too_early" | "missed_window";
};

// reel 판정(순수). reactionMs 는 클라가 "입질 표시→탭"으로 잰 값. serverNow 는 reel 도착 시각.
export function judgeCatch(args: {
  reactionMs: number;
  serverNow: number;
  biteAt: number;
  expiresAt: number;
}): CatchJudgment {
  const { reactionMs, serverNow, biteAt, expiresAt } = args;
  // 만료 — 한참 뒤 reel(또는 replay).
  if (serverNow > expiresAt) return { caught: false, reason: "expired" };
  // 입질 전에 도착 = 대기를 안 함(즉시-reel 봇). biteAt·serverNow 둘 다 서버 시계라
  // 정상 플레이는 왕복 지연+반응만큼 항상 biteAt 이후에 도착 → 오차 허용 없이 하드 게이트.
  if (serverNow < biteAt) return { caught: false, reason: "too_early" };
  // 사람이 못 낼 반응 속도 — 프리파이어.
  if (reactionMs < REACTION_MIN_MS) return { caught: false, reason: "too_early" };
  // 윈도우 초과 — 놓침.
  if (reactionMs > REACTION_WINDOW_MS)
    return { caught: false, reason: "missed_window" };
  return { caught: true, reason: "ok" };
}
