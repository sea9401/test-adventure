import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MinimumAgePolicyNoticePage from "./page";

describe("만 14세 이상 서비스 기준 변경 공지", () => {
  it("공지일·시행일과 기존 이용자 영향을 공개 문서로 안내한다", () => {
    const html = renderToStaticMarkup(<MinimumAgePolicyNoticePage />);

    expect(html).toContain("서비스 이용 연령 기준 변경 안내");
    expect(html).toContain("공지일: 2026년 9월 4일");
    expect(html).toContain("시행일: 2026년 10월 4일 00:00");
    expect(html).toContain("기존 이용자도");
    expect(html).toContain("12세이용가");
    expect(html).toContain("만 14세 이상");
    expect(html).toContain("생년월일은 수집하지 않습니다");
    expect(html).toContain('href="/account-deletion"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});
