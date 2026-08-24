"use client";

import { useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, DotsSixVertical, Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import type { AdventureHomeWidgetId } from "./adventureDashboard";

const WIDGET_LABELS: Record<AdventureHomeWidgetId, string> = {
  character_summary: "캐릭터",
  activity_checklist: "오늘의 모험 체크",
  quest_rewards: "퀘스트",
  hot_time: "핫타임",
  announcements: "공지",
  bulletin_preview: "최근 게시글",
  ranking_preview: "랭킹",
};

const FULL_WIDTH = new Set<AdventureHomeWidgetId>([
  "character_summary",
  "activity_checklist",
  "quest_rewards",
  "hot_time",
]);

export function AdventureHomeWidgetGrid({
  order,
  hidden,
  editing,
  widgets,
  onOrderChange,
  onHiddenChange,
}: {
  order: readonly AdventureHomeWidgetId[];
  hidden: readonly AdventureHomeWidgetId[];
  editing: boolean;
  widgets: Partial<Record<AdventureHomeWidgetId, ReactNode>>;
  onOrderChange: (order: AdventureHomeWidgetId[]) => void;
  onHiddenChange: (hidden: AdventureHomeWidgetId[]) => void;
}) {
  const dragging = useRef<AdventureHomeWidgetId | null>(null);
  const hiddenSet = new Set(hidden);
  const visible = order.filter((id) => !hiddenSet.has(id) && widgets[id] != null);
  const move = (id: AdventureHomeWidgetId, delta: number) => {
    const from = order.indexOf(id);
    const to = Math.max(0, Math.min(order.length - 1, from + delta));
    if (from < 0 || to === from) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    onOrderChange(next);
  };
  const moveBefore = (id: AdventureHomeWidgetId, target: AdventureHomeWidgetId) => {
    if (id === target) return;
    const next = order.filter((item) => item !== id);
    next.splice(next.indexOf(target), 0, id);
    onOrderChange(next);
  };

  return (
    <div className="space-y-3">
      {editing && hidden.length > 0 && (
        <Card as="section" aria-label="숨긴 위젯">
          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">숨긴 위젯 다시 추가</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((id) => (
              <Button key={id} type="button" variant="secondary" size="sm" onClick={() => onHiddenChange(hidden.filter((item) => item !== id))}>
                <Eye size={16} aria-hidden /> {WIDGET_LABELS[id]}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visible.map((id) => (
          <div
            key={id}
            data-testid="home-widget"
            draggable={editing}
            onDragStart={() => { dragging.current = id; }}
            onDragOver={(event) => { if (editing) event.preventDefault(); }}
            onDrop={() => {
              if (editing && dragging.current) moveBefore(dragging.current, id);
              dragging.current = null;
            }}
            className={FULL_WIDTH.has(id) ? "sm:col-span-2" : ""}
          >
            {editing && (
              <Inset className="mb-1 flex min-h-11 items-center gap-1 px-1.5 py-0">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <DotsSixVertical size={19} aria-hidden /> {WIDGET_LABELS[id]}
                </span>
                <Button type="button" variant="ghost" size="icon" aria-label={`${WIDGET_LABELS[id]} 위로 이동`} onClick={() => move(id, -1)}><ArrowUp size={18} /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${WIDGET_LABELS[id]} 아래로 이동`} onClick={() => move(id, 1)}><ArrowDown size={18} /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${WIDGET_LABELS[id]} 숨기기`} onClick={() => onHiddenChange([...hidden, id])}><EyeSlash size={18} /></Button>
              </Inset>
            )}
            <div className={editing ? "pointer-events-none" : ""}>{widgets[id]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
