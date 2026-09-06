import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordLifeGatheringTelemetrySoon } from "@/lib/server/lifeGatheringTelemetry";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
} from "@/lib/server/lifeActivityLock";
import { consumeGuildDiningEffect } from "@/lib/server/guildDining";
import {
  lockSaveForUpdate,
  lockSavesForUpdate,
  upsertSaves,
} from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityStrongSignal,
} from "@/lib/server/activityGuard";
import {
  recordActivityVerificationRequiredSoon,
  recordBehaviorActivitySignalSoon,
  recordExtremeActivityAlertSoon,
  recordStrongActivitySignalSoon,
} from "@/lib/server/activityGuardServer";
import {
  clientIpFromRequest,
  recordAbuseEventSoon,
} from "@/lib/server/abuseLog";
import { FISH, isBigCatch, isTinyCatch } from "@/adventure/data/v2/fish";
import { TINY_CATCH_TITLE_ID } from "@/adventure/data/titles";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  addJobHistory,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  highestVisitedFishingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { MULTTAE_BY_ID, multtaeAt } from "@/adventure/data/v2/multtae";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { referralLifeTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import {
  FISHING_SESSION_KEY,
  judgeCatch,
  parseFishingSession,
} from "@/adventure/v2/fishingSession";
import {
  FISHING_ANTI_MACRO_KEY,
  isFishingAntiMacroStrongSignal,
  parseFishingAntiMacroState,
  recordFishingAntiMacroSample,
} from "@/adventure/v2/fishingAntiMacro";
import {
  FISHING_CODEX_KEY,
  countDiscoveredFish,
  parseFishCodex,
  recordCatch,
} from "@/adventure/v2/fishingCodex";
import { currentFishingSeasonId } from "@/lib/server/fishing/season";
import { upsertFishingRecord } from "@/lib/server/fishing/records";
import {
  FISHING_CATCH_COIN_BY_TIER,
  FISHING_WALLET_KEY,
  applyCatchCoin,
  fishingCatchCoinProgress,
  fishingWalletWithCoins,
} from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  FISHING_DAILY_KEY,
  applyCatch as applyDailyCatch,
  deriveFishingContractViews,
  deriveFishingDailyViews,
  parseFishingDaily,
  rolloverFishingDaily,
} from "@/adventure/data/v2/fishingDailyChallenges";
import {
  FISHING_STREAK_KEY,
  fishingStreakBuff,
  nextFishingStreak,
  resetFishingStreak,
} from "@/adventure/v2/fishingStreak";
import {
  FISHING_PROGRESS_KEY,
  addFishingCatchXp,
  deriveFishingGoalViews,
  emptyFishingProgression,
  fishingLevelRewardCoins,
  fishingProgressionView,
  fishingXpForCatch,
  parseFishingProgressionWithLevelMigration,
} from "@/adventure/v2/fishingProgression";
import {
  FISHING_STOCK_KEY,
  emptyFishingStock,
  parseFishingStock,
  rollFishingCatchToStock,
} from "@/adventure/v2/fishingStock";
import {
  countClaimableFishingTasks,
  fishingProgressNotices,
} from "@/adventure/v2/fishingChallengeProgress";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { applyPctBonus, bonusDelta, readActiveHotTime } from "@/lib/server/opsSettings";
import {
  trySpawnFishingCoopBoss,
} from "@/lib/server/v2Coop";
import { incrementGuildExplorationProgressForUser } from "@/lib/server/guildExplorationWeekly";
import { rolloverRepeatQuestsBeforeProgress } from "@/lib/server/v2QuestContext";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { consumeLifeAidUses, rollHiddenBlueprint } from "@/adventure/v2/lifeCrafting";
import { getFishingSpot } from "@/adventure/data/v2/fishingSpots";
import {
  LIFE_FIELD_DISCOVERIES,
  lifeFieldDiscoveryReward,
} from "@/adventure/v2/lifeFieldRecords";
import {
  LIFE_FIELD_ENVIRONMENTS,
  lifeFieldEnvironmentSnapshot,
  lifeFieldFlatXpBonus,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  lifeFieldSessionRoll,
  recordLifeFieldSuccessInTx,
} from "@/lib/server/lifeFieldProgress";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
  type CodexMasteryGameplayContext,
} from "@/lib/server/codexMasteryGameplay";

// POST /api/v2/fishing/reel — 챔질. body: { castId, reactionMs }.
//
// 세션을 잠가 검증·소비(한 캐스팅 = 한 번의 시도; 성공/실패 무관 소비 → replay 차단).
// 성공이면 cast 때 박제한 어획을 그대로 지급하고 낚시 도감(fishing-codex.v1)에 등록한다.
// 리더보드/코인은 후속 PR(PR-4·5).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:fishing:reel",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const b = (body ?? {}) as { castId?: unknown; reactionMs?: unknown };
  if (typeof b.castId !== "string" || typeof b.reactionMs !== "number" || !Number.isFinite(b.reactionMs)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const castId = b.castId;
  const reactionMs = b.reactionMs;
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const masteryContext: CodexMasteryGameplayContext = {};
    const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
    const activeAutoActivity = activeAutoGatheringActivity(autoStates);
    if (activeAutoActivity) {
      return {
        caught: false as const,
        reason: "auto_active" as const,
        activeAutoActivity,
      };
    }
    const fishingSaves = await lockSavesForUpdate(tx, userId, {
      [FISHING_SESSION_KEY]: {},
      [FISHING_ANTI_MACRO_KEY]: {},
      [ACTIVITY_GUARD_KEY]: {},
      [FISHING_STREAK_KEY]: {},
      [FISHING_STOCK_KEY]: emptyFishingStock(),
      [FISHING_PROGRESS_KEY]: emptyFishingProgression(),
    });
    const session = parseFishingSession(fishingSaves[FISHING_SESSION_KEY]);
    // 열린 세션 없음 = cast 안 함 / 이미 소비됨.
    if (!session) return { caught: false as const, reason: "no_session" as const };
    // 새 캐스팅이 이 세션을 덮어썼다(다른 castId) — 현재 세션은 보존하고 거부.
    if (session.castId !== castId) {
      return { caught: false as const, reason: "stale" as const };
    }

    // castId 일치 → 판정하고 세션 소비(성공/실패 무관).
    const dirtySaves: Record<string, unknown> = {
      [FISHING_SESSION_KEY]: {},
    };
    const judgment = judgeCatch({
      reactionMs,
      serverNow: now,
      biteAt: session.biteAt,
      expiresAt: session.expiresAt,
    });
    const antiMacro = recordFishingAntiMacroSample(
      parseFishingAntiMacroState(
        fishingSaves[FISHING_ANTI_MACRO_KEY],
      ),
      {
        at: now,
        caught: judgment.caught,
        reason: judgment.reason,
        clientReactionMs: reactionMs,
        serverReactionMs: Math.max(0, judgment.serverReactionMs),
        earlyByMs: Math.max(0, -judgment.serverReactionMs),
      },
      now,
    );
    dirtySaves[FISHING_ANTI_MACRO_KEY] = antiMacro.state;
    let guardUpdate = recordActivityCompletion(
      parseActivityGuardState(
        fishingSaves[ACTIVITY_GUARD_KEY],
      ),
      "fishing",
      now,
      {
        patternSignals: antiMacro.signals,
      },
    );
    const strongSignal = antiMacro.signals.find(isFishingAntiMacroStrongSignal);
    let guardStrongSignal: string | null = null;
    if (strongSignal) {
      const strongUpdate = recordActivityStrongSignal(
        guardUpdate.state,
        "fishing",
        now,
      );
      guardUpdate = {
        ...guardUpdate,
        state: strongUpdate.state,
        checkpointNewlyRequired:
          guardUpdate.checkpointNewlyRequired || strongUpdate.checkpointNewlyRequired,
      };
      if (strongUpdate.checkpointNewlyRequired) guardStrongSignal = strongSignal;
    }
    const nextActionAt = Math.max(
      activityGuardView(guardUpdate.state, "fishing").nextActionAt ?? 0,
      antiMacro.state.frictionUntil ?? 0,
    ) || null;
    dirtySaves[ACTIVITY_GUARD_KEY] = guardUpdate.state;
    if (!judgment.caught) {
      const streak = resetFishingStreak(
        fishingSaves[FISHING_STREAK_KEY],
      );
      dirtySaves[FISHING_STREAK_KEY] = streak;
      await upsertSaves(tx, userId, dirtySaves);
      return {
        caught: false as const,
        reason: judgment.reason,
        antiMacro: {
          flagged: antiMacro.flagged,
          suspicion: antiMacro.state.suspicion,
          signals: antiMacro.signals,
          frictionMs: antiMacro.frictionMs,
        },
        guardState: guardUpdate.state,
        guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
        guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
        guardBehaviorSignal: guardUpdate.behaviorSignal,
        guardStrongSignal,
        nextActionAt,
      };
    }

    const fishingSpotId = getFishingSpot(session.fishingSpotId).id;
    const lifeFeatures = await readLifeFieldFeatureSettings(tx);
    const lifeEnvironmentId =
      session.lifeEnvironmentId ??
      lifeFieldEnvironmentSnapshot("fishing", fishingSpotId, now).environment.id;
    const lifeEnvironment = LIFE_FIELD_ENVIRONMENTS[lifeEnvironmentId];
    const lifeField = await recordLifeFieldSuccessInTx(tx, userId, {
      activity: "fishing",
      sourceId: fishingSpotId,
      environmentId: lifeEnvironmentId,
      sessionId: session.castId,
      now,
      features: lifeFeatures,
      masteryContext,
    });
    const completedDiscovery = lifeField.completedTrace
      ? LIFE_FIELD_DISCOVERIES[lifeField.completedTrace.discoveryId]
      : null;
    const discoveryReward =
      completedDiscovery && lifeFeatures.discoveryRewardsEnabled
        ? lifeFieldDiscoveryReward(completedDiscovery.rare)
        : null;
    const discoveryRewardCoins = discoveryReward?.resource ?? 0;
    const discoveryRewardXp = discoveryReward?.xp ?? 0;

    const streak = nextFishingStreak(
      fishingSaves[FISHING_STREAK_KEY],
    );
    dirtySaves[FISHING_STREAK_KEY] = streak;
    const streakBuff = fishingStreakBuff(streak.current);
    const multtaeEffect = multtaeAt(now).condition.effect;
    const dayKey = kstDailyKey(new Date(now));

    const parsedProgress = parseFishingProgressionWithLevelMigration(
      fishingSaves[FISHING_PROGRESS_KEY],
    );
    const progressBefore = parsedProgress.state;
    const fishingLevelBeforeCatch = fishingProgressionView(progressBefore).level;

    // 어종·크기는 도감/기록에 남기고, 공동 식재료는 티어별 5종으로만 적립한다.
    // 길드 식당 기부도 어획물 → 식사 효과 순서로 잠그므로 같은 순서를 지킨다.
    const stockBefore = parseFishingStock(
      fishingSaves[FISHING_STOCK_KEY],
    );
    const catchStock = rollFishingCatchToStock(
      stockBefore,
      FISH[session.fishId].tier,
      dayKey,
      Math.random,
      fishingLevelBeforeCatch,
    );
    if (catchStock.awarded) {
      dirtySaves[FISHING_STOCK_KEY] = catchStock.stock;
    }

    // 낚시 진행도 — 성공한 챔질에만 경험치/누적 어획을 지급한다.
    // 락 순서: 세션 → streak → 어획물 → 낚시진행도 → 식사 효과 → character → proficiency → 반복퀘스트 → 코덱스 → 일일트래커 → 지갑.
    const progressGoalViewsBefore = deriveFishingGoalViews(progressBefore);
    const diningXp = await consumeGuildDiningEffect(
      tx,
      userId,
      "life_xp",
      fishingXpForCatch(session.fishId),
      new Date(now),
    );
    const environmentXpGained = lifeFeatures.environmentEnabled
      ? lifeFieldFlatXpBonus(
          lifeEnvironment.effect.flatXpBonus ?? 0,
          lifeEnvironment.effect.flatXpBonusChance ?? 0,
          lifeFieldSessionRoll(session.castId, "xp-bonus"),
        )
      : 0;
    const progressResult = addFishingCatchXp(
      progressBefore,
      session.fishId,
      diningXp.bonus + environmentXpGained + discoveryRewardXp,
    );
    dirtySaves[FISHING_PROGRESS_KEY] = progressResult.state;
    const progressView = fishingProgressionView(progressResult.state);
    await rewardReferralTutorialTasks(
      tx,
      userId,
      "새 모험가",
      referralLifeTaskIds(progressView.level),
    );

    // 낚시 숙련도 — 현재 직업과 관계없이 직접 전직해 본 낚시 직업 중
    // 가장 높은 차수의 직업 숙련도만 성공한 챔질당 +1. 생존자 직군 숙련도는 올리지 않는다.
    // 스태미나 없는 루프라 숙달 포인트(points)는 주지 않는다.
    const characterSaves = await lockSavesForUpdate(tx, userId, {
      "character.v2": {},
      "proficiency.v2": {},
    });
    const charSave = characterSaves["character.v2"] as {
      class?: unknown;
      specChoice?: unknown;
    };
    const playerClass = parseV2Class(charSave.class);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let prof = parseProficiencyForChar(
      characterSaves["proficiency.v2"],
      charSave,
    );
    const masteryJobId = highestVisitedFishingJobId(prof, jobId);
    prof = addJobHistory(prof, jobId, masteryJobId);
    const masteryGained = masteryJobId ? 1 : 0;
    let masteryAfter: number | null = null;
    if (masteryJobId) {
      prof = addJobCumLevel(prof, masteryJobId, 1);
      masteryAfter = prof.jobCumLevel?.[masteryJobId] ?? 0;
    }
    dirtySaves["proficiency.v2"] = prof;

    // 자정/주간 경계 뒤 첫 낚시도 반복 퀘스트에 포함되도록, 누적 어획 신호를
    // 변경하기 전에 새 주기의 baseline 을 확정한다. repeat → codex 순서는 번들 수령과 동일하다.
    await rolloverRepeatQuestsBeforeProgress(tx, userId, new Date(now));

    // 도감 등록 — 같은 트랜잭션에서 코덱스 키를 잠그고 갱신.
    const codex = parseFishCodex(
      await lockSaveForUpdate(tx, userId, FISHING_CODEX_KEY, {}),
    );
    const prev = codex.fish[session.fishId];
    const prevBest = prev?.bestSize ?? 0;
    const isNewSpecies = prev?.caughtEver !== true;
    const registrationRestored = prev?.caughtEver === true && prev.registered !== true;
    const isPersonalBest = session.size > prevBest;
    const next = recordCatch(codex, session.fishId, session.size, now);
    dirtySaves[FISHING_CODEX_KEY] = next;

    // 주간 종별 기록 upsert(개인 최대어) — 같은 tx. 리더보드/정산(PR-5)의 원천.
    await upsertFishingRecord(
      tx,
      userId,
      currentFishingSeasonId(new Date(now)),
      session.fishId,
      session.size,
      new Date(now),
    );

    if (isTinyCatch(session.fishId, session.size)) {
      await grantTitleIfMissingInTx(
        tx,
        userId,
        TINY_CATCH_TITLE_ID,
        now,
      );
    }

    // 일일 낚시 도전과제 — 그날 카운터를 올린다(일 경계 롤오버는 applyDailyCatch 내부). 같은 tx.
    //   락 순서: 세션 → 코덱스 → 일일트래커 → (조각). claim 라우트는 일일트래커 → 지갑이라 순환 없음.
    const dailyWalletSaves = await lockSavesForUpdate(tx, userId, {
      [FISHING_DAILY_KEY]: {},
      [FISHING_WALLET_KEY]: {},
    });
    const dailyBefore = rolloverFishingDaily(
      parseFishingDaily(
        dailyWalletSaves[FISHING_DAILY_KEY],
      ),
      dayKey,
    );
    const contractViewsBefore = deriveFishingContractViews(dailyBefore);
    const dailyViewsBefore = deriveFishingDailyViews(dailyBefore);
    const daily = applyDailyCatch(
      dailyBefore,
      session.fishId,
      dayKey,
      session.size,
    );
    dirtySaves[FISHING_DAILY_KEY] = daily;
    const contractViewsAfter = deriveFishingContractViews(daily);
    const dailyViewsAfter = deriveFishingDailyViews(daily);
    const goalViewsAfter = progressView.goals;
    const challengeProgress = [
      ...fishingProgressNotices(
        "contract",
        contractViewsBefore,
        contractViewsAfter,
      ),
      ...fishingProgressNotices("daily", dailyViewsBefore, dailyViewsAfter),
      ...fishingProgressNotices(
        "goal",
        progressGoalViewsBefore,
        goalViewsAfter,
      ),
    ];
    const challengeClaimableCount = countClaimableFishingTasks([
      contractViewsAfter,
      dailyViewsAfter,
      goalViewsAfter,
    ]);

    // 챔질당 코인 — 티어 소량(크기 무관) 적립, 일일 상한 클램프. 락 순서: 일일 → 지갑
    //   (= challenges/claim 라우트와 동일 순서라 순환/데드락 없음). 캐스팅·실패엔 미지급(여기는 caught 분기).
    const walletBeforeCoins = dailyWalletSaves[FISHING_WALLET_KEY];
    const hotTime = await readActiveHotTime(now, tx);
    const baseCatchCoin =
      (FISHING_CATCH_COIN_BY_TIER[FISH[session.fishId].tier] ?? 0) +
      streakBuff.coinBonus +
      (multtaeEffect.coinBonus ?? 0);
    const hotTimeCatchCoin = hotTime.active
      ? applyPctBonus(baseCatchCoin, hotTime.bonuses.fishingCoinPct)
      : baseCatchCoin;
    const hotTimeCatchBonus = bonusDelta(baseCatchCoin, hotTimeCatchCoin);
    const coinResult = applyCatchCoin(
      walletBeforeCoins,
      FISH[session.fishId].tier,
      dayKey,
      streakBuff.coinBonus + (multtaeEffect.coinBonus ?? 0) + hotTimeCatchBonus,
    );
    const baseLevelRewardCoins = progressResult.leveledUp
      ? fishingLevelRewardCoins(progressView.level)
      : 0;
    const levelRewardCoins =
      hotTime.active && baseLevelRewardCoins > 0
        ? applyPctBonus(baseLevelRewardCoins, hotTime.bonuses.fishingCoinPct)
        : baseLevelRewardCoins;
    const hotTimeLevelBonus = bonusDelta(baseLevelRewardCoins, levelRewardCoins);
    const walletAfterBaseRewards =
      levelRewardCoins > 0
        ? fishingWalletWithCoins(
            coinResult.next,
            coinResult.next.coins + levelRewardCoins,
          )
        : coinResult.next;
    const walletAfterCoins =
      discoveryRewardCoins > 0
        ? fishingWalletWithCoins(
            walletAfterBaseRewards,
            walletAfterBaseRewards.coins + discoveryRewardCoins,
          )
        : walletAfterBaseRewards;
    dirtySaves[FISHING_WALLET_KEY] = walletAfterCoins;

    const coopBoss = await trySpawnFishingCoopBoss(tx, {
      userId,
      summonerName: "모험가",
      now: new Date(now),
    });
    await incrementGuildExplorationProgressForUser(
      tx,
      userId,
      "fishingCatches",
      1,
      new Date(now),
    );
    let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    let crafting = workshop.crafting;
    crafting = consumeLifeAidUses(crafting, "fishing", session.aidItemId, 1).state;
    const blueprint = rollHiddenBlueprint(crafting, "fishing");
    workshop = { ...workshop, crafting: blueprint.state };
    dirtySaves[LIFE_WORKSHOP_SAVE_KEY] = workshop;

    await upsertSaves(tx, userId, dirtySaves);

    const codexMasteryEvents: CodexMasteryGameplayEvent[] = [{
      category: "fish",
      entryId: session.fishId,
      amount: 1,
      bestValue: session.size,
      source: "fishing.catch",
    }];
    if (masteryJobId && masteryGained > 0) {
      codexMasteryEvents.push({
        category: "job",
        entryId: masteryJobId,
        amount: masteryGained,
        source: "job.activity",
      });
    }
    await recordCodexMasteryGameplayBatch(
      tx,
      userId,
      codexMasteryEvents,
      new Date(now),
      masteryContext,
    );

    return {
      caught: true as const,
      blueprintRecipeId: blueprint.recipe?.id ?? null,
      fishId: session.fishId,
      size: session.size,
      isNewSpecies,
      registrationRestored,
      isPersonalBest,
      prevBest,
      codexCount: countDiscoveredFish(next),
      coinsGained: coinResult.awarded,
      levelRewardCoins,
      coins: walletAfterCoins.coins,
      catchItem: catchStock.awarded
        ? {
            id: catchStock.item.id,
            name: catchStock.item.name,
            icon: catchStock.item.icon,
            quantity: 1,
            balance: catchStock.balance,
            dailyAwarded: catchStock.dailyAwarded,
            dailyCap: catchStock.dailyCap,
          }
        : null,
      catchItemStatus: catchStock.reason,
      catchItemDaily: {
        itemId: catchStock.item.id,
        name: catchStock.item.name,
        awarded: catchStock.dailyAwarded,
        cap: catchStock.dailyCap,
      },
      dailyCatchCoins: fishingCatchCoinProgress(walletAfterCoins, dayKey),
      fishingXpGained: progressResult.xpGained,
      environmentXpGained,
      discoveryRewardCoins,
      discoveryRewardXp,
      fishingLevel: progressView.level,
      fishingLevelUp: progressResult.leveledUp,
      fishingCatches: progressView.catches,
      progression: progressView,
      challengeProgress,
      challengeClaimableCount,
      masteryGained,
      masteryAfter,
      levelCurveMigrated: parsedProgress.levelCurveMigrated,
      coopBoss,
      streak,
      streakBuff,
      hotTime:
        hotTime.active && (hotTimeCatchBonus > 0 || hotTimeLevelBonus > 0)
          ? {
              title: hotTime.title,
              fishingCoinPct: hotTime.bonuses.fishingCoinPct,
              catchBonus: hotTimeCatchBonus,
              levelBonus: hotTimeLevelBonus,
            }
          : null,
      antiMacro: {
        flagged: antiMacro.flagged,
        suspicion: antiMacro.state.suspicion,
        signals: antiMacro.signals,
        frictionMs: antiMacro.frictionMs,
      },
      guardState: guardUpdate.state,
      guardExtremeVolumeAlert: guardUpdate.extremeVolumeAlert,
      guardCheckpointNewlyRequired: guardUpdate.checkpointNewlyRequired,
      guardBehaviorSignal: guardUpdate.behaviorSignal,
      guardStrongSignal,
      nextActionAt,
      lifeEnvironment: lifeFeatures.environmentEnabled ? lifeEnvironment : null,
      lifeField: {
        newRecordIds: lifeField.newRecordIds,
        foundTrace: lifeField.foundTrace,
        completedTrace: lifeField.completedTrace,
      },
      lifeFieldFeedEnabled: lifeFeatures.feedEnabled,
    };
  });

  if (result.caught && result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.blueprintRecipeId });
  if (
    result.caught &&
    result.lifeFieldFeedEnabled &&
    result.lifeField.completedTrace &&
    LIFE_FIELD_DISCOVERIES[result.lifeField.completedTrace.discoveryId].rare
  ) {
    await insertFeedEntry(userId, "life_discovery", {
      discoveryId: result.lifeField.completedTrace.discoveryId,
    });
  }

  if (!result.caught && result.reason === "auto_active") {
    return Response.json(
      {
        ok: false,
        error: "auto_active",
        activeAutoActivity: result.activeAutoActivity,
      },
      { status: 409 },
    );
  }

  if (result.guardStrongSignal) {
    recordStrongActivitySignalSoon({
      req,
      userId,
      activity: "fishing",
      signal: result.guardStrongSignal,
      state: result.guardState,
    });
  }
  if (result.guardExtremeVolumeAlert) {
    recordExtremeActivityAlertSoon({
      req,
      userId,
      activity: "fishing",
      state: result.guardState,
    });
  }
  if (result.guardCheckpointNewlyRequired) {
    recordActivityVerificationRequiredSoon({
      req,
      userId,
      activity: "fishing",
      state: result.guardState,
    });
  }
  if (result.guardBehaviorSignal) {
    recordBehaviorActivitySignalSoon({
      req,
      userId,
      activity: "fishing",
      signal: result.guardBehaviorSignal,
      state: result.guardState,
    });
  }

  if (result.antiMacro?.flagged) {
    recordAbuseEventSoon({
      userId,
      ip: clientIpFromRequest(req),
      action: "v2:fishing:reel",
      reason: "fishing_macro_pattern",
      detail: {
        suspicion: result.antiMacro.suspicion,
        signals: result.antiMacro.signals,
        frictionMs: result.antiMacro.frictionMs,
      },
    });
  }

  if (!result.caught) {
    if ("guardState" in result) {
      recordLifeGatheringTelemetrySoon({
        userId,
        activity: "fishing",
        sourceId: result.reason,
        sourceName: "놓친 입질",
        grade: 1,
        success: false,
        failureRate: 0,
        xpGained: 0,
        drops: [],
      });
    }
    return Response.json({
      ok: true,
      caught: false,
      reason: result.reason,
      nextActionAt: result.nextActionAt,
    });
  }
  const fish = FISH[result.fishId];
  const fishGrade =
    fish.tier === "legendary"
      ? 5
      : fish.tier === "epic"
        ? 4
        : fish.tier === "rare"
          ? 3
          : fish.tier === "uncommon"
            ? 2
            : 1;
  recordLifeGatheringTelemetrySoon({
    userId,
    activity: "fishing",
    sourceId: result.fishId,
    sourceName: fish.name,
    grade: fishGrade,
    success: true,
    failureRate: 0,
    xpGained: result.fishingXpGained,
    drops: result.catchItem
      ? [
          {
            materialId: result.catchItem.id,
            materialName: result.catchItem.name,
            quantity: result.catchItem.quantity,
            primary: true,
          },
        ]
      : [],
  });
  // 낚시 대물 — 종 크기 상위 구간 + 개인 신기록이면 전광판/소식 피드에 알린다.
  //   디바운스(같은 유저+type 60s)·보관 trim 은 insertFeedEntry 가 자동 처리(도배 방지).
  if (result.isPersonalBest && isBigCatch(result.fishId, result.size)) {
    await insertFeedEntry(userId, "fishing_big_catch", {
      fishId: result.fishId,
      size: result.size,
    });
  }
  if (result.coinsGained > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "currency.fishing.catch",
      itemKind: "fishing_coin",
      itemId: "catch_daily_cap",
      quantity: result.coinsGained,
      detail: {
        fishId: result.fishId,
        tier: fish.tier,
        dailyEarned: result.dailyCatchCoins.earned,
        dailyCap: result.dailyCatchCoins.cap,
        hotTime: result.hotTime,
      },
    });
  }
  if (result.levelRewardCoins > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.fishing.level",
      itemKind: "fishing_coin",
      itemId: "level_reward",
      quantity: result.levelRewardCoins,
      detail: {
        fishingLevel: result.fishingLevel,
        fishId: result.fishId,
        hotTime: result.hotTime,
      },
    });
  }
  // 물때 한정 특별 손님이면 그 물때 정보를 동봉(결과 오버레이 "○○ 물때의 손님" 표시용).
  const mt = fish.condition ? MULTTAE_BY_ID.get(fish.condition) : undefined;
  return Response.json({
    ok: true,
    caught: true,
    fishId: result.fishId,
    name: fish.name,
    tier: fish.tier,
    size: result.size,
    isNewSpecies: result.isNewSpecies,
    registrationRestored: result.registrationRestored,
    isPersonalBest: result.isPersonalBest,
    prevBest: result.prevBest,
    codexCount: result.codexCount,
    // 챔질당 코인 — 이번 마리 지급액(일일 상한 도달 시 0) + 누적 잔액.
    coinsGained: result.coinsGained,
    levelRewardCoins: result.levelRewardCoins,
    coins: result.coins,
    catchItem: result.catchItem,
    catchItemStatus: result.catchItemStatus,
    catchItemDaily: result.catchItemDaily,
    dailyCatchCoins: result.dailyCatchCoins,
    fishingXpGained: result.fishingXpGained,
    environmentXpGained: result.environmentXpGained,
    discoveryRewardCoins: result.discoveryRewardCoins,
    discoveryRewardXp: result.discoveryRewardXp,
    fishingLevel: result.fishingLevel,
    fishingLevelUp: result.fishingLevelUp,
    fishingCatches: result.fishingCatches,
    progression: result.progression,
    challengeProgress: result.challengeProgress,
    challengeClaimableCount: result.challengeClaimableCount,
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    special: mt ? { id: mt.id, label: mt.label, emoji: mt.emoji } : undefined,
    coopBoss: result.coopBoss,
    streak: {
      current: result.streak.current,
      best: result.streak.best,
      buffTier: result.streakBuff.tier,
      coinBonus: result.streakBuff.coinBonus,
    },
    hotTime: result.hotTime,
    nextActionAt: result.nextActionAt,
    lifeEnvironment: result.lifeEnvironment,
    lifeField: result.lifeField,
    ...(result.levelCurveMigrated ? { levelCurveMigrated: true } : {}),
  });
}
