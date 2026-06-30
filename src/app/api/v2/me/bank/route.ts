import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { resolveCurrentOutpostId } from "@/adventure/data/v2/outpostGraph";

// POST /api/v2/me/bank — 골드 입금/출금.
// body: { action: "deposit" | "withdraw", amount: number }
//
// 은행 = 사냥 패배 세금 완충용 저축. 입출금은 "안전한 곳"에서만 — 현재 거점이 중립이거나
// 내 길드 소유(또는 미점령 NPC)일 때. 다른 길드 점령 거점(침입 중)에선 불가(unsafe_location).
// → 약탈 나가기 전에 미리 넣어야 하고, 적지에서 위험을 느껴도 숨길 수 없다. 들고 나간 골드가
//   진짜 리스크가 되는 핵심 게이트.

type CharSave = {
  gold?: number;
  bankedGold?: number;
  lastVisitedOutpost?: { outpostId?: string };
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action =
    body.action === "deposit" || body.action === "withdraw"
      ? body.action
      : null;
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount)
      ? Math.floor(body.amount)
      : NaN;
  if (!action) {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ ok: false, error: "bad_amount" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    // 안전 위치 게이트 — 현재 거점이 다른 길드 점령지면 입출금 불가(침입 중엔 못 숨김).
    const currentId = resolveCurrentOutpostId(
      charSave.lastVisitedOutpost?.outpostId,
    );
    const occRow = (
      await tx
        .select({ guildId: outpostOccupations.occupiedByGuildId })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, currentId))
        .limit(1)
    )[0];
    const myGuildId = await getGuildId(tx, userId);
    if (occRow?.guildId != null && occRow.guildId !== myGuildId) {
      return {
        status: 403,
        body: { ok: false as const, error: "unsafe_location" as const },
      };
    }

    const gold = Math.max(0, charSave.gold ?? 0);
    const banked = Math.max(0, charSave.bankedGold ?? 0);
    let nextGold: number;
    let nextBanked: number;
    let moved: number;
    if (action === "deposit") {
      moved = Math.min(amount, gold); // 보유보다 많이 못 넣음.
      nextGold = gold - moved;
      nextBanked = banked + moved;
    } else {
      moved = Math.min(amount, banked); // 입금분보다 많이 못 뺌.
      nextGold = gold + moved;
      nextBanked = banked - moved;
    }
    if (moved <= 0) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error:
            action === "deposit"
              ? ("insufficient_gold" as const)
              : ("insufficient_banked" as const),
        },
      };
    }

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: nextGold,
      bankedGold: nextBanked,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        action,
        moved,
        gold: nextGold,
        bankedGold: nextBanked,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
