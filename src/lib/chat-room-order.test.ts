import { describe, expect, it } from "vitest";
import {
  isValidChatRoomOrderInput,
  moveChatRoomOrder,
  parseChatRoomOrder,
  reconcileChatRoomOrder,
  visibleChatRoomOrder,
} from "./chat-rooms";

describe("chat room order", () => {
  it("기본방 뒤에 참여한 순서대로 사용자 채팅방을 배치한다", () => {
    expect(reconcileChatRoomOrder([], [7, 3])).toEqual([
      "chat",
      "trade",
      "notice",
      "guild",
      "room:7",
      "room:3",
    ]);
  });

  it("저장된 사용자 순서를 유지하고 새 참여방만 뒤에 붙인다", () => {
    expect(
      reconcileChatRoomOrder(
        ["room:3", "trade", "chat", "notice", "guild", "room:99"],
        [7, 3, 8],
      ),
    ).toEqual([
      "room:3",
      "trade",
      "chat",
      "notice",
      "guild",
      "room:7",
      "room:8",
    ]);
  });

  it("드래그한 방을 놓은 방의 위치로 옮긴다", () => {
    expect(
      moveChatRoomOrder(
        ["chat", "trade", "notice", "guild"],
        "guild",
        "trade",
      ),
    ).toEqual(["chat", "guild", "trade", "notice"]);
  });

  it("길드 미가입자에게는 길드 채팅방을 노출하지 않는다", () => {
    const order = reconcileChatRoomOrder([], [5]);
    expect(visibleChatRoomOrder(order, false)).toEqual([
      "chat",
      "trade",
      "notice",
      "room:5",
    ]);
    expect(visibleChatRoomOrder(order, true)).toContain("guild");
  });

  it("손상되거나 허용되지 않은 저장값을 제거한다", () => {
    expect(
      parseChatRoomOrder({
        roomOrder: ["trade", "trade", "room:4", "room:0", "unknown"],
      }),
    ).toEqual(["trade", "room:4"]);
    expect(isValidChatRoomOrderInput(["chat", "room:5"])).toBe(true);
    expect(isValidChatRoomOrderInput(["chat", "room:nope"])).toBe(false);
  });
});
