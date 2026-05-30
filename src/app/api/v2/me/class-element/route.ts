import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  parseV2Class,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/me/class-element — 직업·속성 선택/변경 (PR-1 전투 재설계 슬라이스).
// 직업 선택 시 그 직업의 전용 스킬을 자동 학습(skills.v2.learned)에 추가한다.
// 비용/쿨다운(비용 전직)은 PR-6. PR-1 은 무료 선택.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { class?: unknown; element?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nextClass: V2Class = parseV2Class(body.class);
  const nextElement: V2Element = parseV2Element(body.element);
  if (!V2_SELECTABLE_CLASSES.includes(nextClass)) {
    return Response.json({ ok: false, error: "bad_class" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서 통일 — skill-slots/learn 라우트와 동일하게 skills.v2 → character.v2.
    // (반대로 잡으면 두 라우트 동시 호출 시 AB/BA 데드락.)
    const sig = V2_CLASS_DEFS[nextClass].signatureSkill;
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const skills = parseV2SkillsState(skillsRaw);

    const charSave = await lockSaveForUpdate<{ [k: string]: unknown }>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      class: nextClass,
      element: nextElement,
    });

    // 전용 스킬 자동 학습 — 이미 보유면 그대로.
    if (sig && !skills.learned.includes(sig)) {
      await upsertSave(tx, userId, "skills.v2", {
        ...skills,
        learned: [...skills.learned, sig],
      });
    }

    return { class: nextClass, element: nextElement };
  });

  return Response.json({ ok: true, ...result });
}
