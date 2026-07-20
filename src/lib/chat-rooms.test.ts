import { describe, expect, it } from "vitest";
import {
  CHAT_ROOM_NAME_MAX,
  isChatRoomVisibility,
  normalizeChatRoomName,
} from "./chat-rooms";

describe("chat rooms", () => {
  it("방 이름의 바깥·연속 공백을 정리한다", () => {
    expect(normalizeChatRoomName("  모험   수다방  ")).toBe("모험 수다방");
  });

  it("너무 짧거나 긴 이름과 제어 문자를 거부한다", () => {
    expect(normalizeChatRoomName("가")).toBeNull();
    expect(normalizeChatRoomName("가".repeat(CHAT_ROOM_NAME_MAX + 1))).toBeNull();
    expect(normalizeChatRoomName("모험\u0000방")).toBeNull();
  });

  it("공개·비공개 값만 허용한다", () => {
    expect(isChatRoomVisibility("public")).toBe(true);
    expect(isChatRoomVisibility("private")).toBe(true);
    expect(isChatRoomVisibility("hidden")).toBe(false);
  });
});
