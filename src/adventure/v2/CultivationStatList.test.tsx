import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CultivationStatList } from "./CultivationStatList";

describe("수행 능력치", () => {
  it("기본 성장치와 수행 한계 옆에 내 정보의 효과 적용치를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <CultivationStatList
        base={{ str: 200 }}
        total={{ str: 235 }}
        caps={{ str: 300 }}
        gains={{ str: 5 }}
      />,
    );

    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("기본 200");
    expect(text).toContain("한계 300");
    expect(text).toContain("효과 적용 235");
    expect(text).toContain("한계 +5");
  });

  it("효과 적용치가 기본값과 같아도 값이 보여 비교할 수 있다", () => {
    const html = renderToStaticMarkup(
      <CultivationStatList base={{ str: 200 }} total={{ str: 200 }} caps={{ str: 300 }} gains={{}} />,
    );
    expect(html.replace(/<[^>]+>/g, "")).toContain("효과 적용 200");
  });
});
