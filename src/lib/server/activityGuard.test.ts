import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CHECKPOINT_COMPLETIONS,
  ACTIVITY_CHECKPOINT_CONTINUOUS_MS,
  ACTIVITY_DAILY_ALERT_COMPLETIONS,
  ACTIVITY_SEQUENCE_RESET_MS,
  ACTIVITY_STRONG_SIGNAL_THRESHOLD,
  activityGuardView,
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
    });
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
      .toMatchObject({ activities: { fishing: { strongSignals: 0 } } });
  });
});
