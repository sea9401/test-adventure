import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkshopInspectionPanel } from "./WorkshopInspectionPanel";
import type { BlacksmithPendingInspection } from "@/adventure/data/v2/blacksmithSpecialization";

const pending: BlacksmithPendingInspection = {
  inspectionId: "inspection_1",
  recipeId: "crafted_gale_bow",
  equipmentId: "v2_crafted_gale_bow",
  craftQuality: { level: 1, bonusPct: 5 },
  candidates: [
    { power: 10, weight: 0, options: { crit: 2, spd: 3 } },
    { power: 12, weight: 0, options: { crit: 1, spd: 4 } },
  ],
  craftedBy: {
    userId: "u1",
    profession: "blacksmith",
    level: 30,
    craftedAt: "2026-08-22T00:00:00.000Z",
    masterwork: true,
    specialty: "weapon",
  },
  createdAt: "2026-08-22T00:00:00.000Z",
};

describe("WorkshopInspectionPanel", () => {
  it("shows two same-grade candidates and every changed stat", () => {
    const html = renderToStaticMarkup(
      <WorkshopInspectionPanel
        pending={pending}
        onConfirmed={vi.fn()}
        onMessage={vi.fn()}
      />,
    );

    expect(html).toContain("최종 검수");
    expect(html).toContain("같은 ★ 등급");
    expect(html).toContain("후보 1");
    expect(html).toContain("후보 2");
    expect(html).toContain("공격력");
    expect(html).toContain(">10</strong>");
    expect(html).toContain(">12</strong>");
    expect(html).toContain("치명타");
    expect(html).toContain("속도");
    expect((html.match(/이 후보 확정/g) ?? [])).toHaveLength(2);
  });
});
