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

// GET /api/v2/me/job-codex — 직업 도감(읽기 전용 수집 대시보드, A 메타 PR-1).
//   직업 해금 상태 + 직군 정복(cumLevel) + 직업 패시브 수집 현황. 파워 무관.
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
        inArray(savesKv.key, ["character.v2", "proficiency.v2", "skills.v2"]),
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

  const codex = buildJobCodex(
    prof,
    skillsState.learned,
    cls,
    specChoice,
    skillsState.loadoutPresetSlotsBought ?? 0,
  );
  return Response.json({ ok: true, codex });
}
