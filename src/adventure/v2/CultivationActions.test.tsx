import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CultivationActions,
  cultivationCompletionMessage,
  cultivationRequestInit,
} from "./CultivationActions";

describe("수행 액션", () => {
  it("기존 1회 버튼과 가능한 만큼 버튼을 함께 노출한다", () => {
    const html = renderToStaticMarkup(
      <CultivationActions
        canCultivate
        busy={false}
        isLifestyleJob={false}
        onCultivate={() => undefined}
        onCultivateMax={() => undefined}
      />,
    );

    expect(html).toContain(">수행</button>");
    expect(html).toContain("가능한 만큼 수행");
    expect(html).not.toContain('disabled=""');
  });

  it("수행할 수 없으면 두 버튼을 모두 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <CultivationActions
        canCultivate={false}
        busy={false}
        isLifestyleJob={false}
        onCultivate={() => undefined}
        onCultivateMax={() => undefined}
      />,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("일괄 수행 결과를 횟수·소모·특별 결과로 요약한다", () => {
    expect(
      cultivationCompletionMessage(
        {
          performed: 12,
          spent: 345,
          greatSuccesses: 2,
          awakenings: 1,
          redistributedGrowthPoints: 8,
          hasMore: false,
          mult: 1,
        },
        "max",
        0,
      ),
    ).toBe(
      "✓ 수행 12회 완료 (숙달 포인트 -345) · 대성공 2회 · 각성 1회 · 성장 재분배 +8",
    );
  });

  it("가능한 만큼 수행은 mode=max JSON 요청을 만든다", () => {
    const init = cultivationRequestInit("max");

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ mode: "max" });
  });

  it("요청 상한 도달 시 추가 수행 가능을 알린다", () => {
    const message = cultivationCompletionMessage(
      {
        performed: 10_000,
        spent: 1_000_000,
        hasMore: true,
      },
      "max",
      0,
    );

    expect(message).toContain("남은 포인트로 추가 수행 가능");
  });

  it("기존 1회 수행은 특별 결과를 배수로 표시한다", () => {
    expect(
      cultivationCompletionMessage(
        {
          performed: 1,
          spent: 8,
          mult: 5,
          redistributedGrowthPoints: 4,
        },
        "once",
        0,
      ),
    ).toBe(
      "✓ 수행 완료 (숙달 포인트 -8) · 각성 ×5! · 성장 재분배 +4",
    );
  });
});
