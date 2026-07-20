import { db } from "@/db";
import { randomInt } from "node:crypto";
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
import {
  CHAT_BADGE_VARIANTS,
  CHROMA_NAME_VARIANTS,
  PROFILE_BORDER_VARIANTS,
  chatBadgeDrawWeight,
  chromaNameDrawWeight,
  drawChatBadgeByRoll,
  drawChromaNameByRoll,
  drawProfileBorderByRoll,
  grantChromaName,
  profileBorderDrawWeight,
  unlockMuseunCosmetic,
  unownedChatBadges,
  unownedChromaNames,
  unownedProfileBorders,
} from "@/adventure/data/v2/museunCosmetics";

type CharacterSave = {
  cashItems?: unknown;
  adventureSupport?: unknown;
  stamina?: unknown;
  museunCosmetics?: unknown;
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
  if (item.effect.kind === "chroma_name_box") {
    const result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const available = unownedChromaNames(character.museunCosmetics);
      if (available.length === 0) {
        return {
          status: 409,
          body: { ok: false as const, error: "collection_complete" },
        };
      }
      const cashItems = removeMuseunCashItem(character.cashItems, itemId, 1);
      if (!cashItems) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_owned" },
        };
      }
      const chromaId = drawChromaNameByRoll(
        character.museunCosmetics,
        randomInt(chromaNameDrawWeight(character.museunCosmetics)),
      )!;
      const cosmetics = grantChromaName(character.museunCosmetics, chromaId);
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        cashItems,
        museunCosmetics: cosmetics,
      });
      const chroma = CHROMA_NAME_VARIANTS.find(
        (variant) => variant.id === chromaId,
      )!;
      return {
        status: 200,
        body: {
          ok: true as const,
          itemId,
          cashItems,
          cosmetics,
          chroma,
          remaining: available.length - 1,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  }
  if (item.effect.kind === "profile_border_box") {
    const result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const available = unownedProfileBorders(character.museunCosmetics);
      if (available.length === 0) {
        return {
          status: 409,
          body: { ok: false as const, error: "collection_complete" },
        };
      }
      const cashItems = removeMuseunCashItem(character.cashItems, itemId, 1);
      if (!cashItems) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_owned" },
        };
      }
      const cosmeticItemId = drawProfileBorderByRoll(
        character.museunCosmetics,
        randomInt(profileBorderDrawWeight(character.museunCosmetics)),
      )!;
      const cosmetics = unlockMuseunCosmetic(
        character.museunCosmetics,
        cosmeticItemId,
      ).state;
      const variant = PROFILE_BORDER_VARIANTS.find(
        (candidate) => candidate.itemId === cosmeticItemId,
      )!;
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        cashItems,
        museunCosmetics: cosmetics,
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          itemId,
          cashItems,
          cosmetics,
          cosmetic: { ...variant, slot: "profile_border" as const },
          remaining: available.length - 1,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  }
  if (item.effect.kind === "chat_badge_box") {
    const result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const available = unownedChatBadges(character.museunCosmetics);
      if (available.length === 0) {
        return {
          status: 409,
          body: { ok: false as const, error: "collection_complete" },
        };
      }
      const cashItems = removeMuseunCashItem(character.cashItems, itemId, 1);
      if (!cashItems) {
        return {
          status: 403,
          body: { ok: false as const, error: "not_owned" },
        };
      }
      const cosmeticItemId = drawChatBadgeByRoll(
        character.museunCosmetics,
        randomInt(chatBadgeDrawWeight(character.museunCosmetics)),
      )!;
      const cosmetics = unlockMuseunCosmetic(
        character.museunCosmetics,
        cosmeticItemId,
      ).state;
      const variant = CHAT_BADGE_VARIANTS.find(
        (candidate) => candidate.itemId === cosmeticItemId,
      )!;
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        cashItems,
        museunCosmetics: cosmetics,
      });
      return {
        status: 200,
        body: {
          ok: true as const,
          itemId,
          cashItems,
          cosmetics,
          cosmetic: { ...variant, slot: "chat_badge" as const },
          remaining: available.length - 1,
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  }
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
