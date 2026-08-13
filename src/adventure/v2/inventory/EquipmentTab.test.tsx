import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { V2EquipInstance, V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { EquipmentTab } from "./EquipmentTab";

const id = (value: string) => value as V2EquipmentId;

describe("EquipmentTab 선택 판매", () => {
  it("선택 개수와 예상 골드를 표시하고 장착·잠금 장비 선택을 막는다", () => {
    const instances: V2EquipInstance[] = [
      { iid: "equipped", id: id("v2_iron_sword") },
      { iid: "locked", id: id("v2_iron_sword"), locked: true },
      { iid: "selected", id: id("v2_iron_sword") },
    ];

    const html = renderToStaticMarkup(
      <EquipmentTab
        slot="weapon"
        instances={instances}
        equippedIid="equipped"
        busy={null}
        sortMode="default"
        setSortMode={vi.fn()}
        sellQualityPct={40}
        setSellQualityPct={vi.fn()}
        pageSize={20}
        frontierDepth={99}
        onBulkSell={vi.fn()}
        onOpenCard={vi.fn()}
        onRegisterCodex={vi.fn()}
        selection={{
          active: true,
          selectedIids: new Set(["selected"]),
          selectedCount: 1,
          selectedGold: 1234,
          onStart: vi.fn(),
          onCancel: vi.fn(),
          onToggle: vi.fn(),
          onConfirm: vi.fn(),
        }}
      />,
    );

    expect(html).toContain("판매할 장비를 선택하세요");
    expect(html).toContain("선택 1개");
    expect(html).toContain("1,234골드");
    expect(html).toContain('aria-label="철검 판매 선택됨"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="철검 판매 선택 불가: 장착 중"');
    expect(html).toContain('aria-label="철검 판매 선택 불가: 잠금됨"');
  });
});
