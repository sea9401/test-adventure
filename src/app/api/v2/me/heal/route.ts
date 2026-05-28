import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";

// POST /api/v2/me/heal — 치료소 만피 회복.
//
// 라이브 룰 차용: gold < 50 이면 무료, 아니면 1G.
// 이미 만피면 410 already_full (UI 버튼은 disabled 이지만 race 방어).
// 회복 시 hpRegenSince 도 now 로 리셋.

type CharSave = {
  hp?: number;
  mp?: number;
  hpRegenSince?: number;
  gold?: number;
  [k: string]: unknown;
};

const HEAL_COST_FULL_PRICE = 1;
const HEAL_FREE_GOLD_THRESHOLD = 50;

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );

    const player = await derivePlayerCombatV2(userId, tx);
    if (!player) {
      return {
        ok: false as const,
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }

    const now = Date.now();
    const maxHp = player.maxHp;
    const maxMp = Math.max(0, player.player.maxMp ?? 0);
    const savedHp = Math.max(0, charSave.hp ?? maxHp);
    const savedMp = Math.max(0, charSave.mp ?? maxMp);
    const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
    const regen = applyHpRegen(savedHp, maxHp, hpRegenSince, now);

    // 둘 다 풀이어야 already_full. MP 가 미달이면 HP 풀이어도 회복 가능 (mp 만 채움).
    if (regen.hp >= maxHp && savedMp >= maxMp) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false as const,
          error: "already_full" as const,
          hp: maxHp,
          maxHp,
          mp: maxMp,
          maxMp,
        },
      };
    }

    const gold = Math.max(0, charSave.gold ?? 0);
    const cost = gold < HEAL_FREE_GOLD_THRESHOLD ? 0 : HEAL_COST_FULL_PRICE;

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      hp: maxHp,
      mp: maxMp,
      hpRegenSince: now,
      gold: gold - cost,
    });

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        hp: maxHp,
        maxHp,
        mp: maxMp,
        maxMp,
        gold: gold - cost,
        cost,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
