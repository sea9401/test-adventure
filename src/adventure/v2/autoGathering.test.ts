import { describe, expect, it } from "vitest";
import {
  AUTO_GATHERING_DURATION_MS,
  beginAutoGathering,
  createAutoGatheringSession,
  emptyAutoGatheringState,
  parseAutoGatheringState,
  settleAutoGathering,
} from "./autoGathering";

describe("30분 자동 생활 작업", () => {
  it("작업 속도와 성공률을 기준으로 재료 80%, XP 70%를 정산한다", () => {
    const session = createAutoGatheringSession({
      sessionId: "auto-1",
      sourceId: "pine",
      sourceName: "소나무",
      materialId: "timber",
      now: 1_000,
      cycleDurationMs: 9_000,
      successRate: 0.9,
      baseXp: 10,
    });
    expect(session.readyAt).toBe(1_000 + AUTO_GATHERING_DURATION_MS);
    expect(session.attempts).toBe(200);

    const result = settleAutoGathering(
      beginAutoGathering(emptyAutoGatheringState(), session),
    );
    expect(result).toMatchObject({
      attempts: 200,
      successes: 180,
      materialsGained: 144,
      xpGained: 1_260,
      masteryGained: 126,
    });
  });

  it("버림으로 사라지는 보상은 다음 자동 작업에 넘긴다", () => {
    const first = createAutoGatheringSession({
      sessionId: "auto-1",
      sourceId: "gold",
      sourceName: "금 광맥",
      materialId: "gold",
      now: 0,
      cycleDurationMs: AUTO_GATHERING_DURATION_MS,
      successRate: 1,
      baseXp: 1,
    });
    const firstResult = settleAutoGathering(
      beginAutoGathering(emptyAutoGatheringState(), first),
    );
    expect(firstResult).toMatchObject({ materialsGained: 0, xpGained: 0 });
    expect(firstResult?.state.remainders).toMatchObject({
      materials: { gold: 0.8 },
      xp: 0.7,
    });

    const second = { ...first, sessionId: "auto-2" };
    const secondResult = settleAutoGathering(
      beginAutoGathering(firstResult!.state, second),
    );
    expect(secondResult).toMatchObject({ materialsGained: 1, xpGained: 1 });
  });

  it("손상된 저장값은 안전한 빈 상태로 읽는다", () => {
    expect(parseAutoGatheringState({ session: { sessionId: "broken" } })).toEqual(
      emptyAutoGatheringState(),
    );
  });
});
