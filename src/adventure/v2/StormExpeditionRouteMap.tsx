"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { StormExpeditionMapNode, StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";
import {
  stormExpeditionMobileWindow,
  type StormExpeditionMobileNodeLayout,
} from "./stormExpeditionMobileMap";

type Props = {
  nodes: readonly StormExpeditionMapNode[];
  currentNodeId: StormExpeditionMapNodeId | null;
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  availableNodeIds: readonly StormExpeditionMapNodeId[];
  previewableNodeIds?: readonly StormExpeditionMapNodeId[];
  selectedNodeId: StormExpeditionMapNodeId | null;
  onSelect: (nodeId: StormExpeditionMapNodeId | null) => void;
};

const ROUTE_STYLE = {
  gale: "border-sky-500 text-sky-800 dark:text-sky-200",
  thunder: "border-violet-500 text-violet-800 dark:text-violet-200",
  wreckage: "border-amber-500 text-amber-800 dark:text-amber-200",
} as const;

type PositionedNode = {
  node: StormExpeditionMapNode;
  x: number;
  y: number;
};

type NodeStateProps = Pick<
  Props,
  | "currentNodeId"
  | "visitedNodeIds"
  | "completedNodeIds"
  | "availableNodeIds"
  | "selectedNodeId"
  | "onSelect"
> & {
  previewableNodeIds: readonly StormExpeditionMapNodeId[];
};

export function StormExpeditionRouteMap({
  nodes,
  currentNodeId,
  visitedNodeIds,
  completedNodeIds,
  availableNodeIds,
  previewableNodeIds = availableNodeIds,
  selectedNodeId,
  onSelect,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileWindow = stormExpeditionMobileWindow(
    currentNodeId,
    previewableNodeIds,
  );
  const mobileNodes = positionedMobileNodes(nodes, mobileWindow.nodes);
  const nodeStateProps: NodeStateProps = {
    currentNodeId,
    visitedNodeIds,
    completedNodeIds,
    availableNodeIds,
    previewableNodeIds,
    selectedNodeId,
    onSelect,
  };

  useEffect(() => {
    if (!currentNodeId) return;
    const current = scrollRef.current?.querySelector<HTMLElement>(`[data-node-id="${currentNodeId}"]`);
    current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentNodeId]);

  return (
    <>
      <div data-testid="storm-expedition-mobile-map" className="space-y-2 sm:hidden">
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="font-semibold text-sky-700 dark:text-sky-300">
            {mobileWindow.label}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">선택 가능한 경로</span>
        </div>
        <div
          data-testid="storm-expedition-mobile-canvas"
          className="relative w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
          style={{ height: mobileWindow.height }}
        >
          <MapEdges nodes={mobileNodes} viewBoxWidth={360} viewBoxHeight={mobileWindow.height} />
          {mobileNodes.map(({ node, x, y }) => (
            <MapNodeButton
              key={node.id}
              node={node}
              position={{ left: `${(x / 360) * 100}%`, top: y }}
              {...nodeStateProps}
            />
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        data-testid="storm-expedition-desktop-map"
        className="hidden overflow-x-auto pb-2 sm:block"
      >
        <div data-testid="storm-expedition-map-scroll" className="relative h-[420px] min-w-[1120px] rounded-lg bg-zinc-100 dark:bg-zinc-900">
          <MapEdges nodes={nodes} viewBoxWidth={1120} viewBoxHeight={420} />
          {nodes.map((node) => (
            <MapNodeButton
              key={node.id}
              node={node}
              position={{ left: node.x, top: node.y }}
              {...nodeStateProps}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function positionedMobileNodes(
  nodes: readonly StormExpeditionMapNode[],
  layouts: readonly StormExpeditionMobileNodeLayout[],
): PositionedNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return layouts.flatMap(({ id, x, y }) => {
    const node = nodesById.get(id);
    return node ? [{ node, x, y }] : [];
  });
}

function MapEdges({
  nodes,
  viewBoxWidth,
  viewBoxHeight,
}: {
  nodes: readonly (StormExpeditionMapNode | PositionedNode)[];
  viewBoxWidth: number;
  viewBoxHeight: number;
}) {
  const points = nodes.map((entry) => "node" in entry
    ? entry
    : { node: entry, x: entry.x, y: entry.y });
  const pointsById = new Map(points.map((point) => [point.node.id, point]));
  return (
    <svg
      data-testid="storm-expedition-map-edges"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="none"
    >
      {points.flatMap((point) => point.node.nextNodeIds.map((nextId) => {
        const next = pointsById.get(nextId);
        return next ? (
          <line
            key={`${point.node.id}-${nextId}`}
            x1={point.x}
            y1={point.y}
            x2={next.x}
            y2={next.y}
            className="stroke-zinc-300 dark:stroke-zinc-700"
            strokeWidth="3"
          />
        ) : null;
      }))}
    </svg>
  );
}

function MapNodeButton({
  node,
  position,
  currentNodeId,
  visitedNodeIds,
  completedNodeIds,
  availableNodeIds,
  previewableNodeIds,
  selectedNodeId,
  onSelect,
}: NodeStateProps & {
  node: StormExpeditionMapNode;
  position: Pick<CSSProperties, "left" | "top">;
}) {
  const completed = completedNodeIds.includes(node.id);
  const current = currentNodeId === node.id;
  const available = availableNodeIds.includes(node.id);
  const previewable = previewableNodeIds.includes(node.id);
  const selected = selectedNodeId === node.id;
  const visited = visitedNodeIds.includes(node.id);
  const selectable = previewable || (current && selectedNodeId !== null);
  const statuses = [
    current && "현재",
    completed && "완료",
    available && "이동 가능",
    previewable && !available && "다음 경로",
    selected && "선택됨",
    !current && !completed && !previewable && "잠김",
  ].filter(Boolean);
  const routeStyle = node.routeId
    ? ROUTE_STYLE[node.routeId]
    : "border-zinc-500 text-zinc-800 dark:text-zinc-200";
  return (
    <button
      type="button"
      data-node-id={node.id}
      aria-label={`${node.name}, ${statuses.join(", ")}`}
      disabled={!selectable}
      onClick={() => onSelect(current ? null : node.id)}
      className={`absolute z-10 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 bg-white px-1 text-center shadow-sm transition dark:bg-zinc-950 ${routeStyle} ${completed ? "ring-2 ring-emerald-500" : ""} ${current ? "ring-4 ring-sky-300 dark:ring-sky-800" : ""} ${selected ? "outline-4 outline-offset-2 outline-sky-500" : ""} ${selectable ? "cursor-pointer shadow-md hover:scale-105" : "cursor-default text-zinc-400 dark:text-zinc-500"}`}
      style={position}
    >
      <span aria-hidden="true" className="text-sm font-bold">
        {completed ? "✓" : node.kind === "battle" ? "⚔" : "◆"}
      </span>
      <span className="mt-0.5 max-w-[66px] text-[10px] font-semibold leading-tight">
        {node.name}
      </span>
      <span className="sr-only">{visited ? "방문함" : "미방문"}</span>
    </button>
  );
}
