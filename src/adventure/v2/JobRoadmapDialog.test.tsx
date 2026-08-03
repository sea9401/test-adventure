import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoadmapScroller } from "./JobRoadmapDialog";

describe("RoadmapScroller", () => {
  it("provides visible zoom controls alongside horizontal navigation", () => {
    const html = renderToStaticMarkup(
      <RoadmapScroller>
        <div>전직 계보</div>
      </RoadmapScroller>,
    );

    expect(html).toContain("로드맵 축소, 현재 100%");
    expect(html).toContain("확대/축소 초기화, 현재 100%");
    expect(html).toContain("로드맵 확대, 현재 100%");
    expect(html).toContain("로드맵 왼쪽으로 이동");
    expect(html).toContain("로드맵 오른쪽으로 이동");
    expect(html).toContain("shrine-job-roadmap-canvas");
  });
});
