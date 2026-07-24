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
    expect(html).not.toContain("함께한 모험가");
    expect(html).not.toContain("접속 중");
  });

  it("유효한 홍보 링크가 적용됐음을 대문에서 안내한다", () => {
    const html = renderToStaticMarkup(
      <LandingContent referralStatus="accepted" />,
    );

    expect(html).toContain("홍보 링크가 적용되었습니다");
    expect(html).toContain("새 캐릭터를 만들면 홍보자에게 보상이 지급됩니다");
  });
});
