import { describe, expect, it } from "vitest";
import {
  LIFE_REQUEST_DAILY_LIMIT,
  LIFE_REQUEST_GRADES,
  LIFE_REQUEST_REQUESTERS,
  LIFE_REQUEST_TRUST_SPECIAL_UNLOCK,
  LIFE_REQUEST_WEEKLY_LIMIT,
  completeLifeRequest,
  emptyLifeRequestsState,
  lifeRequestBlockReason,
  lifeRequestGradeForDeliveries,
  lifeRequestRerollBlockReason,
  lifeRequestTrustLevel,
  lifeRequestItemName,
  lifeRequestsForPeriod,
  parseLifeRequestsState,
  rerollLifeRequestLane,
} from "./lifeRequests";

describe("life request board", () => {
  it("creates three grades for four daily lanes, two weekly choices, and a three-step chain deterministically", () => {
    const first = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const second = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    expect(first).toEqual(second);
    expect(first.daily).toHaveLength(12);
    expect(new Set(first.daily.map((request) => request.lane))).toEqual(new Set(["woodcutting", "mining", "processing", "crafting"]));
    expect(new Set(first.daily.map((request) => request.grade))).toEqual(new Set(["normal", "skilled", "expert"]));
    expect(first.daily.every((request) => request.itemKind === "material" || request.itemKind === "crafted")).toBe(true);
    expect(first.weekly).toHaveLength(2);
    expect(first.weekly.every((request) => request.lane === "processing" || request.lane === "crafting")).toBe(true);
    expect(first.chain.map((request) => request.chainStage)).toEqual([1, 2, 3]);
    expect(first.special).toHaveLength(5);
    expect(first.special.every((request) => request.requesterSpecial && request.requiredRequesterTrust === LIFE_REQUEST_TRUST_SPECIAL_UNLOCK)).toBe(true);
  });

  it("rolls only the changed period while preserving lifetime stats", () => {
    const parsed = parseLifeRequestsState({
      daily: { key: "old", completedIds: ["daily_pine"] },
      weekly: { key: "2026-08-03", completedIds: ["weekly_softwood"] },
      chain: { key: "old", completedIds: ["chain_wood_raw"] },
      stats: { totalDeliveries: 12, dailyDeliveries: 10, weeklyDeliveries: 2, chainDeliveries: 1 },
    }, "2026-08-06", "2026-08-03");
    expect(parsed.daily.completedIds).toEqual([]);
    expect(parsed.weekly.completedIds).toEqual(["weekly_softwood"]);
    expect(parsed.chain.completedIds).toEqual([]);
    expect(parsed.stats.totalDeliveries).toBe(12);
  });

  it("enforces three daily choices and one weekly choice", () => {
    let state = emptyLifeRequestsState("d", "w");
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const normal = board.daily.filter((request) => request.grade === "normal");
    for (const request of normal.slice(0, LIFE_REQUEST_DAILY_LIMIT)) state = completeLifeRequest(state, request)!;
    expect(completeLifeRequest(state, normal[LIFE_REQUEST_DAILY_LIMIT])).toBeNull();
    state = completeLifeRequest(state, board.weekly[0])!;
    expect(state.weekly.completedIds).toHaveLength(LIFE_REQUEST_WEEKLY_LIMIT);
    expect(completeLifeRequest(state, board.weekly[1])).toBeNull();
  });

  it("unlocks higher grades from cumulative deliveries and scales their value", () => {
    expect(lifeRequestGradeForDeliveries(0)).toBe("normal");
    expect(lifeRequestGradeForDeliveries(10)).toBe("skilled");
    expect(lifeRequestGradeForDeliveries(50)).toBe("expert");
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const normal = board.daily.find((request) => request.grade === "normal")!;
    const skilled = board.daily.find((request) => request.id === normal.id.replace(":normal", ":skilled"))!;
    expect(skilled.quantity).toBe(normal.quantity * LIFE_REQUEST_GRADES.skilled.quantityMultiplier);
    expect(skilled.rewardGold).toBeGreaterThan(normal.rewardGold * 2);
    expect(lifeRequestBlockReason(emptyLifeRequestsState("d", "w"), skilled)).toBe("grade_locked");
  });

  it("requires chained requests to be completed in order without using the weekly limit", () => {
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    let state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    state = { ...state, stats: { ...state.stats, totalDeliveries: 10 } };
    expect(lifeRequestBlockReason(state, board.chain[1])).toBe("chain_locked");
    state = completeLifeRequest(state, board.chain[0])!;
    state = completeLifeRequest(state, board.chain[1])!;
    state = completeLifeRequest(state, board.chain[2])!;
    expect(state.chain.completedIds).toHaveLength(3);
    expect(state.weekly.completedIds).toHaveLength(0);
    expect(state.stats.chainDeliveries).toBe(3);
  });

  it("resolves labels from every supported inventory", () => {
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    for (const request of [...board.daily, ...board.weekly, ...board.chain]) {
      expect(lifeRequestItemName(request)).not.toBe(request.itemId);
    }
  });

  it("accumulates requester trust, permanent records, and the latest twenty deliveries", () => {
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const request = board.daily.find((entry) => entry.grade === "normal")!;
    let state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    state = completeLifeRequest(state, request, 123_456)!;
    expect(state.requesterTrust[request.requesterId]).toBe(1);
    expect(state.records.byGrade.normal).toBe(1);
    expect(state.records.byLane[request.lane]).toBe(1);
    expect(state.records.goldEarned).toBe(request.rewardGold);
    expect(state.history[0]).toMatchObject({ requestId: request.id, completedAt: 123_456 });
    expect(lifeRequestTrustLevel(5).label).toBe("안면");

    const parsed = parseLifeRequestsState(state, "2026-08-07", "2026-08-03");
    expect(parsed.daily.completedIds).toEqual([]);
    expect(parsed.requesterTrust[request.requesterId]).toBe(1);
    expect(parsed.history).toHaveLength(1);
  });

  it("rerolls one unfinished lane once per day and changes its request", () => {
    const dailyKey = "2026-08-06";
    const weeklyKey = "2026-08-03";
    const board = lifeRequestsForPeriod(dailyKey, weeklyKey);
    const state = emptyLifeRequestsState(dailyKey, weeklyKey);
    const previous = board.daily.find((entry) => entry.lane === "woodcutting")!;
    const rerolled = rerollLifeRequestLane(state, "woodcutting", board.daily)!;
    const next = lifeRequestsForPeriod(dailyKey, weeklyKey, rerolled.daily.rerolledLane);
    expect(next.daily.find((entry) => entry.lane === "woodcutting")!.id).not.toBe(previous.id);
    expect(lifeRequestRerollBlockReason(rerolled, "mining", next.daily)).toBe("reroll_used");

    const completed = completeLifeRequest(state, previous)!;
    expect(lifeRequestRerollBlockReason(completed, "woodcutting", board.daily)).toBe("reroll_completed");
  });

  it("unlocks requester-only weekly requests at trust 15 and shares the weekly limit", () => {
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const special = board.special[0];
    let state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    state = { ...state, stats: { ...state.stats, totalDeliveries: 15 } };
    expect(lifeRequestBlockReason(state, special)).toBe("requester_locked");
    state = { ...state, requesterTrust: { ...state.requesterTrust, [special.requesterId]: 15 } };
    state = completeLifeRequest(state, special, 1)!;
    expect(state.weekly.completedIds).toEqual([special.id]);
    expect(lifeRequestBlockReason(state, board.weekly[0])).toBe("period_limit");
    expect(LIFE_REQUEST_REQUESTERS[special.requesterId].regularTitleId).toMatch(/^life_request_/);
  });

  it("stores the selected second reroll candidate", () => {
    const board = lifeRequestsForPeriod("2026-08-06", "2026-08-03");
    const state = rerollLifeRequestLane(emptyLifeRequestsState("2026-08-06", "2026-08-03"), "mining", board.daily, 2)!;
    expect(state.daily).toMatchObject({ rerolledLane: "mining", rerolledOffset: 2 });
    const first = lifeRequestsForPeriod("2026-08-06", "2026-08-03", "mining", 1).daily.find((request) => request.lane === "mining")!;
    const second = lifeRequestsForPeriod("2026-08-06", "2026-08-03", "mining", 2).daily.find((request) => request.lane === "mining")!;
    expect(second.id).not.toBe(first.id);
  });
});
