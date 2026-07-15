import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CHECKPOINT_COMPLETIONS,
  ACTIVITY_CHECKPOINT_CONTINUOUS_MS,
  ACTIVITY_DAILY_ALERT_COMPLETIONS,
  ACTIVITY_RISK_CRITICAL_COOLDOWN_MS,
  ACTIVITY_RISK_HIGH_THRESHOLD,
  ACTIVITY_SEQUENCE_RESET_MS,
  ACTIVITY_STRONG_SIGNAL_THRESHOLD,
  activityCheckpointTarget,
  activityGuardView,
  activityRewardMultiplier,
  activityVerificationRequired,
  clearActivityVerification,
  emptyActivityGuardState,
  parseActivityGuardState,
  recordActivityCompletion,
  recordActivityStrongSignal,
} from "./activityGuard";

describe("activityGuard", () => {
  it("연속 100회 완료 시 해당 활동에만 사람 확인을 요구한다", () => {
    let state = emptyActivityGuardState();
    for (let i = 0; i < ACTIVITY_CHECKPOINT_COMPLETIONS; i += 1) {
      state = recordActivityCompletion(state, "woodcutting", 1_000 + i * 7_000).state;
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

  it("60분 연속 활동이면 횟수가 적어도 체크포인트를 건다", () => {
    let state = emptyActivityGuardState();
    let result = recordActivityCompletion(state, "fishing", 10_000);
    state = result.state;
    for (let elapsed = 9 * 60_000; elapsed <= ACTIVITY_CHECKPOINT_CONTINUOUS_MS; elapsed += 9 * 60_000) {
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

  it("위험도가 높을수록 다음 확인 목표를 앞당긴다", () => {
    expect(activityCheckpointTarget(0, () => 0)).toBe(80);
    expect(activityCheckpointTarget(0, () => 0.999)).toBe(140);
    expect(activityCheckpointTarget(25, () => 0)).toBe(50);
    expect(activityCheckpointTarget(55, () => 0)).toBe(25);
    expect(activityCheckpointTarget(80, () => 0)).toBe(10);
  });

  it("당일 인증 통과와 누적 활동량이 늘수록 다음 확인 간격을 줄인다", () => {
    expect(
      activityCheckpointTarget(0, () => 0, { dailyVerifications: 1 }),
    ).toBe(60);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyVerifications: 2 }),
    ).toBe(70);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyCompleted: 1_000 }),
    ).toBe(50);
    expect(
      activityCheckpointTarget(0, () => 0.999, { dailyVerifications: 7 }),
    ).toBe(25);
  });

  it("완벽 성공과 균일 반응 조합은 약한 행동 위험도로만 누적한다", () => {
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

  it("운영 상단을 크게 넘는 일일 생산량만 거래 재료 기대값을 줄인다", () => {
    expect(activityRewardMultiplier(parseActivityGuardState({}))).toBe(1);
    expect(
      activityRewardMultiplier(
        parseActivityGuardState({ risk: { dailyCompleted: 1_500 } }),
      ),
    ).toBe(0.75);
    expect(
      activityRewardMultiplier(
        parseActivityGuardState({ risk: { dailyCompleted: 2_500 } }),
      ),
    ).toBe(0.5);
    expect(
      activityRewardMultiplier(
        parseActivityGuardState({ risk: { dailyCompleted: 4_000 } }),
      ),
    ).toBe(0.25);
  });

  it("강신호가 쌓이면 활동 종류와 무관하게 공통 위험도와 대기를 적용한다", () => {
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "fishing", 10_000).state;
    state = recordActivityStrongSignal(state, "woodcutting", 11_000).state;
    state = recordActivityStrongSignal(state, "mining", 12_000).state;

    const mining = activityGuardView(state, "mining");
    expect(mining.riskScore).toBeGreaterThanOrEqual(ACTIVITY_RISK_HIGH_THRESHOLD);
    expect(mining.cooldownUntil).toBeGreaterThan(12_000);
    expect(activityVerificationRequired(state, "farming", true)).toBe(true);
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
    expect(activityGuardView(state, "fishing").checkpointTarget).toBeGreaterThanOrEqual(60);
    expect(activityGuardView(state, "fishing").checkpointTarget).toBeLessThanOrEqual(100);
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

  it("손상된 저장값은 안전하게 파싱한다", () => {
    expect(parseActivityGuardState({ activities: { fishing: { strongSignals: -2 } } }))
      .toMatchObject({
        version: 3,
        activities: {
          fishing: { strongSignals: 0 },
          farming: { strongSignals: 0 },
        },
        risk: { score: 0 },
      });
  });
});
