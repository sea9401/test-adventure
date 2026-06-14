import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { canHuntWithHp } from "@/adventure/v2/hpRegen";
import {
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MS,
  offlineBattlesAccrued,
} from "@/adventure/data/v2/coreLoopConfig";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import {
  runOneHunt,
  type RunOneHuntCtx,
} from "@/app/api/v2/dungeon/hunt/route";

// POST /api/v2/me/offline-settle — 오프라인 자동전투 정산(코어루프 전용).
//
// 안 논 시간(now − lastBattleAt)을 5초 쿨다운으로 나눈 만큼(2시간 캡)을 실제 엔진으로 재현해
// 정산한다. 클라가 앱 포커스/로드 시 호출. 핵심 설계(유저 합의):
//  - 전판 재현 — runOneHunt 를 N회(쿨다운 스킵·시각 주입) 호출. 보상/드랍/레벨업/패배 세금이
//    온라인과 100% 동일(같은 코드). 패배 = 보상 0(승률이 자동 반영 → "잘못된 변수" 없음).
//  - HP/포션 충실 — 판 사이 5초만큼 HP 회복(nowOverride = now − (N−1−i)×쿨다운)·포션 자동소모·
//    소진 시 중단. 액티브가 5초 cadence 로 사냥한 것과 HP 경제 동일 → 오프라인이 더 못 번다.
//  - farm 깊이 = 마지막 정상 사냥 깊이(lastHuntDepth), 무거점(세금 sink)·레어맵 미사용.
//  - 멱등 — 정산 후 lastBattleAt = realNow(조기중단이어도 누적시간 소비) → 재시도 N=0.

const DROP_FLOOR_CAP = 8 as DungeonFloorId;

type SettleCharSave = {
  lastBattleAt?: number;
  lastHuntDepth?: number;
  frontierDepth?: number;
  level?: number;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 코어루프 전용 — flag off 면 오프라인 정산 없음(스태미나 시절엔 재생이 대체).
  if (!V2_CORE_LOOP_V2) {
    return Response.json({ ok: true, disabled: true, battles: 0 });
  }

  const now = Date.now();

  const settled = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<SettleCharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const lastBattleAt = Number(charSave.lastBattleAt) || 0;
    const n = offlineBattlesAccrued(lastBattleAt, now);
    if (n <= 0) {
      return { battles: 0 as const, accrued: 0 };
    }

    // farm 깊이 — lastHuntDepth, 없으면 frontierDepth−1, [1, frontierDepth] 클램프(잠긴 깊이 방지).
    const frontier = Math.max(2, Math.floor(Number(charSave.frontierDepth) || 2));
    const rawDepth = Number(charSave.lastHuntDepth);
    const depth = Math.max(
      1,
      Math.min(
        frontier,
        Number.isFinite(rawDepth) && rawDepth >= 1
          ? Math.floor(rawDepth)
          : frontier - 1,
      ),
    );
    const dropFloor = Math.min(depth, DROP_FLOOR_CAP) as DungeonFloorId;

    // 🔑오프라인 세션 = "로그아웃 HP + 판당 5초 회복". hpRegenSince 를 첫 판 기준(now − n×쿨다운)
    //   으로 리셋해, 장기 부재의 window 이전 누적 회복(거대 첫판 힐)을 차단한다. 첫 판은 정확히
    //   5초 회복부터 시작 → "5초 cadence 액티브"와 동일 HP 경제(오프라인 초과 누수 차단).
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      hpRegenSince: now - n * HUNT_COOLDOWN_MS,
    });

    // === 정산 루프 — runOneHunt 재사용. 각 판이 character.v2 재read 로 HP/exp/골드/레벨/세금 이월. ===
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalGold = 0; // net(세금 차감 후) 합산
    let totalLossTax = 0;
    let levelsGained = 0;
    let stopped: "hp" | "error" | null = null;

    for (let i = 0; i < n; i++) {
      // 판별 시뮬 시각 — 5초 간격, 마지막 판이 realNow(멱등 + HP 회복 정확).
      const nowOverride = now - (n - 1 - i) * HUNT_COOLDOWN_MS;
      const ctx: RunOneHuntCtx = {
        tx,
        userId,
        depth,
        dropFloor,
        outpostId: null,
        rareMapIid: null,
        offline: true,
        nowOverride,
      };
      const r = await runOneHunt(true, ctx);
      if (!r.ok) {
        // hp_zero(전투 시작 HP 부족 게이트) = 정상 중단, 그 외 = 에러.
        stopped =
          (r.body as { error?: string }).error === "hp_zero" ? "hp" : "error";
        break;
      }
      const res = r.body.result;
      completed++;
      if (res.won) wins++;
      else losses++;
      totalExp += res.expGained;
      totalGold += res.goldGained;
      totalLossTax += res.lossTax ?? 0;
      levelsGained += res.levelsGained;
      // HP/포션 소진 — 온라인 배치와 동일 조건으로 중단(누적시간은 아래서 소비).
      if (res.hpAfter <= 0 || !canHuntWithHp(res.hpAfter, res.maxHp)) {
        stopped = "hp";
        break;
      }
    }

    // 멱등 — 누적시간 소비(조기 중단이어도 전진). lastBattleAt 은 요청-시작 now 가 아니라 루프
    //   종료 후 신선한 Date.now() 로(정산이 수초 걸려도 anchor 가 commit 시각 이상 → 재시도 N≈0,
    //   중복 정산 차단). 루프가 쓴 최신 charSave 재read 후 lastBattleAt 만 갱신.
    const after = await lockSaveForUpdate<SettleCharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    await upsertSave(tx, userId, "character.v2", {
      ...after,
      lastBattleAt: Date.now(),
    });

    return {
      battles: completed,
      accrued: n,
      wins,
      losses,
      totalExp,
      totalGold,
      totalLossTax,
      levelsGained,
      depth,
      finalLevel: Math.max(1, Math.floor(Number(after.level) || 1)),
      stopped,
    };
  });

  return Response.json({ ok: true, ...settled });
}
