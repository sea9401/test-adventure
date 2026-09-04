import { describe, expect, it } from "vitest";
import { MANUAL_SECTIONS } from "./manual/sections";
import sitemap from "./sitemap";

describe("sitemap.xml", () => {
  it("대문, 공개 정책과 모든 게임 안내서 섹션을 제공한다", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual([
      "https://msmsge.com/sign-in",
      "https://msmsge.com/notices/minimum-age-policy",
      "https://msmsge.com/terms",
      "https://msmsge.com/privacy",
      "https://msmsge.com/operations",
      "https://msmsge.com/account-deletion",
      "https://msmsge.com/licenses",
      ...MANUAL_SECTIONS.map(
        (section) => `https://msmsge.com/manual/${section.slug}`,
      ),
    ]);
  });

  it("리다이렉트와 로그인 전용 주소는 포함하지 않는다", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).not.toContain("https://msmsge.com/");
    expect(urls).not.toContain("https://msmsge.com/manual");
    expect(urls.some((url) => url.includes("/battle"))).toBe(false);
  });
});
