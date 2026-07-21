import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "u-chat"),
  resolveActor: vi.fn(),
  recordAbuseEventSoon: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/resolveActor", () => ({ resolveActor: mocks.resolveActor }));
vi.mock("@/lib/server/bulletinAccess", () => ({ getViewerGuild: vi.fn() }));
vi.mock("@/lib/server/chatProgress", () => ({ recordUserChatMessageInTx: vi.fn() }));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: vi.fn(),
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(() => "127.0.0.1"),
  recordAbuseEventSoon: mocks.recordAbuseEventSoon,
}));

import { POST } from "./route";

function request(content: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, channel: "global" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("채팅 전송 검열", () => {
  it("부적절한 표현은 사용자 정보를 조회하거나 저장하기 전에 거부한다", async () => {
    const response = await POST(request("씨 발"));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("inappropriate content");
    expect(mocks.resolveActor).not.toHaveBeenCalled();
    expect(mocks.recordAbuseEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-chat",
        action: "chat.message",
        reason: "inappropriate_content",
        detail: expect.objectContaining({ channel: "global" }),
      }),
    );
  });
});
