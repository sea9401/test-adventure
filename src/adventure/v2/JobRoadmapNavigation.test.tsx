// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoadmapScroller } from "./JobRoadmapDialog";

afterEach(cleanup);

describe("전직 로드맵 빠른 이동", () => {
  it("루트 버튼으로 해당 노드를 선택하고 화면 가운데로 이동한다", () => {
    const onSelectJob = vi.fn();
    const { container } = render(
      <RoadmapScroller
        jumpTargets={[{ id: "none", label: "모험가" }]}
        currentJobId="warrior"
        onSelectJob={onSelectJob}
      >
        <button data-roadmap-job-id="none">모험가 노드</button>
        <button data-roadmap-job-id="warrior">현재 직업 노드</button>
      </RoadmapScroller>,
    );
    const scroller = container.querySelector<HTMLElement>(
      ".shrine-job-roadmap",
    )!;
    const target = screen.getByRole("button", { name: "모험가 노드" });
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      value: 300,
    });
    scroller.getBoundingClientRect = () =>
      ({ left: 100, width: 600 }) as DOMRect;
    target.getBoundingClientRect = () =>
      ({ left: 700, width: 120 }) as DOMRect;

    fireEvent.click(screen.getByRole("button", { name: "모험가로 이동" }));

    expect(scrollTo).toHaveBeenCalledWith({ left: 660, behavior: "smooth" });
    expect(onSelectJob).toHaveBeenCalledWith("none");
    expect(document.activeElement).toBe(target);
  });
});
