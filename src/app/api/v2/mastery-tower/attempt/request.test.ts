import { describe, expect, it } from "vitest";
import { parseMasteryTowerAttemptRequest } from "./request";

describe("숙련의 탑 시작 층 요청", () => {
  it("시작 층이 없으면 기존 1층 또는 현재 진행을 사용하도록 비워 둔다", () => {
    expect(parseMasteryTowerAttemptRequest(null)).toEqual({ ok: true });
    expect(parseMasteryTowerAttemptRequest({})).toEqual({ ok: true });
  });

  it("정수 시작 층만 전달한다", () => {
    expect(parseMasteryTowerAttemptRequest({ startFloor: 31 })).toEqual({
      ok: true,
      startFloor: 31,
    });
  });

  it.each(["31", 31.5, Number.NaN, null])(
    "정수가 아닌 시작 층 %p을 거부한다",
    (startFloor) => {
      expect(parseMasteryTowerAttemptRequest({ startFloor })).toEqual({
        ok: false,
        error: "invalid_start_floor",
      });
    },
  );
});
