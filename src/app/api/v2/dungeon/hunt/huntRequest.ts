import { profileAsyncStage, recordProfileCounter } from "@/lib/server/runtimeProfiler/stages";
import { HUNT_COOLDOWN_MODE, V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { type DropResult } from "@/adventure/data/v2/dungeonDrops";
import { GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH } from "@/adventure/data/v2/guildExploration";
import { type EjectedFrom } from "@/adventure/data/v2/intruderTracking";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import { type ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { getAutoHuntStopReason, type AutoHuntStopReason } from "@/adventure/v2/autoHuntStopPolicy";
import { canHuntWithHp } from "@/adventure/v2/hpRegen";
import { HUNT_COST } from "@/adventure/v2/stamina";
import { flushHuntSaves, type HuntBatchState } from "./huntBatchState";
import { RunOneHuntCtx, runOneHunt } from "./huntExecution";
import { parseHuntRequestIntent } from "./huntRequestIntent";
import { broadcastHuntUniqueDrops } from "./huntResultEffects";
import { db } from "@/db";
import { deferLongBattleReplays } from "@/lib/server/battleReplayStore";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
} from "@/lib/server/codexMasteryGameplay";
import { recordGrowthLeapStaminaSpendInTx } from "@/lib/server/growthLeapProgress";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";

export async function handleHunt(req: Request, userId: string) {
  const parsed = await profileAsyncStage("hunt.intent", () => parseHuntRequestIntent(req, userId));
  if (!parsed.ok) return parsed.response;
  const {
    mode,
    depth,
    dropFloor,
    count,
    outpostId,
    lockedTileOutpostId,
    rareMapIid,
    autoStopConfig,
  } = parsed.intent;

  recordProfileCounter("hunt.requestedBattles", count);
  const result = await profileAsyncStage("hunt.transaction", () => db.transaction(async (tx) => {
    const ctx: RunOneHuntCtx = {
      tx,
      userId,
      depth,
      dropFloor,
      outpostId,
      tileOutpostId: lockedTileOutpostId,
      rareMapIid,
      mode,
      hpPotionTargetPct: autoStopConfig.hpPotionTargetPct,
      mpPotionTargetPct: autoStopConfig.mpPotionTargetPct,
    };

    // 단판도 같은 request-scoped save 상태를 사용해 여러 save 잠금·최종 쓰기를 한 쿼리로
    // 합친다. 응답 모양과 길드 탐사 반영 시점은 기존 단판 경로를 그대로 유지한다.
    if (count === 1) {
      const singleState: HuntBatchState = { actor: {}, dining: {} };
      const single = await runOneHunt(true, {
        ...ctx,
        batchState: singleState,
      });
      await profileAsyncStage("hunt.save", () => flushHuntSaves(tx, userId, singleState));
      if (single.ok && !HUNT_COOLDOWN_MODE) {
        await recordGrowthLeapStaminaSpendInTx(tx, userId, HUNT_COST);
      }
      return single;
    }
    // === 일괄(batch) 루프 ===
    const batchState: HuntBatchState = {
      actor: {},
      dining: {},
      deferGuildExploration: true,
    };
    const codexMasteryEvents: CodexMasteryGameplayEvent[] = [];
    const batchCtx: RunOneHuntCtx = {
      ...ctx,
      batchState,
      codexMasteryEvents,
    };
    // count>1 — 한 트랜잭션에서 N회. 스태미나 부족·HP 부족·사망이면 중단(완료분은 커밋).
    let completed = 0;
    let wins = 0;
    let losses = 0;
    let referralRewardEarned = false;
    let totalExp = 0;
    let explorationXpGained = 0;
    let explorationPointsGained = 0;
    let explorationAfter: {
      xpAfter: number;
      xpPoints: number;
    } | null = null;
    let totalProficiency = 0;
    let totalGold = 0;
    let totalLossTax = 0;
    let totalGoldGross = 0; // 구버전 응답 호환용 총 골드 합산.
    let totalGoldTaxed = 0;
    let totalMastery = 0;
    let proficiencyAfter: number | null = null; // 상시 카드 readout — 가장 최근 사냥의 현재 숙련도.
    let proficiencyPointsAfter: number | null = null;
    let levelsGained = 0;
    let spMilestonesGained = 0; // 코어루프 — 일괄 동안 새로 넘은 SP 마일스톤 합산(flag off=0).
    const statGains: Partial<Record<V2StatKey, number>> = {};
    let hpGained = 0; // 일괄 동안 레벨업으로 오른 maxHp 합산.
    let mpGained = 0; // 일괄 동안 레벨업으로 오른 maxMp 합산.
    const drops: DropResult = {};
    const droppedEquipments: V2EquipmentId[] = [];
    const droppedUniques: V2EquipmentId[] = [];
    const rareMapDrops: RareMapKindId[] = [];
    const rareMapDropInstances: RareMapInstance[] = [];
    let rareMapRunsLeft: number | null = null;
    let stoppedReason:
      | "stamina"
      | "death"
      | "defeat"
      | "recovery"
      | "error"
      | AutoHuntStopReason
      | null = null;
    let lastStamina: unknown = null;
    let finalHpAfter: number | null = null;
    let finalMaxHp: number | null = null;
    let finalMaxDepth: number | null = null;
    let expAfter: number | null = null;
    let maxExpAfter: number | null = null;
    let finalLevelAfter: number | null = null;
    // 일괄 결과 아래 캐릭터 정보 카드용 — 마지막 사냥 후 회복약 충전량 + MP 보유 여부.
    let hpCharges: number | null = null;
    let mpCharges: number | null = null;
    let playerMaxMp: number | null = null;
    let finalMpAfter: number | null = null;
    let finalGoldAfter: number | null = null;
    let ejected: EjectedFrom | null = null;
    let unexploredSummary: Record<string, unknown> | null = null;
    const replays: Array<{
      index: number;
      enemyName: string;
      won: boolean;
      turns: number;
      replay: ReplayPayload;
      startPlayerHp: number;
      expForBar: number;
      maxExpForBar: number;
      hpCharges: number;
      mpCharges: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const r = await runOneHunt(true, batchCtx);
      if (!r.ok) {
        // 첫 사냥부터 실패면 단판과 동일하게 에러 응답 그대로(409 스태미나/HP·403 정책 등).
        //   버튼이 스태미나/회복 상태에선 비활성이라 실사용상 드물다. 중간(완료>0) 실패는
        //   완료분 요약 + 라벨로 중단(스태미나 소진·저체력·기타).
        if (completed === 0) {
          await profileAsyncStage("hunt.save", () => flushHuntSaves(tx, userId, batchState));
          return r;
        }
        const err = (r.body as { error?: string }).error;
        if (err === "out_of_stamina") stoppedReason = "stamina";
        else if (err === "hp_zero") stoppedReason = "recovery";
        else stoppedReason = "error";
        lastStamina = (r.body as { stamina?: unknown }).stamina ?? lastStamina;
        break;
      }
      const res = r.body.result;
      completed++;
      if (res.won) wins++;
      else losses++;
      referralRewardEarned ||= res.referralRewardEarned;
      totalExp += res.expGained;
      if (res.exploration) {
        explorationXpGained += res.exploration.xpGained;
        explorationPointsGained += res.exploration.pointsGained;
        explorationAfter = {
          xpAfter: res.exploration.xpAfter,
          xpPoints: res.exploration.xpPoints,
        };
      }
      totalProficiency += res.proficiencyGained;
      totalMastery += res.masteryGained ?? 0;
      proficiencyPointsAfter = res.proficiencyPointsAfter;
      if (res.masteryAfter != null) proficiencyAfter = res.masteryAfter;
      totalGold += res.goldGained;
      totalLossTax += res.lossTax ?? 0;
      totalGoldGross += res.goldGross ?? res.goldGained;
      totalGoldTaxed += res.goldTaxed ?? 0;
      levelsGained += res.levelsGained;
      spMilestonesGained += res.spMilestonesGained ?? 0;
      for (const [k, n] of Object.entries(res.statGains)) {
        const key = k as V2StatKey;
        statGains[key] = (statGains[key] ?? 0) + (n ?? 0);
      }
      hpGained += res.hpGain ?? 0;
      mpGained += res.mpGain ?? 0;
      for (const [id, n] of Object.entries(res.drops)) {
        const key = id as keyof DropResult;
        drops[key] = (drops[key] ?? 0) + (n ?? 0);
      }
      droppedEquipments.push(...res.droppedEquipments);
      droppedUniques.push(...res.droppedUniques);
      if (res.rareMapDrop) rareMapDrops.push(res.rareMapDrop);
      if (res.rareMapDropInstance) {
        rareMapDropInstances.push(res.rareMapDropInstance);
      }
      rareMapRunsLeft = res.rareMapRunsLeft ?? rareMapRunsLeft;
      if (res.ejected && !ejected) ejected = res.ejected;
      if ("unexploredSummary" in res && res.unexploredSummary) {
        unexploredSummary = res.unexploredSummary as unknown as Record<
          string,
          unknown
        >;
      }
      replays.push({
        index: completed,
        enemyName: res.enemyName,
        won: res.won,
        turns: res.turns,
        replay: res.replay,
        startPlayerHp: res.startPlayerHp,
        expForBar: res.expForBar,
        maxExpForBar: res.maxExpForBar,
        hpCharges: res.hpCharges,
        mpCharges: res.mpCharges,
      });
      lastStamina = r.body.stamina;
      finalHpAfter = res.hpAfter;
      finalMpAfter = res.mpAfter ?? finalMpAfter;
      finalGoldAfter = res.goldAfter ?? finalGoldAfter;
      if (res.maxMp != null) playerMaxMp = res.maxMp;
      finalMaxHp = res.maxHp;
      finalMaxDepth = res.maxDepth;
      expAfter = res.expAfter;
      maxExpAfter = res.maxExpAfter;
      finalLevelAfter = res.levelAfter;
      hpCharges = res.hpCharges ?? hpCharges;
      mpCharges = res.mpCharges ?? mpCharges;
      playerMaxMp = res.replay?.playerMaxMp ?? playerMaxMp;
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
        stoppedReason = autoStopReason;
        break;
      }
      // 레어맵 판수 소진 — 다음 사냥이 rare_map_invalid 로 막히므로 여기서 깔끔히 중단.
      if (rareMapIid && (res.rareMapRunsLeft ?? 0) <= 0) {
        break;
      }
      // 사망/저체력이면 다음 사냥이 서버에서 막히므로 즉시 중단(라벨 구분: 사망 vs 회복필요).
      if (res.hpAfter <= 0) {
        stoppedReason = "death";
        break;
      }
      // 패배 시 중단 — 녹아웃(hpAfter<=0)은 위 사망으로 잡히고, 여기선 살아남았지만 진 경우
      //   (ATB 틱 상한 초과 = 못 잡는 적). 보상 0 사냥을 반복하지 않게 즉시 멈춘다.
      if (!res.won) {
        stoppedReason = "defeat";
        break;
      }
      if (!canHuntWithHp(res.hpAfter, res.maxHp)) {
        stoppedReason = "recovery";
        break;
      }
    }

    // 첫 판이 잡은 row lock을 유지한 채 판간 상태는 메모리로 이월하고, 최종 save만 한 번 쓴다.
    // 중간 실패로 루프가 멈춰도 완료된 판의 최신 상태가 여기서 함께 커밋된다.
    await profileAsyncStage("hunt.save", () => flushHuntSaves(tx, userId, batchState));
    if (completed > 0 && !HUNT_COOLDOWN_MODE) {
      await recordGrowthLeapStaminaSpendInTx(
        tx,
        userId,
        HUNT_COST * completed,
      );
    }

    // 매 승리마다 같은 길드 멤버십·본부·주간 row를 다시 조회/잠그지 않고 합산 반영한다.
    // addGuildExplorationProgress의 계산은 count에 선형이므로 판별 결과는 기존과 같다.
    if (wins > 0 && mode === "normal") {
      const progressAt = new Date();
      await incrementGuildExplorationProgressForUser(
        tx,
        userId,
        "huntWins",
        wins,
        progressAt,
      );
      if (depth >= GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH) {
        await incrementGuildExplorationProgressForUser(
          tx,
          userId,
          "deepHuntWins",
          wins,
          progressAt,
        );
      }
    }

    if (codexMasteryEvents.length > 0) {
      await recordCodexMasteryGameplayBatch(
        tx,
        userId,
        codexMasteryEvents,
        new Date(),
      );
    }

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true as const,
        stamina: lastStamina,
        batch: {
          attempted: count,
          completed,
          wins,
          losses,
          referralRewardEarned,
          totalExp,
          ...(explorationAfter
            ? {
                exploration: {
                  xpGained: explorationXpGained,
                  xpAfter: explorationAfter.xpAfter,
                  xpPoints: explorationAfter.xpPoints,
                  pointsGained: explorationPointsGained,
                },
              }
            : {}),
          totalProficiency,
          totalMastery,
          proficiencyAfter,
          proficiencyPointsAfter,
          totalGold,
          totalLossTax,
          totalGoldGross,
          totalGoldTaxed,
          levelsGained,
          ...(V2_CORE_LOOP_V2 ? { spMilestonesGained } : {}),
          statGains,
          hpGained,
          mpGained,
          drops,
          droppedEquipments,
          droppedUniques,
          rareMapDrops,
          rareMapDropInstances,
          rareMapRunsLeft,
          stoppedReason,
          finalHpAfter,
          finalMaxHp,
          finalMpAfter,
          finalGoldAfter,
          finalMaxDepth,
          expAfter,
          maxExpAfter,
          finalLevelAfter,
          hpCharges,
          mpCharges,
          playerMaxMp,
          replays,
          ejected,
          ...(unexploredSummary ? { unexploredSummary } : {}),
        },
      },
    };
  }));

  if (result.status === 200 && "batch" in result.body) {
    const entries = result.body.batch.replays;
    const deferredPayloads = await profileAsyncStage("hunt.replay", () => deferLongBattleReplays(
      db,
      userId,
      entries.map((entry) => entry.replay),
    ));
    result.body.batch.replays = entries.map((entry, index) => ({
      ...entry,
      replay: deferredPayloads[index] ?? entry.replay,
    }));
  }
  await profileAsyncStage("hunt.broadcast", () => broadcastHuntUniqueDrops(userId, result.body));
  return Response.json(result.body, { status: result.status });
}
