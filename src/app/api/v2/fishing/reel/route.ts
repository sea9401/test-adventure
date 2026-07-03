import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { FISH, isBigCatch } from "@/adventure/data/v2/fish";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  isFishingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { MULTTAE_BY_ID, multtaeAt } from "@/adventure/data/v2/multtae";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  FISHING_SESSION_KEY,
  judgeCatch,
  parseFishingSession,
} from "@/adventure/v2/fishingSession";
import {
  FISHING_CODEX_KEY,
  countDiscoveredFish,
  parseFishCodex,
  recordCatch,
} from "@/adventure/v2/fishingCodex";
import { currentFishingSeasonId } from "@/lib/server/fishing/season";
import { upsertFishingRecord } from "@/lib/server/fishing/records";
import {
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
  TREASURE_FRAGMENTS_KEY,
  FISHING_FRAGMENT_DROP_CHANCE,
  addFragments,
  parseTreasureFragments,
  rollFragmentDrop,
} from "@/adventure/v2/treasureFragments";
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
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  countClaimableFishingTasks,
  fishingProgressNotices,
} from "@/adventure/v2/fishingChallengeProgress";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";

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
    const session = parseFishingSession(
      await lockSaveForUpdate(tx, userId, FISHING_SESSION_KEY, {}),
    );
    // 열린 세션 없음 = cast 안 함 / 이미 소비됨.
    if (!session) return { caught: false as const, reason: "no_session" as const };
    // 새 캐스팅이 이 세션을 덮어썼다(다른 castId) — 현재 세션은 보존하고 거부.
    if (session.castId !== castId) {
      return { caught: false as const, reason: "stale" as const };
    }

    // castId 일치 → 판정하고 세션 소비(성공/실패 무관).
    await upsertSave(tx, userId, FISHING_SESSION_KEY, {});
    const judgment = judgeCatch({
      reactionMs,
      serverNow: now,
      biteAt: session.biteAt,
      expiresAt: session.expiresAt,
    });
    if (!judgment.caught) {
      const streak = resetFishingStreak(
        await lockSaveForUpdate(tx, userId, FISHING_STREAK_KEY, {}),
      );
      await upsertSave(tx, userId, FISHING_STREAK_KEY, streak);
      return { caught: false as const, reason: judgment.reason };
    }

    const streak = nextFishingStreak(
      await lockSaveForUpdate(tx, userId, FISHING_STREAK_KEY, {}),
    );
    await upsertSave(tx, userId, FISHING_STREAK_KEY, streak);
    const streakBuff = fishingStreakBuff(streak.current);
    const multtaeEffect = multtaeAt(now).condition.effect;

    // 낚시 진행도 — 성공한 챔질에만 경험치/누적 어획을 지급한다.
    // 락 순서: 세션 → streak → 낚시진행도 → character → proficiency → 코덱스 → 일일트래커 → 지갑 → 조각.
    const progressBefore = parseFishingProgression(
      await lockSaveForUpdate(
        tx,
        userId,
        FISHING_PROGRESS_KEY,
        emptyFishingProgression(),
      ),
    );
    const progressGoalViewsBefore = deriveFishingGoalViews(progressBefore);
    const progressResult = addFishingCatchXp(
      progressBefore,
      session.fishId,
    );
    await upsertSave(
      tx,
      userId,
      FISHING_PROGRESS_KEY,
      progressResult.state,
    );
    const progressView = fishingProgressionView(progressResult.state);

    // 낚시 계열 직업 숙련도 — 성공한 챔질 1회당 +1. 스태미나 없는 루프라 숙달 포인트(points)는 주지 않는다.
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const jobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let masteryGained = 0;
    let masteryAfter: number | null = null;
    if (group !== "none" && isFishingJobId(jobId)) {
      let prof = parseProficiencyForChar(
        await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
        charSave,
      );
      prof = addCumLevel(prof, group, 1);
      prof = addJobCumLevel(prof, jobId, 1);
      masteryGained = 1;
      masteryAfter = prof.jobCumLevel?.[jobId] ?? 0;
      await upsertSave(tx, userId, "proficiency.v2", prof);
    }

    // 도감 등록 — 같은 트랜잭션에서 코덱스 키를 잠그고 갱신.
    const codex = parseFishCodex(
      await lockSaveForUpdate(tx, userId, FISHING_CODEX_KEY, {}),
    );
    const prev = codex.fish[session.fishId];
    const prevBest = prev?.bestSize ?? 0;
    const isNewSpecies = !prev?.discovered;
    const isPersonalBest = session.size > prevBest;
    const next = recordCatch(codex, session.fishId, session.size, now);
    await upsertSave(tx, userId, FISHING_CODEX_KEY, next);

    // 주간 종별 기록 upsert(개인 최대어) — 같은 tx. 리더보드/정산(PR-5)의 원천.
    await upsertFishingRecord(
      tx,
      userId,
      currentFishingSeasonId(new Date(now)),
      session.fishId,
      session.size,
      new Date(now),
    );

    // 일일 낚시 도전과제 — 그날 카운터를 올린다(일 경계 롤오버는 applyDailyCatch 내부). 같은 tx.
    //   락 순서: 세션 → 코덱스 → 일일트래커 → (조각). claim 라우트는 일일트래커 → 지갑이라 순환 없음.
    const dayKey = kstDailyKey(new Date(now));
    const dailyBefore = rolloverFishingDaily(
      parseFishingDaily(
        await lockSaveForUpdate(tx, userId, FISHING_DAILY_KEY, {}),
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
    await upsertSave(tx, userId, FISHING_DAILY_KEY, daily);
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
    const walletBeforeCoins = await lockSaveForUpdate(
      tx,
      userId,
      FISHING_WALLET_KEY,
      {},
    );
    const coinResult = applyCatchCoin(
      walletBeforeCoins,
      FISH[session.fishId].tier,
      dayKey,
      streakBuff.coinBonus + (multtaeEffect.coinBonus ?? 0),
    );
    const levelRewardCoins = progressResult.leveledUp
      ? fishingLevelRewardCoins(progressView.level)
      : 0;
    const walletAfterCoins =
      levelRewardCoins > 0
        ? fishingWalletWithCoins(
            coinResult.next,
            coinResult.next.coins + levelRewardCoins,
          )
        : coinResult.next;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, walletAfterCoins);

    // 보물 탐사 — 챔질 성공 시 낮은 확률로 지도 조각 드랍(주 경로). 굴림은 100% 서버.
    // 드랍 났을 때만 키를 잠그고 누적(매 캐스팅 잠금 회피). 조각 소비(발굴)는 PR-3.
    const fragmentDrop = rollFragmentDrop(
      Math.random,
      FISHING_FRAGMENT_DROP_CHANCE +
        streakBuff.fragmentChanceBonus +
        (multtaeEffect.fragmentChanceBonus ?? 0),
    );
    let fragmentsTotal = 0;
    if (fragmentDrop > 0) {
      const frags = parseTreasureFragments(
        await lockSaveForUpdate(tx, userId, TREASURE_FRAGMENTS_KEY, {}),
      );
      const nextFrags = addFragments(frags, fragmentDrop);
      await upsertSave(tx, userId, TREASURE_FRAGMENTS_KEY, nextFrags);
      fragmentsTotal = nextFrags.fragments;
    }

    return {
      caught: true as const,
      fishId: session.fishId,
      size: session.size,
      isNewSpecies,
      isPersonalBest,
      prevBest,
      codexCount: countDiscoveredFish(next),
      coinsGained: coinResult.awarded,
      levelRewardCoins,
      coins: walletAfterCoins.coins,
      dailyCatchCoins: fishingCatchCoinProgress(walletAfterCoins, dayKey),
      fishingXpGained: progressResult.xpGained,
      fishingLevel: progressView.level,
      fishingLevelUp: progressResult.leveledUp,
      fishingCatches: progressView.catches,
      progression: progressView,
      challengeProgress,
      challengeClaimableCount,
      masteryGained,
      masteryAfter,
      fragmentDrop,
      fragmentsTotal,
      streak,
      streakBuff,
    };
  });

  if (!result.caught) {
    return Response.json({ ok: true, caught: false, reason: result.reason });
  }
  const fish = FISH[result.fishId];
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
    isPersonalBest: result.isPersonalBest,
    prevBest: result.prevBest,
    codexCount: result.codexCount,
    // 챔질당 코인 — 이번 마리 지급액(일일 상한 도달 시 0) + 누적 잔액.
    coinsGained: result.coinsGained,
    levelRewardCoins: result.levelRewardCoins,
    coins: result.coins,
    dailyCatchCoins: result.dailyCatchCoins,
    fishingXpGained: result.fishingXpGained,
    fishingLevel: result.fishingLevel,
    fishingLevelUp: result.fishingLevelUp,
    fishingCatches: result.fishingCatches,
    progression: result.progression,
    challengeProgress: result.challengeProgress,
    challengeClaimableCount: result.challengeClaimableCount,
    masteryGained: result.masteryGained,
    masteryAfter: result.masteryAfter,
    special: mt ? { id: mt.id, label: mt.label, emoji: mt.emoji } : undefined,
    // 보물 탐사 — 이번 챔질에서 지도 조각이 떨어졌는지 + 누적(0 = 안 떨어짐).
    fragmentDrop: result.fragmentDrop,
    fragmentsTotal: result.fragmentsTotal,
    streak: {
      current: result.streak.current,
      best: result.streak.best,
      buffTier: result.streakBuff.tier,
      coinBonus: result.streakBuff.coinBonus,
      fragmentChanceBonusPct: Math.round(
        result.streakBuff.fragmentChanceBonus * 100,
      ),
    },
  });
}
