import { SURFACE_CARD } from "@/components/ui/surfaces";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

export function DungeonContextSummary({
  displayName,
  challenge,
  growthLabel,
  readiness,
  onBack,
}: {
  displayName: string;
  challenge: boolean;
  growthLabel: string | null;
  readiness: { label: string; tone: "positive" | "warning" | "neutral" };
  onBack: () => void;
}) {
  return (
    // 제목은 다른 화면처럼 배경 위에 바로 두고, 성장·위험 안내는 작은 불투명 줄 하나로 줄인다.
    <section aria-label="사냥터 정보" className="space-y-1.5">
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
      />
      <p className={`${SURFACE_CARD} mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1 text-xs text-zinc-500 shadow-none dark:text-zinc-400`}>
        {growthLabel && <span>{growthLabel}</span>}
        <span className={readiness.tone === "positive" ? "font-semibold text-emerald-700 dark:text-emerald-300" : readiness.tone === "warning" ? "font-semibold text-amber-700 dark:text-amber-300" : "font-semibold text-zinc-600 dark:text-zinc-300"}>
          {readiness.label}
        </span>
      </p>
    </section>
  );
}
