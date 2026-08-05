import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EquipmentCodexBadge } from "./EquipmentCodexBadge";

describe("EquipmentCodexBadge", () => {
  it("인벤토리의 미등록 배지는 바로 등록할 수 있는 버튼으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCodexBadge
        itemId="v2_iron_sword"
        registered={false}
        onRegister={() => undefined}
      />,
    );

    expect(html).toContain("<button");
    expect(html).toContain("도감 미등록");
    expect(html).toContain("눌러서 바로 등록");
  });

  it("등록된 장비 배지는 읽기 전용 상태로 유지한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCodexBadge
        itemId="v2_iron_sword"
        registered
        onRegister={() => undefined}
      />,
    );

    expect(html).toContain("<span");
    expect(html).not.toContain("<button");
    expect(html).toContain("도감 등록");
  });

  it("등록 요청 중에는 중복 실행을 막는다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCodexBadge
        itemId="v2_iron_sword"
        registered={false}
        onRegister={() => undefined}
        busy
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("등록 중");
  });
});
