import type { Region } from "./data/world";
import type { EdgeRequirementStatus } from "./data/edge-requirement";
import type { NodeState } from "./MapNode";
import { Card } from "@/components/ui/Card";

const STATE_LABELS: Record<NodeState, string> = {
  current: "현재 위치",
  visited: "방문함",
  reachable: "이동 가능",
  locked: "이동 불가",
};

// 선택한 지역의 상세 패널 — 이름·설명·(이동 불가 시) 전체 조건 텍스트만 보여준다.
// 이동/시련/빠른이동 액션 버튼은 지도 안 하단 오버레이(MapView)로 옮겨졌다 — 여기엔 없다.
export function RegionDetail({
  region,
  state,
  requirementStatus,
}: {
  region: Region | null;
  state: NodeState | null;
  requirementStatus?: EdgeRequirementStatus | null;
}) {
  if (!region || !state) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white/90 px-4 py-3 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-400">
        지도에서 지역을 선택하세요.
      </div>
    );
  }

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {region.name}
        </h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {STATE_LABELS[state]}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {region.description}
      </p>
      {requirementStatus && !requirementStatus.met &&
        (requirementStatus.progress || requirementStatus.reason) && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {requirementStatus.progress
            ? requirementStatus.kind === "trial"
              ? requirementStatus.reason ?? requirementStatus.progress.label
              : `진행 조건: ${requirementStatus.progress.label} 완성 (${requirementStatus.progress.current} / ${requirementStatus.progress.total})`
            : requirementStatus.reason}
        </div>
      )}
    </Card>
  );
}
