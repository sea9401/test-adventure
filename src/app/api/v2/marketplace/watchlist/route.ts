import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  isWatchListingId,
  MARKETPLACE_WATCHLIST_LIMIT,
  MARKETPLACE_WATCHLIST_SAVE_KEY as KEY,
  parseWatchIds,
} from "@/adventure/data/v2/marketplaceWatchlist";

async function authorize(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:watchlist",
    userLimit: 120,
    ipLimit: 600,
    windowMs: 60_000,
  }) ?? userId;
}

export async function GET(req: Request) {
  const userId = await authorize(req);
  if (typeof userId !== "string") return userId;
  const saved = await readSave<{ ids?: unknown }>(db, userId, KEY, {});
  return Response.json(
    { ok: true, ids: parseWatchIds(saved.ids) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: Request) {
  const userId = await authorize(req);
  if (typeof userId !== "string") return userId;
  const body = await req.json().catch(() => null) as {
    action?: unknown;
    id?: unknown;
    ids?: unknown;
  } | null;
  const valid = body && (
    body.action === "clear" ||
    ((body.action === "add" || body.action === "remove") && isWatchListingId(body.id)) ||
    (body.action === "import" && Array.isArray(body.ids) &&
      body.ids.length <= MARKETPLACE_WATCHLIST_LIMIT && body.ids.every(isWatchListingId))
  );
  if (!valid) {
    return Response.json({ ok: false, error: "invalid_watchlist_action" }, { status: 400 });
  }
  const result = await db.transaction(async tx => {
    // 최초 저장도 같은 행을 잠그도록 먼저 충돌 안전하게 생성한다.
    await tx.insert(savesKv)
      .values({ userId, key: KEY, value: { ids: [] }, version: 1 })
      .onConflictDoNothing();
    const saved = await lockSaveForUpdate<{ ids?: unknown }>(tx, userId, KEY, {});
    const ids = new Set(parseWatchIds(saved.ids));
    if (body.action === "clear") ids.clear();
    if (body.action === "add") ids.add(body.id as number);
    if (body.action === "remove") ids.delete(body.id as number);
    if (body.action === "import") {
      for (const id of body.ids as number[]) ids.add(id);
    }
    if (ids.size > MARKETPLACE_WATCHLIST_LIMIT) {
      return { ok: false as const, error: "watchlist_limit" };
    }
    await upsertSave(tx, userId, KEY, { ids: [...ids] });
    return { ok: true as const, ids: [...ids] };
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
