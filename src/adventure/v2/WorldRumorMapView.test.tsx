import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FISH_IDS } from "@/adventure/data/v2/fish";
import { WorldRumorMapView } from "./WorldRumorMapView";

describe("생활 지도", () => {
  it("낚시·벌목·채광 전용 아이콘과 활동 안내판을 표시한다", () => {
    const html = renderToStaticMarkup(<WorldRumorMapView />);

    expect(html).toContain("모험가 생활 안내판");
    expect(html).toContain("선택 가능한 지역");
    expect(html).toContain('data-life-activity-icon="fishing"');
    expect(html).toContain('data-life-activity-icon="woodcutting"');
    expect(html).toContain('data-life-activity-icon="mining"');
    expect(html).toContain("대표 어종:");
    expect(html).toContain("전체 어종 14종 보기");
  });

  it("낚시터별 미등록 어종 수와 상세 어종의 미등록 상태를 표시한다", () => {
    const discovered = new Set(
      FISH_IDS.filter((fishId) => fishId !== "crucian_carp"),
    );
    const html = renderToStaticMarkup(
      <WorldRumorMapView fishCodexDiscoveredIds={discovered} />,
    );

    expect(html).toContain("미등록 어종 1종");
    expect(html).toContain(
      "이 낚시터에 아직 등록하지 않은 어종이 1종 있습니다",
    );
    expect(html).toContain("· 미등록");
  });

  it("낚시터 어종을 모두 등록했으면 미등록 배지를 숨긴다", () => {
    const html = renderToStaticMarkup(
      <WorldRumorMapView fishCodexDiscoveredIds={new Set(FISH_IDS)} />,
    );

    expect(html).not.toContain("미등록 어종");
    expect(html).not.toContain("· 미등록");
  });
});
