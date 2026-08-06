import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveBulletinActivity } from "@/lib/bulletinActivity";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ value: unknown }>,
  select: vi.fn(),
  transaction: vi.fn(),
  grantTitleIfMissingInTx: vi.fn(),
  tx: { kind: "tx" },
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/server/grantTitle", () => ({
  ownedTitleIdsOf(raw: unknown) {
    const titles = (raw as { titles?: Record<string, unknown> } | undefined)
      ?.titles;
    return titles ? Object.keys(titles) : [];
  },
  grantTitleIfMissingInTx: mocks.grantTitleIfMissingInTx,
}));

import {
  syncBulletinActivityTitles,
  syncBulletinActivityTitlesBestEffort,
} from "./bulletinActivityTitles";

beforeEach(() => {
  mocks.rows = [];
  mocks.select.mockReset();
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => mocks.rows,
      }),
    }),
  }));
  mocks.transaction.mockReset();
  mocks.transaction.mockImplementation(async (run) => run(mocks.tx));
  mocks.grantTitleIfMissingInTx.mockReset();
  mocks.grantTitleIfMissingInTx.mockResolvedValue(true);
});

describe("syncBulletinActivityTitles", () => {
  it("현재 레벨까지의 미보유 이정표 칭호만 지급한다", async () => {
    mocks.rows = [
      {
        value: {
          titles: { bulletin_storyteller: { obtainedAt: 1 } },
        },
      },
    ];
    const activity = deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: 0,
      receivedLikes: 48,
    });

    const granted = await syncBulletinActivityTitles("u1", activity, 123);

    expect(activity.level).toBe(7);
    expect(granted).toEqual(["bulletin_regular", "bulletin_adviser"]);
    expect(mocks.grantTitleIfMissingInTx).toHaveBeenNthCalledWith(
      1,
      mocks.tx,
      "u1",
      "bulletin_regular",
      123,
    );
    expect(mocks.grantTitleIfMissingInTx).toHaveBeenNthCalledWith(
      2,
      mocks.tx,
      "u1",
      "bulletin_adviser",
      123,
    );
  });

  it("모든 대상 칭호를 이미 보유하면 쓰기 트랜잭션을 열지 않는다", async () => {
    mocks.rows = [
      {
        value: {
          titles: {
            bulletin_storyteller: { obtainedAt: 1 },
            bulletin_regular: { obtainedAt: 2 },
          },
        },
      },
    ];
    const activity = deriveBulletinActivity({
      creditedPosts: 25,
      creditedComments: 10,
      receivedLikes: 0,
    });

    await expect(syncBulletinActivityTitles("u1", activity)).resolves.toEqual(
      [],
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("칭호 보상 전 레벨이면 보유 목록도 조회하지 않는다", async () => {
    const activity = deriveBulletinActivity({
      creditedPosts: 1,
      creditedComments: 0,
      receivedLikes: 0,
    });

    await expect(syncBulletinActivityTitles("u1", activity)).resolves.toEqual(
      [],
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("동기화 실패가 게시판 본 요청으로 전파되지 않게 흡수한다", async () => {
    const error = new Error("db unavailable");
    mocks.select.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const activity = deriveBulletinActivity({
      creditedPosts: 5,
      creditedComments: 6,
      receivedLikes: 1,
    });

    await expect(
      syncBulletinActivityTitlesBestEffort("u1", activity),
    ).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "[bulletin] activity title sync failed",
      error,
    );
    consoleError.mockRestore();
  });
});
