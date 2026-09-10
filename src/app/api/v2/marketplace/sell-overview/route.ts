import { ensureUser } from "@/lib/server/ensureUser";
import { readMarketplaceSellOverview } from "@/lib/server/marketplaceSellOverview";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const overview = await readMarketplaceSellOverview(userId);
  return Response.json({ ok: true, ...overview });
}
