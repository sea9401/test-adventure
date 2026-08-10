import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EnhancementResetAction,
  EnhancementResetConfirmDialog,
  StormRefinementConfirmDialog,
} from "./V2EnhanceView";

describe("강화 초기화 확인 창", () => {
  it.each([
    ["equipped" as const, "장착 해제 후 초기화 가능"],
    ["locked" as const, "잠금 해제 후 초기화 가능"],
  ])("%s 장비는 초기화 버튼을 비활성화한다", (blockReason, label) => {
    const html = renderToStaticMarkup(
      <EnhancementResetAction
        blockReason={blockReason}
        busy={false}
        onClick={() => undefined}
      />,
    );

    expect(html).toContain(label);
    expect(html).toContain('disabled=""');
  });

  it("조건을 충족한 강화 장비는 초기화 확인창을 열 수 있다", () => {
    const html = renderToStaticMarkup(
      <EnhancementResetAction
        blockReason={null}
        busy={false}
        onClick={() => undefined}
      />,
    );

    expect(html).toContain("강화 초기화");
    expect(html).not.toContain('disabled=""');
  });

  it("강화 초기화 손실과 위력 변화를 확정 전에 보여준다", () => {
    const html = renderToStaticMarkup(
      <EnhancementResetConfirmDialog
        itemName="일식"
        enhanceLevel={9}
        currentPower={420}
        resetPower={350}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("+9 일식의 강화를 초기화할까요?");
    expect(html).toContain("420 → 350");
    expect(html).toContain(
      "사용한 골드·강화석·재료 장비는 환급되지 않습니다",
    );
    expect(html).toContain("되돌릴 수 없습니다");
    expect(html).toContain("강화 초기화 확정");
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
