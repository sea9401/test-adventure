import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  outpostLords,
  outpostOccupations,
  outpostTreasury,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { guildOwningOutpost } from "@/lib/server/v2Settlement";
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  LORD_HARVEST_COOLDOWN_MS,
  V2_SETTLEMENT_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";

// 정착지 전쟁 — 거점 영주 지정/조회. 설계: docs/v2-settlement-warfare-plan.md §2.4.
//   POST { outpostId, userId, action: "set"|"clear" } — 점령 길드 마스터/관리자만.
//   GET ?outpostId= — 현재 영주(현재 점령길드 필터·스테일 제외) + 거점 금고 잔액.
//   플래그 off → 404.

export async function GET(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const url = new URL(req.url);
  const outpostId = url.searchParams.get("outpostId") ?? "";
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }
  const occ = (
    await db
      .select({ g: outpostOccupations.occupiedByGuildId })
      .from(outpostOccupations)
      .where(eq(outpostOccupations.outpostId, outpostId))
      .limit(1)
  )[0];
  const ownerGuildId = occ?.g ?? null;
  const lordRow =
    ownerGuildId == null
      ? undefined
      : (
          await db
            .select()
            .from(outpostLords)
            .where(eq(outpostLords.outpostId, outpostId))
            .limit(1)
        )[0];
  // 스테일 가드 — 영주 행의 길드가 현재 점령 길드와 다르면(거점 양도) 영주 없음 취급.
  const lord = lordRow && lordRow.guildId === ownerGuildId ? lordRow : null;
  const tRow = (
    await db
      .select({ gold: outpostTreasury.gold })
      .from(outpostTreasury)
      .where(eq(outpostTreasury.outpostId, outpostId))
      .limit(1)
  )[0];
  const now = Date.now();
  const lastMs = lord?.lastHarvestAt ? lord.lastHarvestAt.getTime() : null;
  const nextMs = lastMs != null ? lastMs + LORD_HARVEST_COOLDOWN_MS : null;
  return Response.json({
    ok: true,
    lord: lord
      ? {
          userId: lord.userId,
          name: await resolveUserDisplayName(lord.userId),
          lastHarvestAt: lord.lastHarvestAt?.toISOString() ?? null,
          onCooldown: nextMs != null && nextMs > now,
          nextHarvestAt: nextMs != null ? new Date(nextMs).toISOString() : null,
        }
      : null,
    treasuryGold: Math.max(0, tRow?.gold ?? 0),
  });
}

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; userId?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  const action = body.action;
  if (!outpostId) {
    return Response.json(
      { ok: false, error: "missing_outpost" },
      { status: 400 },
    );
  }
  if (action !== "set" && action !== "clear") {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  if (action === "set" && !targetUserId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  // lock 순서: occupation FOR UPDATE(guildOwningOutpost) → 영주 행 변경. 마스터/관리자 전용.
  const gate = await db.transaction(async (tx) => {
    const guildId = await guildOwningOutpost(tx, userId, outpostId);
    if (guildId == null) {
      return { ok: false as const, status: 403, error: "not_owner" };
    }
    if (!(await isGuildMasterOrManager(tx, guildId, userId))) {
      return { ok: false as const, status: 403, error: "not_authorized" };
    }
    if (action === "clear") {
      await tx.delete(outpostLords).where(eq(outpostLords.outpostId, outpostId));
      return { ok: true as const };
    }
    // set — 임명 대상이 그 길드 멤버여야 함.
    const member = (
      await tx
        .select({ u: guildMembers.userId })
        .from(guildMembers)
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.userId, targetUserId),
          ),
        )
        .limit(1)
    )[0];
    if (!member) {
      return { ok: false as const, status: 400, error: "not_member" };
    }
    // 거점당 1인(outpostId PK). 재임명 시 lastHarvestAt 보존 = 쿨다운은 거점(금고) 단위 —
    //   영주를 갈아끼워 6h 수확 쿨을 리셋하는 우회 차단. 신규 행만 null(values 기본).
    await tx
      .insert(outpostLords)
      .values({ outpostId, userId: targetUserId, guildId, lastHarvestAt: null })
      .onConflictDoUpdate({
        target: outpostLords.outpostId,
        set: { userId: targetUserId, guildId },
      });
    return { ok: true as const };
  });
  if (!gate.ok) {
    return Response.json(
      { ok: false, error: gate.error },
      { status: gate.status },
    );
  }
  return Response.json({ ok: true });
}
