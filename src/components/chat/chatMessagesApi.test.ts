import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../ChatPanel";
import {
  chatMessagesUrl,
  latestChatMessageId,
  mainChatMessagesUrl,
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
    expect(chatMessagesUrl({ channel: "trade", afterId: 3 })).toBe(
      "/api/chat?channel=trade&afterId=3",
    );
    expect(chatMessagesUrl({ channel: "room", roomId: 7, afterId: 12 })).toBe(
      "/api/chat?channel=room&roomId=7&afterId=12",
    );
  });

  it("세 기본 채널의 증분 커서를 한 요청에 담는다", () => {
    expect(
      mainChatMessagesUrl({
        globalAfterId: 11,
        tradeAfterId: 22,
        guildAfterId: 33,
        includeGuild: true,
      }),
    ).toBe(
      "/api/chat?channels=main&globalAfterId=11&tradeAfterId=22&guildAfterId=33&includeGuild=1",
    );
  });

  it("기본 채널 초기 조회에서는 커서와 길드 채널을 생략한다", () => {
    expect(mainChatMessagesUrl({ includeGuild: false })).toBe(
      "/api/chat?channels=main",
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

  it("늦게 도착한 최초 조회가 이미 전송한 내 메시지를 덮어쓰지 않는다", () => {
    const sent = { ...message(51, "내 메시지"), mine: true };
    const merged = mergeChatMessages([sent], [message(49), message(50)]);

    expect(merged.map((entry) => entry.id)).toEqual([49, 50, 51]);
    expect(merged.at(-1)).toEqual(sent);
  });
});
