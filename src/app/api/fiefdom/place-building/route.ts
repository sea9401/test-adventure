import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiefdoms, guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
} from "@/adventure/fiefdom/builderData";
import { applyTick } from "@/adventure/fiefdom/tick";
import type {
  Building,
  BuildingType,
  FiefdomState,
  ResourceBag,
} from "@/adventure/fiefdom/types";

// POST /api/fiefdom/place-building — 건물 배치 intent.
// 본문: { type: BuildingType, x: number, y: number }.
// 서버에서 tick → 비용/위치/중복 검증 → 적용 → state 반환.

const VALID_TYPES: BuildingType[] = [
  "townhall",
  "goldmine",
  "lumbermill",
  "farm",
  "barracks",
];

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

  let body: { type?: unknown; x?: unknown; y?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (
    typeof body.type !== "string" ||
    !(VALID_TYPES as string[]).includes(body.type) ||
    typeof body.x !== "number" ||
    !Number.isInteger(body.x) ||
    typeof body.y !== "number" ||
    !Number.isInteger(body.y)
  ) {
    return Response.json({ error: "bad_intent" }, { status: 400 });
  }
  const type = body.type as BuildingType;
  const x = body.x;
  const y = body.y;

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

      // 검증.
      const def = BUILDINGS[type];
      if (def.max && ticked.buildings.filter((b) => b.type === type).length >= def.max) {
        return { kind: "error" as const, status: 409, reason: "max_reached" };
      }
      const s = def.size;
      if (x < 0 || y < 0 || x + s > GRID_W || y + s > GRID_H) {
        return { kind: "error" as const, status: 400, reason: "out_of_bounds" };
      }
      for (let dx = 0; dx < s; dx++) {
        for (let dy = 0; dy < s; dy++) {
          const collision = ticked.buildings.find((b) => {
            const bs = BUILDINGS[b.type].size;
            return x + dx >= b.x && x + dx < b.x + bs && y + dy >= b.y && y + dy < b.y + bs;
          });
          if (collision) return { kind: "error" as const, status: 409, reason: "occupied" };
        }
      }
      for (const k of Object.keys(def.cost) as Array<keyof ResourceBag>) {
        if ((ticked.resources[k] ?? 0) < (def.cost[k] ?? 0)) {
          return { kind: "error" as const, status: 409, reason: "insufficient_resources" };
        }
      }

      // 적용.
      const resources: ResourceBag = { ...ticked.resources };
      for (const k of Object.keys(def.cost) as Array<keyof ResourceBag>) {
        resources[k] = (resources[k] ?? 0) - (def.cost[k] ?? 0);
      }
      const newBuilding: Building = { type, x, y };
      if (def.produces) newBuilding.lastProduce = now;

      const newState: FiefdomState = {
        ...ticked,
        resources,
        buildings: [...ticked.buildings, newBuilding],
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
    console.error("[fiefdom/place-building] failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
