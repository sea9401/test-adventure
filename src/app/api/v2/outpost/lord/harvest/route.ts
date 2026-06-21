import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  outpostLords,
  outpostOccupations,
  outpostTreasury,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import {
  LORD_HARVEST_COOLDOWN_MS,
  LORD_PERSONAL_CUT_FRAC,
  V2_SETTLEMENT_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";

// 정착지 전쟁 — 영주 세금 수확. 설계: docs/v2-settlement-warfare-plan.md §2.4.
//   POST { outpostId } — 영주 본인만. 6h 쿨다운. 거점 금고 → 10% 영주 개인 / 90% 길드 금고.
//   플래그 off → 404. 락 순서: occupation FOR UPDATE → 영주 행 → 금고 → 세이브 → 길드자원.

type GoldSave = { gold?: number; [k: string]: unknown };

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
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
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const occ = (
      await tx
        .select({ g: outpostOccupations.occupiedByGuildId })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    const ownerGuildId = occ?.g ?? null;
    if (ownerGuildId == null) {
      return { status: 400, body: { ok: false as const, error: "not_occupied" } };
    }
    const lord = (
      await tx
        .select()
        .from(outpostLords)
        .where(eq(outpostLords.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    // 영주 본인 + 현재 점령 길드 일치(스테일 제외)만 수확.
    if (!lord || lord.userId !== userId || lord.guildId !== ownerGuildId) {
      return { status: 403, body: { ok: false as const, error: "not_lord" } };
    }
    const lastMs = lord.lastHarvestAt ? lord.lastHarvestAt.getTime() : null;
    if (lastMs != null && now - lastMs < LORD_HARVEST_COOLDOWN_MS) {
      return {
        status: 429,
        body: {
          ok: false as const,
          error: "cooldown",
          nextHarvestAt: new Date(lastMs + LORD_HARVEST_COOLDOWN_MS).toISOString(),
        },
      };
    }

    const tRow = (
      await tx
        .select({ gold: outpostTreasury.gold })
        .from(outpostTreasury)
        .where(eq(outpostTreasury.outpostId, outpostId))
        .for("update")
        .limit(1)
    )[0];
    const total = Math.max(0, tRow?.gold ?? 0);
    if (total <= 0) {
      // 빈 금고 — 쿨다운 소모 없이 no-op(헛수확 방지).
      return {
        status: 200,
        body: {
          ok: true as const,
          total: 0,
          lordCut: 0,
          guildCut: 0,
          nextHarvestAt: null,
        },
      };
    }

    const lordCut = Math.floor(total * LORD_PERSONAL_CUT_FRAC);
    const guildCut = total - lordCut;

    await tx
      .update(outpostTreasury)
      .set({ gold: 0, updatedAt: new Date(now) })
      .where(eq(outpostTreasury.outpostId, outpostId));

    const save = await lockSaveForUpdate<GoldSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...save,
      gold: Math.max(0, (save.gold ?? 0) + lordCut),
    });

    const gr = await lockGuildResources(tx, ownerGuildId);
    await upsertGuildResources(tx, ownerGuildId, { gold: gr.gold + guildCut });

    await tx
      .update(outpostLords)
      .set({ lastHarvestAt: new Date(now) })
      .where(eq(outpostLords.outpostId, outpostId));

    return {
      status: 200,
      body: {
        ok: true as const,
        total,
        lordCut,
        guildCut,
        nextHarvestAt: new Date(now + LORD_HARVEST_COOLDOWN_MS).toISOString(),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
