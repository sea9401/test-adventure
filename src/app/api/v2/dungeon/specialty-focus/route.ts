import {
  isUnexploredSpecialtyPoolId,
  parseUnexploredHuntMode,
  type UnexploredHuntMode,
} from "@/adventure/data/v2/unexploredSpecialtyPools";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import type { HuntCharacterSave } from "../hunt/huntCharacter";

const UNEXPLORED_SPECIALTY_UNLOCK_DEPTH = 79;

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function unlocked(character: HuntCharacterSave): boolean {
  return Number(character.frontierDepth) >= UNEXPLORED_SPECIALTY_UNLOCK_DEPTH;
}

function parseRequestedMode(raw: unknown): UnexploredHuntMode | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { mode?: unknown; poolId?: unknown };
  if (value.mode === "standard") return { mode: "standard" };
  if (value.mode === "random") return { mode: "random" };
  if (value.mode !== "focused") return null;
  return isUnexploredSpecialtyPoolId(value.poolId)
    ? { mode: "focused", poolId: value.poolId }
    : null;
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  const character = await readSave<HuntCharacterSave>(
    db,
    userId,
    "character.v2",
    {},
  );
  return Response.json({
    ok: true,
    unlocked: unlocked(character),
    mode: parseUnexploredHuntMode(character.unexploredHuntMode),
  });
}

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

  const body = await request.json().catch(() => null);
  const mode = parseRequestedMode(body);
  if (!mode) {
    const poolId = body && typeof body === "object"
      ? (body as { poolId?: unknown }).poolId
      : undefined;
    return typeof poolId === "string" || (body as { mode?: unknown } | null)?.mode === "focused"
      ? bad("invalid_specialty_pool")
      : bad("invalid_specialty_mode");
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<HuntCharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    if (!unlocked(character)) {
      return { status: 403, body: { ok: false as const, error: "specialty_locked" } };
    }

    const next = {
      ...character,
      unexploredHuntMode: mode,
    };
    await upsertSave(tx, userId, "character.v2", next);
    return { status: 200, body: { ok: true as const, mode } };
  });

  return Response.json(result.body, { status: result.status });
}
