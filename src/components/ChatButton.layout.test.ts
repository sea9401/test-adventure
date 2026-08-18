import { describe, expect, it } from "vitest";
import {
  CHAT_FLOATING_CLOSED_LAYER_CLASS,
  CHAT_FLOATING_OPEN_LAYER_CLASS,
} from "./ChatButton";

describe("ChatButton responsive layer", () => {
  it("채팅이 열리면 모바일 토글은 숨기고 데스크톱 토글만 패널 위에 유지한다", () => {
    expect(CHAT_FLOATING_CLOSED_LAYER_CLASS).toBe("z-[44]");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("invisible");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("pointer-events-none");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("sm:visible");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("sm:pointer-events-auto");
    expect(CHAT_FLOATING_OPEN_LAYER_CLASS).toContain("sm:z-[46]");
  });
});
