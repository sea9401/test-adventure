import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import {
  SPELLS,
  learnedSpellsForInt,
  type SpellId,
} from "@/adventure/data/v2/spells";

// POST /api/v2/me/skills/equip — character.v2.equippedSpells 업데이트 (PR-5).
//
// 본문: { equippedSpells: SpellId[] }
// - 알 수 없는 id 거부
// - INT 임계값 미달 (학습 안 함) 거부
// - 슬롯 한도(layout.normalSlots) 초과 거부
// - 중복 거부
//
// 라이브 스킬 시스템 폐기 후 v2 마법 슬롯 전용.

type CharSave = {
  equippedSpells?: SpellId[];
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equippedSpells?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.equippedSpells)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const requested = body.equippedSpells.filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );
  if (new Set(requested).size !== requested.length) {
    return Response.json({ ok: false, error: "duplicate" }, { status: 400 });
  }
  for (const id of requested) {
    if (!(id in SPELLS)) {
      return Response.json(
        { ok: false, error: "unknown_spell", spell: id },
        { status: 400 },
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const combat = await derivePlayerCombatV2(userId, tx);
    if (!combat) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_character" as const },
      };
    }
    const intStat = combat.totalStats.int ?? 0;
    const learnable = new Set(learnedSpellsForInt(intStat));
    for (const id of requested) {
      if (!learnable.has(id as SpellId)) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "not_learned" as const,
            spell: id,
          },
        };
      }
    }
    if (requested.length > combat.layout.normalSlots) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "slot_overflow" as const,
          max: combat.layout.normalSlots,
        },
      };
    }

    const typed = requested as SpellId[];
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      equippedSpells: typed,
    });
    return {
      status: 200,
      body: { ok: true as const, equippedSpells: typed },
    };
  });

  return Response.json(result.body, { status: result.status });
}
