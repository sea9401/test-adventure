import {
  isMuseunCoinCheckoutStep,
  museunCoinCheckoutEventType,
  sanitizeCheckoutCode,
} from "@/lib/museunCoinCheckoutSteps";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { ensureUser } from "@/lib/server/ensureUser";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import {
  getPaymentOrderForUser,
  MuseunCoinPaymentError,
} from "@/lib/server/museunCoinPayments";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// POST /api/v2/museun-coin-payments/orders/{orderId}/steps — 결제 단계 기록.
// 결제창을 열었는지, 결제하기를 눌렀는지, 어떤 코드로 실패했는지를 남긴다. 주문 상태와 코인에는 영향이 없다.
export async function POST(
  req: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  if (!readMuseunCoinPaymentConfig()) return new Response(null, { status: 404 });
  const userId = await ensureUser();
  if (!userId) {
    return process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true"
      ? Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
      : new Response(null, { status: 404 });
  }
  if (!(await canAccessMuseunCoinShop(userId))) {
    return new Response(null, { status: 404 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:museun-coin:checkout-step",
    userLimit: 30,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { step?: unknown; code?: unknown }
    | null;
  if (!isMuseunCoinCheckoutStep(body?.step)) {
    return Response.json({ ok: false, error: "bad_step" }, { status: 400 });
  }
  try {
    const { orderId } = await context.params;
    const order = await getPaymentOrderForUser(userId, orderId);
    const code = sanitizeCheckoutCode(body.code);
    recordEconomyEventSoon({
      userId,
      eventType: museunCoinCheckoutEventType(body.step),
      itemKind: "museun_coin_order",
      itemId: order.orderId,
      detail: {
        packageId: order.packageId,
        amountKrw: order.amountKrw,
        ...(code ? { code } : {}),
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MuseunCoinPaymentError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
