import { describe, expect, it } from "vitest";
import {
  resolveTradeRestriction,
  tradeSuspendedPayload,
  tradeSuspensionMessage,
} from "./tradeSuspension";

const now = new Date("2026-08-20T00:00:00.000Z");

describe("resolveTradeRestriction", () => {
  it("제한이 없으면 null을 반환한다", () => {
    expect(
      resolveTradeRestriction({
        bannedUntil: null,
        banReason: null,
        tradeSuspendedUntil: null,
        tradeSuspensionReason: null,
      }, now),
    ).toBeNull();
  });

  it("만료 시각과 같은 거래 정지는 만료된 것으로 처리한다", () => {
    expect(
      resolveTradeRestriction({
        bannedUntil: null,
        banReason: null,
        tradeSuspendedUntil: now,
        tradeSuspensionReason: "만료된 제한",
      }, now),
    ).toBeNull();
  });

  it("활성 기간 거래 정지와 응답 payload를 반환한다", () => {
    const active = resolveTradeRestriction({
      bannedUntil: null,
      banReason: null,
      tradeSuspendedUntil: new Date("2026-08-21T00:00:00.000Z"),
      tradeSuspensionReason: "비정상 거래 조사",
    }, now);

    expect(active).toMatchObject({
      source: "trade",
      reason: "비정상 거래 조사",
      permanent: false,
    });
    expect(active).not.toBeNull();
    expect(tradeSuspendedPayload(active!)).toEqual({
      ok: false,
      error: "trade_suspended",
      reason: "비정상 거래 조사",
      expiresAt: "2026-08-21T00:00:00.000Z",
      permanent: false,
    });
  });

  it("9999년 만료 시각을 영구 거래 정지로 표시한다", () => {
    expect(
      resolveTradeRestriction({
        bannedUntil: null,
        banReason: null,
        tradeSuspendedUntil: new Date("9999-12-31T00:00:00.000Z"),
        tradeSuspensionReason: "영구 거래 정지",
      }, now),
    ).toMatchObject({
      source: "trade",
      reason: "영구 거래 정지",
      permanent: true,
    });
  });

  it("활성 계정 제재를 독립 거래 정지보다 우선한다", () => {
    expect(
      resolveTradeRestriction({
        bannedUntil: new Date("2026-08-22T00:00:00.000Z"),
        banReason: "계정 이용 제한",
        tradeSuspendedUntil: new Date("2026-08-23T00:00:00.000Z"),
        tradeSuspensionReason: "독립 거래 정지",
      }, now),
    ).toMatchObject({
      source: "account",
      reason: "계정 이용 제한",
      expiresAt: new Date("2026-08-22T00:00:00.000Z"),
    });
  });

  it("계정 제재가 만료된 뒤에도 독립 거래 정지는 유지한다", () => {
    expect(
      resolveTradeRestriction({
        bannedUntil: now,
        banReason: "만료된 계정 제한",
        tradeSuspendedUntil: new Date("2026-08-21T00:00:00.000Z"),
        tradeSuspensionReason: "독립 거래 정지",
      }, now),
    ).toMatchObject({
      source: "trade",
      reason: "독립 거래 정지",
    });
  });
});

describe("tradeSuspensionMessage", () => {
  it("기간 거래 제한은 만료 시각과 사유를 한국어 안내문으로 표시한다", () => {
    const message = tradeSuspensionMessage({
      reason: "비정상 거래 조사",
      expiresAt: "2026-08-23T00:00:00.000Z",
      permanent: false,
    });

    expect(message).toContain("거래 이용");
    expect(message).toContain("비정상 거래 조사");
    expect(message).toContain("2026");
    expect(message).not.toContain("영구");
  });

  it("영구 거래 제한은 만료 날짜 대신 영구임을 명시한다", () => {
    const message = tradeSuspensionMessage({
      reason: "거래 악용",
      expiresAt: "9999-12-31T00:00:00.000Z",
      permanent: true,
    });

    expect(message).toContain("영구");
    expect(message).toContain("거래 악용");
  });
});
