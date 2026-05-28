import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { savesKv } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  V2_SKILLS,
  emptyV2SkillsState,
  parseV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/skill-slots/equip — v2 스킬 슬롯 장착/정렬.
//
// 본문: { equipped: V2SkillId[] }
//
// 검증 순서:
// 1) 슬롯 수 초과 (현재 캐릭 레벨의 슬롯 수)
// 2) 중복 id
// 3) 학습 보유 (learned 부분집합)
//
// equipped 배열 순서 = 자동 발동 우선순위 (PR-4 전투 런타임이 사용).
// PR-7a — 옛 spell 시스템 폐기, 이 라우트가 v2 스킬 슬롯 장착의 단일 진입점.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { equipped?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.equipped)) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }
  // 엄격 검증 — unknown id 조용히 필터하지 않고 명시 거부 (Codex APPROVE_WITH_NOTES).
  const requested: V2SkillId[] = [];
  for (const v of body.equipped) {
    if (typeof v !== "string" || !(v in V2_SKILLS)) {
      return Response.json(
        { ok: false, error: `알 수 없는 스킬: ${String(v)}` },
        { status: 400 },
      );
    }
    requested.push(v as V2SkillId);
  }
  if (new Set(requested).size !== requested.length) {
    return Response.json({ ok: false, error: "중복 스킬" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const skillsRaw = await lockSaveForUpdate(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState() as unknown as Record<string, unknown>,
      );
      const skills = parseV2SkillsState(skillsRaw);

      // 슬롯 수 — character.v2.level 기반.
      const charRows = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
        .limit(1);
      const charValue = charRows[0]?.value as { level?: number } | null;
      const level =
        typeof charValue?.level === "number" && charValue.level > 0
          ? charValue.level
          : 1;
      const slotCount = v2SkillSlotsForLevel(level);
      if (requested.length > slotCount) {
        return {
          ok: false as const,
          error: `장착 슬롯 초과 (최대 ${slotCount})`,
          status: 400,
        };
      }

      // 학습 보유 검증.
      for (const id of requested) {
        if (!skills.learned.includes(id)) {
          return {
            ok: false as const,
            error: `미학습 스킬: ${V2_SKILLS[id].name}`,
            status: 400,
          };
        }
      }

      const nextSkills: V2SkillsState = {
        learned: skills.learned,
        equipped: requested,
      };
      await upsertSave(tx, userId, "skills.v2", nextSkills);
      return { ok: true as const, skills: nextSkills };
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }
    return Response.json({ ok: true, skills: result.skills });
  } catch (e) {
    console.error("[/api/v2/me/skill-slots/equip]", e);
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
