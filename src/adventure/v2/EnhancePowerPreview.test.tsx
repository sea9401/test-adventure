import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildEnhancePowerPreview,
  EnhancePowerPreview,
  enhancePowerPreviewLevels,
} from "./EnhancePowerPreview";

describe("EnhancePowerPreview", () => {
  it("+1~+20과 고강 대표 단계의 정확한 예상 위력을 만든다", () => {
    const rows = buildEnhancePowerPreview(
      100,
      { level: 1, bonusPct: 5 },
      0,
    );

    expect(rows.find((row) => row.level === 1)).toEqual({
      level: 1,
      bonusPct: 1,
      power: 106,
      gain: 1,
    });
    expect(rows.find((row) => row.level === 10)).toEqual({
      level: 10,
      bonusPct: 24,
      power: 129,
      gain: 24,
    });
    expect(rows.find((row) => row.level === 20)).toEqual({
      level: 20,
      bonusPct: 69,
      power: 174,
      gain: 69,
    });
    expect(rows.find((row) => row.level === 30)).toEqual({
      level: 30,
      bonusPct: 89,
      power: 194,
      gain: 89,
    });
  });

  it("현재 단계가 +20을 넘으면 현재와 다음 단계도 표에 포함한다", () => {
    const levels = enhancePowerPreviewLevels(25);
    expect(levels).toContain(25);
    expect(levels).toContain(26);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("표의 의미와 상한 없는 고강 규칙을 안내한다", () => {
    const html = renderToStaticMarkup(
      <EnhancePowerPreview
        basePower={100}
        craftQuality={undefined}
        currentLevel={10}
      />,
    );

    expect(html).toContain("단계별 강화 수치");
    expect(html).toContain("누적 보너스");
    expect(html).toContain("+10");
    expect(html).toContain("현재");
    expect(html).toContain("강화 상한은 없습니다");
  });
});
