import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { isGuildAdmin } from "@/lib/server/guildAdmin";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { setGuildWarehousePermission } from "@/lib/server/guildWarehouse";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { userId?: unknown; allowed?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const targetUserId = body.userId;
  if (typeof targetUserId !== "string" || typeof body.allowed !== "boolean") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const allowed = body.allowed;

  try {
    const result = await db.transaction(async (tx) => {
      const guildId = await getGuildId(tx, userId);
      if (guildId == null) {
        return { status: 403, body: { ok: false as const, error: "no_guild" } };
      }
      if (!(await isGuildAdmin(tx, guildId, userId))) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_authorized" },
        };
      }
      if (
        !(await lockGuildSettlementBuilding(
          tx,
          guildId,
          "guild_warehouse",
        ))
      ) {
        return {
          status: 409,
          body: { ok: false as const, error: "warehouse_required" },
        };
      }
      const target = (
        await tx
          .select({ role: guildMembers.role })
          .from(guildMembers)
          .where(
            and(
              eq(guildMembers.guildId, guildId),
              eq(guildMembers.userId, targetUserId),
            ),
          )
          .limit(1)
      )[0];
      if (!target) {
        return {
          status: 404,
          body: { ok: false as const, error: "member_not_found" },
        };
      }
      if (target.role === "master" || target.role === "manager") {
        return {
          status: 409,
          body: { ok: false as const, error: "admin_default_access" },
        };
      }

      await setGuildWarehousePermission(tx, {
        guildId,
        userId: targetUserId,
        grantedBy: userId,
        allowed,
      });
      await logGuildActivity(tx, {
        guildId,
        type: "warehouse_permission_change",
        actorUserId: userId,
        targetUserId,
        meta: { permissionEnabled: allowed },
      });
      return {
        status: 200,
        body: { ok: true as const, userId: targetUserId, allowed },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[guild.warehouse.permissions] failed", error);
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
