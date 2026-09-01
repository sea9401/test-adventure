import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  canAccessBulletinPost: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/bulletinAccess", () => ({
  canAccessBulletinPost: mocks.canAccessBulletinPost,
}));
vi.mock("@/lib/server/resolveActor", () => ({
  resolveActor: vi.fn(),
}));
vi.mock("@/lib/server/bulletinActivity", () => ({
  bulletinActivityFromMap: vi.fn(),
  readBulletinActivityMap: vi.fn(),
}));
vi.mock("@/lib/server/bulletinActivityTitles", () => ({
  syncBulletinActivityTitlesBestEffort: vi.fn(),
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  readBlockedUserIds: vi.fn(),
  requireCurrentUgcConsent: vi.fn(),
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "7" }) };

function commentRequest(content: string) {
  return new Request("http://localhost/api/bulletin/7/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

describe("POST /api/bulletin/[id]/comments", () => {
  beforeEach(() => {
    mocks.ensureUser.mockReset();
    mocks.ensureUser.mockResolvedValue("commenter");
    mocks.canAccessBulletinPost.mockReset();
    mocks.canAccessBulletinPost.mockResolvedValue(false);
  });

  it("400자 댓글은 길이 검사를 통과한다", async () => {
    const response = await POST(commentRequest("가".repeat(400)), context);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("not found");
    expect(mocks.canAccessBulletinPost).toHaveBeenCalledOnce();
  });

  it("401자 댓글은 길이 검사에서 거부한다", async () => {
    const response = await POST(commentRequest("가".repeat(401)), context);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("too long (max 400)");
    expect(mocks.canAccessBulletinPost).not.toHaveBeenCalled();
  });
});
