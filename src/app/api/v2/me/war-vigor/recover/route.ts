import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_SETTLEMENT_WARFARE,
  WAR_VIGOR_FULL_RECOVERY_MS,
  HOTSPRING_VIGOR_RECOVERY_DIVISOR,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { applyVigorRecovery, parseWarVigor } from "@/adventure/data/v2/warVigor";
import { guildHasHotspringAdjacency } from "@/lib/server/tileHotspring";

// 정착지 전쟁 — 치료소 건강도 회복. 설계: docs/v2-settlement-warfare-plan.md §2.1.
//   건강도(전쟁 전용 HP/MP 이월)는 일반 HP/MP 와 별개로, 시간이 지나며 회복분이 누적되고
//   치료소에 "방문(POST)"하면 그만큼 적용된다(수확창과 같은 로그인 리듬).
//   GET — 현재 저장된 건강도(회복 미적용·표시용). POST — 경과 회복 적용 후 저장.
//   플래그 off → 404.

type WarVigorSave = { warVigor?: unknown; [k: string]: unknown };

export async function GET() {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
  )[0];
  const save = (row?.value ?? {}) as WarVigorSave;
  return Response.json({ ok: true, warVigor: parseWarVigor(save.warVigor) });
}

export async function POST() {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const warVigor = await db.transaction(async (tx) => {
    const save = await lockSaveForUpdate<WarVigorSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    // 온천 인접 정착지 보유 길드원은 회복 가속(분모÷divisor) — docs §2.3.
    const guildRow = (
      await tx
        .select({ id: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, userId))
        .limit(1)
    )[0];
    const fullRecoveryMs = (await guildHasHotspringAdjacency(
      tx,
      guildRow?.id ?? null,
    ))
      ? WAR_VIGOR_FULL_RECOVERY_MS / HOTSPRING_VIGOR_RECOVERY_DIVISOR
      : WAR_VIGOR_FULL_RECOVERY_MS;
    const recovered = applyVigorRecovery(
      parseWarVigor(save.warVigor),
      Date.now(),
      fullRecoveryMs,
    );
    await upsertSave(tx, userId, "character.v2", { ...save, warVigor: recovered });
    return recovered;
  });
  return Response.json({ ok: true, warVigor });
}
