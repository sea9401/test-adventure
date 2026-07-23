import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldRumorMapView } from "./WorldRumorMapView";

describe("생활 지도", () => {
  it("낚시·벌목·채광 전용 아이콘과 활동 안내판을 표시한다", () => {
    const html = renderToStaticMarkup(<WorldRumorMapView />);

    expect(html).toContain("모험가 생활 안내판");
    expect(html).toContain("선택 가능한 지역");
    expect(html).toContain('data-life-activity-icon="fishing"');
    expect(html).toContain('data-life-activity-icon="woodcutting"');
    expect(html).toContain('data-life-activity-icon="mining"');
  });
});
