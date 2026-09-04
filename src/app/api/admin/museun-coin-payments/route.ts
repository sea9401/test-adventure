import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdminRole } from "@/lib/server/isAdmin";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import { reconcilePaymentOrder } from "@/lib/server/museunCoinPayments";
import {
  approveMuseunCoinRefund,
  listMuseunCoinPaymentOperations,
  MuseunCoinRefundError,
  rejectMuseunCoinRefund,
} from "@/lib/server/museunCoinRefunds";

export async function GET(req: Request): Promise<Response> {
  const gate = await requireAdminRole("readonly");
  if (gate) return gate;
  const url = new URL(req.url);
  const data = await listMuseunCoinPaymentOperations({
    query: url.searchParams.get("query")?.slice(0, 100) ?? undefined,
    status: url.searchParams.get("status")?.slice(0, 40) ?? undefined,
  });
  return Response.json({ ok: true, ...data });
}

export async function POST(req: Request): Promise<Response> {
  const gate = await requireAdminRole("super");
  if (gate) return gate;
  const config = readMuseunCoinPaymentConfig();
  if (!config) {
    return Response.json({ ok: false, error: "payments_disabled" }, { status: 409 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 2 || reason.length > 500) {
    return Response.json({ ok: false, error: "invalid_reason" }, { status: 400 });
  }
  const adminEmail = await currentAdminEmail();
  try {
    if (
      body.action === "approve_refund" &&
      typeof body.refundId === "string" &&
      typeof body.coins === "number"
    ) {
      const refund = await approveMuseunCoinRefund(
        { refundId: body.refundId, coins: body.coins, reason, adminEmail },
        config,
      );
      await logAdminAction({
        adminEmail,
        action: "museun-coin-payment.refund.approve",
        detail: { refundId: body.refundId, coins: body.coins, reason },
      });
      return Response.json({ ok: true, refund });
    }
    if (body.action === "reject_refund" && typeof body.refundId === "string") {
      const refund = await rejectMuseunCoinRefund({ refundId: body.refundId, adminEmail });
      await logAdminAction({
        adminEmail,
        action: "museun-coin-payment.refund.reject",
        detail: { refundId: body.refundId, reason },
      });
      return Response.json({ ok: true, refund });
    }
    if (body.action === "reconcile_order" && typeof body.orderId === "string") {
      const order = await reconcilePaymentOrder({ orderId: body.orderId }, config);
      await logAdminAction({
        adminEmail,
        action: "museun-coin-payment.order.reconcile",
        detail: { orderId: body.orderId, reason },
      });
      return Response.json({ ok: true, order });
    }
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (error) {
    if (error instanceof MuseunCoinRefundError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
