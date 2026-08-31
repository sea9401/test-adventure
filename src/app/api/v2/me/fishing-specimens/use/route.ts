import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { isFishId, type FishId } from "@/adventure/data/v2/fish";
import {
  FISHING_CODEX_KEY,
  fishCodexSpBonus,
  parseFishCodex,
  registerFishSpecimen,
  registeredFishIds,
} from "@/adventure/v2/fishingCodex";
import {
  FISH_SPECIMEN_SAVE_KEY,
  fishSpecimenItemId,
  parseFishSpecimenInventory,
  removeFishSpecimen,
} from "@/adventure/v2/fishSpecimens";

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let fishId: FishId | null = null;
  try {
    const body = (await request.json()) as { fishId?: unknown };
    if (typeof body.fishId === "string" && isFishId(body.fishId)) fishId = body.fishId;
  } catch {
    // 아래 입력 오류로 정규화한다.
  }
  if (!fishId) {
    return Response.json({ ok: false, error: "invalid_fish_id" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const codex = parseFishCodex(
      await lockSaveForUpdate(tx, userId, FISHING_CODEX_KEY, {}),
    );
    const specimens = parseFishSpecimenInventory(
      await lockSaveForUpdate(tx, userId, FISH_SPECIMEN_SAVE_KEY, {}),
    );
    if (codex.fish[fishId]?.registered) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_registered" as const },
      };
    }
    const nextSpecimens = removeFishSpecimen(specimens, fishId);
    if (!nextSpecimens) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_owned" as const },
      };
    }

    const fishSpBefore = fishCodexSpBonus(codex);
    const registered = registerFishSpecimen(codex, fishId);
    const fishSpAfter = fishCodexSpBonus(registered.codex);
    await upsertSave(tx, userId, FISHING_CODEX_KEY, registered.codex);
    await upsertSave(tx, userId, FISH_SPECIMEN_SAVE_KEY, nextSpecimens);
    return {
      status: 200,
      body: {
        ok: true as const,
        fishId,
        specimenBalance: nextSpecimens.items[fishId] ?? 0,
        registered: true,
        registeredIds: registeredFishIds(registered.codex),
        fishSpBefore,
        fishSpAfter,
      },
    };
  });

  if (result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "fish_specimen.use",
      itemKind: "consumable",
      itemId: fishSpecimenItemId(fishId),
      quantity: -1,
      detail: { fishId },
    });
  }
  return Response.json(result.body, { status: result.status });
}
