import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "u-order" as string | null),
  upsertSave: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => ({})),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  readBlockedUserIds: vi.fn(async () => []),
  requireCurrentUgcConsent: vi.fn(async () => null),
}));

import { CHAT_ROOM_ORDER_SAVE_KEY } from "@/lib/chat-rooms";
import { PATCH } from "./route";

function request(roomOrder: unknown) {
  return new Request("http://localhost/api/chat/rooms", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomOrder }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureUser.mockResolvedValue("u-order");
});

describe("PATCH /api/chat/rooms", () => {
  it("검증한 채팅방 순서를 계정 저장소에 보관한다", async () => {
    const roomOrder = ["trade", "chat", "room:7", "notice", "guild"];
    const response = await PATCH(request(roomOrder));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, roomOrder });
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-order",
      CHAT_ROOM_ORDER_SAVE_KEY,
      { version: 1, roomOrder },
    );
  });

  it("허용되지 않은 방 식별자가 있으면 저장하지 않는다", async () => {
    const response = await PATCH(request(["chat", "room:nope"]));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid room order");
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("로그아웃 상태에서는 저장하지 않는다", async () => {
    mocks.ensureUser.mockResolvedValue(null);
    const response = await PATCH(request(["chat", "trade"]));

    expect(response.status).toBe(401);
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });
});
