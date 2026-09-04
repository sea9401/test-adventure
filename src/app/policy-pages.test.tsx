import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OperationsPage from "./operations/page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import LicensesPage from "./licenses/page";
import AccountDeletionPage from "./account-deletion/page";

describe("공개 정책 페이지", () => {
  it.each([
    ["개인정보처리방침", PrivacyPage],
    ["이용약관", TermsPage],
    ["운영정책", OperationsPage],
    ["계정 및 데이터 삭제", AccountDeletionPage],
    ["오픈소스 고지", LicensesPage],
  ] as const)("%s 문서를 로그인 없이 렌더링한다", (title, Page) => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain(`<h1 class="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">${title}</h1>`);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/operations"');
    expect(html).toContain('href="/account-deletion"');
    expect(html).toContain('href="/licenses"');
    expect(html).toContain("sea9401@gmail.com");
  });

  it("런타임 패키지와 Geist 글꼴의 공개 고지문을 연결한다", () => {
    const html = renderToStaticMarkup(<LicensesPage />);

    expect(html).toContain('href="/third-party-notices.txt"');
    expect(html).toContain('href="/licenses/geist-OFL-1.1.txt"');
    expect(html).toContain("sharp-libvips");
  });

  it("유료 코인 활성화 전 상태와 결제·환불 기준을 사전 고지한다", () => {
    const terms = renderToStaticMarkup(<TermsPage />);
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    expect(terms).toContain("카드 결제 기능은 아직 운영 환경에서 활성화되지 않았습니다");
    expect(terms).toContain("유료 무슨 코인");
    expect(terms).toContain("미사용 유료 코인");
    expect(terms).toContain("sea9401@gmail.com");
    expect(privacy).toContain("토스페이먼츠");
    expect(privacy).toContain("카드번호와 CVC를 저장하지 않습니다");
    expect(privacy).toContain("5년");
  });

  it("12세이용가와 별도로 만 14세 이상 서비스 기준을 안내한다", () => {
    const terms = renderToStaticMarkup(<TermsPage />);
    const privacy = renderToStaticMarkup(<PrivacyPage />);

    expect(terms).toContain("서비스는 만 14세 이상인 이용자만 이용할 수 있습니다");
    expect(terms).toContain("12세이용가 등급과 별도의 서비스 이용 조건");
    expect(terms).toContain("시행일: 2026년 10월 4일");
    expect(privacy).toContain("만 14세 이상 확인 여부와 확인 시각");
    expect(privacy).toContain("생년월일은 수집하지 않음");
    expect(privacy).toContain("확인 후 최대 1년");
    expect(privacy).toContain("시행일: 2026년 10월 4일");
  });

  it("확인된 처리 위치와 외부 보안 서비스의 국외 처리 내용을 안내한다", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);

    expect(html).toContain("2026년 10월 4일");
    expect(html).toContain("대한민국 서울 리전");
    expect(html).toContain("ap-northeast-2");
    expect(html).toContain("CloudFront·AWS WAF");
    expect(html).toContain("aws-korea-privacy@amazon.com");
    expect(html).toContain("Cloudflare, Inc. (R2)");
    expect(html).toContain("아시아·태평양 지역(APAC)");
    expect(html).toContain("Cloudflare, Inc. (Turnstile)");
    expect(html).toContain("dpo@cloudflare.com");
    expect(html).toContain("Intuition Machines, Inc. (hCaptcha)");
    expect(html).toContain("privacy@imachines.com");
    expect(html).toContain("확인이 요구된 낚시·벌목·채광 활동");
    expect(html).toContain('aria-label="외부 서비스와 처리 인프라"');
    expect(html).toContain('aria-label="Turnstile과 hCaptcha 국외 처리 정보"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("이전을 거부하는 방법과 영향");
    expect(html).toContain("privacyquestions@cloudflare.com");
    expect(html).toContain("생성 후 최대 90일");
    expect(html).toContain("환경 설정 → 회원 탈퇴");
    expect(html).toContain("처리 완료 후 180일");
    expect(html).toContain("푸시 구독 주소");
    expect(html).toContain("‘알림 끄기’");
    expect(html).not.toContain("정식 출시 전 실제 운영 계약과 저장 위치");
  });

  it("개인정보처리방침에 실제 운영 로그 보관 기간을 안내한다", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);

    expect(html).toContain("<td>전체 소식 기록</td><td>발생 후 30일</td>");
    expect(html).toContain("<td>이상행동·보안 이벤트</td><td>발생 후 30일</td>");
    expect(html).toContain(
      "<td>재화 변동·경제 감사 이벤트</td><td>발생 후 30일</td>",
    );
    expect(html).toContain(
      "<td>푸시 중복 발송 방지 기록</td><td>발송 후 최대 30일</td>",
    );
    expect(html).toContain(
      "<td>관리자 조치 감사 기록</td><td>발생 후 60일</td>",
    );
    expect(html).toContain(
      "<td>종료된 이용 제한·경고 기록</td><td>해제·만료 또는 경고 확인 후 60일</td>",
    );
  });
});
