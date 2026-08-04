import { describe, expect, it } from "vitest";
import {
  CHAT_FLOATING_CLOSED_LAYER_CLASS,
  CHAT_FLOATING_OPEN_LAYER_CLASS,
} from "./ChatButton";

describe("ChatButton responsive layer", () => {
  it("모바일 채팅이 열리면 전체화면 오버레이 위에 닫기 토글을 유지한다", () => {
    expect(CHAT_FLOATING_CLOSED_LAYER_CLASS).toBe("z-[44]");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("z-[65]");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("sm:z-[44]");
  });
});
