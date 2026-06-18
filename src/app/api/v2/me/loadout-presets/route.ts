import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2SkillsState,
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { countCollectedPassives } from "@/adventure/data/v2/v2JobCodex";
import {
  totalPresetSlots,
  nextPresetSlotCost,
  PRESET_SLOTS_FREE,
  PRESET_SLOTS_BUYABLE_MAX,
} from "@/adventure/data/v2/v2LoadoutPresets";
import { totalCollectionSpend } from "@/adventure/data/v2/v2CollectionTitles";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";

// 로드아웃 프리셋(A 메타 PR-2b — 소비형 수집 포인트 = 환생 QoL).
//   프리셋 = 이름 붙인 장착 스킬 묶음(빠른 빌드 전환·순수 편의). 슬롯 수만 수집 포인트로 확장.
//   프리셋 "적용"은 클라가 프리셋 skills 를 POST /me/loadout 으로 보내 처리(예산/직업고정 검증 재사용).
//   이 라우트는 (1) 프리셋 라이브러리 저장 (2) 슬롯 구매 (3) 현황 조회 만 담당.

// 현재 프리셋 상태 — 슬롯/사용분/잔액 포함(파생). 사용분 = 프리셋 슬롯 + 수집 칭호(같은 풀).
function presetStateOf(skills: V2SkillsState, ownedTitleIds: readonly string[]) {
  const bought = skills.loadoutPresetSlotsBought ?? 0;
  const lifetime = countCollectedPassives(skills.learned);
  const spent = totalCollectionSpend(bought, ownedTitleIds);
  return {
    presets: skills.loadoutPresets ?? [],
    slotsBought: bought,
    totalSlots: totalPresetSlots(bought),
    freeSlots: PRESET_SLOTS_FREE,
    buyableMax: PRESET_SLOTS_BUYABLE_MAX,
    nextSlotCost: nextPresetSlotCost(bought),
    collectionPoints: lifetime,
    collectionPointsSpent: spent,
    collectionPointsAvailable: Math.max(0, lifetime - spent),
  };
}

// GET — 현재 프리셋/슬롯/포인트 현황(읽기 전용).
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
        inArray(savesKv.key, ["skills.v2", "adventure-log.v2"]),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const skills = parseV2SkillsState(byKey.get("skills.v2"));
  const ownedTitleIds = ownedTitleIdsOf(byKey.get("adventure-log.v2"));
  return Response.json({ ok: true, ...presetStateOf(skills, ownedTitleIds) });
}

// POST — { action: "save", presets } | { action: "buySlot" }.
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
  if (action !== "save" && action !== "buySlot") {
    return Response.json(
      { ok: false, error: "bad_action" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서 skills.v2 → adventure-log.v2 (수집 칭호 라우트와 동일 — 같은 포인트 풀 race 방지).
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const ownedTitleIds = ownedTitleIdsOf(
      await lockSaveForUpdate(tx, userId, "adventure-log.v2", {}),
    );

    if (action === "buySlot") {
      const bought = skills.loadoutPresetSlotsBought ?? 0;
      const cost = nextPresetSlotCost(bought);
      if (cost == null) {
        return { status: 400, body: { ok: false as const, error: "slots_maxed" as const } };
      }
      const lifetime = countCollectedPassives(skills.learned);
      const available = Math.max(
        0,
        lifetime - totalCollectionSpend(bought, ownedTitleIds),
      );
      if (available < cost) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "insufficient_points" as const,
            need: cost,
            have: available,
          },
        };
      }
      const next: V2SkillsState = {
        ...skills,
        loadoutPresetSlotsBought: bought + 1,
      };
      await upsertSave(tx, userId, "skills.v2", next);
      return { status: 200, body: { ok: true as const, ...presetStateOf(next, ownedTitleIds) } };
    }

    // action === "save" — 클라가 프리셋 라이브러리 전체를 보낸다. parseV2SkillsState 가 슬롯 수만큼
    //   상한·유효 id·이름 정규화하므로, 보낸 presets 를 임시 합성 후 재파싱해 정규화한다.
    const reparsed = parseV2SkillsState({
      ...skills,
      loadoutPresets: Array.isArray(body.presets) ? body.presets : [],
    });
    const next: V2SkillsState = {
      ...skills,
      loadoutPresets: reparsed.loadoutPresets ?? [],
    };
    await upsertSave(tx, userId, "skills.v2", next);
    return { status: 200, body: { ok: true as const, ...presetStateOf(next, ownedTitleIds) } };
  });

  return Response.json(result.body, { status: result.status });
}
