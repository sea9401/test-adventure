import { describe, expect, it } from "vitest";
import {
  CHAT_FLOATING_CLOSED_LAYER_CLASS,
  CHAT_FLOATING_OPEN_LAYER_CLASS,
} from "./ChatButton";

describe("ChatButton responsive layer", () => {
  it("채팅이 열리면 모바일·데스크톱 모두 패널 위에 닫기 토글을 유지한다", () => {
    expect(CHAT_FLOATING_CLOSED_LAYER_CLASS).toBe("z-[44]");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("z-[75]");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("sm:z-[46]");
  });
});
