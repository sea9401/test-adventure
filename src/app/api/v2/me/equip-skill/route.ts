import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2Class,
  elementalSkillsForClass,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillsState,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import {
  parseProficiencyForChar,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

// POST /api/v2/me/equip-skill — 학습한 직업군 속성 스킬을 슬롯에 장착/해제. (시그니처는 패시브 전환 — 장착 불가)
// body: { skillId, equip: boolean }. 장착 = 학습 + 현 직업군 속성 풀 + 슬롯 여유 필요.
// 슬롯 수 = v2SkillSlotsForLevel(level)(레벨 33렙당+1, 3~6 — 레벨 리셋되면 줄어듦).
// equipped 는 체인 순서로 정렬 보관(= 발동 우선순위). lock 순서 character.v2 → skills.v2 → proficiency.v2.
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
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const cls = parseV2Class(charSave.class);
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
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

    // 차수 — 계파 스킬은 차수당 1개 해금. lock 순서 character→skills→proficiency.
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const tier = prof.groups[tier1ClassOf(cls)]?.tier ?? 1;
    // 장착 가능 = 공용 + 선택 계파(전직)의 차수 해금분만(발동 순서도 이 순서). 계파 미선택이면 공용만.
    const equippable = [...elementalSkillsForClass(cls, specChoice, tier)];

    if (equip) {
      // 장착 — 학습 + 현 체인 + 슬롯 여유.
      if (!skills.learned.includes(skillId as V2SkillId)) {
        return { status: 400, body: { ok: false as const, error: "not_learned" as const } };
      }
      if (!equippable.includes(skillId as V2SkillId)) {
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

    // 장착 가능 순서로 정렬(발동 우선순위 = 시그니처 차수 순 → 속성 풀). 밖은 제외(안전).
    const nextEquipped = equippable.filter((s) => equippedSet.has(s));
    const next: V2SkillsState = {
      ...skills, // learned·pattern 보존(combat-pattern 라우트만 pattern 변경).
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
