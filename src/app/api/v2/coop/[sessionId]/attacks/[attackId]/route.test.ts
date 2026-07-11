import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  select: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/db", () => ({
  db: { select: mocks.select },
}));

import { GET } from "./route";

function context(sessionId: string, attackId: string) {
  return { params: Promise.resolve({ sessionId, attackId }) };
}

describe("GET /api/v2/coop/[sessionId]/attacks/[attackId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("viewer");
  });

  it("로그인하지 않은 사용자를 거절한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);
    const response = await GET(
      new Request("http://test/api/v2/coop/session/attacks/1"),
      context("session", "1"),
    );

    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-1", "1.5"])(
    "잘못된 공격 ID %s를 조회하지 않는다",
    async (attackId) => {
      const response = await GET(
        new Request(`http://test/api/v2/coop/session/attacks/${attackId}`),
        context("session", attackId),
      );

      expect(response.status).toBe(404);
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );
});
