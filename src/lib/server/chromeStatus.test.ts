import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  select: vi.fn(),
  readSave: vi.fn(),
  createFarmReadyNotification: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  readSave: mocks.readSave,
}));

vi.mock("@/adventure/v2/farm", () => ({
  FARM_SAVE_KEY: "farm.v2",
  emptyFarmState: vi.fn(() => ({ plots: [] })),
}));

vi.mock("@/adventure/v2/farmReadyNotification", () => ({
  FARM_READY_NOTIFICATION_SAVE_KEY: "farm-ready-notification.v1",
  emptyFarmReadyNotificationState: vi.fn(() => ({
    version: 1,
    acknowledgedPlantings: {},
  })),
  createFarmReadyNotification: mocks.createFarmReadyNotification,
}));

import { readChromeStatus } from "./chromeStatus";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.results = [];
  mocks.select.mockImplementation((projection: Record<string, unknown>) => {
    const rows =
      Object.keys(projection).length === 1 && "one" in projection
        ? []
        : (mocks.results.shift() ?? []);
    const query: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return query;
  });
  mocks.readSave.mockImplementation(
    async (_db: unknown, _userId: string, key: string) =>
      key === "farm.v2" ? { farm: true } : { notification: true },
  );
  mocks.createFarmReadyNotification.mockReturnValue({ id: 0 });
});

describe("readChromeStatus", () => {
  it("알림·우편·최신 공지 상태를 기존 판정 규칙으로 한 번에 계산한다", async () => {
    mocks.results = [
      [{ unreadCount: 4 }],
      [{ unreadCount: 7 }],
      [{ id: 99 }],
      [],
    ];

    const result = await readChromeStatus("u1", 1_700_000_000_000);

    expect(result).toEqual({
      notificationUnread: 5,
      mailUnread: 7,
      hasUnreadNotice: true,
    });
    expect(mocks.createFarmReadyNotification).toHaveBeenCalledWith(
      { farm: true },
      { notification: true },
      1_700_000_000_000,
    );
    expect(mocks.select).toHaveBeenCalledTimes(5);
  });

  it("공지 자체가 없으면 열람 기록을 추가 조회하지 않는다", async () => {
    mocks.results = [[{ unreadCount: 0 }], [{ unreadCount: 0 }], []];
    mocks.createFarmReadyNotification.mockReturnValue(null);

    await expect(readChromeStatus("u1")).resolves.toEqual({
      notificationUnread: 0,
      mailUnread: 0,
      hasUnreadNotice: false,
    });
    expect(mocks.select).toHaveBeenCalledTimes(4);
  });
});
