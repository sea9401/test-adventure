import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  resolveSmithyForgeMode,
  smithyForgeTabs,
  StormRefinementConfirmDialog,
} from "./V2EnhanceView";

describe("대장간 해방 기능 플래그", () => {
  it("플래그가 꺼지면 탭과 URL 진입 모두 기존 강화로 돌아간다", () => {
    expect(smithyForgeTabs(false).map(({ key }) => key)).not.toContain("liberation");
    expect(resolveSmithyForgeMode("liberation", false)).toBe("enhance");
  });

  it("플래그가 켜지면 해방 탭과 URL 진입을 허용한다", () => {
    expect(smithyForgeTabs(true).map(({ key }) => key)).toContain("liberation");
    expect(resolveSmithyForgeMode("liberation", true)).toBe("liberation");
  });
});

describe("폭풍 개량 확인 창", () => {
  it("개량 전후 위력·소모 비용·재련 불가 경고를 확정 전에 보여준다", () => {
    const html = renderToStaticMarkup(
      <StormRefinementConfirmDialog
        itemName="일식"
        enhanceLevel={9}
        currentPower={420}
        refinedPower={630}
        goldCost={10_000_000}
        materials={[
          { label: "부유 합금핵", have: 8, need: 6 },
          { label: "칼바람 정수", have: 7, need: 6 },
          { label: "뇌운 결정", have: 6, need: 6 },
          { label: "폭풍 심장 조각", have: 1, need: 1 },
        ]}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("+9 일식 장비를 개량할까요?");
    expect(html).toContain("420 → 630");
    expect(html).toContain("10,000,000 G");
    expect(html).toContain("폭풍 심장 조각");
    expect(html).toContain("개량은 한 번만 가능하고 되돌릴 수 없습니다");
    expect(html).toContain("향후에도 재련할 수 없으며");
    expect(html).toContain("비용 확인 · 개량 확정");
  });
});
