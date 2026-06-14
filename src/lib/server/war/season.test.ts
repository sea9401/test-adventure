import { describe, it, expect } from "vitest";
import {
  currentWarSeasonId,
  rolloverDecision,
  warSeasonBounds,
} from "./season";

// 시즌 경계 = 월 00:00 KST = 일 15:00 UTC. 2026-06-14 는 일요일(UTC day 0).
describe("war season", () => {
  it("일 14:59 UTC 와 15:00 UTC 는 다른 시즌", () => {
    const before = currentWarSeasonId(new Date("2026-06-14T14:59:00Z"));
    const after = currentWarSeasonId(new Date("2026-06-14T15:00:00Z"));
    expect(before).not.toBe(after);
  });

  it("같은 주 안(월~토)은 같은 시즌", () => {
    const mon = currentWarSeasonId(new Date("2026-06-15T03:00:00Z"));
    const sat = currentWarSeasonId(new Date("2026-06-20T03:00:00Z"));
    expect(mon).toBe(sat);
  });

  it("시즌 id 는 YYYY-Www 형식", () => {
    expect(currentWarSeasonId(new Date("2026-06-15T03:00:00Z"))).toMatch(
      /^\d{4}-W\d{2}$/,
    );
  });

  it("bounds — start/end 7일 간격, id 일치", () => {
    const now = new Date("2026-06-15T03:00:00Z");
    const b = warSeasonBounds(now);
    expect(b.id).toBe(currentWarSeasonId(now));
    expect(b.endAt.getTime() - b.startAt.getTime()).toBe(7 * 24 * 3600 * 1000);
    // start 는 일 15:00 UTC.
    expect(b.startAt.getUTCDay()).toBe(0);
    expect(b.startAt.getUTCHours()).toBe(15);
  });
});

describe("rolloverDecision — 경계-인식형 중립화", () => {
  const seasonStart = new Date("2026-06-14T15:00:00Z");

  it("점령자 없음 → already-neutral", () => {
    expect(rolloverDecision(null, new Date("2026-06-10T00:00:00Z"), seasonStart)).toBe(
      "already-neutral",
    );
    expect(rolloverDecision(undefined, seasonStart, seasonStart)).toBe(
      "already-neutral",
    );
  });

  it("경계 이전 점령(지난 시즌 잔재) → neutralize", () => {
    expect(
      rolloverDecision("u1", new Date("2026-06-10T08:00:00Z"), seasonStart),
    ).toBe("neutralize");
    // 경계 직전 1초.
    expect(
      rolloverDecision("u1", new Date("2026-06-14T14:59:59Z"), seasonStart),
    ).toBe("neutralize");
  });

  it("경계 이후 점령(새 시즌 첫 점령) → keep (증발 방지)", () => {
    // 3분 창 안 점령.
    expect(
      rolloverDecision("u1", new Date("2026-06-14T15:01:30Z"), seasonStart),
    ).toBe("keep");
    // 경계 정각 점령도 새 시즌.
    expect(rolloverDecision("u1", seasonStart, seasonStart)).toBe("keep");
  });
});
