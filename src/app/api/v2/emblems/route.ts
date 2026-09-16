import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { mutateEmblems, parseEmblemState, type EmblemMutation } from "@/adventure/data/v2/emblems";

type CharacterSave = Record<string, unknown>;
const MUTATION_ERRORS = new Set(["stale_state", "invalid_slot", "not_owned", "invalid_action", "max_grade", "invalid_material", "material_equipped"]);

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const character = await readSave<CharacterSave | null>(db, userId, "character.v2", null);
  if (!character) return Response.json({ ok: false, error: "no_character" }, { status: 404 });
  return Response.json({ ok: true, emblems: parseEmblemState(character.emblems) });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:emblems", userLimit: 60, ipLimit: 300, windowMs: 60_000 });
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  return db.transaction(async (tx) => {
    // All inventory changes and level-up snapshots serialize through the character row.
    const character = await lockSaveForUpdate<CharacterSave | null>(tx, userId, "character.v2", null);
    if (!character) return Response.json({ ok: false, error: "no_character" }, { status: 404 });
    const current = parseEmblemState(character.emblems);
    let result: ReturnType<typeof mutateEmblems>;
    try {
      result = mutateEmblems(current, body as EmblemMutation);
    } catch (error) {
      if (!(error instanceof Error) || !MUTATION_ERRORS.has(error.message)) throw error;
      return Response.json({ ok: false, error: error.message, emblems: current }, { status: error.message === "stale_state" ? 409 : 400 });
    }
    await upsertSave(tx, userId, "character.v2", { ...character, emblems: result.state });
    return Response.json({ ok: true, emblems: result.state, ...(result.success === undefined ? {} : { success: result.success }) });
  });
}
