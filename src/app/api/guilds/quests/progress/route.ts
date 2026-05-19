import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  guildQuestInstances,
  guilds,
  marketplaceInbox,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  applyGuildQuestKills,
  type GuildQuestKill,
} from "@/lib/server/guildQuestKills";
import {
  QUEST_PROGRESS_CAP_PER_CALL,
  getGuildQuestById,
} from "@/adventure/data/guildQuests";

// POST /api/guilds/quests/progress — 멤버의 활동을 활성 의뢰 카운터에 반영.
// body: { kind: 'kill_monster'|'kill_boss'|'collect_material', name?, materialId?, count }
//
// kill_* 는 `applyGuildQuestKills` 헬퍼에 위임 (autoHunt apply 와 공유).
// collect_material 은 여기서 직접 처리.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  let body: {
    kind?: unknown;
    name?: unknown;
    materialId?: unknown;
    count?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const reqKind = body.kind;
  const reqCount = Math.floor(Number(body.count));
  if (
    typeof reqKind !== "string" ||
    !Number.isFinite(reqCount) ||
    reqCount <= 0
  ) {
    return new Response("invalid body", { status: 400 });
  }
  const delta = Math.min(reqCount, QUEST_PROGRESS_CAP_PER_CALL);

  try {
    if (reqKind === "kill_monster" || reqKind === "kill_boss") {
      const name = body.name;
      if (typeof name !== "string" || name.length === 0) {
        return new Response("invalid body", { status: 400 });
      }
      const kill: GuildQuestKill = { kind: reqKind, name, count: delta };
      const out = await db.transaction((tx) =>
        applyGuildQuestKills(tx, userId, [kill]),
      );
      const matched = out.matchedQuests > 0;
      return Response.json({
        ok: true as const,
        matched,
        reason: matched ? undefined : "no_match",
        fameAdded: out.fameAdded,
      });
    }

    if (reqKind === "collect_material") {
      const materialId = body.materialId;
      if (typeof materialId !== "string") {
        return new Response("invalid body", { status: 400 });
      }
      const result = await db.transaction(async (tx) => {
        const myRows = await tx
          .select({ guildId: guildMembers.guildId })
          .from(guildMembers)
          .where(eq(guildMembers.userId, userId))
          .limit(1);
        if (myRows.length === 0) {
          return { ok: true as const, matched: false, reason: "no_guild" };
        }
        const guildId = myRows[0].guildId;
        const guildRows = await tx
          .select()
          .from(guilds)
          .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)))
          .for("update");
        if (guildRows.length === 0) {
          return { ok: true as const, matched: false, reason: "no_guild" };
        }
        const activeRows = await tx
          .select()
          .from(guildQuestInstances)
          .where(
            and(
              eq(guildQuestInstances.guildId, guildId),
              eq(guildQuestInstances.status, "active"),
            ),
          )
          .for("update");
        if (activeRows.length === 0) {
          return { ok: true as const, matched: false, reason: "no_active" };
        }

        let matched = false;
        let fameAdded = 0;
        for (const inst of activeRows) {
          const def = getGuildQuestById(inst.questDefId);
          if (!def) continue;
          const t = def.task;
          if (t.kind !== "collect_material" || t.materialId !== materialId) {
            continue;
          }
          matched = true;
          const before = inst.progress;
          const target = inst.target;
          const next = Math.min(before + delta, target);
          if (next === before) continue;
          const reachedTarget = next >= target;
          const now = new Date();
          await tx
            .update(guildQuestInstances)
            .set({
              progress: next,
              status: reachedTarget ? "completed" : "active",
              completedAt: reachedTarget ? now : null,
            })
            .where(eq(guildQuestInstances.id, inst.id));
          if (reachedTarget) {
            const f = def.reward.fame;
            fameAdded += f;
            await tx
              .update(guilds)
              .set({
                fameTotal: sql`${guilds.fameTotal} + ${f}`,
                fameAvailable: sql`${guilds.fameAvailable} + ${f}`,
              })
              .where(eq(guilds.id, guildId));
            const memberRows = await tx
              .select({ userId: guildMembers.userId })
              .from(guildMembers)
              .where(eq(guildMembers.guildId, guildId));
            if (memberRows.length > 0) {
              await tx.insert(marketplaceInbox).values(
                memberRows.map((m) =>
                  inboxValues({
                    userId: m.userId,
                    payload: {
                      kind: "guild_quest_reward",
                      quest_id: def.id,
                      quest_name: def.name,
                      gold: def.reward.goldPerMember,
                      materials: def.reward.materialsPerMember ?? [],
                      items: def.reward.itemsPerMember ?? [],
                    },
                    message: `${def.name} 완료 보상`,
                  }),
                ),
              );
            }
          }
        }
        return {
          ok: true as const,
          matched,
          reason: matched ? undefined : "no_match",
          fameAdded,
        };
      });
      return Response.json(result);
    }

    return new Response("invalid body", { status: 400 });
  } catch (e) {
    console.error("[guilds.quests.progress.POST] ", e);
    return new Response("internal error", { status: 500 });
  }
}
