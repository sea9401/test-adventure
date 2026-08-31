import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userRows: [] as Array<Record<string, unknown>>,
  warningRows: [] as Array<Record<string, unknown>>,
  tradeRows: [] as Array<Record<string, unknown>>,
  selectCall: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const call = mocks.selectCall++;
      const rows =
        call === 0
          ? mocks.userRows
          : call === 1
            ? mocks.warningRows
            : mocks.tradeRows;
      const query = {
        from: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => rows),
      };
      return query;
    }),
  },
}));

import { readPlayerSanctionStatus } from "./playerSanctions";

const now = new Date("2026-08-20T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectCall = 0;
  mocks.userRows = [
    {
      bannedUntil: null,
      banReason: null,
      tradeSuspendedUntil: new Date("2026-08-25T00:00:00.000Z"),
      tradeSuspensionReason: "현재 조사",
    },
  ];
  mocks.warningRows = [];
  mocks.tradeRows = [];
});

describe("플레이어 거래 제재 현재 행", () => {
  it("활성 거래 제재 시각이 없으면 거래 이력을 추가 조회하지 않는다", async () => {
    mocks.userRows[0] = {
      ...mocks.userRows[0],
      tradeSuspendedUntil: null,
      tradeSuspensionReason: null,
    };

    await expect(readPlayerSanctionStatus("u", now)).resolves.toMatchObject({
      tradeSuspension: null,
    });
    expect(mocks.selectCall).toBe(2);
  });

  it("더 오래 남은 과거 이력이 아니라 users 현재 만료 시각과 일치하는 행만 표시한다", async () => {
    mocks.tradeRows = [
      {
        id: 11,
        reason: "대체된 장기 제재",
        expiresAt: new Date("2026-08-30T00:00:00.000Z"),
        acknowledgedAt: null,
      },
      {
        id: 12,
        reason: "현재 조사",
        expiresAt: new Date("2026-08-25T00:00:00.000Z"),
        acknowledgedAt: null,
      },
    ];

    await expect(readPlayerSanctionStatus("u", now)).resolves.toMatchObject({
      tradeSuspension: {
        id: 12,
        reason: "현재 조사",
      },
    });
    expect(mocks.selectCall).toBe(3);
  });

  it("users의 현재 거래 제재가 만료됐으면 남아 있는 미래 이력을 현재로 노출하지 않는다", async () => {
    mocks.userRows[0] = {
      ...mocks.userRows[0],
      tradeSuspendedUntil: new Date("2026-08-19T00:00:00.000Z"),
    };
    mocks.tradeRows = [
      {
        id: 11,
        reason: "고아 이력",
        expiresAt: new Date("2026-08-30T00:00:00.000Z"),
        acknowledgedAt: null,
      },
    ];

    await expect(readPlayerSanctionStatus("u", now)).resolves.toMatchObject({
      tradeSuspension: null,
    });
    expect(mocks.selectCall).toBe(2);
  });
});
