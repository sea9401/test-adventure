import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { kstDailyKey, kstWeeklyKey, nextDailyResetAt, nextWeeklyResetAt } from "@/adventure/data/v2/v2RepeatQuests";
import {
  LIFE_REQUESTS_SAVE_KEY,
  LIFE_REQUEST_GRADE_ORDER,
  LIFE_REQUEST_GRADES,
  LIFE_REQUEST_REQUESTERS,
  LIFE_REQUEST_TRUST_REROLL_UNLOCK,
  LIFE_REQUEST_TRUST_SPECIAL_UNLOCK,
  LIFE_REQUEST_TRUST_TITLE_UNLOCK,
  completeLifeRequest,
  emptyLifeRequestsState,
  isLifeFinishedRequestItem,
  lifeRequestBlockReason,
  lifeRequestGradeForDeliveries,
  lifeRequestGradeUnlocked,
  lifeRequestItemName,
  lifeRequestRerollBlockReason,
  lifeRequestTrustGain,
  lifeRequestTrustLevel,
  lifeRequestsForPeriod,
  parseLifeRequestsState,
  rerollLifeRequestLane,
  type LifeRequestDefinition,
  type LifeRequestLane,
  type LifeRequestRequesterId,
} from "@/adventure/v2/lifeRequests";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { consumeFinishedItem } from "@/adventure/v2/lifeCrafting";
import { FARM_DAILY_DELIVERY_LIMIT, FARM_SAVE_KEY, emptyFarmState, normalizeFarmForDay, parseFarmState } from "@/adventure/v2/farm";
import { FISHING_PROGRESS_KEY, emptyFishingProgression, parseFishingProgression } from "@/adventure/v2/fishingProgression";
import { COOKING_DAILY_REQUEST_COUNT, COOKING_SAVE_KEY, emptyCookingState, parseCookingState } from "@/adventure/v2/cooking/state";
import { WOODCUTTING_LOG_KEY, parseWoodcuttingLog } from "@/adventure/v2/woodcuttingSession";
import { MINING_LOG_KEY, parseMiningLog } from "@/adventure/v2/miningSession";
import { FISHING_DAILY_CHALLENGES, FISHING_DAILY_KEY, emptyFishingDaily, parseFishingDaily, rolloverFishingDaily } from "@/adventure/data/v2/fishingDailyChallenges";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { TITLES } from "@/adventure/data/titles";

type CharacterSave = Record<string, unknown> & { gold?: unknown; materials?: unknown };

type Snapshot = {
  char: CharacterSave;
  workshopRaw: unknown;
  farmRaw: unknown;
  cookingRaw: unknown;
  fishingDailyRaw: unknown;
  requestsRaw: unknown;
};

function period(now: Date) {
  return { dailyKey: kstDailyKey(now), weeklyKey: kstWeeklyKey(now) };
}

function requestBalance(request: LifeRequestDefinition, snapshot: Snapshot): number {
  if (request.itemKind === "material") return mergeDrops(snapshot.char.materials, {})[request.itemId] ?? 0;
  return parseLifeWorkshopState(snapshot.workshopRaw).crafting.balances[request.itemId as never] ?? 0;
}

function requestSource(request: LifeRequestDefinition) {
  if (request.lane === "woodcutting") {
    return { label: "벌목터에서 획득", href: "/town/logging" };
  }
  if (request.lane === "mining") {
    return { label: "광산에서 획득", href: "/town/mining" };
  }
  if (request.lane === "processing") {
    return { label: "재료 가공에서 제작", workshopTab: "process" as const };
  }
  return { label: "생활 제작에서 제작", workshopTab: "craft" as const };
}

function boardPayload(now: Date, snapshot: Snapshot) {
  const keys = period(now);
  const state = parseLifeRequestsState(snapshot.requestsRaw, keys.dailyKey, keys.weeklyKey);
  const board = lifeRequestsForPeriod(
    keys.dailyKey,
    keys.weeklyKey,
    state.daily.rerolledLane,
    state.daily.rerolledOffset ?? 1,
  );
  const farm = normalizeFarmForDay(parseFarmState(snapshot.farmRaw), now.getTime());
  const cooking = parseCookingState(snapshot.cookingRaw, now.getTime());
  const fishingDaily = rolloverFishingDaily(parseFishingDaily(snapshot.fishingDailyRaw), keys.dailyKey);
  const view = (request: LifeRequestDefinition) => {
    const balance = requestBalance(request, snapshot);
    const prerequisiteId = request.prerequisiteId;
    return {
      ...request,
      itemName: lifeRequestItemName(request),
      balance,
      shortage: Math.max(0, request.quantity - balance),
      completed: state[request.scope].completedIds.includes(request.id),
      unlocked: lifeRequestGradeUnlocked(request.grade, state.stats.totalDeliveries),
      requesterUnlocked:
        !request.requiredRequesterTrust ||
        state.requesterTrust[request.requesterId] >= request.requiredRequesterTrust,
      chainLocked:
        request.scope === "chain" &&
        prerequisiteId !== undefined &&
        !state.chain.completedIds.includes(prerequisiteId),
      source: requestSource(request),
      trustGain: lifeRequestTrustGain(request),
    };
  };
  const currentGrade = lifeRequestGradeForDeliveries(state.stats.totalDeliveries);
  const nextGrade = LIFE_REQUEST_GRADE_ORDER.find(
    (grade) => !lifeRequestGradeUnlocked(grade, state.stats.totalDeliveries),
  );
  return {
    ok: true,
    now: now.getTime(),
    nextDailyResetAt: nextDailyResetAt(now),
    nextWeeklyResetAt: nextWeeklyResetAt(now),
    state,
    daily: board.daily.map(view),
    weekly: board.weekly.map(view),
    chain: board.chain.map(view),
    special: board.special.map(view),
    requesterProgress: (Object.keys(LIFE_REQUEST_REQUESTERS) as LifeRequestRequesterId[]).map((requesterId) => {
      const trust = state.requesterTrust[requesterId];
      return {
        id: requesterId,
        ...LIFE_REQUEST_REQUESTERS[requesterId],
        trust,
        level: lifeRequestTrustLevel(trust),
        milestones: {
          extraRerollCandidate: trust >= LIFE_REQUEST_TRUST_REROLL_UNLOCK,
          specialRequest: trust >= LIFE_REQUEST_TRUST_SPECIAL_UNLOCK,
          regularTitle: trust >= LIFE_REQUEST_TRUST_TITLE_UNLOCK,
        },
      };
    }),
    reroll: {
      used: state.daily.rerolledLane !== null,
      rerolledLane: state.daily.rerolledLane,
      rerolledOffset: state.daily.rerolledOffset,
      lanes: (["woodcutting", "mining", "processing", "crafting"] as const).map((lane) => {
        const requests = board.daily.filter((request) => request.lane === lane);
        const requesterId = requests[0]?.requesterId;
        const candidateCount = requesterId && state.requesterTrust[requesterId] >= LIFE_REQUEST_TRUST_REROLL_UNLOCK ? 2 : 1;
        return {
          lane,
          title: requests[0]?.title ?? lane,
          completed: requests.some((request) => state.daily.completedIds.includes(request.id)),
          candidates: Array.from({ length: candidateCount }, (_, index) => {
            const offset = index + 1;
            const candidate = lifeRequestsForPeriod(keys.dailyKey, keys.weeklyKey, lane, offset).daily.find((request) => request.lane === lane)!;
            return { offset, title: candidate.title, itemName: lifeRequestItemName(candidate) };
          }),
        };
      }),
    },
    gradeProgress: {
      currentGrade,
      grades: LIFE_REQUEST_GRADE_ORDER.map((grade) => ({
        grade,
        label: LIFE_REQUEST_GRADES[grade].label,
        unlockDeliveries: LIFE_REQUEST_GRADES[grade].unlockDeliveries,
        unlocked: lifeRequestGradeUnlocked(grade, state.stats.totalDeliveries),
      })),
      next: nextGrade
        ? {
            grade: nextGrade,
            label: LIFE_REQUEST_GRADES[nextGrade].label,
            unlockDeliveries: LIFE_REQUEST_GRADES[nextGrade].unlockDeliveries,
            remaining: Math.max(
              0,
              LIFE_REQUEST_GRADES[nextGrade].unlockDeliveries - state.stats.totalDeliveries,
            ),
          }
        : null,
    },
    linkedSources: [
      {
        id: "farm",
        title: "농장 납품",
        description: "작물 납품과 농장 증표 보상은 기존 농장에서 진행합니다.",
        href: "/town/farm",
        progressLabel: `오늘 ${farm.deliveries.claimedIds.length}/${FARM_DAILY_DELIVERY_LIMIT}건 완료`,
      },
      {
        id: "cooking",
        title: "요리 조건 납품",
        description: "분야·조리법·품질 조건 납품은 주방에서 진행합니다.",
        href: "/town/kitchen",
        progressLabel: `오늘 ${cooking.daily.completedRequestIds.length}/${COOKING_DAILY_REQUEST_COUNT}건 완료`,
      },
      {
        id: "fishing",
        title: "낚시 일일 과제",
        description: "어획 조건과 낚시 코인 보상은 기존 낚시 과제에서 진행합니다.",
        href: "/town/fishing/challenges",
        progressLabel: `오늘 ${fishingDaily.claimed.length}/${FISHING_DAILY_CHALLENGES.length}개 보상 수령`,
      },
    ],
  };
}

async function readSnapshot(userId: string): Promise<Snapshot> {
  const [char, workshopRaw, farmRaw, cookingRaw, fishingDailyRaw, requestsRaw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState()),
    readSave(db, userId, COOKING_SAVE_KEY, emptyCookingState()),
    readSave(db, userId, FISHING_DAILY_KEY, emptyFishingDaily("")),
    readSave(db, userId, LIFE_REQUESTS_SAVE_KEY, {}),
  ]);
  return { char, workshopRaw, farmRaw, cookingRaw, fishingDailyRaw, requestsRaw };
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:life-requests:get", userLimit: 90, ipLimit: 500, windowMs: 60_000 });
  if (limited) return limited;
  const now = new Date();
  return Response.json(boardPayload(now, await readSnapshot(userId)));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:life-requests:deliver", userLimit: 20, ipLimit: 100, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as {
    action?: unknown;
    requestId?: unknown;
    scope?: unknown;
    lane?: unknown;
    offset?: unknown;
  } | null;
  const now = new Date();
  const keys = period(now);

  if (body?.action === "reroll") {
    if (
      body.lane !== "woodcutting" &&
      body.lane !== "mining" &&
      body.lane !== "processing" &&
      body.lane !== "crafting"
    ) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const lane: LifeRequestLane = body.lane;
    const offset = Math.floor(Number(body.offset) || 1);
    const rerollResult = await db.transaction(async (tx) => {
      const state = parseLifeRequestsState(
        await lockSaveForUpdate(
          tx,
          userId,
          LIFE_REQUESTS_SAVE_KEY,
          emptyLifeRequestsState(keys.dailyKey, keys.weeklyKey),
        ),
        keys.dailyKey,
        keys.weeklyKey,
      );
      const currentBoard = lifeRequestsForPeriod(
        keys.dailyKey,
        keys.weeklyKey,
        state.daily.rerolledLane,
        state.daily.rerolledOffset ?? 1,
      );
      const blockReason = lifeRequestRerollBlockReason(state, lane, currentBoard.daily);
      if (blockReason) return { error: blockReason };
      const currentRequest = currentBoard.daily.find((request) => request.lane === lane);
      const maxOffset = currentRequest && state.requesterTrust[currentRequest.requesterId] >= LIFE_REQUEST_TRUST_REROLL_UNLOCK ? 2 : 1;
      if (offset < 1 || offset > maxOffset) return { error: "reroll_candidate_locked" as const };
      const nextState = rerollLifeRequestLane(state, lane, currentBoard.daily, offset)!;
      await upsertSave(tx, userId, LIFE_REQUESTS_SAVE_KEY, nextState);
      const nextBoard = lifeRequestsForPeriod(keys.dailyKey, keys.weeklyKey, lane, offset);
      return {
        ok: true as const,
        result: {
          action: "reroll" as const,
          lane,
          title: nextBoard.daily.find((request) => request.lane === lane)?.title ?? "새 의뢰",
        },
      };
    });
    if (!("ok" in rerollResult)) {
      return Response.json({ ok: false, error: rerollResult.error }, { status: 400 });
    }
    return Response.json({
      ...boardPayload(now, await readSnapshot(userId)),
      result: rerollResult.result,
    });
  }

  if (
    typeof body?.requestId !== "string" ||
    (body.scope !== "daily" && body.scope !== "weekly" && body.scope !== "chain")
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const preliminaryState = parseLifeRequestsState(
    await readSave(db, userId, LIFE_REQUESTS_SAVE_KEY, {}),
    keys.dailyKey,
    keys.weeklyKey,
  );
  const board = lifeRequestsForPeriod(
    keys.dailyKey,
    keys.weeklyKey,
    preliminaryState.daily.rerolledLane,
    preliminaryState.daily.rerolledOffset ?? 1,
  );
  const availableRequests = body.scope === "weekly"
    ? [...board.weekly, ...board.special]
    : board[body.scope];
  const request = availableRequests.find((entry) => entry.id === body.requestId);
  if (!request) return Response.json({ ok: false, error: "request_unavailable" }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    let char = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const farm = request.activity === "farming" ? parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now.getTime()))) : null;
    const cooking = request.activity === "cooking" ? parseCookingState(await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now.getTime())), now.getTime()) : null;
    const fishing = request.activity === "fishing" ? parseFishingProgression(await lockSaveForUpdate(tx, userId, FISHING_PROGRESS_KEY, emptyFishingProgression())) : null;
    const woodcutting = request.activity === "woodcutting" ? parseWoodcuttingLog(await lockSaveForUpdate(tx, userId, WOODCUTTING_LOG_KEY, {})) : null;
    const mining = request.activity === "mining" ? parseMiningLog(await lockSaveForUpdate(tx, userId, MINING_LOG_KEY, {})) : null;
    let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    const requests = parseLifeRequestsState(await lockSaveForUpdate(tx, userId, LIFE_REQUESTS_SAVE_KEY, emptyLifeRequestsState(keys.dailyKey, keys.weeklyKey)), keys.dailyKey, keys.weeklyKey);
    const lockedBoard = lifeRequestsForPeriod(
      keys.dailyKey,
      keys.weeklyKey,
      requests.daily.rerolledLane,
      requests.daily.rerolledOffset ?? 1,
    );
    const lockedRequests = request.scope === "weekly"
      ? [...lockedBoard.weekly, ...lockedBoard.special]
      : lockedBoard[request.scope];
    if (!lockedRequests.some((entry) => entry.id === request.id)) {
      return { error: "request_unavailable" as const };
    }
    const blockReason = lifeRequestBlockReason(requests, request);
    if (blockReason) return { error: blockReason };
    const nextRequests = completeLifeRequest(requests, request, now.getTime())!;

    if (request.itemKind === "material") {
      const materials = mergeDrops(char.materials, {});
      if ((materials[request.itemId] ?? 0) < request.quantity) return { error: "not_enough_items" as const };
      const nextMaterials = { ...materials, [request.itemId]: materials[request.itemId] - request.quantity };
      if (!nextMaterials[request.itemId]) delete nextMaterials[request.itemId];
      char = { ...char, materials: nextMaterials };
    } else {
      if (!isLifeFinishedRequestItem(request.itemId)) return { error: "bad_request" as const };
      const crafting = consumeFinishedItem(workshop.crafting, request.itemId, request.quantity);
      if (!crafting) return { error: "not_enough_items" as const };
      workshop = { ...workshop, crafting };
    }

    char = { ...char, gold: Math.max(0, Math.floor(Number(char.gold) || 0)) + request.rewardGold };
    await upsertSave(tx, userId, "character.v2", char);
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, workshop);
    if (farm) await upsertSave(tx, userId, FARM_SAVE_KEY, { ...farm, stats: { ...farm.stats, farmingXp: farm.stats.farmingXp + request.rewardXp } });
    if (cooking) await upsertSave(tx, userId, COOKING_SAVE_KEY, { ...cooking, xp: cooking.xp + request.rewardXp });
    if (fishing) await upsertSave(tx, userId, FISHING_PROGRESS_KEY, { ...fishing, xp: fishing.xp + request.rewardXp });
    if (woodcutting) await upsertSave(tx, userId, WOODCUTTING_LOG_KEY, { ...woodcutting, xp: woodcutting.xp + request.rewardXp });
    if (mining) await upsertSave(tx, userId, MINING_LOG_KEY, { ...mining, xp: mining.xp + request.rewardXp });
    await upsertSave(tx, userId, LIFE_REQUESTS_SAVE_KEY, nextRequests);
    const grantedTitleNames: string[] = [];
    const previousTrust = requests.requesterTrust[request.requesterId];
    const nextTrust = nextRequests.requesterTrust[request.requesterId];
    if (previousTrust < LIFE_REQUEST_TRUST_TITLE_UNLOCK && nextTrust >= LIFE_REQUEST_TRUST_TITLE_UNLOCK) {
      const titleId = LIFE_REQUEST_REQUESTERS[request.requesterId].regularTitleId;
      if (await grantTitleIfMissingInTx(tx, userId, titleId, now.getTime())) {
        grantedTitleNames.push(TITLES[titleId]?.name ?? titleId);
      }
    }
    return { ok: true as const, result: { action: "deliver" as const, requestId: request.id, scope: request.scope, title: request.title, itemName: lifeRequestItemName(request), quantity: request.quantity, rewardGold: request.rewardGold, rewardXp: request.rewardXp, grantedTitleNames } };
  });

  if (!("ok" in result)) return Response.json({ ok: false, error: result.error }, { status: result.error === "not_enough_items" ? 409 : 400 });
  return Response.json({ ...boardPayload(now, await readSnapshot(userId)), result: result.result });
}
