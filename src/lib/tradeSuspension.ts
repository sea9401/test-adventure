const PERMANENT_YEAR = 9_999;

export type TradeRestrictionFields = {
  bannedUntil: Date | null;
  banReason: string | null;
  tradeSuspendedUntil: Date | null;
  tradeSuspensionReason: string | null;
};

export type ActiveTradeRestriction = {
  source: "account" | "trade";
  reason: string;
  expiresAt: Date;
  permanent: boolean;
};

export type TradeSuspendedPayload = {
  ok: false;
  error: "trade_suspended";
  reason: string;
  expiresAt: string;
  permanent: boolean;
};

function activeRestriction(
  source: ActiveTradeRestriction["source"],
  expiresAt: Date | null,
  reason: string | null,
  defaultReason: string,
  now: Date,
): ActiveTradeRestriction | null {
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) return null;

  return {
    source,
    reason: reason ?? defaultReason,
    expiresAt,
    permanent: expiresAt.getUTCFullYear() >= PERMANENT_YEAR,
  };
}

export function resolveTradeRestriction(
  fields: TradeRestrictionFields,
  now = new Date(),
): ActiveTradeRestriction | null {
  const accountRestriction = activeRestriction(
    "account",
    fields.bannedUntil,
    fields.banReason,
    "운영 정책에 따라 계정 이용이 제한되었습니다.",
    now,
  );
  if (accountRestriction) return accountRestriction;

  return activeRestriction(
    "trade",
    fields.tradeSuspendedUntil,
    fields.tradeSuspensionReason,
    "운영 정책에 따라 거래 이용이 제한되었습니다.",
    now,
  );
}

export function tradeSuspendedPayload(
  restriction: ActiveTradeRestriction,
): TradeSuspendedPayload {
  return {
    ok: false,
    error: "trade_suspended",
    reason: restriction.reason,
    expiresAt: restriction.expiresAt.toISOString(),
    permanent: restriction.permanent,
  };
}

export function tradeSuspensionMessage(
  restriction: Pick<TradeSuspendedPayload, "reason" | "expiresAt" | "permanent">,
): string {
  if (restriction.permanent) {
    return `거래 이용이 제한되었습니다. 사유: ${restriction.reason}`;
  }

  return `거래 이용이 ${new Date(restriction.expiresAt).toLocaleString("ko-KR")}까지 제한되었습니다. 사유: ${restriction.reason}`;
}
