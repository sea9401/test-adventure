"use client";

import { useRef } from "react";
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import type { AdventureHomeWidgetId } from "./adventureDashboard";

const WIDGET_LABELS: Record<AdventureHomeWidgetId, string> = {
  character_summary: "캐릭터",
  stamina: "스태미나",
  activity_checklist: "오늘의 모험 체크",
  quest_rewards: "퀘스트",
  hot_time: "핫타임",
  announcements: "공지",
  bulletin_preview: "최근 게시글",
  ranking_preview: "랭킹",
};

export function AdventureHomeLayoutSettings({
  order,
  hidden,
  onOrderChange,
  onHiddenChange,
  onReset,
}: {
  order: readonly AdventureHomeWidgetId[];
  hidden: readonly AdventureHomeWidgetId[];
  onOrderChange: (order: AdventureHomeWidgetId[]) => void;
  onHiddenChange: (hidden: AdventureHomeWidgetId[]) => void;
  onReset: () => void;
}) {
  const dragging = useRef<AdventureHomeWidgetId | null>(null);
  const hiddenSet = new Set(hidden);
  const visible = order.filter((id) => !hiddenSet.has(id));

  const move = (id: AdventureHomeWidgetId, delta: number) => {
    const visibleIndex = visible.indexOf(id);
    const target = visible[visibleIndex + delta];
    if (!target) return;

    const next = [...order];
    const from = next.indexOf(id);
    const to = next.indexOf(target);
    [next[from], next[to]] = [next[to], next[from]];
    onOrderChange(next);
  };

  const moveBefore = (
    id: AdventureHomeWidgetId,
    target: AdventureHomeWidgetId,
  ) => {
    if (id === target) return;
    const next = order.filter((item) => item !== id);
    next.splice(next.indexOf(target), 0, id);
    onOrderChange(next);
  };

  return (
    <Card as="section" padding="md" aria-labelledby="home-layout-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="home-layout-settings-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            홈 화면 구성
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            홈 위젯의 순서를 바꾸거나 사용하지 않는 항목을 숨길 수 있습니다.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onReset}>
          <ArrowCounterClockwise size={16} aria-hidden />
          기본 배치로 되돌리기
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {visible.map((id, index) => (
          <Inset
            key={id}
            draggable
            onDragStart={() => {
              dragging.current = id;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging.current) moveBefore(dragging.current, id);
              dragging.current = null;
            }}
            className="flex min-h-12 items-center gap-1 px-2 py-1"
          >
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              <DotsSixVertical
                size={19}
                className="shrink-0 text-zinc-400"
                aria-hidden
              />
              {WIDGET_LABELS[id]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${WIDGET_LABELS[id]} 위로 이동`}
              disabled={index === 0}
              onClick={() => move(id, -1)}
            >
              <ArrowUp size={18} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${WIDGET_LABELS[id]} 아래로 이동`}
              disabled={index === visible.length - 1}
              onClick={() => move(id, 1)}
            >
              <ArrowDown size={18} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${WIDGET_LABELS[id]} 숨기기`}
              onClick={() => onHiddenChange([...hidden, id])}
            >
              <EyeSlash size={18} aria-hidden />
            </Button>
          </Inset>
        ))}
      </div>

      {hidden.length > 0 && (
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            숨긴 위젯
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((id) => (
              <Button
                key={id}
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`${WIDGET_LABELS[id]} 표시`}
                onClick={() =>
                  onHiddenChange(hidden.filter((item) => item !== id))
                }
              >
                <Eye size={16} aria-hidden />
                {WIDGET_LABELS[id]} 표시
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
