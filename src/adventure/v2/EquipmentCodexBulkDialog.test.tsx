import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EquipmentCodexBulkDialog } from "./EquipmentCodexBulkDialog";

describe("EquipmentCodexBulkDialog", () => {
  it("실제로 소모될 개체와 위험 정보를 최종 확인 전에 보여준다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCodexBulkDialog
        slot="weapon"
        candidates={[
          {
            inst: {
              iid: "alpha-1",
              id: "v2_den_sig_alpha_greatsword",
              enhance: { level: 3, bonusPct: 4 },
            },
            ownedCount: 1,
          },
          {
            inst: { iid: "iron-1", id: "v2_iron_sword" },
            ownedCount: 2,
          },
        ]}
        selectedIids={new Set(["alpha-1"])}
        busy={false}
        onToggle={() => undefined}
        onSelectAll={() => undefined}
        onClearAll={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("무기 장비 일괄등록");
    expect(html).toContain("알파검");
    expect(html).toContain("철검");
    expect(html).toContain("유니크");
    expect(html).toContain("강화 +3");
    expect(html).toContain("세트 · 포식자");
    expect(html).toContain("마지막 보유 장비");
    expect(html).toContain("주의 장비 1개");
    expect(html).toContain("선택한 장비 1종 등록");
  });
});
