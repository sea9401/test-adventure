import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "u-feed"),
  rows: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(),
}));
vi.mock("@/adventure/data/items", () => ({
  ITEMS: {},
  isLuckyFind: vi.fn(() => false),
}));

import { GET } from "./route";

function feedRow(id: number) {
  return {
    id,
    type: "newcomer",
    actorName: `모험가-${id}`,
    payload: { newcomer: true },
    createdAt: new Date(1_700_000_000_000 + id * 1_000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureUser.mockResolvedValue("u-feed");
  mocks.rows = [];
  mocks.limit.mockImplementation(async () => mocks.rows);
  mocks.select.mockImplementation(() => {
    const builder = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: mocks.limit,
    };
    builder.from.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    return builder;
  });
});

describe("전체 소식 과거 조회", () => {
  it("30건보다 하나 더 조회해 다음 페이지 여부를 계산한다", async () => {
    mocks.rows = Array.from({ length: 31 }, (_, index) => feedRow(100 - index));

    const response = await GET(new Request("http://localhost/api/feed"));
    const body = (await response.json()) as {
      entries: Array<{ id: number }>;
      hasMore: boolean;
    };

    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith(31);
    expect(body.hasMore).toBe(true);
    expect(body.entries).toHaveLength(30);
    expect(body.entries[0]?.id).toBe(71);
    expect(body.entries.at(-1)?.id).toBe(100);
  });

  it("잘못된 cursor는 DB 조회 전에 거부한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/feed?before=2147483648"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid cursor");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
