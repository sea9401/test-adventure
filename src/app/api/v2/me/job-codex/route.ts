import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { buildJobCodex } from "@/adventure/data/v2/v2JobCodex";
import {
  CATALOG_USES_QUEST_CONDITION,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  GUIDE_QUESTS_KEY,
  parseClaimed,
} from "@/lib/server/v2QuestContext";

// GET /api/v2/me/job-codex — 직업 도감(읽기 전용 대시보드). 직업 해금 상태 + 스킬 수집 현황.
//   파워 무관(직군 묶음·수집 포인트/칭호는 폐지).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(
          savesKv.key,
          CATALOG_USES_QUEST_CONDITION
            ? ["character.v2", "proficiency.v2", "skills.v2", GUIDE_QUESTS_KEY]
            : ["character.v2", "proficiency.v2", "skills.v2"],
        ),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const charSave = (byKey.get("character.v2") ?? {}) as {
    class?: unknown;
    specChoice?: unknown;
  };
  const cls = parseV2Class(charSave.class);
  const specChoice =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const prof = parseProficiencyForChar(
    byKey.get("proficiency.v2") as V2ProficiencyState | undefined,
    charSave,
  );
  const skillsState = parseV2SkillsState(byKey.get("skills.v2"));

  // questCompleted 조건을 쓰는 직업이 있을 때만 가이드 퀘스트 완료셋을 ctx 로 — 해금 표시 일치.
  const unlockCtx: JobUnlockContext | undefined = CATALOG_USES_QUEST_CONDITION
    ? { completedQuestIds: parseClaimed(byKey.get(GUIDE_QUESTS_KEY)) }
    : undefined;

  const codex = buildJobCodex(
    prof,
    skillsState.learned,
    cls,
    specChoice,
    unlockCtx,
  );
  return Response.json({ ok: true, codex });
}
