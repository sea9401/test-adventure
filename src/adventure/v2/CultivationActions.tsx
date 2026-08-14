import { cultivationOutcomeLabel } from "@/adventure/data/v2/proficiency";
import { Button } from "@/components/ui/Button";

export type CultivationMode = "once" | "max";

export type CultivationRunSummary = {
  performed?: number;
  spent?: number;
  greatSuccesses?: number;
  awakenings?: number;
  redistributedGrowthPoints?: number;
  growthRespecPoints?: number;
  hasMore?: boolean;
  mult?: number;
};

export function cultivationRequestInit(mode: CultivationMode): RequestInit {
  return mode === "max"
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "max" }),
      }
    : { method: "POST" };
}

export function cultivationCompletionMessage(
  summary: CultivationRunSummary,
  mode: CultivationMode,
  fallbackSpent: number,
): string {
  const spent = summary.spent ?? fallbackSpent;
  const redistributed = summary.redistributedGrowthPoints ?? 0;
  const redistribution =
    redistributed > 0
      ? `성장 재분배 +${redistributed.toLocaleString()}${
          summary.growthRespecPoints != null
            ? ` (대기 ${summary.growthRespecPoints.toLocaleString()})`
            : ""
        }`
      : "";

  if (mode === "once") {
    const outcome = cultivationOutcomeLabel(summary.mult ?? 1);
    const special = outcome ? `${outcome} ×${summary.mult}!` : "";
    const details = [special, redistribution].filter(Boolean);
    return `✓ 수행 완료 (숙달 포인트 -${spent.toLocaleString()})${
      details.length > 0 ? ` · ${details.join(" · ")}` : ""
    }`;
  }

  const details = [
    (summary.greatSuccesses ?? 0) > 0
      ? `대성공 ${summary.greatSuccesses?.toLocaleString()}회`
      : "",
    (summary.awakenings ?? 0) > 0
      ? `각성 ${summary.awakenings?.toLocaleString()}회`
      : "",
    redistribution,
    summary.hasMore ? "남은 포인트로 추가 수행 가능" : "",
  ].filter(Boolean);
  return `✓ 수행 ${(summary.performed ?? 0).toLocaleString()}회 완료 (숙달 포인트 -${spent.toLocaleString()})${
    details.length > 0 ? ` · ${details.join(" · ")}` : ""
  }`;
}

export function CultivationActions({
  canCultivate,
  busy,
  isLifestyleJob,
  onCultivate,
  onCultivateMax,
}: {
  canCultivate: boolean;
  busy: boolean;
  isLifestyleJob: boolean;
  onCultivate: () => void;
  onCultivateMax: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        onClick={onCultivate}
        disabled={!canCultivate}
        title={
          isLifestyleJob ? "생활직은 수행할 수 없습니다." : undefined
        }
        variant="success"
        size="md"
      >
        {busy ? "처리 중…" : isLifestyleJob ? "수행 불가" : "수행"}
      </Button>
      <Button
        onClick={onCultivateMax}
        disabled={!canCultivate}
        title={
          isLifestyleJob ? "생활직은 수행할 수 없습니다." : undefined
        }
        variant="primary"
        size="md"
      >
        {busy ? "수행 중…" : "가능한 만큼 수행"}
      </Button>
    </div>
  );
}
