import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  createUserGuild,
  GuildCreateError,
} from "@/lib/server/v2EnsureSoloGuild";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";

// POST /api/v2/guild/create — 길드 생성.
// body: { name: string }
// 조건: Lv5 이상 + 골드 5000 차감. 무소속만.
// 응답: { ok: true, guildId } | { ok: false, error }

export const GUILD_CREATE_MIN_LEVEL = 5;
export const GUILD_CREATE_GOLD_COST = 5000;
const NAME_MIN = 2;
const NAME_MAX = 18;

type CharSave = {
  level?: number;
  gold?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (rawName.length < NAME_MIN || rawName.length > NAME_MAX) {
    return Response.json(
      { ok: false, error: "bad_name", min: NAME_MIN, max: NAME_MAX },
      { status: 400 },
    );
  }
  // 한글/영문/숫자/공백만 허용. 공백 연속 trim 은 클라가 처리.
  if (!/^[\p{L}\p{N} _-]+$/u.test(rawName)) {
    return Response.json(
      { ok: false, error: "bad_name_chars" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const level = Math.max(1, charSave.level ?? 1);
    const gold = Math.max(0, charSave.gold ?? 0);
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    if (level < GUILD_CREATE_MIN_LEVEL) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "level_too_low" as const,
          minLevel: GUILD_CREATE_MIN_LEVEL,
          level,
        },
      };
    }
    const spend = spendGold(gold, bankedGold, GUILD_CREATE_GOLD_COST);
    if (!spend.ok) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          required: GUILD_CREATE_GOLD_COST,
          have: gold,
        },
      };
    }
    let guildId: number;
    try {
      guildId = await createUserGuild(tx, userId, rawName);
    } catch (e) {
      if (e instanceof GuildCreateError) {
        return {
          status: 400,
          body: { ok: false as const, error: e.code },
        };
      }
      throw e;
    }
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        guildId,
        gold: spend.gold,
        bankedGold: spend.bankedGold,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
