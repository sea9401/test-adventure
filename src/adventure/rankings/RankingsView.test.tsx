import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  codexMasteryScopeForView,
  CodexRankingControls,
  LifeMasteryMetricPill,
} from "./RankingsView";

describe("생활 숙련도 랭킹 안내", () => {
  it("다섯 생활의 100레벨 상한을 안내한다", () => {
    const html = renderToStaticMarkup(<LifeMasteryMetricPill />);

    expect(html).toContain("생활 숙련도");
    expect(html).toContain("각 생활은 Lv.100까지 반영");
  });
});

describe("도감 숙련·월간 연구 랭킹 전환", () => {
  it("완성도는 기존 랭킹을 유지하고 숙련 화면만 전용 scope를 선택한다", () => {
    expect(codexMasteryScopeForView("completion", "fish")).toBeNull();
    expect(codexMasteryScopeForView("overall", "fish")).toBe("overall");
    expect(codexMasteryScopeForView("category", "fish")).toBe("fish");
    expect(codexMasteryScopeForView("category", "job")).toBe("job");
    expect(codexMasteryScopeForView("monthly", "job")).toBeNull();
  });

  it("완성도·종합 숙련·분야별과 여섯 분야를 모두 노출한다", () => {
    const html = renderToStaticMarkup(
      <CodexRankingControls
        view="category"
        category="monster"
        onViewChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    );

    expect(html).toContain("완성도");
    expect(html).toContain("종합 숙련");
    expect(html).toContain("분야별");
    expect(html).toContain("월간 연구");
    expect(html).toContain("장비 연구");
    expect(html).toContain("어류 연구");
    expect(html).toContain("생태 연구");
    expect(html).toContain("미식 연구");
    expect(html).toContain("현장 연구");
    expect(html).toContain("직업 연구");
    expect(html).toContain("aria-selected=\"true\"");
  });

  it("종합 숙련에서는 분야 선택기를 숨긴다", () => {
    const html = renderToStaticMarkup(
      <CodexRankingControls
        view="overall"
        category="monster"
        onViewChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    );

    expect(html).toContain("종합 숙련");
    expect(html).not.toContain("생태 연구");
  });
});
