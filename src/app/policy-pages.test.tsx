import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OperationsPage from "./operations/page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import LicensesPage from "./licenses/page";

describe("공개 정책 페이지", () => {
  it.each([
    ["개인정보처리방침", PrivacyPage],
    ["이용약관", TermsPage],
    ["운영정책", OperationsPage],
    ["오픈소스 고지", LicensesPage],
  ] as const)("%s 문서를 로그인 없이 렌더링한다", (title, Page) => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain(`<h1 class="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">${title}</h1>`);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/operations"');
    expect(html).toContain('href="/licenses"');
    expect(html).toContain("sea9401@gmail.com");
  });

  it("런타임 패키지와 Geist 글꼴의 공개 고지문을 연결한다", () => {
    const html = renderToStaticMarkup(<LicensesPage />);

    expect(html).toContain('href="/third-party-notices.txt"');
    expect(html).toContain('href="/licenses/geist-OFL-1.1.txt"');
    expect(html).toContain("sharp-libvips");
  });

  it("현재 유료 결제를 제공하지 않는다고 안내한다", () => {
    const html = renderToStaticMarkup(<TermsPage />);
    expect(html).toContain("현재 서비스는 현금 결제나 유료 상품 구매를 제공하지 않습니다");
  });

  it("확인된 처리 위치와 Cloudflare R2 국외 처리 내용을 안내한다", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);

    expect(html).toContain("대한민국 서울 리전");
    expect(html).toContain("ap-northeast-2");
    expect(html).toContain("Cloudflare, Inc. (R2)");
    expect(html).toContain("아시아·태평양 지역(APAC)");
    expect(html).toContain("이전을 거부하는 방법과 영향");
    expect(html).toContain("privacyquestions@cloudflare.com");
    expect(html).not.toContain("정식 출시 전 실제 운영 계약과 저장 위치");
  });
});
