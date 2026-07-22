import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("공개 페이지 수집과 사이트맵 발견을 허용한다", () => {
    const result = robots();

    expect(result.sitemap).toBe("https://msmsge.com/sitemap.xml");
    expect(result.host).toBe("https://msmsge.com");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("API와 로그인 전용 화면을 수집 대상에서 제외한다", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules?.disallow).toEqual(
      expect.arrayContaining(["/api/", "/battle", "/create", "/settings"]),
    );
    expect(rules?.disallow).not.toContain("/_next");
    expect(rules?.disallow).not.toContain("/sign-in");
    expect(rules?.disallow).not.toContain("/manual");
  });
});
