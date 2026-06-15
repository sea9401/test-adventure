import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CORE_LOOP_V2,
  OFFLINE_MAX_MS,
} from "@/adventure/data/v2/coreLoopConfig";

// POST /api/v2/me/offline-hunt — 오프라인 사냥 세션 시작/정지 (코어루프 전용).
//
// body: { action: "start" | "stop" }
//  - start: offlineHuntStartedAt = now·lastBattleAt = now. 이후 탭을 닫아도 최대 2시간(OFFLINE_MAX_MS)
//    동안 누적되고, 복귀/정지 시 /me/offline-settle 이 정산한다(서버가 실시간으로 도는 게 아니라
//    경과 시간으로 한 번에 계산 → 부하 0).
//  - stop: 세션 종료(offlineHuntStartedAt 제거). 정산은 클라가 stop 직전 offline-settle 로 처리.
//
// 자동 사냥(탭 열린 동안 연속)은 순수 클라 루프라 서버 상태가 없다 — 이 라우트는 오프라인 세션만.

type CharSave = {
  offlineHuntStartedAt?: number | null;
  lastBattleAt?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!V2_CORE_LOOP_V2) {
    return Response.json({ ok: true, disabled: true, active: false });
  }

  let body: { action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action === "stop" ? "stop" : "start";
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    if (action === "stop") {
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        offlineHuntStartedAt: null,
      });
      return { active: false as const };
    }
    // start — 새 2시간 창. lastBattleAt 도 now 로 맞춰 누적이 시작 시점부터 잡히게.
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      offlineHuntStartedAt: now,
      lastBattleAt: now,
    });
    return {
      active: true as const,
      startedAt: now,
      endsAt: now + OFFLINE_MAX_MS,
    };
  });

  return Response.json({ ok: true, ...result });
}
