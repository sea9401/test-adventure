"use client";

import type { ReactNode } from "react";
import type { AdventureHomeWidgetId } from "./adventureDashboard";

const FULL_WIDTH = new Set<AdventureHomeWidgetId>([
  "character_summary",
  "stamina",
  "activity_checklist",
  "quest_rewards",
  "hot_time",
]);

const MATCHED_HEIGHT = new Set<AdventureHomeWidgetId>([
  "announcements",
  "bulletin_preview",
  "ranking_preview",
]);

export function AdventureHomeWidgetGrid({
  order,
  hidden,
  widgets,
}: {
  order: readonly AdventureHomeWidgetId[];
  hidden: readonly AdventureHomeWidgetId[];
  widgets: Partial<Record<AdventureHomeWidgetId, ReactNode>>;
}) {
  const hiddenSet = new Set(hidden);
  const visible = order.filter((id) => !hiddenSet.has(id) && widgets[id] != null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map((id) => (
        <div
          key={id}
          data-testid="home-widget"
          className={FULL_WIDTH.has(id) ? "sm:col-span-2" : ""}
        >
          <div
            className={
              MATCHED_HEIGHT.has(id) ? "sm:h-[21rem] [&>*]:h-full" : ""
            }
          >
            {widgets[id]}
          </div>
        </div>
      ))}
    </div>
  );
}
