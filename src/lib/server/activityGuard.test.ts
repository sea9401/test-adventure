import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CHECKPOINT_COMPLETIONS,
  ACTIVITY_CHECKPOINT_CONTINUOUS_MS,
  ACTIVITY_DAILY_ALERT_COMPLETIONS,
  ACTIVITY_EARLY_ATTEMPT_THRESHOLD,
  ACTIVITY_RISK_CRITICAL_COOLDOWN_MS,
  ACTIVITY_RISK_HIGH_THRESHOLD,
  ACTIVITY_SEQUENCE_RESET_MS,
  ACTIVITY_STRONG_SIGNAL_THRESHOLD,
  activeManualActivityVerification,
  activityCheckpointTarget,
  activityGuardView,
  activityVerificationContext,
  activityVerificationReason,
  activityVerificationRequired,
  clearActivityVerification,
  emptyActivityGuardState,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityEarlyAttempt,
  recordActivityStrongSignal,
  setManualActivityVerification,
} from "./activityGuard";

describe("activityGuard", () => {
  it("연속 500회 완료 시 해당 활동에만 사람 확인을 요구한다", () => {
    let state = emptyActivityGuardState();
    let now = 1_000;
    const intervals = [6_500, 7_200, 8_100, 6_800, 7_600];
    for (let i = 0; i < ACTIVITY_CHECKPOINT_COMPLETIONS; i += 1) {
      now += intervals[i % intervals.length]!;
      state = recordActivityCompletion(state, "woodcutting", now).state;
    }
    expect(activityVerificationRequired(state, "woodcutting", true)).toBe(true);
    expect(activityVerificationRequired(state, "fishing", true)).toBe(false);
    expect(activityVerificationRequired(state, "mining", true)).toBe(false);
    expect(activityVerificationRequired(state, "woodcutting", false)).toBe(false);
  });

  it("중간 휴식이 있어도 누적 완료 수 기준 체크포인트는 유지한다", () => {
    let state = emptyActivityGuardState();
    state = recordActivityCompletion(state, "fishing", 1_000).state;
    state = recordActivityCompletion(
      state,
      "fishing",
      1_000 + ACTIVITY_SEQUENCE_RESET_MS + 1,
    ).state;
    expect(activityGuardView(state, "fishing").completedSinceVerification).toBe(2);
  });

  it("3시간 연속 활동이면 횟수가 적어도 체크포인트를 건다", () => {
    let state = emptyActivityGuardState();
    let result = recordActivityCompletion(state, "fishing", 10_000);
    state = result.state;
    for (let elapsed = 9 * 60_000; elapsed < ACTIVITY_CHECKPOINT_CONTINUOUS_MS; elapsed += 9 * 60_000) {
      result = recordActivityCompletion(state, "fishing", 10_000 + elapsed);
      state = result.state;
    }
    result = recordActivityCompletion(
      state,
      "fishing",
      10_000 + ACTIVITY_CHECKPOINT_CONTINUOUS_MS,
    );
    expect(result.checkpointNewlyRequired).toBe(true);
  });

  it("10분 내 강신호 3회면 체크포인트를 건다", () => {
    let state = emptyActivityGuardState();
    let last = recordActivityStrongSignal(state, "woodcutting", 1_000);
    state = last.state;
    for (let i = 1; i < ACTIVITY_STRONG_SIGNAL_THRESHOLD; i += 1) {
      last = recordActivityStrongSignal(state, "woodcutting", 1_000 + i * 1_000);
      state = last.state;
    }
    expect(last.checkpointNewlyRequired).toBe(true);
    expect(activityGuardView(state, "woodcutting").strongSignals).toBe(3);
    expect(activityGuardView(state, "woodcutting")).toMatchObject({
      riskLevel: "high",
    });
  });

  it("벌목·채광 조기 완료는 세 번째 반복부터 강신호 한 건으로 승격한다", () => {
    let state = emptyActivityGuardState();
    for (let index = 1; index <= ACTIVITY_EARLY_ATTEMPT_THRESHOLD; index += 1) {
      const update = recordActivityEarlyAttempt(
        state,
        "woodcutting",
        1_000 + index * 1_000,
      );
      state = update.state;
      expect(update.strongSignalPromoted).toBe(
        index === ACTIVITY_EARLY_ATTEMPT_THRESHOLD,
      );
    }
    expect(activityGuardView(state, "woodcutting")).toMatchObject({
      earlyAttempts: 0,
      strongSignals: 1,
      riskScore: 18,
    });
  });

  it("위험도가 높을수록 다음 확인 목표를 앞당긴다", () => {
    expect(activityCheckpointTarget(0, () => 0)).toBe(400);
    expect(activityCheckpointTarget(0, () => 0.999)).toBe(700);
    expect(activityCheckpointTarget(25, () => 0)).toBe(250);
    expect(activityCheckpointTarget(55, () => 0)).toBe(100);
    expect(activityCheckpointTarget(80, () => 0)).toBe(40);
  });

  it("인증 통과 횟수는 다음 확인 간격을 줄이지 않고 대량 활동만 완만하게 반영한다", () => {
    expect(
      activityCheckpointTarget(0, () => 0, { dailyVerifications: 1 }),
    ).toBe(400);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyVerifications: 2 }),
    ).toBe(700);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyCompleted: 1_000 }),
    ).toBe(500);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyVerifications: 7 }),
    ).toBe(700);
  });

  it("완벽 성공과 균일 반응만으로는 행동 위험도를 올리지 않는다", () => {
    let state = emptyActivityGuardState();
    let now = 10_000;
    let signal: string | null = null;
    const intervals = [3_500, 7_100, 4_300, 6_400, 5_200];
    for (let i = 0; i < 30; i += 1) {
      now += intervals[i % intervals.length]!;
      const update = recordActivityCompletion(state, "fishing", now, {
        patternSignals: [
          "near_perfect_success_rate",
          "uniform_client_reaction",
        ],
      });
      state = update.state;
      signal = update.behaviorSignal ?? signal;
    }
    expect(signal).toBeNull();
    expect(activityGuardView(state, "fishing")).toMatchObject({
      behaviorSignals: 0,
      riskScore: 0,
      riskLevel: "normal",
    });
  });

  it("완벽 성공·균일 반응과 기계적 완료 간격이 겹치면 약한 위험도로 누적한다", () => {
    let state = emptyActivityGuardState();
    let signal: string | null = null;
    for (let i = 0; i < 30; i += 1) {
      const update = recordActivityCompletion(
        state,
        "fishing",
        10_000 + i * 5_000,
        {
          patternSignals: [
            "near_perfect_success_rate",
            "uniform_client_reaction",
          ],
        },
      );
      state = update.state;
      signal = update.behaviorSignal ?? signal;
    }
    expect(signal).toBe("near_perfect_uniform_fishing");
    expect(activityGuardView(state, "fishing")).toMatchObject({
      behaviorSignals: 1,
      riskScore: 6,
      riskLevel: "normal",
    });
    expect(activityVerificationRequired(state, "fishing", true)).toBe(false);
  });

  it("오랜 시간 오차 없이 반복되는 완료 간격을 약한 신호로 기록한다", () => {
    let state = emptyActivityGuardState();
    let lastSignal: string | null = null;
    for (let i = 0; i < 30; i += 1) {
      const update = recordActivityCompletion(
        state,
        "woodcutting",
        20_000 + i * 5_000,
      );
      state = update.state;
      lastSignal = update.behaviorSignal ?? lastSignal;
    }
    expect(lastSignal).toBe("highly_regular_intervals");
    expect(activityGuardView(state, "woodcutting").intervalStddevMs).toBe(0);
  });

  it("기계적으로 일정한 행동 신호가 반복되면 추가 CAPTCHA 대상으로 분류한다", () => {
    let state = emptyActivityGuardState();
    for (let i = 0; i < 90; i += 1) {
      state = recordActivityCompletion(
        state,
        "woodcutting",
        20_000 + i * 5_000,
      ).state;
    }
    expect(activityGuardView(state, "woodcutting").behaviorSignals).toBe(3);
    expect(activityVerificationReason(state, "woodcutting")).toBe("strong_signal");
  });

  it("일일 활동량만 많으면 다음 행동 대기를 추가하지 않는다", () => {
    let state = emptyActivityGuardState();
    let now = 10_000;
    const intervals = [6_500, 7_200, 8_100, 6_800, 7_600];
    for (let i = 0; i < 2_500; i += 1) {
      now += intervals[i % intervals.length]!;
      state = recordActivityCompletion(
        state,
        "woodcutting",
        now,
      ).state;
    }
    expect(activityGuardView(state, "woodcutting")).toMatchObject({
      globalDailyCompleted: 2_500,
      nextActionAt: null,
    });
    expect(activityVerificationReason(state, "woodcutting")).toBe("volume");
  });

  it("강신호가 쌓이면 활동 종류와 무관하게 공통 위험도와 대기를 적용한다", () => {
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "fishing", 10_000).state;
    state = recordActivityStrongSignal(state, "woodcutting", 11_000).state;
    state = recordActivityStrongSignal(state, "mining", 12_000).state;

    const mining = activityGuardView(state, "mining");
    expect(mining.riskScore).toBeGreaterThanOrEqual(ACTIVITY_RISK_HIGH_THRESHOLD);
    expect(mining.cooldownUntil).toBeGreaterThan(12_000);
    expect(activityVerificationRequired(state, "fishing", true)).toBe(true);
  });

  it("임계 이상 강신호는 최대 2분 대기로 상향된다", () => {
    let state = emptyActivityGuardState();
    for (let i = 0; i < 5; i += 1) {
      state = recordActivityStrongSignal(state, "mining", 20_000 + i).state;
    }
    expect(activityGuardView(state, "mining").cooldownUntil).toBe(
      20_004 + ACTIVITY_RISK_CRITICAL_COOLDOWN_MS,
    );
  });

  it("사람 확인 성공 시 연속 카운터와 강신호를 초기화한다", () => {
    let state = emptyActivityGuardState();
    for (let i = 0; i < ACTIVITY_CHECKPOINT_COMPLETIONS; i += 1) {
      state = recordActivityCompletion(state, "fishing", 1_000 + i).state;
    }
    state = clearActivityVerification(state, "fishing", 99_000);
    expect(activityGuardView(state, "fishing")).toMatchObject({
      completedSinceVerification: 0,
      verificationRequiredAt: null,
      strongSignals: 0,
      dailyVerifications: 1,
    });
    expect(activityGuardView(state, "fishing").checkpointTarget).toBeGreaterThanOrEqual(400);
    expect(activityGuardView(state, "fishing").checkpointTarget).toBeLessThanOrEqual(700);
  });

  it("관리자 일반 확인 요청은 10분 동안 해당 활동만 확인 대상으로 만든다", () => {
    const requestedAt = 100_000;
    const state = setManualActivityVerification(
      emptyActivityGuardState(),
      "woodcutting",
      "standard",
      requestedAt,
    );

    expect(
      activeManualActivityVerification(state, "woodcutting", requestedAt + 1),
    ).toMatchObject({
      mode: "standard",
      requestedAt,
      expiresAt: requestedAt + 10 * 60_000,
    });
    expect(
      activityVerificationContext(state, "woodcutting", true, requestedAt + 1),
    ).toMatchObject({ required: true, reason: "volume", manualTest: true });
    expect(
      activityVerificationContext(state, "fishing", true, requestedAt + 1),
    ).toMatchObject({ required: false, manualTest: false });
    expect(
      activityVerificationContext(
        state,
        "woodcutting",
        true,
        requestedAt + 10 * 60_000,
      ),
    ).toMatchObject({ required: false, manualTest: false });
  });

  it("관리자 2단계 확인 요청은 실제 의심 수치를 올리지 않고 CAPTCHA 사유로 분류한다", () => {
    const requestedAt = 200_000;
    const state = setManualActivityVerification(
      emptyActivityGuardState(),
      "fishing",
      "captcha",
      requestedAt,
    );

    expect(activityGuardView(state, "fishing")).toMatchObject({
      riskScore: 0,
      strongSignals: 0,
      behaviorSignals: 0,
      dailyVerifications: 0,
    });
    expect(
      activityVerificationContext(state, "fishing", true, requestedAt + 1),
    ).toEqual({ required: true, reason: "strong_signal", manualTest: true });
  });

  it("관리자 확인 성공은 요청만 지우고 실제 위험 상태와 확인 횟수를 보존한다", () => {
    const requestedAt = 300_000;
    let state = recordActivityStrongSignal(
      emptyActivityGuardState(),
      "fishing",
      requestedAt - 1_000,
    ).state;
    state = setManualActivityVerification(
      state,
      "fishing",
      "standard",
      requestedAt,
    );

    const cleared = clearActivityVerification(
      state,
      "fishing",
      requestedAt + 5_000,
    );

    expect(
      activeManualActivityVerification(cleared, "fishing", requestedAt + 5_000),
    ).toBeNull();
    expect(activityGuardView(cleared, "fishing")).toMatchObject({
      riskScore: 18,
      strongSignals: 1,
      dailyVerifications: 0,
    });
  });

  it("실제 확인 대기가 있으면 관리자 요청보다 실제 판정을 우선한다", () => {
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "mining", 400_000).state;
    state = recordActivityStrongSignal(state, "mining", 401_000).state;
    state = recordActivityStrongSignal(state, "mining", 402_000).state;
    state = setManualActivityVerification(
      state,
      "mining",
      "standard",
      403_000,
    );

    expect(
      activityVerificationContext(state, "mining", true, 500_000),
    ).toEqual({ required: true, reason: "strong_signal", manualTest: false });
  });

  it("일일 500회 도달 순간에 운영 알림을 한 번만 만든다", () => {
    let state = emptyActivityGuardState();
    let alerts = 0;
    for (let i = 0; i < ACTIVITY_DAILY_ALERT_COMPLETIONS + 2; i += 1) {
      const result = recordActivityCompletion(state, "woodcutting", 1_800_000_000_000 + i);
      state = result.state;
      if (result.extremeVolumeAlert) alerts += 1;
    }
    expect(alerts).toBe(1);
  });

  it("이전 버전의 의심도와 확인 대기 상태는 새 기준에서 초기화한다", () => {
    expect(parseActivityGuardState({
      version: 4,
      activities: {
        fishing: {
          strongSignals: 3,
          behaviorSignals: 4,
          verificationRequiredAt: 123_000,
        },
      },
      risk: { score: 80, cooldownUntil: 456_000 },
    }))
      .toMatchObject({
        version: 5,
        activities: {
          fishing: {
            strongSignals: 0,
            behaviorSignals: 0,
            verificationRequiredAt: null,
          },
        },
        risk: { score: 0, cooldownUntil: null },
      });
  });
});
