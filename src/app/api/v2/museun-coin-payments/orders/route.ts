import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import {
  createPaymentOrder,
  getPaymentCustomerKey,
  listPaymentOrdersForUser,
  MuseunCoinPaymentError,
} from "@/lib/server/museunCoinPayments";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

function unavailable() {
  return new Response(null, { status: 404 });
}

async function access(): Promise<
  | { ok: false; response: Response }
  | {
      ok: true;
      config: NonNullable<ReturnType<typeof readMuseunCoinPaymentConfig>>;
      userId: string;
    }
> {
  const config = readMuseunCoinPaymentConfig();
  if (!config) return { ok: false, response: unavailable() };
  const userId = await ensureUser();
  if (!userId) {
    return {
      ok: false,
      response:
        process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true"
          ? Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
          : unavailable(),
    };
  }
  if (!(await canAccessMuseunCoinShop(userId))) {
    return { ok: false, response: unavailable() };
  }
  return { ok: true, config, userId };
}

export async function GET(_req: Request): Promise<Response> {
  const gate = await access();
  if (!gate.ok) return gate.response;
  return Response.json({
    ok: true,
    orders: await listPaymentOrdersForUser(gate.userId),
  });
}

export async function POST(req: Request): Promise<Response> {
  const gate = await access();
  if (!gate.ok) return gate.response;
  const limited = enforceUserAndIpRateLimit(req, {
    userId: gate.userId,
    action: "v2:museun-coin-payments:create",
    userLimit: 10,
    ipLimit: 40,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { packageId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.packageId !== "string") {
    return Response.json({ ok: false, error: "invalid_package" }, { status: 400 });
  }

  try {
    const customerKey = await getPaymentCustomerKey(gate.userId);
    const order = await createPaymentOrder(
      gate.userId,
      body.packageId,
      customerKey,
      gate.config,
    );
    return Response.json({ ok: true, ...order }, { status: 201 });
  } catch (error) {
    if (error instanceof MuseunCoinPaymentError) {
      return Response.json(
        { ok: false, error: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
