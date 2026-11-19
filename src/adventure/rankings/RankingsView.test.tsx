import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  codexMasteryScopeForView,
  CodexRankingControls,
  DeepStageRankingControls,
  effectiveRankingMetric,
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
    expect(codexMasteryScopeForView("archive", "job")).toBeNull();
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
    expect(html).toContain("명예의 전당");
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

describe("심층 단계 랭킹", () => {
  it("심층 단계 탭은 고른 던전의 순위를 조회한다", () => {
    expect(effectiveRankingMetric("stormDeep", "sanctuaryDeep")).toBe("sanctuaryDeep");
    expect(effectiveRankingMetric("stormDeep", "stormDeep")).toBe("stormDeep");
    expect(effectiveRankingMetric("masteryTower", "sanctuaryDeep")).toBe("masteryTower");
  });

  it("폭풍 원정과 태초의 성소를 전환하는 선택기를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <DeepStageRankingControls dungeon="stormDeep" onChange={() => undefined} />,
    );
    expect(html).toContain("폭풍 원정");
    expect(html).toContain("태초의 성소");
    expect(html).toContain("실전으로 완주한 가장 높은 심층 단계");
  });
});

