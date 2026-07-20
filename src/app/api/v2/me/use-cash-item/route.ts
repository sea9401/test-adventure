import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MUSEUN_CASH_ITEMS,
  isMuseunCashItemId,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import {
  ADVENTURE_SUPPORT_PASS,
  grantAdventureSupport,
} from "@/adventure/data/v2/adventureSupport";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  staminaOverchargeCap,
} from "@/adventure/v2/stamina";

type CharacterSave = {
  cashItems?: unknown;
  adventureSupport?: unknown;
  stamina?: unknown;
  [key: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:use-cash-item",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { itemId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMuseunCashItemId(body.itemId)) return bad("invalid_item");
  const itemId = body.itemId;
  const item = MUSEUN_CASH_ITEMS[itemId];
  if (item.effect.kind !== "adventure_support") {
    return bad("use_elsewhere");
  }
  const supportDays = item.effect.days;

  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const cashItems = removeMuseunCashItem(character.cashItems, itemId, 1);
    if (!cashItems) {
      return {
        status: 403,
        body: { ok: false as const, error: "not_owned" },
      };
    }
    const grant = grantAdventureSupport(
      character.adventureSupport,
      supportDays,
      now,
    );
    if (!grant) {
      return {
        status: 400,
        body: { ok: false as const, error: "invalid_item" },
      };
    }

    let nextCharacter: CharacterSave = {
      ...character,
      cashItems,
      adventureSupport: grant.state,
    };
    if (grant.firstActivation) {
      const previousConfig = staminaConfigForCharacter(character, now);
      const nextConfig = staminaConfigForCharacter(nextCharacter, now);
      const current = applyRegen(
        parseStaminaFromSave(character.stamina, now),
        now,
        previousConfig.max,
        previousConfig.regenBonusPct,
      );
      nextCharacter = {
        ...nextCharacter,
        stamina: {
          current: Math.min(
            staminaOverchargeCap(nextConfig.max),
            current.current + ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
          ),
          lastUpdatedAt: current.lastUpdatedAt,
        },
      };
    }

    await upsertSave(tx, userId, "character.v2", nextCharacter);
    return {
      status: 200,
      body: {
        ok: true as const,
        itemId,
        cashItems,
        activeUntil: grant.state.activeUntil,
        daysAdded: grant.days,
        firstActivation: grant.firstActivation,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
