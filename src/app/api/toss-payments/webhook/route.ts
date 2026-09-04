import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import { reconcilePaymentOrder } from "@/lib/server/museunCoinPayments";

const MAX_WEBHOOK_BYTES = 64 * 1024;
const ACCEPTED_EVENTS = new Set([
  "PAYMENT_STATUS_CHANGED",
  "CANCEL_STATUS_CHANGED",
]);

export async function POST(req: Request): Promise<Response> {
  const config = readMuseunCoinPaymentConfig();
  if (!config) return new Response(null, { status: 404 });
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.eventType !== "string" || !ACCEPTED_EVENTS.has(raw.eventType)) {
    return Response.json({ ok: true, ignored: true });
  }
  const data = raw.data;
  if (!data || typeof data !== "object") {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const event = data as Record<string, unknown>;
  const orderId = typeof event.orderId === "string" ? event.orderId : undefined;
  const paymentKey =
    typeof event.paymentKey === "string" ? event.paymentKey : undefined;
  if (!orderId && !paymentKey) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  await reconcilePaymentOrder({ orderId, paymentKey }, config);
  return Response.json({ ok: true });
}
