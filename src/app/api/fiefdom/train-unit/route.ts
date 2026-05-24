import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiefdoms, guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { UNITS } from "@/adventure/fiefdom/builderData";
import { applyTick } from "@/adventure/fiefdom/tick";
import type {
  FiefdomState,
  ResourceBag,
  UnitType,
} from "@/adventure/fiefdom/types";

// POST /api/fiefdom/train-unit — 유닛 훈련 예약 intent.
// 본문: { type: UnitType }. 병영 보유 + 비용 검증 후 큐에 추가.

const VALID_TYPES: UnitType[] = ["warrior", "archer"];

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const membership = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!membership[0]) {
    return Response.json({ error: "no_guild" }, { status: 403 });
  }
  const guildId = membership[0].guildId;

  let body: { type?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.type !== "string" || !(VALID_TYPES as string[]).includes(body.type)) {
    return Response.json({ error: "bad_intent" }, { status: 400 });
  }
  const type = body.type as UnitType;

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(fiefdoms)
        .where(eq(fiefdoms.guildId, guildId))
        .limit(1)
        .for("update");
      if (!rows[0]) return { kind: "error" as const, status: 404, reason: "fiefdom_missing" };

      const now = Date.now();
      const { state: ticked } = applyTick(rows[0].state as FiefdomState, now);

      const def = UNITS[type];
      if (!ticked.buildings.some((b) => b.type === "barracks")) {
        return { kind: "error" as const, status: 409, reason: "no_barracks" };
      }
      for (const k of Object.keys(def.cost) as Array<keyof ResourceBag>) {
        if ((ticked.resources[k] ?? 0) < (def.cost[k] ?? 0)) {
          return { kind: "error" as const, status: 409, reason: "insufficient_resources" };
        }
      }

      const resources: ResourceBag = { ...ticked.resources };
      for (const k of Object.keys(def.cost) as Array<keyof ResourceBag>) {
        resources[k] = (resources[k] ?? 0) - (def.cost[k] ?? 0);
      }
      const lastFinish =
        ticked.trainQueue.length > 0
          ? ticked.trainQueue[ticked.trainQueue.length - 1].finishAt
          : now;
      const newState: FiefdomState = {
        ...ticked,
        resources,
        trainQueue: [...ticked.trainQueue, { type, finishAt: lastFinish + def.trainTime }],
      };
      await tx
        .update(fiefdoms)
        .set({ state: newState, updatedAt: new Date(now) })
        .where(eq(fiefdoms.guildId, guildId));

      return { kind: "ok" as const, state: newState };
    });

    if (result.kind === "error") {
      return Response.json({ error: result.reason }, { status: result.status });
    }
    return Response.json({ state: result.state });
  } catch (e) {
    console.error("[fiefdom/train-unit] failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
