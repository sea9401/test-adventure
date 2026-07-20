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
  CATALOG_USES_FARMING_LEVEL_CONDITION,
  CATALOG_USES_MINING_LEVEL_CONDITION,
  CATALOG_USES_QUEST_CONDITION,
  CATALOG_USES_WOODCUTTING_LEVEL_CONDITION,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  FARM_SAVE_KEY,
  farmingLevelForState,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
} from "@/adventure/v2/woodcuttingSession";
import { woodcuttingProgressionView } from "@/adventure/v2/woodcuttingProgression";
import {
  MINING_LOG_KEY,
  parseMiningLog,
} from "@/adventure/v2/miningSession";
import { miningProgressionView } from "@/adventure/v2/miningProgression";
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

  const saveKeys = ["character.v2", "proficiency.v2", "skills.v2"];
  if (CATALOG_USES_QUEST_CONDITION) saveKeys.push(GUIDE_QUESTS_KEY);
  if (CATALOG_USES_FARMING_LEVEL_CONDITION) saveKeys.push(FARM_SAVE_KEY);
  if (CATALOG_USES_WOODCUTTING_LEVEL_CONDITION) {
    saveKeys.push(WOODCUTTING_LOG_KEY);
  }
  if (CATALOG_USES_MINING_LEVEL_CONDITION) saveKeys.push(MINING_LOG_KEY);
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, saveKeys),
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
  const woodcuttingLog = parseWoodcuttingLog(byKey.get(WOODCUTTING_LOG_KEY));
  const miningLog = parseMiningLog(byKey.get(MINING_LOG_KEY));
  const unlockCtx: JobUnlockContext = {
    ...(CATALOG_USES_QUEST_CONDITION
      ? { completedQuestIds: parseClaimed(byKey.get(GUIDE_QUESTS_KEY)) }
      : {}),
    ...(CATALOG_USES_FARMING_LEVEL_CONDITION
      ? {
          farmingLevel: farmingLevelForState(
            parseFarmState(byKey.get(FARM_SAVE_KEY)),
          ),
        }
      : {}),
    ...(CATALOG_USES_WOODCUTTING_LEVEL_CONDITION
      ? {
          woodcuttingLevel: woodcuttingProgressionView(
            woodcuttingLog.cuts,
            woodcuttingLog.xp,
          ).level,
        }
      : {}),
    ...(CATALOG_USES_MINING_LEVEL_CONDITION
      ? {
          miningLevel: miningProgressionView(
            miningLog.successes,
            miningLog.xp,
          ).level,
        }
      : {}),
  };

  const codex = buildJobCodex(
    prof,
    skillsState.learned,
    cls,
    specChoice,
    unlockCtx,
  );
  return Response.json({ ok: true, codex });
}
