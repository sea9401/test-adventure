"use client";

import type { StormExpeditionMapNode, StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";
import type { StormExpeditionMode } from "@/adventure/data/v2/stormExpedition";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { StormExpeditionAutoplayPlan } from "./stormExpeditionAutoplayPolicy";
import { StormExpeditionRouteMap } from "./StormExpeditionRouteMap";

export type StormExpeditionMapActive = {
  currentNodeId: StormExpeditionMapNodeId;
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
};

export type StormExpeditionAutoplayDisplay =
  | { kind: "idle" }
  | { kind: "resume" }
  | { kind: "running"; label: string }
  | { kind: "stopping"; label: string }
  | { kind: "error"; message: string };

type Props = {
  nodes: readonly StormExpeditionMapNode[];
  active: StormExpeditionMapActive | null;
  availableNodeIds: readonly StormExpeditionMapNodeId[];
  previewableNodeIds?: readonly StormExpeditionMapNodeId[];
  nodeCount: number;
  plan: StormExpeditionAutoplayPlan | null;
  autoplay: StormExpeditionAutoplayDisplay;
  entry?: {
    selectedMode: StormExpeditionMode;
    attemptsLeft: number;
    onModeChange: (mode: StormExpeditionMode) => void;
  };
  onNodeOpen: (nodeId: StormExpeditionMapNodeId) => void;
  onOpenAutoplayPlan: () => void;
  onStopAutoplay: () => void;
  onResumeAutoplay?: () => void;
  onUseManual?: () => void;
};

export function StormExpeditionCommandMap({
  nodes,
  active,
  availableNodeIds,
  previewableNodeIds = availableNodeIds,
  nodeCount,
  plan,
  autoplay,
  entry,
  onNodeOpen,
  onOpenAutoplayPlan,
  onStopAutoplay,
  onResumeAutoplay,
  onUseManual,
}: Props) {
  const visitedCount = active?.visitedNodeIds.length ?? 0;
  return (
    <Card padding="md" className="space-y-4" data-testid="storm-expedition-command-map">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">현재 진행</p>
            <h2 className="text-lg font-bold">항로 지도</h2>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            진행 {visitedCount}/{nodeCount}
          </span>
        </div>

        {active && (
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <Metric label="HP" value={`${formatNumber(active.hp)} / ${formatNumber(active.maxHp)}`} />
            <Metric label="MP" value={`${formatNumber(active.mp)} / ${formatNumber(active.maxMp)}`} />
          </div>
        )}

        {!active && entry && (
          <div className={`${SURFACE_INSET} flex flex-wrap items-center gap-2 p-2 text-xs`}>
            <button
              type="button"
              aria-pressed={entry.selectedMode === "normal"}
              disabled={entry.attemptsLeft <= 0}
              onClick={() => entry.onModeChange("normal")}
              className={`min-h-11 rounded-md border px-4 font-semibold disabled:opacity-50 ${entry.selectedMode === "normal" ? "border-sky-500 bg-sky-600 text-white" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"}`}
            >
              {entry.attemptsLeft > 0 ? "실전 출발" : "오늘 입장 완료"}
            </button>
            <button
              type="button"
              aria-pressed={entry.selectedMode === "practice"}
              onClick={() => entry.onModeChange("practice")}
              className={`min-h-11 rounded-md border px-4 font-semibold ${entry.selectedMode === "practice" ? "border-violet-500 bg-violet-600 text-white" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"}`}
            >
              연습 시작
            </button>
            <span>{entry.selectedMode === "practice" ? "입장 횟수 소모 없음 · 보상 없음" : `오늘 ${entry.attemptsLeft}회 입장 가능`}</span>
          </div>
        )}

        <div aria-live="polite" className={`${SURFACE_INSET} flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs`}>
          <span>{autoplayMessage(autoplay, active !== null)}</span>
          {(autoplay.kind === "running" || autoplay.kind === "stopping") && (
            <button
              type="button"
              className="min-h-11 rounded-md border border-rose-300 px-3 font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300"
              disabled={autoplay.kind === "stopping"}
              onClick={onStopAutoplay}
            >
              {autoplay.kind === "stopping" ? "중단 대기 중" : "현재 요청 후 중단"}
            </button>
          )}
          {!active && autoplay.kind === "idle" && (
            <button
              type="button"
              className="min-h-11 rounded-md bg-sky-600 px-4 font-semibold text-white hover:bg-sky-500"
              onClick={onOpenAutoplayPlan}
            >
              일괄 진행 설정
            </button>
          )}
          {autoplay.kind === "resume" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onUseManual} className="min-h-11 rounded-md border border-zinc-300 px-3 font-semibold dark:border-zinc-700">직접 진행</button>
              <button type="button" onClick={onResumeAutoplay} className="min-h-11 rounded-md bg-sky-600 px-3 font-semibold text-white hover:bg-sky-500">일괄 진행 재개</button>
            </div>
          )}
        </div>
      </header>

      <StormExpeditionRouteMap
        nodes={nodes}
        currentNodeId={active?.currentNodeId ?? null}
        visitedNodeIds={active?.visitedNodeIds ?? []}
        completedNodeIds={active?.completedNodeIds ?? []}
        availableNodeIds={availableNodeIds}
        previewableNodeIds={previewableNodeIds}
        plan={plan}
        onNodeOpen={onNodeOpen}
      />
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${SURFACE_INSET} px-2 py-2`}>
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function autoplayMessage(autoplay: StormExpeditionAutoplayDisplay, active: boolean): string {
  if (autoplay.kind === "running") return `일괄 진행 · ${autoplay.label}`;
  if (autoplay.kind === "stopping") return `일괄 진행 중단 대기 · ${autoplay.label}`;
  if (autoplay.kind === "resume") return "저장된 계획으로 일괄 진행을 재개할 수 있습니다.";
  if (autoplay.kind === "error") return autoplay.message;
  return active ? "직접 진행 · 현재 또는 다음 노드를 선택하세요." : "직접 진행 · 지도에서 외곽 항로 선택";
}

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("ko-KR");
}
