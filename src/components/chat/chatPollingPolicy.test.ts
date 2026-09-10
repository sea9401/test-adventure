import { describe, expect, it } from "vitest";
import {
  chatPollDelayMs,
  nextChatIdlePollCount,
} from "./chatPollingPolicy";

describe("chatPollDelayMs", () => {
  it("열린 채팅은 idle 횟수와 무관하게 3초를 유지한다", () => {
    expect(chatPollDelayMs(true, 0)).toBe(3_000);
    expect(chatPollDelayMs(true, 100)).toBe(3_000);
  });

  it("닫힌 채팅은 연속 무변화 횟수에 따라 30초에서 120초까지 늦춘다", () => {
    expect(chatPollDelayMs(false, 0)).toBe(30_000);
    expect(chatPollDelayMs(false, 2)).toBe(30_000);
    expect(chatPollDelayMs(false, 3)).toBe(60_000);
    expect(chatPollDelayMs(false, 9)).toBe(60_000);
    expect(chatPollDelayMs(false, 10)).toBe(120_000);
    expect(chatPollDelayMs(false, 100)).toBe(120_000);
  });

  it("새 메시지를 받으면 idle 단계를 즉시 초기화한다", () => {
    expect(nextChatIdlePollCount(8, true)).toBe(0);
    expect(nextChatIdlePollCount(8, false)).toBe(9);
  });
});
