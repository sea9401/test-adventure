import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingContent } from "./LandingContent";

describe("대문 로그인 선택지", () => {
  it("로그인했지만 캐릭터가 없어도 생성과 기존 계정 로그인을 모두 제공한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent authed />,
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
      <LandingContent />,
    );

    expect(html).not.toContain("캐릭터 만들고 시작하기");
    expect(html).toContain("카카오톡으로 로그인");
    expect(html).toContain(">무슨무슨게임</h1>");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/operations"');
    expect(html).toContain('href="/licenses"');
    expect(html).not.toContain("함께한 모험가");
    expect(html).not.toContain("접속 중");
  });

  it("유효한 홍보 링크가 적용됐음을 대문에서 안내한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent referralStatus="accepted" />,
    );

    expect(html).toContain("홍보 링크가 적용되었습니다");
    expect(html).toContain("캐릭터를 만들면 회복약 2개를 받고");
    expect(html).toContain("홍보자에게도 단계별 보상이 지급됩니다");
  });

  it("OAuth 계정 연결 실패를 로그인 반복 대신 명시적으로 안내한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent authError="account-not-linked" />,
    );

    expect(html).toContain("기존 계정과 카카오 로그인을 연결하지 못했습니다");
    expect(html).toContain("인게임 닉네임과 함께 운영자에게 문의");
    expect(html).toContain('role="alert"');
  });
});
