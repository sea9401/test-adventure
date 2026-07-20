import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { parseMuseunCashItems } from "@/adventure/data/v2/museunCashItems";
import {
  equipChatBadge,
  equipChromaName,
  equipProfileBorder,
  isChatBadgeItemId,
  isChromaNameId,
  isProfileBorderItemId,
  parseMuseunCosmetics,
} from "@/adventure/data/v2/museunCosmetics";

type CharacterSave = {
  cashItems?: unknown;
  museunCosmetics?: unknown;
  [key: string]: unknown;
};

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const character = await readSave<CharacterSave>(
    db,
    userId,
    "character.v2",
    {},
  );
  return Response.json({
    ok: true,
    cosmetics: parseMuseunCosmetics(character.museunCosmetics),
    cashItems: parseMuseunCashItems(character.cashItems),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:cosmetics:equip",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { slot?: unknown; itemId?: unknown; chromaNameId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const slot = body.slot ?? "chroma_name";
  const itemId = body.slot ? body.itemId : body.chromaNameId;
  if (
    !["chroma_name", "profile_border", "chat_badge"].includes(String(slot))
  ) {
    return Response.json(
      { ok: false, error: "invalid_cosmetic" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    let cosmetics;
    if (slot === "profile_border") {
      if (itemId !== null && !isProfileBorderItemId(itemId)) return null;
      cosmetics = equipProfileBorder(character.museunCosmetics, itemId);
    } else if (slot === "chat_badge") {
      if (itemId !== null && !isChatBadgeItemId(itemId)) return null;
      cosmetics = equipChatBadge(character.museunCosmetics, itemId);
    } else {
      if (itemId !== null && !isChromaNameId(itemId)) return null;
      cosmetics = equipChromaName(character.museunCosmetics, itemId);
    }
    if (!cosmetics) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_owned" },
      };
    }
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      museunCosmetics: cosmetics,
    });
    return { status: 200, body: { ok: true as const, cosmetics } };
  });

  if (!result) {
    return Response.json(
      { ok: false, error: "invalid_cosmetic" },
      { status: 400 },
    );
  }

  return Response.json(result.body, { status: result.status });
}
