import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";

export async function GET() {
  const userId = await ensureUser();
  if (!userId || !(await canAccessMuseunCoinShop(userId))) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

  return Response.json(
    { ok: true },
    { headers: { "cache-control": "private, no-store" } },
  );
}
