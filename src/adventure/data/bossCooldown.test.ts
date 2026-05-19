import { describe, expect, it } from "vitest";
import {
  cooldownAfterAttempt,
  formatCooldownRemaining,
  nextAttemptAt,
} from "./bossCooldown";

const MIN = 60_000;

describe("cooldownAfterAttempt — 누진 단계", () => {
  it("1·2회차 직후 → 0 (1·2·3번째 도전을 연속 가능)", () => {
    expect(cooldownAfterAttempt(1)).toBe(0);
    expect(cooldownAfterAttempt(2)).toBe(0);
  });
  it("3·4·5회차 직후 → 30분 (4·5·6번째 직전 30분 대기)", () => {
    expect(cooldownAfterAttempt(3)).toBe(30 * MIN);
    expect(cooldownAfterAttempt(4)).toBe(30 * MIN);
    expect(cooldownAfterAttempt(5)).toBe(30 * MIN);
  });
  it("6·7·8회차 직후 → 1시간", () => {
    expect(cooldownAfterAttempt(6)).toBe(60 * MIN);
    expect(cooldownAfterAttempt(8)).toBe(60 * MIN);
  });
  it("9회+ 직후 → 3시간 반복", () => {
    expect(cooldownAfterAttempt(9)).toBe(180 * MIN);
    expect(cooldownAfterAttempt(50)).toBe(180 * MIN);
  });
  it("0회차 (도전 안 함) → 0", () => {
    expect(cooldownAfterAttempt(0)).toBe(0);
    expect(cooldownAfterAttempt(-5)).toBe(0);
  });
});

describe("cooldownAfterAttempt — 길드 % 감소", () => {
  it("0% 감소는 베이스 그대로", () => {
    expect(cooldownAfterAttempt(3, 0)).toBe(30 * MIN);
  });
  it("50% 감소: 30분(3회차) → 15분", () => {
    expect(cooldownAfterAttempt(3, 50)).toBe(15 * MIN);
  });
  it("3시간(9회+) 30% 감소: 180분 → 126분", () => {
    expect(cooldownAfterAttempt(9, 30)).toBe(126 * MIN);
  });
  it("1·2회차는 베이스 0 이라 감소율 적용해도 0", () => {
    expect(cooldownAfterAttempt(1, 50)).toBe(0);
    expect(cooldownAfterAttempt(2, 99)).toBe(0);
  });
  it("음수/100 이상은 clamp", () => {
    expect(cooldownAfterAttempt(3, -10)).toBe(30 * MIN);
    expect(cooldownAfterAttempt(3, 999)).toBe(Math.round(30 * MIN * 0.01));
  });
});

describe("nextAttemptAt", () => {
  it("lastAttemptAt null → 0 (즉시 가능)", () => {
    expect(nextAttemptAt(null, 5)).toBe(0);
  });
  it("attemptCount 0 → 0 (오늘 안 침)", () => {
    expect(nextAttemptAt(Date.now(), 0)).toBe(0);
  });
  it("2회 친 직후 (last=now) → now + 0 = now (1·2회차 직후 쿨없음)", () => {
    const now = 1_700_000_000_000;
    expect(nextAttemptAt(now, 2)).toBe(now);
  });
  it("3회 친 직후 (last=now) → now + 30분 (4번째 도전 30분 대기)", () => {
    const now = 1_700_000_000_000;
    expect(nextAttemptAt(now, 3)).toBe(now + 30 * MIN);
  });
  it("길드 50% 감소 적용", () => {
    const now = 1_700_000_000_000;
    expect(nextAttemptAt(now, 6, 50)).toBe(now + 30 * MIN);
  });

  // ── day-boundary reset semantic ─────────────────────────────────────────
  // caller (useCharacterState.consumeBossAttempt) 가 todayLocalDateKey 비교로
  // 새 날 첫 호출 시 count=1 / lastAttemptAt=now 로 다시 시작한다. 그 직전
  // getBossAttemptsToday / getBossLastAttemptAt 는 0 / null 을 반환. 이 모듈의
  // nextAttemptAt 가 그 시점에 0 (즉시 가능) 을 돌려줘야 자정 직후 첫 도전이 막히지 않는다.
  it("자정 지나서 caller 가 attemptCount=0 으로 리셋한 시점은 즉시 가능", () => {
    expect(nextAttemptAt(null, 0)).toBe(0);
    const yesterdayMs = Date.now() - 24 * 3600 * 1000;
    // lastAttemptAt 가 살아 있어도 caller 가 attemptCount=0 으로 넘기면 즉시 가능.
    expect(nextAttemptAt(yesterdayMs, 0)).toBe(0);
  });

  it("자정 직전 3회차로 30분 쿨에 걸려도 자정 후 첫 도전은 0 (caller 가 count 리셋)", () => {
    const beforeMidnight = 1_700_000_000_000;
    // 자정 직전: 3회 친 직후라 30분 대기 중.
    expect(nextAttemptAt(beforeMidnight, 3)).toBe(beforeMidnight + 30 * MIN);
    // 자정 후 caller 가 count=0 으로 리셋. 같은 lastAttemptAtMs 라도 nextAttemptAt 0.
    expect(nextAttemptAt(beforeMidnight, 0)).toBe(0);
  });
});

describe("formatCooldownRemaining", () => {
  it("시간 단위 — 시간+분만", () => {
    expect(formatCooldownRemaining(2 * 3600 * 1000 + 15 * MIN)).toBe(
      "2시간 15분",
    );
  });
  it("분 단위 — 분+초", () => {
    expect(formatCooldownRemaining(12 * MIN + 34_000)).toBe("12분 34초");
  });
  it("초 단위", () => {
    expect(formatCooldownRemaining(5_000)).toBe("5초");
  });
  it("0 이하는 '0초'", () => {
    expect(formatCooldownRemaining(0)).toBe("0초");
    expect(formatCooldownRemaining(-1000)).toBe("0초");
  });
});
