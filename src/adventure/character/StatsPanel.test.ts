import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeSkillCritStats, StatsPanel } from "./StatsPanel";

describe("activeSkillCritStats", () => {
  it("액티브 스킬은 캐릭터 치명타 확률을 75% 상한으로 공유한다", () => {
    expect(activeSkillCritStats({ critChancePct: 62 })).toEqual({
      chancePct: 62,
      multiplier: 1.7,
    });
    expect(activeSkillCritStats({ critChancePct: 100 })).toEqual({
      chancePct: 75,
      multiplier: 1.7,
    });
  });

  it("관련 패시브가 있으면 초과 치명타 확률을 스킬 배율에도 반영한다", () => {
    expect(
      activeSkillCritStats({ critChancePct: 100, skillCritOverflow: true }),
    ).toEqual({ chancePct: 75, multiplier: 1.95 });
  });
});

describe("StatsPanel 명중·회피 표기", () => {
  it("원본 능력 수치와 현재 사냥터 최종 회피율을 구분한다", () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        stats: { str: 1 },
        statKeys: ["str"],
        statLabels: { str: "힘" },
        combat: {
          atk: 10,
          def: 5,
          accRating: 23,
          evaRating: 75,
          evasionPct: 40,
        },
      }),
    );

    expect(html).toContain("명중 능력");
    expect(html).toContain("회피 능력");
    expect(html).toContain("현재 사냥터 회피율");
    expect(html).toContain("40%");
    expect(html).not.toContain("명중</span><span");
  });
});
