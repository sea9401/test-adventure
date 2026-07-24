import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../ChatPanel";
import {
  chatMessagesUrl,
  latestChatMessageId,
  mergeChatMessages,
} from "./chatMessagesApi";

function message(id: number, content = `message-${id}`): ChatMessage {
  return {
    id,
    channel: "global",
    name: "tester",
    className: "warrior",
    title: null,
    content,
    createdAt: id,
    mine: false,
  };
}

describe("chatMessagesApi", () => {
  it("마지막 id가 0이어도 증분 조회 URL을 만든다", () => {
    expect(chatMessagesUrl({ channel: "global", afterId: 0 })).toBe(
      "/api/chat?channel=global&afterId=0",
    );
    expect(chatMessagesUrl({ channel: "room", roomId: 7, afterId: 12 })).toBe(
      "/api/chat?channel=room&roomId=7&afterId=12",
    );
  });

  it("증분 메시지를 id로 중복 제거하고 최신 50개만 유지한다", () => {
    const previous = Array.from({ length: 49 }, (_, index) => message(index + 1));
    const merged = mergeChatMessages(previous, [
      message(49, "updated"),
      message(50),
      message(51),
    ]);

    expect(merged).toHaveLength(50);
    expect(merged[0]?.id).toBe(2);
    expect(merged.at(-1)?.id).toBe(51);
    expect(merged.find((entry) => entry.id === 49)?.content).toBe("updated");
    expect(latestChatMessageId(merged)).toBe(51);
  });

  it("새 메시지가 없으면 기존 배열을 그대로 재사용한다", () => {
    const previous = [message(1)];
    expect(mergeChatMessages(previous, [])).toBe(previous);
  });
});
