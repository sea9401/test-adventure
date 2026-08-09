import { describe, expect, it } from "vitest";
import { chatPollDelayMs } from "./chatPollingPolicy";

describe("chatPollDelayMs", () => {
  it("열린 채팅은 3초, 닫힌 채팅은 30초 뒤에 다음 조회를 예약한다", () => {
    expect(chatPollDelayMs(true)).toBe(3_000);
    expect(chatPollDelayMs(false)).toBe(30_000);
  });
});
