import { describe, expect, it } from "vitest";
import { compactHubMenuStatusText } from "./useHubMenuStatus";

describe("메뉴 타일 상태 글 줄이기", () => {
  it("메뉴 이름과 겹치는 앞머리를 뺀다", () => {
    expect(compactHubMenuStatusText("농장 일일 납품 · 0 / 2", "모험가 농장")).toBe(
      "일일 납품 · 0 / 2",
    );
    expect(compactHubMenuStatusText("주방 일일 납품 · 0 / 3", "주방")).toBe(
      "일일 납품 · 0 / 3",
    );
  });

  it("겹치지 않는 글과 한 단어뿐인 앞머리는 그대로 둔다", () => {
    expect(compactHubMenuStatusText("훈련장 · 전직 후 이용 가능", "모험가 협회")).toBe(
      "훈련장 · 전직 후 이용 가능",
    );
    expect(compactHubMenuStatusText("폭풍 원정 · 0 / 3", "던전")).toBe(
      "폭풍 원정 · 0 / 3",
    );
    expect(compactHubMenuStatusText("농장 · 수확 가능", "모험가 농장")).toBe(
      "농장 · 수확 가능",
    );
    expect(compactHubMenuStatusText("오늘 0회 참여", "아레나")).toBe("오늘 0회 참여");
  });
});
