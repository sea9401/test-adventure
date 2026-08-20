import type { Tier7AdvancementStatus } from "@/adventure/data/v2/tier7Advancement";
import { V2_JOB_CATALOG } from "@/adventure/data/v2/v2JobCatalog";
import { SURFACE_INSET } from "@/components/ui/surfaces";

function jobName(jobId: string): string {
  return V2_JOB_CATALOG[jobId]?.name ?? "선행 직업";
}

function progress(current: number, required: number): string {
  return `${current.toLocaleString("ko-KR")} / ${required.toLocaleString("ko-KR")}`;
}

function RequirementRow({
  label,
  value,
  met,
}: {
  label: string;
  value: string;
  met: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-600 dark:text-zinc-300">{label}</dt>
      <dd
        className={`text-right font-semibold tabular-nums ${
          met
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function Tier7AdvancementRequirements({
  status,
  compact = false,
}: {
  status: Tier7AdvancementStatus;
  compact?: boolean;
}) {
  if (status.permanentlyUnlocked) {
    return (
      <div className={`${SURFACE_INSET} px-3 py-2 text-xs`}>
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
          영구 해금
        </span>
        <span className="ml-2 text-zinc-600 dark:text-zinc-300">
          최초 전직 조건과 재료 소모가 면제됩니다.
        </span>
      </div>
    );
  }

  const [first, second] = status.prerequisiteProgress;
  return (
    <dl
      className={`${SURFACE_INSET} grid ${compact ? "gap-1.5 p-2" : "gap-2 p-3"} text-xs`}
    >
      <RequirementRow
        label={`${jobName(first.jobId)} 숙련도`}
        value={progress(first.current, first.required)}
        met={first.met}
      />
      <RequirementRow
        label={`${jobName(second.jobId)} 숙련도`}
        value={progress(second.current, second.required)}
        met={second.met}
      />
      <RequirementRow
        label="현재 직업"
        value={`${jobName(status.currentJob.allowed[0])} 또는 ${jobName(status.currentJob.allowed[1])}`}
        met={status.currentJob.met}
      />
      <RequirementRow
        label="현재 레벨"
        value={progress(status.level.current, status.level.required)}
        met={status.level.met}
      />
      <RequirementRow
        label="폭풍 기원의 파편"
        value={progress(status.material.current, status.material.required)}
        met={status.material.met}
      />
    </dl>
  );
}

export function Tier7FirstUnlockNotice({
  status,
}: {
  status: Tier7AdvancementStatus;
}) {
  if (status.permanentlyUnlocked || !status.firstUnlockReady) return null;
  return (
    <div className={`${SURFACE_INSET} mt-3 space-y-1 p-3 text-sm`}>
      <p className="font-semibold text-amber-700 dark:text-amber-300">
        최초 전직에만 폭풍 기원의 파편 30개를 소모합니다.
      </p>
      <p className="text-zinc-600 dark:text-zinc-300">
        전직 후 Lv.1로 돌아가지만 숙련도와 배운 스킬은 유지됩니다.
      </p>
    </div>
  );
}
