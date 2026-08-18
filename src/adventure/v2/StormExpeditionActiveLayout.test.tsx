import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StormExpeditionActiveLayout } from "./StormExpeditionActiveLayout";

describe("폭풍 원정 진행 화면 배치", () => {
  it("모바일 읽기 순서에서는 현재 행동과 경로 선택과 지원 정보를 차례로 보여준다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionActiveLayout
        currentAction={<div>현재 행동</div>}
        routePlanner={<div>경로 선택</div>}
        support={<div>원정 지원</div>}
      />,
    );

    expect(html.indexOf("현재 행동")).toBeLessThan(html.indexOf("경로 선택"));
    expect(html.indexOf("경로 선택")).toBeLessThan(html.indexOf("원정 지원"));
  });

  it("PC에서는 경로와 행동을 두 열에 함께 배치한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionActiveLayout
        currentAction={<div>현재 행동</div>}
        routePlanner={<div>경로 선택</div>}
        support={<div>원정 지원</div>}
      />,
    );

    expect(html).toContain("md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]");
    expect(html).toMatch(/data-testid="storm-expedition-route-planner"[^>]*md:col-start-1/);
    expect(html).toMatch(/data-testid="storm-expedition-current-action"[^>]*md:col-start-2/);
  });
});
