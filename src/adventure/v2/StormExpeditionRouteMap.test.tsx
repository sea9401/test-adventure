import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { STORM_EXPEDITION_MAP_NODES } from "@/adventure/data/v2/stormExpeditionMap";
import { StormExpeditionRouteMap } from "./StormExpeditionRouteMap";

describe("StormExpeditionRouteMap", () => {
  it.each([
    [null, "1/3 항로 입구"],
    ["supply", "2/3 중층 항로"],
    ["altar", "3/3 폭풍 심장"],
  ] as const)("모바일에서 현재 위치에 맞는 구간만 표시한다 %#", (currentNodeId, label) => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        currentNodeId={currentNodeId}
        visitedNodeIds={currentNodeId ? [currentNodeId] : []}
        completedNodeIds={[]}
        availableNodeIds={[]}
        selectedNodeId={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="storm-expedition-mobile-map"');
    expect(html).toContain(label);
    expect(html).toContain('data-testid="storm-expedition-mobile-canvas"');
    expect(html).toContain('data-testid="storm-expedition-desktop-map"');
    expect(html).toContain("hidden overflow-x-auto pb-2 sm:block");
    expect(html).toMatch(/data-testid="storm-expedition-mobile-canvas"[^>]*class="[^"]*w-full[^"]*"/);
    expect(html).not.toMatch(/data-testid="storm-expedition-mobile-canvas"[^>]*(?:overflow-x-auto|min-w-\[1120px\])/);
  });

  it("완료·현재·이동 가능·선택·잠김 상태를 색상 외 문구와 버튼 상태로 표현한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        currentNodeId="gale_outer"
        visitedNodeIds={["gale_outer"]}
        completedNodeIds={["gale_outer"]}
        availableNodeIds={["supply"]}
        selectedNodeId="supply"
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("칼바람 외곽, 현재, 완료");
    expect(html).toContain("표류 보급품, 이동 가능, 선택됨");
    expect(html).toContain("뇌운 중층, 잠김");
    expect(html).toContain("data-testid=\"storm-expedition-map-edges\"");
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("data-testid=\"storm-expedition-map-scroll\"");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-w-[1120px]");
  });

  it("잠긴 노드는 비활성이고 이동 가능한 노드는 활성 버튼이다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap nodes={STORM_EXPEDITION_MAP_NODES} currentNodeId="gale_outer" visitedNodeIds={["gale_outer"]} completedNodeIds={["gale_outer"]} availableNodeIds={["supply"]} selectedNodeId={null} onSelect={() => undefined} />,
    );
    expect(html).toMatch(/aria-label="표류 보급품, 이동 가능"[^>]*>/);
    expect(html).toMatch(/aria-label="뇌운 중층, 잠김"[^>]*disabled=""/);
  });

  it("현재 노드를 완료하기 전에도 연결된 다음 노드는 미리볼 수 있다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap nodes={STORM_EXPEDITION_MAP_NODES} currentNodeId="gale_outer" visitedNodeIds={["gale_outer"]} completedNodeIds={[]} availableNodeIds={[]} previewableNodeIds={["supply"]} selectedNodeId={null} onSelect={() => undefined} />,
    );
    expect(html).toContain("표류 보급품, 다음 경로");
    expect(html).not.toMatch(/aria-label="표류 보급품, 다음 경로"[^>]*disabled=""/);
  });
});
