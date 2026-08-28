import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  STORM_EXPEDITION_ENTRANCE_NODE_IDS,
  STORM_EXPEDITION_MAP_NODES,
} from "@/adventure/data/v2/stormExpeditionMap";
import { StormExpeditionRouteMap } from "./StormExpeditionRouteMap";

describe("StormExpeditionRouteMap", () => {
  it.each([
    [null, STORM_EXPEDITION_ENTRANCE_NODE_IDS, "입구 선택", "height:180px"],
    ["supply", ["gale_middle", "thunder_middle", "wreckage_middle"], "현재 + 다음 경로", "height:260px"],
    ["storm_heart", [], "현재 체크포인트", "height:180px"],
  ] as const)("모바일에서 현재 위치와 바로 다음 선택지만 표시한다 %#", (currentNodeId, previewableNodeIds, label, heightStyle) => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        currentNodeId={currentNodeId}
        visitedNodeIds={currentNodeId ? [currentNodeId] : []}
        completedNodeIds={[]}
        availableNodeIds={[]}
        previewableNodeIds={previewableNodeIds}
        plan={null}
        onNodeOpen={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="storm-expedition-mobile-map"');
    expect(html).toContain(label);
    expect(html).toContain(heightStyle);
    expect(html).toContain('data-testid="storm-expedition-mobile-canvas"');
    expect(html).toContain('data-testid="storm-expedition-desktop-map"');
    expect(html).toContain("hidden overflow-x-auto pb-2 sm:block");
    expect(html).toMatch(/data-testid="storm-expedition-mobile-canvas"[^>]*class="[^"]*w-full[^"]*"/);
    expect(html).not.toMatch(/data-testid="storm-expedition-mobile-canvas"[^>]*(?:overflow-x-auto|min-w-\[1120px\])/);
  });

  it("완료·현재·이동 가능·잠김 상태를 색상 외 문구로 표현한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        currentNodeId="gale_outer"
        visitedNodeIds={["gale_outer"]}
        completedNodeIds={["gale_outer"]}
        availableNodeIds={["supply"]}
        plan={null}
        onNodeOpen={vi.fn()}
      />,
    );

    expect(html).toContain("칼바람 외곽, 현재, 완료");
    expect(html).toContain("표류 보급품, 이동 가능, 이동 확인");
    expect(html).toContain("뇌운 중층, 잠김, 정보 보기");
    expect(html).toContain("data-testid=\"storm-expedition-map-edges\"");
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("data-testid=\"storm-expedition-map-scroll\"");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-w-[1120px]");
    expect(html).toContain('data-plump-icon="battle_node"');
    expect(html).not.toContain("⚔");
  });

  it("잠긴 노드도 정보 모달을 열 수 있도록 활성 버튼으로 제공한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap nodes={STORM_EXPEDITION_MAP_NODES} currentNodeId="gale_outer" visitedNodeIds={["gale_outer"]} completedNodeIds={["gale_outer"]} availableNodeIds={["supply"]} plan={null} onNodeOpen={() => undefined} />,
    );
    expect(html).not.toMatch(/aria-label="표류 보급품, 이동 가능, 이동 확인"[^>]*disabled/);
    expect(html).not.toMatch(/aria-label="뇌운 중층, 잠김, 정보 보기"[^>]*disabled/);
  });

  it("현재 노드를 완료하기 전에도 연결된 다음 노드는 미리볼 수 있다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap nodes={STORM_EXPEDITION_MAP_NODES} currentNodeId="gale_outer" visitedNodeIds={["gale_outer"]} completedNodeIds={[]} availableNodeIds={[]} previewableNodeIds={["supply"]} plan={null} onNodeOpen={() => undefined} />,
    );
    expect(html).toContain("표류 보급품, 다음 경로, 정보 보기");
    expect(html).not.toMatch(/aria-label="표류 보급품, 다음 경로, 정보 보기"[^>]*disabled/);
  });

  it("현재 체크포인트는 언제든 다시 열 수 있다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap nodes={STORM_EXPEDITION_MAP_NODES} currentNodeId="gale_outer" visitedNodeIds={["gale_outer"]} completedNodeIds={[]} availableNodeIds={[]} previewableNodeIds={["supply"]} plan={null} onNodeOpen={() => undefined} />,
    );

    expect(html).toContain("칼바람 외곽, 현재, 현재 행동 열기");
    expect(html).not.toMatch(/aria-label="칼바람 외곽, 현재, 현재 행동 열기"[^>]*disabled/);
  });

  it("일괄 진행 계획의 예약 경로를 모바일 요약에 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionRouteMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        currentNodeId="supply"
        visitedNodeIds={["gale_outer", "supply"]}
        completedNodeIds={["gale_outer"]}
        availableNodeIds={[]}
        previewableNodeIds={["gale_middle", "thunder_middle", "wreckage_middle"]}
        plan={{ version: 1, mode: "normal", outerRouteId: "gale", middleRouteId: "thunder", guardianRouteId: "wreckage", boonStrategy: "offense" }}
        onNodeOpen={() => undefined}
      />,
    );

    expect(html).toContain("완료 경로 · 칼바람 외곽");
    expect(html).toContain("예약 경로 · 외곽 칼바람 · 중층 뇌운 · 수호자 잔해");
  });
});
