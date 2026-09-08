import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthPreview } from "./GrowthPreview";
import { proficiencySection } from "@/app/api/v2/me/state/stateSections";

describe("growth preview", () => {
  it("shows fractional chances, means and next rejob bases without consuming RNG", () => {
    const rng = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview must not roll"); });
    try {
      const raw = { groups: { warrior: { tier: 1, cumLevel: 100_000 } }, lifeResourceGrowth: { version: 2, rolledLevel: 30, baseHp: 170, baseMp: 80, gainedHp: 200, gainedMp: 100 } };
      const before = JSON.stringify(raw);
      const section = proficiencySection(raw, { class: "warrior", level: 30 });
      const html = renderToStaticMarkup(<GrowthPreview {...section} />);
      expect(html).toContain("39.23%로 0~6 범위 선택");
      expect(html).toContain("평균 +2.70");
      expect(html).toContain("다음 전투 재전직 시작");
      expect(html).toContain("HP 268~368");
      expect(html).toContain("현재 레벨업 증가");
      expect(JSON.stringify(raw)).toBe(before);
      expect(rng).not.toHaveBeenCalled();
    } finally { rng.mockRestore(); }
  });
  it("labels legacy resources as applying after rejob", () => {
    const html = renderToStaticMarkup(<GrowthPreview {...proficiencySection({}, { class: "warrior" })} />);
    expect(html).toContain("다음 Lv.100 전투 재전직부터");
    expect(html).not.toContain("현재 레벨업 증가");
  });
});
