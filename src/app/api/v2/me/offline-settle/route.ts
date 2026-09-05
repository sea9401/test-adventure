import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceHighCostRateLimit } from "@/lib/server/highCostRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { canHuntWithHp } from "@/adventure/v2/hpRegen";
import { RARE_MAP_KINDS } from "@/adventure/data/v2/rareMaps";
import {
  getAutoHuntStopReason,
  normalizeAutoHuntStopConfig,
  type AutoHuntStopConfig,
  type AutoHuntStopReason,
} from "@/adventure/v2/autoHuntStopPolicy";
import {
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MODE,
  HUNT_COOLDOWN_MS,
  OFFLINE_MAX_MS,
  OFFLINE_SETTLE_BATCH_SIZE,
  offlineBattlesAccrued,
  offlineFarmDepth,
  V2_EQUIPMENT_LIBERATION,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  EMPTY_LIBERATION_HUNT_SNAPSHOT,
  deriveLiberationHuntSnapshot,
} from "@/adventure/data/v2/equipmentLiberationEffects";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import { runOneHunt, type RunOneHuntCtx } from "@/app/api/v2/dungeon/hunt/huntExecution";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
} from "@/lib/server/codexMasteryGameplay";

// POST /api/v2/me/offline-settle — 오프라인 자동전투 정산(코어루프 전용).
//
// 안 논 시간(now − lastBattleAt)을 5초 쿨다운으로 나눈 만큼(2시간 캡)을 실제 엔진으로 재현해
// 정산한다. 클라가 앱 포커스/로드 시 호출. 핵심 설계(유저 합의):
//  - 전판 재현 — runOneHunt 를 N회(쿨다운 스킵·시각 주입) 호출. 보상/드랍/레벨업/패배 페널티가
//    온라인과 100% 동일(같은 코드). 패배 = 보상 0(승률이 자동 반영 → "잘못된 변수" 없음).
//  - HP/포션 충실 — 판 사이 5초만큼 HP 회복(nowOverride = now − (N−1−i)×쿨다운)·포션 자동소모·
//    소진 시 중단. 액티브가 5초 cadence 로 사냥한 것과 HP 경제 동일 → 오프라인이 더 못 번다.
//  - farm 깊이 = 마지막 정상 사냥 깊이(lastHuntDepth), 레어맵 미사용.
//  - 멱등 — 정산 후 lastBattleAt = realNow(조기중단이어도 누적시간 소비) → 재시도 N=0.

const DROP_FLOOR_CAP = 8 as DungeonFloorId;

type SettleCharSave = {
  lastBattleAt?: number;
  lastHuntDepth?: number;
  frontierDepth?: number;
  level?: number;
  // 오프라인 사냥 세션 시작 시각(없으면 비활성 → 정산 없음). 최대 OFFLINE_MAX_MS(2h) 창.
  offlineHuntStartedAt?: number;
  offlineHuntStopConfig?: AutoHuntStopConfig | null;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 쿨다운 모드 전용 — 스태미나 모드/off 면 오프라인 정산 없음(스태미나 재생이 대체).
  if (!HUNT_COOLDOWN_MODE) {
    return Response.json({ ok: true, disabled: true, battles: 0 });
  }
  const limited = enforceHighCostRateLimit(req, userId, "offlineSettle");
  if (limited) return limited;

  const now = Date.now();

  const settled = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<SettleCharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    // 오프라인 사냥은 명시 세션(offlineHuntStartedAt)이 켜져 있을 때만 누적·정산한다.
    //   세션 없음(시작 안 함)이면 정산 0 — 그냥 탭만 닫는다고 누적되지 않음(opt-in).
    const startedAt = Number(charSave.offlineHuntStartedAt) || 0;
    if (startedAt <= 0) {
      return { battles: 0 as const, accrued: 0, active: false as const };
    }
    // 세션 창 끝 = 시작 + 2h. 정산 기준 시각은 now 를 창 끝으로 클램프(2h 초과분 버림).
    const windowEnd = startedAt + OFFLINE_MAX_MS;
    const autoStopConfig = normalizeAutoHuntStopConfig(
      charSave.offlineHuntStopConfig,
    );
    const effectiveNow = Math.min(now, windowEnd);
    const lastBattleAt = Number(charSave.lastBattleAt) || 0;
    const accrued = offlineBattlesAccrued(lastBattleAt, effectiveNow);
    const n = Math.min(accrued, OFFLINE_SETTLE_BATCH_SIZE);
    // 한 요청이 DB 커넥션과 CPU를 오래 독점하지 않게 최대 50판만 처리한다. 남은 판은
    // 클라이언트가 후속 요청으로 이어서 정산하며, 매 배치마다 트랜잭션을 반납한다.
    const batchEnd = Math.min(
      effectiveNow,
      lastBattleAt + n * HUNT_COOLDOWN_MS,
    );
    const remainingBattles = offlineBattlesAccrued(batchEnd, effectiveNow);
    // 창이 끝났더라도 남은 배치가 있으면 세션을 유지한다. 마지막 배치에서만 종료한다.
    const windowDone = effectiveNow >= windowEnd && remainingBattles <= 0;
    if (n <= 0) {
      // 누적 0 이지만 창이 끝났으면 세션만 정리.
      if (windowDone) {
        await upsertSave(tx, userId, "character.v2", {
          ...charSave,
          offlineHuntStartedAt: null,
          offlineHuntStopConfig: null,
        });
      }
      return {
        battles: 0 as const,
        accrued,
        remainingBattles: 0,
        active: !windowDone,
      };
    }

    // farm 깊이 — lastHuntDepth, 없으면 frontierDepth−1, [1, frontierDepth] 클램프(잠긴 깊이 방지).
    //   me/state offlineHunt.depth("자동 사냥 중 사냥터 바로 입장" 목적지)와 동일 헬퍼로 일치.
    const depth = offlineFarmDepth(
      Number(charSave.lastHuntDepth),
      Number(charSave.frontierDepth) || 2,
    );
    const dropFloor = Math.min(depth, DROP_FLOOR_CAP) as DungeonFloorId;
    const liberationSnapshot = V2_EQUIPMENT_LIBERATION
      ? deriveLiberationHuntSnapshot(
          await lockSaveForUpdate(tx, userId, "equipment.v2", {}),
        )
      : EMPTY_LIBERATION_HUNT_SNAPSHOT;

    // 🔑오프라인 세션 = "로그아웃 HP + 판당 5초 회복". hpRegenSince 를 첫 판 기준(now − n×쿨다운)
    //   으로 리셋해, 장기 부재의 window 이전 누적 회복(거대 첫판 힐)을 차단한다. 첫 판은 정확히
    //   5초 회복부터 시작 → "5초 cadence 액티브"와 동일 HP 경제(오프라인 초과 누수 차단).
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      hpRegenSince: batchEnd - n * HUNT_COOLDOWN_MS,
    });

    // === 정산 루프 — runOneHunt 재사용. 각 판이 character.v2 재read 로 HP/exp/골드/레벨을 이월. ===
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let totalExp = 0;
    let totalGold = 0;
    let totalLossTax = 0;
    let totalProficiency = 0;
    let totalMastery = 0;
    let levelsGained = 0;
    let spMilestonesGained = 0; // 코어루프 — 자리 비운 동안 새로 넘은 SP 마일스톤 합산.
    let stopped: "hp" | "error" | AutoHuntStopReason | null = null;
    const codexMasteryEvents: CodexMasteryGameplayEvent[] = [];

    for (let i = 0; i < n; i++) {
      // 판별 시뮬 시각 — 5초 간격, 마지막 판이 이번 batchEnd에 맞닿는다.
      const nowOverride = batchEnd - (n - 1 - i) * HUNT_COOLDOWN_MS;
      const ctx: RunOneHuntCtx = {
        tx,
        userId,
        depth,
        dropFloor,
        outpostId: null,
        rareMapIid: null,
        hpPotionTargetPct: autoStopConfig.hpPotionTargetPct,
        mpPotionTargetPct: autoStopConfig.mpPotionTargetPct,
        offline: true,
        nowOverride,
        codexMasteryEvents,
        liberationSnapshot,
      };
      const r = await runOneHunt(false, ctx);
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
      totalProficiency += res.proficiencyGained ?? 0;
      totalMastery += res.masteryGained ?? 0;
      levelsGained += res.levelsGained;
      spMilestonesGained += res.spMilestonesGained ?? 0;
      const autoStopReason = getAutoHuntStopReason(autoStopConfig, {
        hpCharges: res.hpCharges,
        mpCharges: res.mpCharges,
        hasMp: (res.maxMp ?? 0) > 0,
        rareMapFound:
          !!res.rareMapDrop &&
          RARE_MAP_KINDS[res.rareMapDrop]?.category === "hunt",
        level: res.levelAfter,
      });
      if (autoStopReason) {
        stopped = autoStopReason;
        break;
      }
      // HP/포션 소진 — 온라인 배치와 동일 조건으로 중단(누적시간은 아래서 소비).
      if (res.hpAfter <= 0 || !canHuntWithHp(res.hpAfter, res.maxHp)) {
        stopped = "hp";
        break;
      }
    }

    // 멱등 — 이번 배치의 누적시간을 소비한다. 조기 중단이어도 batchEnd까지 전진해 같은
    // 구간을 다시 보상하지 않고, 남은 과거 구간은 후속 요청이 이어서 처리한다.
    const after = await lockSaveForUpdate<SettleCharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const autoStopped =
      stopped === "potion" ||
      stopped === "rare_map" ||
      stopped === "level_100";
    const sessionDone = windowDone || autoStopped;
    await upsertSave(tx, userId, "character.v2", {
      ...after,
      lastBattleAt: batchEnd,
      ...(sessionDone
        ? {
            offlineHuntStartedAt: null,
            offlineHuntStopConfig: null,
          }
        : {}),
    });

    if (codexMasteryEvents.length > 0) {
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        codexMasteryEvents,
        new Date(batchEnd),
      );
    }

    return {
      battles: completed,
      accrued,
      remainingBattles: autoStopped ? 0 : remainingBattles,
      wins,
      losses,
      totalExp,
      totalGold,
      totalLossTax,
      totalProficiency,
      totalMastery,
      levelsGained,
      ...(V2_CORE_LOOP_V2 ? { spMilestonesGained } : {}),
      depth,
      finalLevel: Math.max(1, Math.floor(Number(after.level) || 1)),
      stopped,
      stoppedReason: stopped,
      // 창이 남아 있으면 세션 유지(true) — 또 비우면 더 누적됨. 다 쓰면 false(종료).
      active: !sessionDone,
    };
  });

  return Response.json({ ok: true, ...settled });
}
