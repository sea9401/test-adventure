import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { sellGoldValue } from "@/adventure/data/v2/antique";
import {
  TREASURE_COLLECTION_KEY,
  parseTreasureCollection,
  removeInstanceById,
} from "@/adventure/v2/treasureCollection";

// POST /api/v2/treasure/sell — body { instanceId }. 골동품 한 점을 감정사에게 골드로 판매.
// 판매가 = 감정가 × TREASURE_SELL_GOLD_MULT (분해[코인]와 택일 — 골동품의 골드 실현 경로,
// 2026-06-12 신설: 그 전까지 감정가는 표시 전용이었음).
// 락 순서: treasure-collection → character.v2. (역방향으로 두 키를 잡는 경로 없음 —
// dig=session→collection→codex, dismantle=collection→wallet, hunt=character→fragments.)

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const instanceId =
    typeof (body as { instanceId?: unknown })?.instanceId === "string"
      ? (body as { instanceId: string }).instanceId
      : null;
  if (!instanceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const collection = parseTreasureCollection(
      await lockSaveForUpdate(tx, userId, TREASURE_COLLECTION_KEY, {}),
    );
    const removed = removeInstanceById(collection, instanceId);
    // 보관함에 없음(이미 판매/분해/없는 id) — 지급 없이 거부(중복 판매 차단).
    if (!removed) return { kind: "not_found" as const };

    const goldGained = sellGoldValue(
      removed.removed.antiqueId,
      removed.removed.condition,
    );
    await upsertSave(tx, userId, TREASURE_COLLECTION_KEY, removed.collection);

    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const gold = Math.max(0, Math.floor(charSave.gold ?? 0)) + goldGained;
    await upsertSave(tx, userId, "character.v2", { ...charSave, gold });
    return { kind: "sold" as const, goldGained, gold };
  });

  if (outcome.kind === "not_found") {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({
    ok: true,
    goldGained: outcome.goldGained,
    gold: outcome.gold,
  });
}
