import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GameInfoPage from "@/app/game-info/page";
import { GameRatingInformation } from "./GameRatingInformation";

describe("게임 등급정보", () => {
  it("결정된 12세 등급과 폭력성 정보 및 등록번호를 표시한다", () => {
    const html = renderToStaticMarkup(<GameRatingInformation />);

    expect(html).toContain("12세 미만은 이용할 수 없습니다");
    expect(html).toContain("GC-CC-NP-260903-001");
    expect(html).toContain("2026.08.07");
    expect(html).toContain("제2026-000005호");
    expect(html).toContain("제2026-000001호");
    expect(html).toContain("폭력성");
    expect(html).toContain("/images/rating/12-plus.webp");
    expect(html).toContain("/images/rating/violence.webp");
    expect(html).not.toContain("선정성");
    expect(html).not.toContain("사행성");
  });

  it("로그인 없는 공개 페이지에서 결정사유와 공식 확인 경로를 제공한다", async () => {
    const html = renderToStaticMarkup(
      await GameInfoPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("게임 등급정보");
    expect(html).toContain("최초 공개일");
    expect(html).toContain("2026.08.01");
    expect(html).toContain("무기와 붉은 선혈이 표현된 일러스트");
    expect(html).toContain("게임콘텐츠등급분류위원회에서 결정 내용 확인");
    expect(html).toContain('href="/"');
  });

  it("게임에서 연 등급정보 탭은 게임 루트로 이동하지 않고 탭 닫기를 제공한다", async () => {
    const html = renderToStaticMarkup(
      await GameInfoPage({ searchParams: Promise.resolve({ from: "game" }) }),
    );

    expect(html).toContain("무슨무슨게임으로 돌아가기");
    expect(html).not.toContain('href="/"');
  });
});
