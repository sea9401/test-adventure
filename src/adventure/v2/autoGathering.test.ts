import { describe, expect, it } from "vitest";
import {
  AUTO_GATHERING_DURATION_MS,
  autoGatheringCompletedAttempts,
  beginAutoGathering,
  cancelAutoGathering,
  createAutoGatheringSession,
  emptyAutoGatheringState,
  parseAutoGatheringState,
  settleAutoGathering,
} from "./autoGathering";

describe("자동 생활 작업", () => {
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

  it("2시간 느긋한 작업은 성공률 80%와 재료 효율 60%를 적용한다", () => {
    const session = createAutoGatheringSession({
      sessionId: "extended-auto",
      planId: "extended",
      sourceId: "pine",
      sourceName: "소나무",
      materialId: "timber",
      now: 1_000,
      cycleDurationMs: 9_000,
      successRate: 0.9,
      baseXp: 10,
    });

    expect(session).toMatchObject({
      planId: "extended",
      readyAt: 1_000 + 2 * 60 * 60_000,
      attempts: 800,
      successRate: 0.72,
      materialEfficiency: 0.6,
      xpEfficiency: 0.7,
    });
    expect(
      settleAutoGathering(beginAutoGathering(emptyAutoGatheringState(), session)),
    ).toMatchObject({
      attempts: 800,
      successes: 576,
      materialsGained: 345,
      xpGained: 4_032,
      masteryGained: 403,
    });
  });

  it("기존 저장 세션은 30분 기본 작업 효율로 호환한다", () => {
    const state = parseAutoGatheringState({
      session: {
        sessionId: "legacy-auto",
        sourceId: "pine",
        sourceName: "소나무",
        materialId: "timber",
        startedAt: 1_000,
        readyAt: 1_000 + AUTO_GATHERING_DURATION_MS,
        cycleDurationMs: 9_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });

    expect(state.session).toMatchObject({
      planId: "standard",
      materialEfficiency: 0.8,
      xpEfficiency: 0.7,
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

  it("취소 시점까지 완료된 작업 횟수만 계산하고 30분이 지나면 전부 계산한다", () => {
    const session = createAutoGatheringSession({
      sessionId: "partial-settlement",
      sourceId: "iron",
      sourceName: "철 광맥",
      materialId: "iron",
      now: 1_000,
      cycleDurationMs: 9_000,
      successRate: 1,
      baseXp: 10,
    });

    expect(autoGatheringCompletedAttempts(session, 1_000 + 15 * 60_000)).toBe(100);
    expect(autoGatheringCompletedAttempts(session, session.readyAt)).toBe(200);
    expect(autoGatheringCompletedAttempts(session, session.readyAt + 60_000)).toBe(200);

    const result = settleAutoGathering(
      beginAutoGathering(emptyAutoGatheringState(), session),
      100,
    );
    expect(result).toMatchObject({
      attempts: 100,
      successes: 100,
      materialsGained: 80,
      xpGained: 700,
      masteryGained: 70,
    });
  });

  it("손상된 저장값은 안전한 빈 상태로 읽는다", () => {
    expect(parseAutoGatheringState({ session: { sessionId: "broken" } })).toEqual(
      emptyAutoGatheringState(),
    );
  });

  it("취소하면 미정산 세션만 제거하고 누적 나머지는 보존한다", () => {
    const session = createAutoGatheringSession({
      sessionId: "cancel-me",
      sourceId: "oak",
      sourceName: "참나무",
      materialId: "v2_oak_log",
      now: 1_000,
      cycleDurationMs: 5_000,
      successRate: 0.8,
      baseXp: 10,
    });
    const state = beginAutoGathering(
      {
        session: null,
        remainders: {
          successes: { oak: 0.25 },
          materials: { v2_oak_log: 0.5 },
          xp: 0.75,
          mastery: 0.4,
        },
      },
      session,
    );

    expect(cancelAutoGathering(state)).toEqual({
      session: null,
      remainders: state.remainders,
    });
  });
});
