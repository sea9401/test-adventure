import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import {
  getPaymentOrderForUser,
  MuseunCoinPaymentError,
} from "@/lib/server/museunCoinPayments";

export async function GET(
  _req: Request,
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
  try {
    const { orderId } = await context.params;
    return Response.json({
      ok: true,
      order: await getPaymentOrderForUser(userId, orderId),
    });
  } catch (error) {
    if (error instanceof MuseunCoinPaymentError) {
      return Response.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
}
