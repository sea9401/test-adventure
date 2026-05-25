import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";

// POST /api/v2/me/skills/equip — character.v2.equippedSkills 업데이트.
//
// 본문: { equippedSkills: string[] }
// - 보유 스킬에 속하지 않는 이름 거부
// - 슬롯 한도(layout.normalSlots) 초과 거부
// - 중복 거부

type CharSave = {
  equippedSkills?: string[];
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equippedSkills?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.equippedSkills)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  const requested = body.equippedSkills.filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );
  if (new Set(requested).size !== requested.length) {
    return Response.json({ ok: false, error: "duplicate" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 보유 스킬·슬롯 한도 검증 — character.v2 lock 후 derive.
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
    const known = new Set(combat.characterSkills.map((s) => s.name));
    for (const name of requested) {
      if (!known.has(name)) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "unknown_skill" as const,
            skill: name,
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

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      equippedSkills: requested,
    });
    return {
      status: 200,
      body: { ok: true as const, equippedSkills: requested },
    };
  });

  return Response.json(result.body, { status: result.status });
}
