import { describe, expect, it } from "vitest";
import { mergeBossAttemptSnapshotForClaim } from "./battleClaim";

describe("mergeBossAttemptSnapshotForClaim", () => {
  it("보스 승리 claim 응답이 클라 도전 카운터를 잃지 않도록 병합한다", () => {
    const character: Record<string, unknown> = { level: 20 };

    const changed = mergeBossAttemptSnapshotForClaim(
      character,
      "운봉의 거인",
      {
        regionId: "canyon",
        date: "2026-05-20",
        count: 3,
        lastAttemptAtMs: 1_790_000_000_000,
      },
    );

    expect(changed).toBe(true);
    expect(character.bossAttempts).toEqual({
      canyon: {
        date: "2026-05-20",
        count: 3,
        lastAttemptAtMs: 1_790_000_000_000,
      },
    });
  });

  it("서버에 같은 날짜의 더 큰 카운터가 있으면 감소시키지 않는다", () => {
    const character: Record<string, unknown> = {
      bossAttempts: {
        canyon: {
          date: "2026-05-20",
          count: 5,
          lastAttemptAtMs: 1_790_000_000_100,
        },
      },
    };

    const changed = mergeBossAttemptSnapshotForClaim(
      character,
      "운봉의 거인",
      {
        regionId: "canyon",
        date: "2026-05-20",
        count: 3,
        lastAttemptAtMs: 1_790_000_000_000,
      },
    );

    expect(changed).toBe(false);
    expect(character.bossAttempts).toEqual({
      canyon: {
        date: "2026-05-20",
        count: 5,
        lastAttemptAtMs: 1_790_000_000_100,
      },
    });
  });

  it("해당 지역의 솔로 보스가 아니면 병합하지 않는다", () => {
    const character: Record<string, unknown> = {};

    const changed = mergeBossAttemptSnapshotForClaim(
      character,
      "운봉의 거인",
      {
        regionId: "cave",
        date: "2026-05-20",
        count: 1,
        lastAttemptAtMs: 1_790_000_000_000,
      },
    );

    expect(changed).toBe(false);
    expect(character.bossAttempts).toBeUndefined();
  });
});
