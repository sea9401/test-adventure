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

  it("천궁의 고정 스킬 치명타 피해를 오버플로와 독립적으로 표시한다", () => {
    expect(
      activeSkillCritStats({ critChancePct: 83, skillCritDmgPct: 30 }),
    ).toEqual({ chancePct: 75, multiplier: 2 });
  });
});

describe("StatsPanel 회복량 표기", () => {
  it("최종 회복 배율을 소수 첫째 자리 백분율로 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        stats: { str: 1 },
        statKeys: ["str"],
        statLabels: { str: "힘" },
        combat: {
          atk: 10,
          def: 5,
          healMult: 1.2744,
        },
      }),
    );

    expect(html).toContain("회복량");
    expect(html).toContain("127.4%");
  });

  it("회복 배율을 전달하지 않은 기존 호출에는 회복량을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        stats: { str: 1 },
        statKeys: ["str"],
        statLabels: { str: "힘" },
        combat: { atk: 10, def: 5 },
      }),
    );

    expect(html).not.toContain("회복량");
  });
});

describe("StatsPanel 명중·회피 표기", () => {
  it("내 정보에는 원본 방어력·회피도만 표시하고 상대별 경감률은 숨긴다", () => {
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

    expect(html).toContain("적중도");
    expect(html).toContain("회피도");
    expect(html).not.toContain("현재 사냥터 회피 경감률");
    expect(html).not.toContain("물리 피해 경감률");
    expect(html).not.toContain("0.8%");
    expect(html).not.toContain("40%");
    expect(html).not.toContain("명중</span><span");
  });
});

describe("StatsPanel 효과 능력치 표기", () => {
  it("한계치가 있는 내 정보에서는 최종값과 효과 증가분을 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(StatsPanel, {
        stats: { str: 110 },
        totalStats: { str: 142 },
        caps: { str: 160 },
        statKeys: ["str"],
        statLabels: { str: "힘" },
      }),
    );

    expect(html).toMatch(/font-semibold[^>]*>142<\/span>/);
    expect(html).toContain("기본·성장 110");
    expect(html).toContain("효과 +32");
    expect(html).toContain("성장 한계 160");
    expect(html).not.toContain("장비 +32");
  });
});
