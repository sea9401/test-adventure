import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { STORM_EXPEDITION_MAP_NODES } from "@/adventure/data/v2/stormExpeditionMap";
import { StormExpeditionCommandMap } from "./StormExpeditionCommandMap";

const active = {
  currentNodeId: "supply" as const,
  visitedNodeIds: ["gale_outer", "supply"] as const,
  completedNodeIds: ["gale_outer"] as const,
  hp: 720,
  maxHp: 1000,
  mp: 380,
  maxMp: 500,
};

describe("StormExpeditionCommandMap", () => {
  it("현재 자원·진행률·지도 행동을 하나의 불투명 카드에 표시한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionCommandMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        active={active}
        availableNodeIds={[]}
        previewableNodeIds={["gale_middle", "thunder_middle", "wreckage_middle"]}
        nodeCount={9}
        plan={null}
        autoplay={{ kind: "idle" }}
        onNodeOpen={vi.fn()}
        onOpenAutoplayPlan={vi.fn()}
        onStopAutoplay={vi.fn()}
      />,
    );

    expect(html).toContain("항로 지도");
    expect(html).toContain("720 / 1,000");
    expect(html).toContain("380 / 500");
    expect(html).toContain("진행 2/9");
    expect(html).toContain("ui-game-card");
    expect(html).toContain("bg-white");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("이 노드로 이동");
  });

  it("입장 전에는 직접 진행과 일괄 진행 설정을 함께 제공한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionCommandMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        active={null}
        availableNodeIds={["gale_outer", "thunder_outer", "wreckage_outer"]}
        nodeCount={9}
        plan={null}
        autoplay={{ kind: "idle" }}
        entry={{ selectedMode: "normal", attemptsLeft: 2, onModeChange: vi.fn() }}
        onNodeOpen={vi.fn()}
        onOpenAutoplayPlan={vi.fn()}
        onStopAutoplay={vi.fn()}
      />,
    );

    expect(html).toContain("직접 진행 · 지도에서 외곽 항로 선택");
    expect(html).toContain("실전 출발");
    expect(html).toContain("연습 시작");
    expect(html).toContain("오늘 2회 입장 가능");
    expect(html).toContain("일괄 진행 설정");
  });

  it("자동 진행 중에는 처리 상태와 현재 요청 후 중단 버튼을 제공한다", () => {
    const html = renderToStaticMarkup(
      <StormExpeditionCommandMap
        nodes={STORM_EXPEDITION_MAP_NODES}
        active={active}
        availableNodeIds={[]}
        nodeCount={9}
        plan={null}
        autoplay={{ kind: "running", label: "표류 보급품 선택 중" }}
        onNodeOpen={vi.fn()}
        onOpenAutoplayPlan={vi.fn()}
        onStopAutoplay={vi.fn()}
      />,
    );

    expect(html).toContain("표류 보급품 선택 중");
    expect(html).toContain("현재 요청 후 중단");
    expect(html).toContain("min-h-11");
  });
});
