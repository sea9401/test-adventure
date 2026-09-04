import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingContent } from "./LandingContent";

describe("대문 로그인 선택지", () => {
  it("로그인했지만 캐릭터가 없어도 생성과 기존 계정 로그인을 모두 제공한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent authed ageConfirmed />,
    );

    expect(html).toContain("캐릭터 만들고 시작하기");
    expect(html).toContain("기존 계정으로 로그인");
    expect(html).not.toContain("Google 계정으로 로그인");
    expect(html).toContain("카카오톡으로 로그인");
    expect(html).toContain("아이디·비밀번호로 로그인");
    expect(html).toContain("운영자가 개별 발급합니다");
  });

  it("비로그인 대문은 로그인 선택지만 제공한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent ageConfirmed />,
    );

    expect(html).not.toContain("캐릭터 만들고 시작하기");
    expect(html).toContain("카카오톡으로 로그인");
    expect(html).toContain(">무슨무슨게임</h1>");
    expect(html).toContain('aria-label="게임 이미지 슬라이드"');
    expect(html).toContain('href="#features"');
    expect(html).toContain('href="/manual"');
    expect(html).toContain("별도 설치 없이 브라우저에서 바로 시작");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/operations"');
    expect(html).toContain('href="/licenses"');
    expect(html).toContain('href="/game-info"');
    expect(html).toContain("게임 등급정보");
    expect(html).toContain('href="/notices/minimum-age-policy"');
    expect(html).toContain("만 14세 이상 서비스 기준 변경 안내");
    expect(html).not.toContain("함께한 모험가");
    expect(html).not.toContain("접속 중");
  });

  it("푸터에 공개 상품과 완성된 사업자 정보를 제공한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent
        merchantInfo={{
          legalName: "무슨게임",
          registrationNumber: "781-52-01091",
          representative: "홍길동",
          address: "서울특별시 테스트구 테스트로 1",
          contact: "02-0000-0000",
          mailOrderSalesNumber: null,
        }}
      />,
    );

    expect(html).toContain('href="/products/museun-coin"');
    expect(html).toContain("상호 무슨게임");
    expect(html).toContain("사업자등록번호 781-52-01091");
    expect(html).toContain("대표자 홍길동");
    expect(html).toContain("사업장 주소 서울특별시 테스트구 테스트로 1");
    expect(html).toContain("고객센터 02-0000-0000");
  });

  it("홍보 링크 유입 상태가 전달돼도 대문에 별도 안내를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      LandingContent({ referralStatus: "accepted" } as never),
    );

    expect(html).not.toContain("홍보 링크가 적용되었습니다");
    expect(html).not.toContain("나와 홍보자 모두 회복약 2개를 받고");
    expect(html).not.toContain("양쪽 모두 추가 보상을 받습니다");
  });

  it("OAuth 계정 연결 실패를 로그인 반복 대신 명시적으로 안내한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent authError="account-not-linked" />,
    );

    expect(html).toContain("기존 계정과 카카오 로그인을 연결하지 못했습니다");
    expect(html).toContain("인게임 닉네임과 함께 운영자에게 문의");
    expect(html).toContain('role="alert"');
  });

  it("연령 확인 전에는 로그인·캐릭터 생성 대신 만 14세 확인만 제공한다", () => {
    const html = renderToStaticMarkup(<LandingContent authed={false} />);

    expect(html).toContain("본인은 만 14세 이상입니다");
    expect(html).toContain("서비스 이용 기준은 만 14세 이상");
    expect(html).toContain("게임 등급은 12세이용가");
    expect(html).not.toContain("카카오톡으로 로그인");
    expect(html).not.toContain("아이디·비밀번호로 로그인");
    expect(html).not.toContain("캐릭터 만들고 시작하기");
  });
});
