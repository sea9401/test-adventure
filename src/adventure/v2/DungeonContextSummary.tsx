import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

export function DungeonContextSummary({
  displayName,
  outpostName,
  challenge,
  playerPower,
  difficultyPower,
  growthLabel,
  readiness,
  onBack,
}: {
  displayName: string;
  outpostName: string;
  challenge: boolean;
  playerPower: number | null;
  difficultyPower: number;
  growthLabel: string | null;
  readiness: { label: string; tone: "positive" | "warning" | "neutral" };
  onBack: () => void;
}) {
  return (
    <Card as="section" padding="sm" aria-label="사냥터 정보">
      <SubViewHeader
        title={
          <>
            {displayName}
            {challenge && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                도전
              </span>
            )}
          </>
        }
        onBack={onBack}
        right={<span className="max-w-24 truncate text-[0.6875rem] text-zinc-500">{outpostName}</span>}
      />
      <Inset className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 py-2 text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
        {playerPower != null && (
          <span>내 전투력 <strong className="tabular-nums text-zinc-700 dark:text-zinc-200">{playerPower.toLocaleString()}</strong></span>
        )}
        <span>난이도 지표 <span className="tabular-nums">{difficultyPower.toLocaleString()}</span></span>
        {growthLabel && <span>{growthLabel}</span>}
        <span className={readiness.tone === "positive" ? "font-semibold text-emerald-700 dark:text-emerald-300" : readiness.tone === "warning" ? "font-semibold text-amber-700 dark:text-amber-300" : "font-semibold text-zinc-600 dark:text-zinc-300"}>
          {readiness.label}
        </span>
      </Inset>
    </Card>
  );
}
