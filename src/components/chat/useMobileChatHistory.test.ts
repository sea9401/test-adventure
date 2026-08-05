import { describe, expect, it } from "vitest";
import {
  MOBILE_CHAT_HISTORY_STATE_KEY,
  readMobileChatHistoryMarker,
  resolveMobileChatPopState,
  withMobileChatHistoryMarker,
} from "./useMobileChatHistory";

describe("mobile chat history", () => {
  it("Next.js가 사용 중인 기존 history state를 보존한다", () => {
    const state = withMobileChatHistoryMarker(
      { __NA: true, tree: ["adventure"] },
      { sessionId: "chat-1", layer: "rooms" },
    );

    expect(state).toMatchObject({
      __NA: true,
      tree: ["adventure"],
      [MOBILE_CHAT_HISTORY_STATE_KEY]: {
        sessionId: "chat-1",
        layer: "rooms",
      },
    });
  });

  it("현재 채팅 세션의 방과 목록 단계를 구분한다", () => {
    const roomsState = withMobileChatHistoryMarker(null, {
      sessionId: "chat-1",
      layer: "rooms",
    });
    const detailState = withMobileChatHistoryMarker(roomsState, {
      sessionId: "chat-1",
      layer: "detail",
    });

    expect(resolveMobileChatPopState(roomsState, "chat-1")).toBe("rooms");
    expect(resolveMobileChatPopState(detailState, "chat-1")).toBe("detail");
  });

  it("채팅 기록 바깥이나 다른 세션으로 이동하면 닫기로 판단한다", () => {
    const staleState = withMobileChatHistoryMarker(null, {
      sessionId: "old-chat",
      layer: "rooms",
    });

    expect(resolveMobileChatPopState(null, "chat-1")).toBe("close");
    expect(resolveMobileChatPopState(staleState, "chat-1")).toBe("close");
    expect(readMobileChatHistoryMarker({
      [MOBILE_CHAT_HISTORY_STATE_KEY]: { sessionId: 1, layer: "rooms" },
    })).toBeNull();
  });
});
