import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, outpostVillages } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { validateNationName } from "@/adventure/data/guild";
import {
  NATION_REQUIRED_TIER,
  tierMeetsNation,
  VILLAGE_TIER_NAME,
  type VillageTier,
} from "@/adventure/data/v2/settlement";

// POST /api/v2/guild/nation/declare — 국가 선포 (마스터 전용, 1회).
//
// body: { name }  — 국가명(길드가 직접 지음, 2~16자).
// 게이트:
//   - 길드 마스터일 것.
//   - 아직 국가 미선포(nationName == null).
//   - 보유 마을 중 하나라도 대도시(NATION_REQUIRED_TIER) 등급일 것.
// 효과: guilds.nationName 설정 → 길드 성장(정원 +NATION_MEMBER_BONUS; guildMemberCap 참조).
//
// 🔑 락: guild row 만 FOR UPDATE(선포 직렬화 — 동시 2건 중 하나만 성공). 마을은 게이트
//   확인용 read 만(점령/생산 라우트의 점령행→마을→재화 락 순서와 겹치지 않음 → 데드락 무관).

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.name !== "string") {
    return Response.json({ ok: false, error: "name_required" }, { status: 400 });
  }
  const nameCheck = validateNationName(body.name);
  if (!nameCheck.ok) {
    return Response.json(
      { ok: false, error: "invalid_name", reason: nameCheck.reason },
      { status: 400 },
    );
  }
  const nationName = nameCheck.trimmed;

  const result = await db.transaction(async (tx) => {
    // 내 길드.
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1);
    if (!mem) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    // 길드 row 락 — 선포 직렬화 + 마스터/미선포 확인.
    const [guild] = await tx
      .select({
        masterId: guilds.masterId,
        nationName: guilds.nationName,
      })
      .from(guilds)
      .where(and(eq(guilds.id, mem.guildId), isNull(guilds.disbandedAt)))
      .for("update")
      .limit(1);
    if (!guild) {
      return {
        status: 404,
        body: { ok: false as const, error: "guild_not_found" },
      };
    }
    if (guild.masterId !== userId) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_master" },
      };
    }
    if (guild.nationName != null) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "already_nation",
          nationName: guild.nationName,
        },
      };
    }

    // 대도시 등급 마을 보유 게이트 — 보유 마을 중 하나라도 충족하면 통과.
    const villages = await tx
      .select({ tier: outpostVillages.tier })
      .from(outpostVillages)
      .where(eq(outpostVillages.guildId, mem.guildId));
    const hasMetropolis = villages.some((v) =>
      tierMeetsNation(v.tier as VillageTier),
    );
    if (!hasMetropolis) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "no_metropolis",
          requiredTier: VILLAGE_TIER_NAME[NATION_REQUIRED_TIER],
        },
      };
    }

    await tx
      .update(guilds)
      .set({ nationName, nationDeclaredAt: new Date() })
      .where(eq(guilds.id, mem.guildId));

    await logGuildActivity(tx, {
      guildId: mem.guildId,
      type: "nation_declare",
      actorUserId: userId,
      meta: { nationName },
    });

    return {
      status: 200,
      body: { ok: true as const, nationName },
    };
  });

  return Response.json(result.body, { status: result.status });
}
