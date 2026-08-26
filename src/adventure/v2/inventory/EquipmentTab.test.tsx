import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { V2EquipInstance, V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { EquipmentTab } from "./EquipmentTab";

const id = (value: string) => value as V2EquipmentId;

describe("EquipmentTab 선택 판매", () => {
  it("현재 장비 탭에서 등록 가능한 도감 항목 수와 도감 일괄 등록 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentTab
        slot="weapon"
        instances={[{ iid: "plain", id: id("v2_iron_sword") }]}
        equippedIid={null}
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
        codexBulk={{ registerableCount: 1, onStart: vi.fn() }}
        selection={{
          active: false,
          selectedIids: new Set(),
          selectedCount: 0,
          selectedGold: 0,
          onStart: vi.fn(),
          onCancel: vi.fn(),
          onToggle: vi.fn(),
          onConfirm: vi.fn(),
        }}
      />,
    );

    expect(html).toContain(">도감 일괄 등록 (1)<");
    expect(html).not.toContain(">도감<");
    expect(html).not.toContain(">정리<");
  });

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

describe("EquipmentTab 정렬", () => {
  it("최근 획득 정렬의 방향을 명시하고 첫 장비에 최신 표식을 붙인다", () => {
    const html = renderToStaticMarkup(
      <EquipmentTab
        slot="weapon"
        instances={[
          { iid: "older", id: id("v2_iron_sword") },
          { iid: "latest", id: id("v2_greatsword") },
        ]}
        equippedIid={null}
        busy={null}
        sortMode="acquired"
        setSortMode={vi.fn()}
        sellQualityPct={40}
        setSellQualityPct={vi.fn()}
        pageSize={20}
        frontierDepth={99}
        onBulkSell={vi.fn()}
        onOpenCard={vi.fn()}
        onRegisterCodex={vi.fn()}
        selection={{
          active: false,
          selectedIids: new Set(),
          selectedCount: 0,
          selectedGold: 0,
          onStart: vi.fn(),
          onCancel: vi.fn(),
          onToggle: vi.fn(),
          onConfirm: vi.fn(),
        }}
      />,
    );

    expect(html).toContain('aria-label="장비 정렬 기준"');
    expect(html).not.toContain(">정렬<");
    expect(html).toContain("최근 획득 · 최신부터");
    expect(html).toContain("dark:[color-scheme:dark]");
    expect(html).toContain("dark:bg-zinc-900 dark:text-zinc-100");
    expect(html).toContain('aria-label="가장 최근에 획득한 장비"');
    expect(html.indexOf('aria-label="한타검 정보"')).toBeLessThan(
      html.indexOf('aria-label="철검 정보"'),
    );
  });
});
