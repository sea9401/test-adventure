import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2ItemMultiCompareCard } from "./V2ItemMultiCompareCard";

const ironSword = { item: V2_EQUIPMENT.v2_iron_sword };
const greatSword = { iid: "great", item: V2_EQUIPMENT.v2_greatsword };
const hornBow = { iid: "horn", item: V2_EQUIPMENT.v2_horn_bow };

describe("V2ItemMultiCompareCard", () => {
  it("장착 장비를 기준 열로 두고 후보마다 증감과 장착 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemMultiCompareCard
        equipped={ironSword}
        candidates={[
          { ...greatSword, equip: { busy: false, onEquip: vi.fn() } },
          {
            ...hornBow,
            equip: { busy: false, disabledReason: "협곡 개척 필요", onEquip: vi.fn() },
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("아이템 비교");
    expect(html).toContain("장착 중");
    expect(html).toContain("철검");
    expect(html).toContain("한타검");
    expect(html).toContain("각궁");
    expect(html).toContain("장착 시 스탯 합계");
    // 공격력 5 → 19 / 15
    expect(html).toContain("▲+14");
    expect(html).toContain("▲+10");
    expect(html).toContain("착용 조건: 협곡 개척 필요");
    expect(html).toContain("착용 조건 미달");
    expect(html).toContain('aria-label="한타검 장착"');
    expect(html).toContain('aria-label="각궁 장착"');
    expect(html).not.toContain('aria-label="철검 장착"');
  });

  it("장착 장비가 없으면 증감 대신 줄마다 가장 좋은 값을 강조한다", () => {
    const html = renderToStaticMarkup(
      <V2ItemMultiCompareCard
        candidates={[{ iid: "iron", ...ironSword }, greatSword]}
        onClose={vi.fn()}
      />,
    );

    expect(html).not.toContain("장착 중");
    expect(html).not.toContain("▲");
    expect(html).toContain('data-best="true"');
  });
});
