import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { guildOwningOutpost } from "@/lib/server/v2Settlement";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import {
  FORT_MAX_HP,
  currentFortHp,
  repairHpFromGold,
  REPAIR_GOLD_PER_HP,
} from "@/adventure/data/v2/outpostSiege";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// 정착지 전쟁 — 성벽 수동 수리. 공성 자동 수리(옛 길드 금고 자동 보강)를 폐지하고
//   수비 길드가 직접 골드를 써서 성벽을 보강하는 능동 방어로 대체한다.
//   POST { outpostId } — 점령 길드원이 길드 금고 골드로 성벽을 결손분만큼(보유 골드 한도) 수리.
//     HP 1 당 REPAIR_GOLD_PER_HP 골드. 부족하면 살 수 있는 만큼만.
//   게이트: V2_SETTLEMENT_WARFARE on + 점령 길드 멤버(guildOwningOutpost).
//
//   응답: { ok, fortHp, fortMaxHp, repairedHp, goldSpent, guildGold }
//     - 미점령/타 길드 → 403  · 이미 풀성벽/골드부족 → repairedHp 0 (ok)

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

  // lock 순서: 점령행(guildOwningOutpost 가 FOR UPDATE) → 길드 금고. 공성/claim 라우트 공통.
  const result = await db.transaction(async (tx) => {
    const guildId = await guildOwningOutpost(tx, userId, outpostId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "not_owner" } };
    }
    // 점령행은 위에서 FOR UPDATE 로 잠금 — 성벽 현재값(재생 반영) 계산용 필드만 추가 read.
    const occ = (
      await tx
        .select({
          fortHp: outpostOccupations.fortHp,
          fortMaxHp: outpostOccupations.fortMaxHp,
          fortUpdatedAt: outpostOccupations.fortUpdatedAt,
        })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .limit(1)
    )[0];
    if (!occ) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_occupied" },
      };
    }
    const fortMaxHp = occ.fortMaxHp ?? FORT_MAX_HP;
    const fortHpNow = currentFortHp(
      occ.fortHp,
      fortMaxHp,
      occ.fortUpdatedAt,
      new Date(),
    );
    const deficit = fortMaxHp - fortHpNow;
    if (deficit <= 0) {
      // 이미 풀성벽 — 수리할 게 없음(골드 미소모).
      const dr = await lockGuildResources(tx, guildId);
      return {
        status: 200,
        body: {
          ok: true as const,
          fortHp: fortHpNow,
          fortMaxHp,
          repairedHp: 0,
          goldSpent: 0,
          guildGold: dr.gold,
        },
      };
    }
    // 🔑 lock 먼저 — 잠근 잔액으로 수리 HP 계산(stale 잔액 음수 클램프 차단). repairHpFromGold
    //   가 보유 골드로 hp 를 캡하므로 차감 후 항상 ≥0.
    const dr = await lockGuildResources(tx, guildId);
    const hp = repairHpFromGold(deficit, dr.gold);
    if (hp <= 0) {
      // 골드 부족 — 1 HP 도 못 사는 상태.
      return {
        status: 200,
        body: {
          ok: true as const,
          fortHp: fortHpNow,
          fortMaxHp,
          repairedHp: 0,
          goldSpent: 0,
          guildGold: dr.gold,
        },
      };
    }
    const goldSpent = hp * REPAIR_GOLD_PER_HP;
    const newFortHp = fortHpNow + hp;
    const newGold = dr.gold - goldSpent;
    await tx
      .update(outpostOccupations)
      // fortUpdatedAt 갱신으로 재생 기준점 리셋(수리값에서 다시 재생 시작).
      .set({ fortHp: newFortHp, fortUpdatedAt: new Date() })
      .where(eq(outpostOccupations.outpostId, outpostId));
    await upsertGuildResources(tx, guildId, { gold: newGold });
    return {
      status: 200,
      body: {
        ok: true as const,
        fortHp: newFortHp,
        fortMaxHp,
        repairedHp: hp,
        goldSpent,
        guildGold: newGold,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
