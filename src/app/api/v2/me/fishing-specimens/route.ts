import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  FISHING_CODEX_KEY,
  parseFishCodex,
  registeredFishIds,
} from "@/adventure/v2/fishingCodex";
import {
  FISH_SPECIMEN_SAVE_KEY,
  parseFishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [codexRaw, specimensRaw] = await Promise.all([
    readSave(db, userId, FISHING_CODEX_KEY, {}),
    readSave(db, userId, FISH_SPECIMEN_SAVE_KEY, {}),
  ]);
  const codex = parseFishCodex(codexRaw);
  const specimens = parseFishSpecimenInventory(specimensRaw);
  return Response.json({
    ok: true,
    specimens: specimens.items,
    registeredIds: registeredFishIds(codex),
  });
}
