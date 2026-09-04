import "server-only";

const TOSS_API_ORIGIN = "https://api.tosspayments.com";

export type TossPaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED";

export type TossPaymentCancel = {
  transactionKey: string;
  cancelAmount: number;
  cancelReason: string;
};

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: TossPaymentStatus;
  totalAmount: number;
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  cancels: TossPaymentCancel[];
};

export class TossPaymentsError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly ambiguous: boolean;

  constructor(args: {
    code: string;
    message: string;
    status?: number | null;
    ambiguous?: boolean;
  }) {
    super(args.message);
    this.name = "TossPaymentsError";
    this.code = args.code;
    this.status = args.status ?? null;
    this.ambiguous = args.ambiguous ?? false;
  }
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TossPaymentsClientOptions = {
  secretKey: string;
  fetchImpl?: FetchLike;
};

const PAYMENT_STATUSES = new Set<TossPaymentStatus>([
  "READY",
  "IN_PROGRESS",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
]);

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function normalizeCancel(value: unknown): TossPaymentCancel | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const cancelAmount = finiteNonNegativeInteger(raw.cancelAmount);
  if (
    typeof raw.transactionKey !== "string" ||
    cancelAmount === null ||
    typeof raw.cancelReason !== "string"
  ) {
    return null;
  }
  return {
    transactionKey: raw.transactionKey,
    cancelAmount,
    cancelReason: raw.cancelReason,
  };
}

function normalizePayment(value: unknown): TossPayment {
  if (!value || typeof value !== "object") {
    throw new TossPaymentsError({
      code: "INVALID_RESPONSE",
      message: "토스페이먼츠 응답 형식이 올바르지 않습니다.",
      ambiguous: true,
    });
  }
  const raw = value as Record<string, unknown>;
  const totalAmount = finiteNonNegativeInteger(raw.totalAmount);
  const balanceAmount = finiteNonNegativeInteger(raw.balanceAmount);
  if (
    typeof raw.paymentKey !== "string" ||
    typeof raw.orderId !== "string" ||
    typeof raw.status !== "string" ||
    !PAYMENT_STATUSES.has(raw.status as TossPaymentStatus) ||
    totalAmount === null ||
    balanceAmount === null ||
    (raw.method !== null && typeof raw.method !== "string") ||
    (raw.approvedAt !== null && typeof raw.approvedAt !== "string")
  ) {
    throw new TossPaymentsError({
      code: "INVALID_RESPONSE",
      message: "토스페이먼츠 응답 필드가 올바르지 않습니다.",
      ambiguous: true,
    });
  }

  return {
    paymentKey: raw.paymentKey,
    orderId: raw.orderId,
    status: raw.status as TossPaymentStatus,
    totalAmount,
    balanceAmount,
    method: raw.method as string | null,
    approvedAt: raw.approvedAt as string | null,
    cancels: Array.isArray(raw.cancels)
      ? raw.cancels.map(normalizeCancel).filter((item) => item !== null)
      : [],
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TossPaymentsError({
      code: "INVALID_RESPONSE",
      message: "토스페이먼츠 응답을 해석할 수 없습니다.",
      status: response.status,
      ambiguous: true,
    });
  }
}

export function createTossPaymentsClient({
  secretKey,
  fetchImpl = fetch,
}: TossPaymentsClientOptions) {
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

  async function request(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
      idempotencyKey?: string;
    } = {},
  ): Promise<TossPayment> {
    let response: Response;
    try {
      response = await fetchImpl(`${TOSS_API_ORIGIN}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        cache: "no-store",
      });
    } catch (error) {
      throw new TossPaymentsError({
        code: "NETWORK_ERROR",
        message:
          error instanceof Error ? error.message : "토스페이먼츠 연결 실패",
        ambiguous: true,
      });
    }

    const body = await readResponseBody(response);
    if (!response.ok) {
      const errorBody =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : null;
      throw new TossPaymentsError({
        code:
          typeof errorBody?.code === "string"
            ? errorBody.code
            : `HTTP_${response.status}`,
        message:
          typeof errorBody?.message === "string"
            ? errorBody.message
            : "토스페이먼츠 요청이 실패했습니다.",
        status: response.status,
        ambiguous: response.status >= 500,
      });
    }
    return normalizePayment(body);
  }

  return {
    confirm(input: {
      paymentKey: string;
      orderId: string;
      amount: number;
      idempotencyKey: string;
    }) {
      return request("/v1/payments/confirm", {
        method: "POST",
        body: {
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        },
        idempotencyKey: input.idempotencyKey,
      });
    },
    get(paymentKey: string) {
      return request(`/v1/payments/${encodeURIComponent(paymentKey)}`);
    },
    cancel(input: {
      paymentKey: string;
      cancelReason: string;
      cancelAmount?: number;
      idempotencyKey: string;
    }) {
      return request(
        `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
        {
          method: "POST",
          body: {
            cancelReason: input.cancelReason,
            ...(input.cancelAmount === undefined
              ? {}
              : { cancelAmount: input.cancelAmount }),
          },
          idempotencyKey: input.idempotencyKey,
        },
      );
    },
  };
}
