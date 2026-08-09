import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RareMapsTab } from "./RareMapsTab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("RareMapsTab 이벤트 소모품", () => {
  it("100레벨 비약에 이벤트 태그와 전용 사용 설명을 표시한다", () => {
    const html = renderToStaticMarkup(
      <RareMapsTab
        materials={{}}
        spFruitUsed={{ 1: 0, 2: 0, 3: 0, 4: 0 }}
        busy={null}
        onUseSpFruit={() => undefined}
        onUseEquipmentBox={() => undefined}
        onUseMasteryTome={() => undefined}
        masteryCertificates={0}
        onUseMasteryCertificate={() => undefined}
        rareMaps={[]}
        cashItems={{ level_100_elixir: 1 }}
        onUseCashItem={() => undefined}
        cookingFoods={{}}
        onUseCookingFood={() => undefined}
        onUseExpTome={() => undefined}
      />,
    );

    expect(html).toContain("100레벨 달성의 비약");
    expect(html).toContain(">이벤트</span>");
    expect(html).toContain("사용 즉시 100레벨 달성");
  });

  it("보유한 숙련 증서를 소모품에서 사용할 수 있게 표시한다", () => {
    const onUseMasteryCertificate = vi.fn();
    const html = renderToStaticMarkup(
      <RareMapsTab
        materials={{}}
        spFruitUsed={{ 1: 0, 2: 0, 3: 0, 4: 0 }}
        busy={null}
        onUseSpFruit={() => undefined}
        onUseEquipmentBox={() => undefined}
        onUseMasteryTome={() => undefined}
        masteryCertificates={10}
        onUseMasteryCertificate={onUseMasteryCertificate}
        rareMaps={[]}
        cashItems={{}}
        onUseCashItem={() => undefined}
        cookingFoods={{}}
        onUseCookingFood={() => undefined}
        onUseExpTome={() => undefined}
      />,
    );

    expect(html).toContain("숙련 증서 사용");
    expect(html).toContain("보유 10개");
    expect(html).toContain("직업 숙련도 또는 숙달 포인트");
  });
});
