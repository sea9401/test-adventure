import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  outpostOccupations,
  outpostTreasury,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { treasuryShares } from "@/adventure/data/v2/outposts";

// POST /api/v2/outpost/treasury/claim — 점령 길드원이 거점 금고 세금 회수.
//
// body: { outpostId }
// 검증: 거점 점령 중 + 호출자가 점령 길드원.
// 분배: treasuryShares (회수자 10% / 길드 나머지 — outposts.ts 단일 출처).
//   (회수자 몫이 character.v2.gold, 나머지가 v2_guild_resources.gold 로)
// 금고 0 으로. G=0 이면 400 empty.
// 주의: 점령/함락 시 outpost/claim 이 같은 분배로 자동 회수하므로, 이 수동 회수는
// 자동 회수 도입 전 점령분 등 잔여 금고용으로 유지.

type CharSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { outpostId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId =
    typeof body.outpostId === "string" && body.outpostId.length > 0
      ? body.outpostId
      : null;
  if (!outpostId) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 1) 거점 점령 상태 lock
    const occRow = (
      await tx
        .select()
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    if (!occRow || occRow.occupiedByGuildId == null) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" as const },
      };
    }
    const occupyingGuildId = occRow.occupiedByGuildId;

    // 2) 호출자가 점령 길드원인지
    const viewerGuildId = await getGuildId(tx, userId);
    if (viewerGuildId == null || viewerGuildId !== occupyingGuildId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_member" as const },
      };
    }

    // 3) 거점 금고 lock + read
    const treasuryRow = (
      await tx
        .select()
        .from(outpostTreasury)
        .where(eq(outpostTreasury.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    const total = Math.max(0, treasuryRow?.gold ?? 0);
    if (total <= 0) {
      return {
        status: 400,
        body: { ok: false as const, error: "empty" as const },
      };
    }

    // 4) 분배 — 회수자 몫 / 길드 나머지 (outposts.ts 단일 출처).
    const { claimerShare, guildShare } = treasuryShares(total);

    // 5) 회수자 character.v2.gold +claimerShare
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const newCharGold = Math.max(0, charSave.gold ?? 0) + claimerShare;
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: newCharGold,
    });

    // 6) 길드 공용 자원 풀 gold += guildShare
    const resources = await lockGuildResources(tx, occupyingGuildId);
    const newGuildGold = resources.gold + guildShare;
    await upsertGuildResources(tx, occupyingGuildId, {
      ...resources,
      gold: newGuildGold,
    });

    // 7) 거점 금고 0 으로
    await tx
      .update(outpostTreasury)
      .set({ gold: 0, updatedAt: sql`now()` })
      .where(eq(outpostTreasury.outpostId, outpostId));

    return {
      status: 200,
      body: {
        ok: true as const,
        total,
        claimerShare,
        guildShare,
        charGold: newCharGold,
        guildGold: newGuildGold,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
