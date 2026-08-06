import { describe, expect, it } from "vitest";
import {
  expandBulletinTextColors,
  wrapBulletinTextColor,
} from "./bulletinTextColors";

describe("bulletinTextColors", () => {
  it("사용자 색상 태그를 허용된 내부 링크 문법으로만 바꾼다", () => {
    expect(expandBulletinTextColors("[빨강]긴급[/빨강]")).toBe(
      "[긴급](bulletin-color:red)",
    );
    expect(expandBulletinTextColors("[검정]미허용[/검정]")).toBe(
      "[검정]미허용[/검정]",
    );
  });

  it("링크 라벨 문자를 이스케이프해 다른 링크로 탈출하지 못하게 한다", () => {
    expect(
      expandBulletinTextColors("[빨강]문구](javascript:alert(1))[/빨강]"),
    ).toBe("[문구\\](javascript:alert(1))](bulletin-color:red)");
  });

  it("선택 문구를 색상 태그로 감싸고 선택 영역을 유지한다", () => {
    expect(wrapBulletinTextColor("긴급 안내", 0, 2, "red")).toEqual({
      content: "[빨강]긴급[/빨강] 안내",
      selectionStart: 4,
      selectionEnd: 6,
    });
  });

  it("여러 줄을 선택하면 줄마다 태그를 적용한다", () => {
    expect(wrapBulletinTextColor("첫째\n둘째", 0, 5, "blue").content).toBe(
      "[파랑]첫째[/파랑]\n[파랑]둘째[/파랑]",
    );
  });
});
