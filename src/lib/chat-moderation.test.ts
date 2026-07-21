import { describe, expect, it } from "vitest";
import { isChatContentAllowed, moderateChatContent } from "./chat-moderation";

describe("채팅 욕설 필터", () => {
  it.each([
    "씨발",
    "시 발",
    "씨1발",
    "씨\u200b발",
    "개-새-끼",
    "병...신",
    "지.랄",
    "ㅅ ㅂ",
    "ㅈ-ㄹ",
    "ＦＵＣＫ",
  ])("우회 표기를 정규화해 차단한다: %s", (content) => {
    expect(isChatContentAllowed(content)).toBe(false);
  });

  it.each([
    "안녕하세요",
    "보스 잡으실 분",
    "시발점에서 출발해요",
    "막차의 시발지는 마을입니다",
    "표고버섯을 구합니다",
    "고양이 새끼가 귀여워요",
    "횃불이 자꾸 꺼져요",
    "허리띠를 졸라매요",
  ])("정상적인 문장은 허용한다: %s", (content) => {
    expect(isChatContentAllowed(content)).toBe(true);
  });

  it("차단 결과에는 원문 대신 규칙 식별자만 반환한다", () => {
    expect(moderateChatContent("개 새 끼")).toEqual({
      allowed: false,
      rule: "ko_gaesaekki",
    });
  });
});
