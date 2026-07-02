import { describe, expect, it } from "vitest";
import {
  formatRemainingMinutes,
  formatRemainingMinutesFloor,
  timeAgoKo,
} from "./timeFormat";

const NOW = Date.parse("2026-07-02T00:00:00Z");
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();

describe("timeAgoKo", () => {
  it("사다리: 방금 → 분 → 시간 → 일", () => {
    expect(timeAgoKo(isoAgo(30_000), NOW)).toBe("방금");
    expect(timeAgoKo(isoAgo(59_000), NOW)).toBe("방금");
    expect(timeAgoKo(isoAgo(5 * 60_000), NOW)).toBe("5분 전");
    expect(timeAgoKo(isoAgo(59 * 60_000), NOW)).toBe("59분 전");
    expect(timeAgoKo(isoAgo(60 * 60_000), NOW)).toBe("1시간 전");
    expect(timeAgoKo(isoAgo(23 * 3600_000), NOW)).toBe("23시간 전");
    expect(timeAgoKo(isoAgo(24 * 3600_000), NOW)).toBe("1일 전");
    expect(timeAgoKo(isoAgo(49 * 3600_000), NOW)).toBe("2일 전");
  });

  it("미래 시각은 방금 취급, 불량 입력은 빈 문자열", () => {
    expect(timeAgoKo(isoAgo(-5 * 60_000), NOW)).toBe("방금");
    expect(timeAgoKo("", NOW)).toBe("");
    expect(timeAgoKo("not-a-date", NOW)).toBe("");
  });
});

describe("formatRemainingMinutes (올림·최소 1분 — TileMap/OutpostView 규약)", () => {
  it("분 단위 올림, 0/음수도 최소 1분", () => {
    expect(formatRemainingMinutes(0)).toBe("1분");
    expect(formatRemainingMinutes(-5_000)).toBe("1분");
    expect(formatRemainingMinutes(30_000)).toBe("1분");
    expect(formatRemainingMinutes(61_000)).toBe("2분");
    expect(formatRemainingMinutes(59 * 60_000)).toBe("59분");
  });

  it("시간 단위 — 0분이면 분 생략", () => {
    expect(formatRemainingMinutes(59 * 60_000 + 1_000)).toBe("1시간");
    expect(formatRemainingMinutes(60 * 60_000)).toBe("1시간");
    expect(formatRemainingMinutes(90 * 60_000)).toBe("1시간 30분");
    expect(formatRemainingMinutes(120 * 60_000)).toBe("2시간");
  });
});

describe("formatRemainingMinutesFloor (내림·0분 허용 — 물때/낚시 도전 규약)", () => {
  it("분 단위 내림, 0분 표기 허용", () => {
    expect(formatRemainingMinutesFloor(-1_000)).toBe("0분");
    expect(formatRemainingMinutesFloor(30_000)).toBe("0분");
    expect(formatRemainingMinutesFloor(59 * 60_000 + 59_000)).toBe("59분");
  });

  it("시간 단위 — 분을 항상 표기(0분 포함)", () => {
    expect(formatRemainingMinutesFloor(60 * 60_000)).toBe("1시간 0분");
    expect(formatRemainingMinutesFloor(90 * 60_000 + 30_000)).toBe("1시간 30분");
  });
});
