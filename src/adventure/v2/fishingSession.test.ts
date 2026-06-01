import { describe, it, expect } from "vitest";
import {
  BITE_MAX_MS,
  BITE_MIN_MS,
  REACTION_MIN_MS,
  REACTION_WINDOW_MS,
  expiresAtFor,
  judgeCatch,
  parseFishingSession,
  rollBiteDelayMs,
} from "./fishingSession";

describe("rollBiteDelayMs", () => {
  it("항상 [BITE_MIN, BITE_MAX] 범위", () => {
    for (let i = 0; i <= 20; i += 1) {
      const d = rollBiteDelayMs(() => i / 20);
      expect(d).toBeGreaterThanOrEqual(BITE_MIN_MS);
      expect(d).toBeLessThanOrEqual(BITE_MAX_MS);
    }
  });
});

describe("parseFishingSession", () => {
  const ok = {
    castId: "abc",
    biteAt: 1000,
    expiresAt: 2000,
    fishId: "carp",
    size: 50,
  };

  it("정상 세션 파싱", () => {
    expect(parseFishingSession(ok)).toEqual(ok);
  });

  it("빈/손상 입력은 null", () => {
    expect(parseFishingSession(null)).toBeNull();
    expect(parseFishingSession({})).toBeNull();
    expect(parseFishingSession("x")).toBeNull();
  });

  it("알 수 없는 어종 id 는 null", () => {
    expect(parseFishingSession({ ...ok, fishId: "not_a_fish" })).toBeNull();
  });

  it("숫자 필드 누락은 null", () => {
    expect(parseFishingSession({ ...ok, biteAt: "x" })).toBeNull();
    expect(parseFishingSession({ ...ok, size: undefined })).toBeNull();
  });
});

describe("judgeCatch", () => {
  const biteAt = 10000;
  const expiresAt = expiresAtFor(biteAt);

  it("정상 윈도우 안 → 성공", () => {
    const j = judgeCatch({
      reactionMs: 300,
      serverNow: biteAt + 350,
      biteAt,
      expiresAt,
    });
    expect(j).toEqual({ caught: true, reason: "ok" });
  });

  it("만료 후 reel → expired", () => {
    const j = judgeCatch({
      reactionMs: 300,
      serverNow: expiresAt + 1,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(false);
    expect(j.reason).toBe("expired");
  });

  it("입질 전에 도착(대기 안 함) → too_early", () => {
    const j = judgeCatch({
      reactionMs: 300,
      serverNow: biteAt - 3000,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(false);
    expect(j.reason).toBe("too_early");
  });

  it("사람이 못 낼 반응 속도(프리파이어) → too_early", () => {
    const j = judgeCatch({
      reactionMs: REACTION_MIN_MS - 1,
      serverNow: biteAt + 50,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(false);
    expect(j.reason).toBe("too_early");
  });

  it("윈도우 초과 → missed_window", () => {
    const j = judgeCatch({
      reactionMs: REACTION_WINDOW_MS + 1,
      serverNow: biteAt + REACTION_WINDOW_MS + 1,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(false);
    expect(j.reason).toBe("missed_window");
  });

  it("biteAt 직전 도착(대기 안 함)은 하드 거부 — 둘 다 서버 시계라 오차 허용 없음", () => {
    const j = judgeCatch({
      reactionMs: 200,
      serverNow: biteAt - 1,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(false);
    expect(j.reason).toBe("too_early");
  });

  it("biteAt 정각 도착은 통과(경계)", () => {
    const j = judgeCatch({
      reactionMs: 200,
      serverNow: biteAt,
      biteAt,
      expiresAt,
    });
    expect(j.caught).toBe(true);
  });

  it("경계: reactionMs === WINDOW 는 성공, MIN 은 성공", () => {
    expect(
      judgeCatch({
        reactionMs: REACTION_WINDOW_MS,
        serverNow: biteAt + REACTION_WINDOW_MS,
        biteAt,
        expiresAt,
      }).caught,
    ).toBe(true);
    expect(
      judgeCatch({
        reactionMs: REACTION_MIN_MS,
        serverNow: biteAt + 100,
        biteAt,
        expiresAt,
      }).caught,
    ).toBe(true);
  });
});
