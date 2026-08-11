import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FishSpecimenExtractModal } from "./FishSpecimenExtractModal";

const base = {
  fishSpBefore: 6,
  fishSpAfter: 6,
  totalSpBefore: 34,
  totalSpAfter: 34,
  spLoss: 0,
  equippedSpUsed: 30,
  overBudget: false,
};

describe("FishSpecimenExtractModal", () => {
  it("일반 추출에서도 기록 보존과 등록 권리 이전을 확인시킨다", () => {
    const html = renderToStaticMarkup(
      <FishSpecimenExtractModal
        fish={{ name: "잉어" }}
        projection={base}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("잉어 표본 추출");
    expect(html).toContain("어획 기록은 유지");
    expect(html).toContain("표본 추출 확정");
  });

  it("마일스톤을 잃는 경우 어보와 전체 SP 전후를 표시한다", () => {
    const html = renderToStaticMarkup(
      <FishSpecimenExtractModal
        fish={{ name: "잉어" }}
        projection={{ ...base, fishSpAfter: 5, totalSpAfter: 33, spLoss: 1 }}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("도감 SP +6 → +5");
    expect(html).toContain("전체 SP 34 → 33");
  });

  it("새 한도보다 장착 비용이 크면 확정 동작을 숨긴다", () => {
    const html = renderToStaticMarkup(
      <FishSpecimenExtractModal
        fish={{ name: "잉어" }}
        projection={{
          ...base,
          totalSpAfter: 33,
          equippedSpUsed: 34,
          overBudget: true,
        }}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("장착 스킬 34 / 새 한도 33");
    expect(html).not.toContain("표본 추출 확정");
  });
});
