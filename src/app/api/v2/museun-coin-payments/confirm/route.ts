import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import {
  confirmPaymentOrder,
  MuseunCoinPaymentError,
} from "@/lib/server/museunCoinPayments";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function POST(req: Request): Promise<Response> {
  const config = readMuseunCoinPaymentConfig();
  if (!config) return new Response(null, { status: 404 });
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
    action: "v2:museun-coin-payments:confirm",
    userLimit: 20,
    ipLimit: 80,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { orderId?: unknown; paymentKey?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.orderId !== "string" ||
    body.orderId.length < 8 ||
    body.orderId.length > 100 ||
    typeof body.paymentKey !== "string" ||
    body.paymentKey.length < 4 ||
    body.paymentKey.length > 200 ||
    typeof body.amount !== "number" ||
    !Number.isSafeInteger(body.amount) ||
    body.amount <= 0
  ) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const order = await confirmPaymentOrder(
      userId,
      { orderId: body.orderId, paymentKey: body.paymentKey, amount: body.amount },
      config,
    );
    return Response.json({ ok: true, order });
  } catch (error) {
    if (error instanceof MuseunCoinPaymentError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
