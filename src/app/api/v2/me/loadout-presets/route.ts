import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { totalPresetSlots } from "@/adventure/data/v2/v2LoadoutPresets";

// 로드아웃 프리셋 — 이름 붙인 장착 스킬 묶음(빠른 빌드 전환·순수 편의). 프리셋 "적용"은 클라가
//   프리셋 skills 를 POST /me/loadout 으로 보내 처리(예산/직업고정 검증 재사용). 이 라우트는
//   (1) 프리셋 라이브러리 저장 (2) 현황 조회 만 담당. 슬롯은 무료 고정(수집 포인트 경제 폐지).

// 현재 프리셋 상태 — 프리셋 목록 + 무료 고정 슬롯 수.
function presetStateOf(skills: V2SkillsState) {
  return {
    presets: skills.loadoutPresets ?? [],
    totalSlots: totalPresetSlots(),
  };
}

// GET — 현재 프리셋/슬롯 현황(읽기 전용).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")));
  const skills = parseV2SkillsState(rows[0]?.value);
  return Response.json({ ok: true, ...presetStateOf(skills) });
}

// POST — { action: "save", presets }.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown; presets?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "save") {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );

    // 클라가 프리셋 라이브러리 전체를 보낸다. parseV2SkillsState 가 슬롯 수만큼 상한·유효 id·이름
    //   정규화하므로, 보낸 presets 를 임시 합성 후 재파싱해 정규화한다.
    const reparsed = parseV2SkillsState({
      ...skills,
      loadoutPresets: Array.isArray(body.presets) ? body.presets : [],
    });
    const next: V2SkillsState = {
      ...skills,
      loadoutPresets: reparsed.loadoutPresets ?? [],
    };
    await upsertSave(tx, userId, "skills.v2", next);
    return { ok: true as const, ...presetStateOf(next) };
  });

  return Response.json(result);
}
