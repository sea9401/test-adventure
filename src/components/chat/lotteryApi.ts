import type { LotterySnapshot } from "@/lib/lottery";

export type LotteryPurchaseResponse = {
  ok: true;
  replayed: boolean;
  purchasedTickets: number;
  amountPaid: number;
  snapshot: LotterySnapshot;
};

export class LotteryApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail: { remainingTickets?: number; requiredGold?: number } = {},
  ) {
    super(code);
  }
}

async function responseJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: string; remainingTickets?: number; requiredGold?: number })
    | null;
  if (!res.ok) {
    throw new LotteryApiError(json?.error ?? "request_failed", {
      remainingTickets: json?.remainingTickets,
      requiredGold: json?.requiredGold,
    });
  }
  if (!json) throw new LotteryApiError("request_failed");
  return json;
}

export async function fetchLotterySnapshot(): Promise<LotterySnapshot> {
  const res = await fetch("/api/lottery", { cache: "no-store" });
  return responseJson<LotterySnapshot>(res);
}

export async function buyLotteryTickets(
  ticketCount: number,
  requestId: string,
): Promise<LotteryPurchaseResponse> {
  const res = await fetch("/api/lottery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketCount, requestId }),
  });
  return responseJson<LotteryPurchaseResponse>(res);
}

export function lotteryErrorMessage(error: unknown): string {
  if (!(error instanceof LotteryApiError)) {
    return "복권 구매를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  switch (error.code) {
    case "purchase_rate_limited":
      return "너무 빠릅니다. 2초 후 다시 구매해주세요.";
    case "round_ticket_limit":
      return `이번 회차에는 ${error.detail.remainingTickets ?? 0}장 더 구매할 수 있습니다.`;
    case "insufficient_gold":
      return `골드가 부족합니다. ${(
        error.detail.requiredGold ?? 0
      ).toLocaleString()}G가 필요합니다.`;
    case "invalid_ticket_count":
      return "한 번에 1~10장만 구매할 수 있습니다.";
    case "unauthorized":
      return "로그인이 만료됐습니다. 새로고침해주세요.";
    default:
      return "복권 구매를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}
