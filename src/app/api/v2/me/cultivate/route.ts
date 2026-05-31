import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  parseProficiency,
  applyCultivation,
  emptyProficiency,
  groupUsable,
  cultivationCost,
  cultivationCount,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

// POST /api/v2/me/cultivate — 수행 1회. 현 직업군 사용가능 숙련도로 stat cap 상승.
// docs/v2-proficiency-redesign.md §4. 골드/쿨다운 없음. lock 순서 character.v2 → proficiency.v2.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{ class?: unknown }>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const group = tier1ClassOf(parseV2Class(charSave.class));
    if (group === "none") {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }
    const profSave = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    const prof = parseProficiency(profSave);
    const applied = applyCultivation(prof, group);
    if (!applied) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: cultivationCost(cultivationCount(prof, group)),
          have: groupUsable(prof, group),
        },
      };
    }
    await upsertSave(tx, userId, "proficiency.v2", applied.next);
    const nextCult = applied.next.groups[group].cultivations;
    return {
      status: 200,
      body: {
        ok: true as const,
        spent: applied.cost,
        group,
        caps: applied.next.caps,
        cultivations: nextCult,
        usable: groupUsable(applied.next, group),
        nextCost: cultivationCost(nextCult),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
