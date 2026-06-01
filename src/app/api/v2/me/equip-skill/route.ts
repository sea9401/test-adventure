import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, signaturesForClass } from "@/adventure/data/v2/classes";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/equip-skill — 학습한 시그니처를 슬롯에 직접 장착/해제(수동 착용 복귀).
// body: { skillId, equip: boolean }. 장착 = 학습 + 현 직업 체인 + 슬롯 여유 필요.
// 슬롯 수 = v2SkillSlotsForLevel(level)(레벨 33렙당+1, 3~6 — 레벨 리셋되면 줄어듦).
// equipped 는 체인 순서로 정렬 보관(= 발동 우선순위). lock 순서 character.v2 → skills.v2.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { skillId?: unknown; equip?: unknown };
  try {
    body = (await req.json()) as { skillId?: unknown; equip?: unknown };
  } catch {
    body = {};
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : null;
  const equip = body.equip !== false; // 기본 장착(true)
  if (!skillId) {
    return Response.json({ ok: false, error: "missing_skill" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      level?: number;
    }>(tx, userId, "character.v2", {});
    const cls = parseV2Class(charSave.class);
    const chain = signaturesForClass(cls);
    const slots = v2SkillSlotsForLevel(Math.max(1, charSave.level ?? 1));

    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const equippedSet = new Set<string>(skills.equipped);

    if (equip) {
      // 장착 — 학습 + 현 체인 + 슬롯 여유.
      if (!skills.learned.includes(skillId as V2SkillId)) {
        return { status: 400, body: { ok: false as const, error: "not_learned" as const } };
      }
      if (!chain.includes(skillId as V2SkillId)) {
        return { status: 400, body: { ok: false as const, error: "not_in_chain" as const } };
      }
      if (!equippedSet.has(skillId) && equippedSet.size >= slots) {
        return {
          status: 400,
          body: { ok: false as const, error: "slots_full" as const, slots },
        };
      }
      equippedSet.add(skillId);
    } else {
      equippedSet.delete(skillId);
    }

    // 체인 순서로 정렬(발동 우선순위 = 차수 순). 체인 밖은 제외(안전).
    const nextEquipped = chain.filter((s) => equippedSet.has(s));
    const next: V2SkillsState = {
      learned: skills.learned,
      equipped: nextEquipped,
    };
    await upsertSave(tx, userId, "skills.v2", next);
    return {
      status: 200,
      body: {
        ok: true as const,
        skillId,
        equipped: nextEquipped,
        slots,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
