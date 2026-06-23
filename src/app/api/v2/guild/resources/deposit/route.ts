import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  V2_SETTLEMENT_WARFARE,
  GOLD_PER_HONOR_ON_DEPOSIT,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";

// POST /api/v2/guild/resources/deposit — 길드원이 개인 골드를 길드 공용 골드 풀에 입금.
//
// body: { amount }  — 입금할 골드(양의 정수).
// 길드 골드(v2_guild_resources.gold)는 거점 점령/공성 비용·성벽 자동 수리의 단일 재원.
//   충원이 거점 금고 회수뿐이라 신규 길드가 첫 점령을 못 하던 부트스트랩 데드락의 해소책.
//
// 🔒 락 순서: character.v2 → guild_resources (전역 순서 준수 — guild_resources 항상 마지막).
//   개인 골드는 은행 우선 차감(spendGold; 코어루프 기본). 무소속/잔액 부족 거부.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { amount?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // 정수만(소수 절사 거부) + 안전 정수 범위 — 과도한 값/부동소수 오염 차단.
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return Response.json({ ok: false, error: "bad_amount" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }

    // 개인 골드 lock + 차감(은행 우선).
    const charSave = await lockSaveForUpdate<{
      gold?: number;
      bankedGold?: number;
      [k: string]: unknown;
    }>(tx, userId, "character.v2", {});
    const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
    const banked = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const spend = spendGold(gold, banked, amount);
    if (!spend.ok) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_gold",
          have: gold + banked,
        },
      };
    }
    // 정착지 전쟁 on = 입금 보조 명성(10만골드당 1). off = 명성 미기록(byte-identical).
    const honorDelta = V2_SETTLEMENT_WARFARE
      ? Math.floor(amount / GOLD_PER_HONOR_ON_DEPOSIT)
      : 0;
    const honorBefore = parseHonor(charSave.honor);
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
      // 보유(honor)·누적(honorEarned) 동시 가산. 누적은 길드 명성 적립·본인 누적 표기의 원천.
      ...(honorDelta > 0
        ? {
            honor: honorBefore + honorDelta,
            honorEarned:
              parseHonorEarned(charSave.honorEarned, honorBefore) + honorDelta,
          }
        : {}),
    });

    // 길드 풀 가산 — tx 마지막(락 순서: ... → guild_resources → guilds).
    const resources = await lockGuildResources(tx, guildId);
    const nextGuildGold = resources.gold + amount;
    await upsertGuildResources(tx, guildId, {
      ...resources,
      gold: nextGuildGold,
    });
    // 길드 누적 명성 가산 — 길드원이 획득한 명성만큼(앞으로만·소급 없음). guild_resources 다음.
    await addGuildFame(tx, guildId, honorDelta);

    await logGuildActivity(tx, {
      guildId,
      type: "gold_deposit",
      actorUserId: userId,
      meta: { amount },
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        deposited: amount,
        gold: spend.gold,
        bankedGold: spend.bankedGold,
        guildGold: nextGuildGold,
        ...(V2_SETTLEMENT_WARFARE ? { honorGained: honorDelta } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
