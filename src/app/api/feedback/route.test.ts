import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "user-1" as string | null),
  queryRows: [] as Array<Array<Record<string, unknown>>>,
  select: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: () => ({values: (value: unknown) => {mocks.insertValues(value); return {returning: async () => [{id:587}]};}}),
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

vi.mock("@/lib/server/resolveActor", () => ({ resolveActor: async () => ({name:"작성자"}) }));
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { GET, POST } from "./route";

function feedbackRow(id: number) {
  return {
    id,
    category: "suggestion",
    content: `건의 내용 ${id}`,
    imageKey: null,
    status: "resolved",
    adminReply: `답변 ${id}`,
    reviewedAt: new Date("2026-08-10T00:00:00.000Z"),
    repliedAt: new Date("2026-08-10T01:00:00.000Z"),
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetUserRateLimitForTests();
  mocks.ensureUser.mockResolvedValue("user-1");
  mocks.queryRows = [];
  mocks.select.mockImplementation(() => {
    const rows = mocks.queryRows[mocks.select.mock.calls.length - 1] ?? [];
    const builder = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(async () => rows),
    };
    builder.from.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    return builder;
  });
});

describe("건의 내역 대상 조회", () => {
  it("최근 50건 밖의 요청 대상 건의를 목록에 보충한다", async () => {
    mocks.queryRows = [[feedbackRow(100)], [feedbackRow(7)]];

    const response = await GET(
      new Request("http://localhost/api/feedback?targetId=7"),
    );
    const body = (await response.json()) as {
      entries: Array<{ id: number; hasImage: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body.entries.map((entry) => entry.id)).toEqual([100, 7]);
    expect(body.entries.every((entry) => entry.hasImage === false)).toBe(true);
  });

  it("잘못된 대상 번호는 최근 목록만 반환한다", async () => {
    mocks.queryRows = [[feedbackRow(100)]];

    const response = await GET(
      new Request("http://localhost/api/feedback?targetId=invalid"),
    );
    const body = (await response.json()) as {
      entries: Array<{ id: number }>;
    };

    expect(body.entries.map((entry) => entry.id)).toEqual([100]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});


it("최근 건의가 삭제되어 조회되지 않아도 1분 접수 제한을 유지한다", async () => {
  const request = () => new Request("http://localhost/api/feedback", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:"새로 작성한 건의입니다.",category:"suggestion"})});
  // 첫 접수 이후 행이 삭제된 상황: 최신 내역 SELECT는 계속 빈 배열을 반환한다.
  mocks.queryRows = [[], []];
  expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(429);
  expect(mocks.insertValues).toHaveBeenCalledTimes(1);
});
