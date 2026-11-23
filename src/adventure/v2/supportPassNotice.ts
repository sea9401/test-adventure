// 월간 모험 지원권 만료 알림 — 끝나기 3일 전에 한 번, 끝난 뒤에 한 번.
// 알릴지 판단하는 순수 로직과 문구만 둔다. 알림 행을 쓰는 일은 서버 쪽(`supportPassNotice` 서버 모듈)이 맡는다.

import {
  ADVENTURE_SUPPORT_PASS,
  parseAdventureSupportState,
} from "@/adventure/data/v2/adventureSupport";
import { MAX_STAMINA } from "@/adventure/v2/stamina";

export const SUPPORT_PASS_NOTICE_SAVE_KEY = "support-pass-notice.v1";

const DAY_MS = 24 * 60 * 60 * 1_000;
/** 끝나기 이만큼 전부터 알린다. */
export const SUPPORT_PASS_EXPIRING_LEAD_MS = 3 * DAY_MS;
/** 끝난 뒤 이 기간 안에 접속한 경우에만 끝났다고 알린다. 오래 떠나 있던 계정에는 알리지 않는다. */
export const SUPPORT_PASS_EXPIRED_NOTICE_WINDOW_MS = 7 * DAY_MS;

export type SupportPassNoticeType = "support_pass_expiring" | "support_pass_expired";

export type SupportPassNotificationPayload = {
  tier: "standard" | "premium";
  /** 그 등급이 끝나는(끝난) 시각. */
  endAt: number;
  /** 프리미엄이 끝난 뒤 일반 지원권이 이어지는지. */
  continuesStandard: boolean;
};

export type SupportPassNotice = {
  type: SupportPassNoticeType;
  payload: SupportPassNotificationPayload;
};

/** 이미 알린 종료 시각. 기간을 이어 붙여 종료 시각이 바뀌면 다시 알린다. */
export type SupportPassNoticeState = {
  expiringFor: number | null;
  expiredFor: number | null;
};

function timestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function parseSupportPassNoticeState(raw: unknown): SupportPassNoticeState {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    expiringFor: timestamp(item.expiringFor),
    expiredFor: timestamp(item.expiredFor),
  };
}

/** 지금 보내야 할 만료 알림. 이미 같은 종료 시각으로 알렸으면 빠진다. */
export function dueSupportPassNotices(
  supportRaw: unknown,
  noticeRaw: unknown,
  now: number = Date.now(),
): SupportPassNotice[] {
  const support = parseAdventureSupportState(supportRaw);
  if (!support) return [];
  const sent = parseSupportPassNoticeState(noticeRaw);
  const premiumUntil = support.premiumUntil ?? null;
  const notices: SupportPassNotice[] = [];

  // 지금 적용 중인 등급과 그 등급이 끝나는 시각
  const current: SupportPassNotificationPayload | null =
    premiumUntil !== null && premiumUntil > now
      ? {
          tier: "premium",
          endAt: premiumUntil,
          continuesStandard: support.activeUntil > premiumUntil,
        }
      : support.activeUntil > now
        ? { tier: "standard", endAt: support.activeUntil, continuesStandard: false }
        : null;
  if (
    current &&
    current.endAt - now <= SUPPORT_PASS_EXPIRING_LEAD_MS &&
    sent.expiringFor !== current.endAt
  ) {
    notices.push({ type: "support_pass_expiring", payload: current });
  }

  // 가장 최근에 끝난 등급
  const ended: SupportPassNotificationPayload | null =
    support.activeUntil <= now
      ? {
          tier: premiumUntil !== null && premiumUntil >= support.activeUntil ? "premium" : "standard",
          endAt: support.activeUntil,
          continuesStandard: false,
        }
      : premiumUntil !== null && premiumUntil <= now
        ? { tier: "premium", endAt: premiumUntil, continuesStandard: true }
        : null;
  if (
    ended &&
    now - ended.endAt <= SUPPORT_PASS_EXPIRED_NOTICE_WINDOW_MS &&
    sent.expiredFor !== ended.endAt
  ) {
    notices.push({ type: "support_pass_expired", payload: ended });
  }
  return notices;
}

export function markSupportPassNotices(
  state: SupportPassNoticeState,
  notices: readonly SupportPassNotice[],
): SupportPassNoticeState {
  const next = { ...state };
  for (const notice of notices) {
    if (notice.type === "support_pass_expiring") next.expiringFor = notice.payload.endAt;
    else next.expiredFor = notice.payload.endAt;
  }
  return next;
}

function endTimeText(endAt: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(endAt));
}

export function supportPassNotificationText(
  type: SupportPassNoticeType,
  payload: SupportPassNotificationPayload,
): string {
  const name =
    payload.tier === "premium" ? "월간 모험 지원권 프리미엄" : "월간 모험 지원권";
  if (type === "support_pass_expiring") {
    return payload.continuesStandard
      ? `${name}이 ${endTimeText(payload.endAt)}에 끝나고 일반 지원권으로 이어집니다.`
      : `${name}이 ${endTimeText(payload.endAt)}에 끝납니다.`;
  }
  if (payload.continuesStandard) {
    return `${name}이 끝나 일반 지원권이 적용 중입니다.`;
  }
  return `${name}이 끝났습니다. 최대 스태미나 ${MAX_STAMINA.toLocaleString("ko-KR")}, 일괄 사냥 ${ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch}회로 돌아갔습니다.`;
}
