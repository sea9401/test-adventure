import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";

// GET /api/v2/me/skills — V2SkillsView 의 자체 fetch.
// derivePlayerCombatV2 결과의 characterSkills/effectiveSkillNames/layout +
// character.v2.equippedSkills 반환. 라이브 SkillsView 의 prop 그대로 매핑.
//
// POST /api/v2/me/skills/equip — character.v2.equippedSkills 배열 업데이트.
// 본문: { equippedSkills: string[] }. 슬롯 한도(layout.normalSlots) 초과 시 거부.
// 보유 스킬에 속하지 않는 이름은 거부.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const combat = await derivePlayerCombatV2(userId);
  if (!combat) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  // 현재 장착 — character.v2.equippedSkills 직접 read.
  const charRow = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
  )[0];
  const charSave = (charRow?.value ?? {}) as {
    equippedSkills?: string[];
  };
  const equippedSkills = Array.isArray(charSave.equippedSkills)
    ? charSave.equippedSkills.filter((n): n is string => typeof n === "string")
    : [];

  return Response.json({
    ok: true,
    skills: combat.characterSkills,
    effectiveSkillNames: combat.effectiveSkillNames,
    normalSlots: combat.layout.normalSlots,
    equippedSkills,
  });
}
