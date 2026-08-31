import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import {
  applyUnexploredMutation,
  unexploredSnapshot,
  type UnexploredCharacterSave,
  type UnexploredMutation,
  type UnexploredMutationError,
} from "@/lib/server/unexploredService";
import {
  discountedPersonalCraftGoldCost,
  equippedPersonalCraftGoldDiscountPct,
} from "@/lib/server/equipmentLiberationCraftDiscount";
import { UNEXPLORED_SUMMON_STONE_GOLD_COST } from "@/adventure/data/v2/unexploredBosses";

function summonStoneCraftCost(equipment: unknown) {
  const liberationDiscountPct =
    equippedPersonalCraftGoldDiscountPct(equipment);
  return {
    baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
    goldCost: discountedPersonalCraftGoldCost(
      UNEXPLORED_SUMMON_STONE_GOLD_COST,
      liberationDiscountPct,
    ),
    liberationDiscountPct,
  };
}

function unavailable() {
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!V2_UNEXPLORED) return unavailable();
  const [character, equipment] = await Promise.all([
    readSave<UnexploredCharacterSave>(db, userId, "character.v2", {}),
    readSave<unknown>(db, userId, "equipment.v2", {}),
  ]);
  return Response.json({
    ok: true,
    snapshot: {
      ...unexploredSnapshot(character),
      summonStoneCraftCost: summonStoneCraftCost(equipment),
    },
  });
}

function parseMutation(raw: unknown): UnexploredMutation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (source.action === "reset") return { action: "reset" };
  if (
    (source.action === "activate" || source.action === "refund") &&
    typeof source.nodeId === "string" &&
    source.nodeId.length > 0
  ) {
    return { action: source.action, nodeId: source.nodeId };
  }
  return null;
}

function mutationStatus(error: UnexploredMutationError): number {
  return error === "unknown_node" ? 400 : 409;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!V2_UNEXPLORED) return unavailable();
  const mutation = parseMutation(await req.json().catch(() => null));
  if (!mutation) {
    return Response.json(
      { ok: false, error: "invalid_mutation" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<UnexploredCharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const applied = applyUnexploredMutation(character, mutation);
    if (!applied.ok) {
      return {
        status: mutationStatus(applied.error),
        body: { ok: false as const, error: applied.error },
      };
    }
    await upsertSave(tx, userId, "character.v2", applied.character);
    return {
      status: 200,
      body: { ok: true as const, snapshot: applied.snapshot },
    };
  });
  if ("snapshot" in result.body) {
    const equipment = await readSave<unknown>(
      db,
      userId,
      "equipment.v2",
      {},
    );
    return Response.json(
      {
        ...result.body,
        snapshot: {
          ...result.body.snapshot,
          summonStoneCraftCost: summonStoneCraftCost(equipment),
        },
      },
      { status: result.status },
    );
  }
  return Response.json(result.body, { status: result.status });
}
