import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import {
  MuseunCoinRefundError,
  requestMuseunCoinRefund,
} from "@/lib/server/museunCoinRefunds";
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
  if (!(await canAccessMuseunCoinShop(userId))) return new Response(null, { status: 404 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:museun-coin-payments:refund",
    userLimit: 5,
    ipLimit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as
    | { orderId?: unknown; reason?: unknown }
    | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (
    typeof body?.orderId !== "string" ||
    body.orderId.length < 8 ||
    body.orderId.length > 100 ||
    reason.length < 2 ||
    reason.length > 500
  ) {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  try {
    const refund = await requestMuseunCoinRefund(
      userId,
      { orderId: body.orderId, reason },
      config,
    );
    return Response.json({ ok: true, refund });
  } catch (error) {
    if (error instanceof MuseunCoinRefundError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
