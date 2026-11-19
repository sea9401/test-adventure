import { describe, expect, it } from "vitest";
import {
  AUTO_GATHERING_DURATION_MS,
  autoGatheringDurationLabel,
  parseAutoGatheringSessionView,
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

  it("시작 시 고정한 현장 환경 보너스를 자동 정산에 적용한다", () => {
    const session = createAutoGatheringSession({
      sessionId: "field-auto",
      sourceId: "pine",
      sourceName: "소나무",
      materialId: "timber",
      now: 0,
      cycleDurationMs: 90_000,
      successRate: 1,
      baseXp: 10,
      spotId: "greenwood_edge",
      lifeEnvironmentId: "woodcutting_dense_growth",
      lifeEnvironmentDayKey: "2026-08-06",
      environmentPrimaryBonusChance: 0.05,
      environmentXpBonusPct: 8,
    });
    const result = settleAutoGathering(
      beginAutoGathering(emptyAutoGatheringState(), session),
    );
    expect(result).toMatchObject({
      attempts: 20,
      successes: 20,
      materialsGained: 16,
      xpGained: 151,
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

describe("정비한 채집지의 느긋한 작업 시간", () => {
  const HOUR = 60 * 60_000;
  const base = {
    sessionId: "upkeep-auto",
    sourceId: "iron",
    sourceName: "철 광맥",
    materialId: "v2_iron_ore",
    now: 1_000,
    cycleDurationMs: 9_000,
    successRate: 0.9,
    baseXp: 5,
  };

  it("느긋한 작업만 넘겨받은 시간으로 길어지고 작업 횟수가 시간에 비례한다", () => {
    const extended = createAutoGatheringSession({
      ...base,
      planId: "extended",
      extendedDurationMs: 3 * HOUR,
    });
    expect(extended).toMatchObject({
      planId: "extended",
      readyAt: 1_000 + 3 * HOUR,
      durationMs: 3 * HOUR,
      attempts: 1_200,
      successRate: 0.72,
      materialEfficiency: 0.6,
    });

    const standard = createAutoGatheringSession({
      ...base,
      planId: "standard",
      extendedDurationMs: 3 * HOUR,
    });
    expect(standard.readyAt).toBe(1_000 + AUTO_GATHERING_DURATION_MS);
    expect(standard.durationMs).toBe(AUTO_GATHERING_DURATION_MS);
    expect(standard.attempts).toBe(200);
  });

  it("명장 정비의 6시간까지 받는다", () => {
    const session = createAutoGatheringSession({ ...base, planId: "extended", extendedDurationMs: 6 * HOUR });
    expect(session.readyAt).toBe(1_000 + 6 * HOUR);
    expect(session.durationMs).toBe(6 * HOUR);
    expect(session.attempts).toBe(2_400);
  });

  it("기본 시간보다 짧거나 6시간보다 긴 값은 무시한다", () => {
    for (const extendedDurationMs of [HOUR, 6 * HOUR + 1, Number.NaN, -5]) {
      const session = createAutoGatheringSession({ ...base, planId: "extended", extendedDurationMs });
      expect(session.readyAt).toBe(1_000 + 2 * HOUR);
      expect(session.durationMs).toBe(2 * HOUR);
    }
  });

  it("굳힌 작업 시간은 저장했다 읽어도 남고, 없던 세이브는 계획 시간으로 읽는다", () => {
    const session = createAutoGatheringSession({
      ...base,
      planId: "extended",
      extendedDurationMs: 156 * 60_000,
    });
    const reloaded = parseAutoGatheringState(
      JSON.parse(JSON.stringify(beginAutoGathering(emptyAutoGatheringState(), session))),
    );
    expect(reloaded.session?.durationMs).toBe(156 * 60_000);
    expect(reloaded.session?.readyAt).toBe(session.readyAt);

    const { durationMs: _dropped, ...legacy } = session;
    void _dropped;
    expect(parseAutoGatheringState({ session: legacy }).session?.durationMs).toBe(2 * HOUR);

    const view = parseAutoGatheringSessionView(session);
    expect(view?.durationMs).toBe(156 * 60_000);
    expect(parseAutoGatheringSessionView(legacy)?.durationMs).toBe(2 * HOUR);
  });

  it("작업 시간을 시간과 분으로 적는다", () => {
    expect(autoGatheringDurationLabel(30 * 60_000)).toBe("30분");
    expect(autoGatheringDurationLabel(2 * HOUR)).toBe("2시간");
    expect(autoGatheringDurationLabel(132 * 60_000)).toBe("2시간 12분");
    expect(autoGatheringDurationLabel(210 * 60_000)).toBe("3시간 30분");
  });
});
