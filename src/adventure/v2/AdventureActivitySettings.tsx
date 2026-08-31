"use client";

import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import type { AdventureActivityView } from "./adventureDashboard";

export function AdventureActivitySettings({
  activities,
  onToggle,
}: {
  activities: readonly AdventureActivityView[];
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <Card as="section" padding="md" aria-labelledby="activity-settings-title">
      <h2 id="activity-settings-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        체크 항목 관리
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        하지 않는 콘텐츠를 끄면 완료율, 활동 목록과 상단 알림에서 함께 제외됩니다.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {activities.map((activity) => (
          <Inset as="label" key={activity.id} className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2">
            <input
              type="checkbox"
              checked={activity.enabled}
              onChange={(event) => onToggle(activity.id, event.currentTarget.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{activity.title}</span>
              <span className="block truncate text-[0.6875rem] text-zinc-500 dark:text-zinc-400">{activity.detail}</span>
            </span>
          </Inset>
        ))}
      </div>
    </Card>
  );
}
