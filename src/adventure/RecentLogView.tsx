"use client";

import { useState } from "react";
import { CaretDown, CaretRight, Trash } from "@phosphor-icons/react";
import {
  formatRelative,
  isBattleNotification,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { renderHighlightedText } from "@/components/NotificationToast";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import type { BattleLogEntry } from "@/adventure/battle/engine";

const KIND_COLOR: Record<NotificationKind, string> = {
  battle_win: "text-emerald-600 dark:text-emerald-400",
  battle_lose: "text-rose-600 dark:text-rose-400",
  training_done: "text-amber-600 dark:text-amber-400",
  quest_ready: "text-yellow-700 dark:text-yellow-400",
  quest_complete: "text-violet-700 dark:text-violet-400",
  milestone: "text-fuchsia-700 dark:text-fuchsia-400",
  expedition: "text-teal-700 dark:text-teal-400",
  loot: "text-lime-700 dark:text-lime-400",
  equip_drop: "text-orange-700 dark:text-orange-400",
  item: "text-blue-700 dark:text-blue-400",
  info: "text-zinc-600 dark:text-zinc-400",
};

function formatAbsolute(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationRow({ n }: { n: AppNotification }) {
  const [open, setOpen] = useState(false);
  const battleLog = n.meta?.battleLog;
  const expandable = !!battleLog && battleLog.length > 0;

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        className={`flex w-full items-start gap-2 text-left ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {expandable && (
          <span
            aria-hidden
            className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500"
          >
            {open ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <div className={`text-sm ${KIND_COLOR[n.kind]}`}>{renderHighlightedText(n.text, n.meta?.highlight)}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{formatAbsolute(n.timestamp)}</span>
            <span aria-hidden>·</span>
            <span>{formatRelative(n.timestamp)}</span>
          </div>
        </span>
      </button>
      {expandable && open && (
        <div className="mt-2 ml-5 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* meta.battleLog 의 kind 는 lib 레이어 한정으로 string — 실제 값은 엔진이 작성한 BattleLogEntry. */}
          <BattleLogList entries={battleLog as BattleLogEntry[]} compact />
        </div>
      )}
    </li>
  );
}

type Tab = "system" | "battle";

export function RecentLogView({
  notifications,
  onClear,
}: {
  notifications: AppNotification[];
  onClear?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("system");

  const battle = notifications.filter((n) => isBattleNotification(n.kind));
  const system = notifications.filter((n) => !isBattleNotification(n.kind));
  const list = tab === "battle" ? battle : system;
  const pager = usePagination(list, 10);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
          <TabButton
            label={`시스템 ${system.length}`}
            active={tab === "system"}
            onClick={() => setTab("system")}
          />
          <TabButton
            label={`전투 로그 ${battle.length}`}
            active={tab === "battle"}
            onClick={() => setTab("battle")}
          />
        </div>
        {onClear && notifications.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("최근 기록을 모두 삭제할까요?")) onClear();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
          >
            <Trash size={12} weight="bold" />
            전체 삭제
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white/90 p-8 text-center dark:border-zinc-700 dark:bg-zinc-950/90">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {tab === "battle"
              ? "기록된 전투가 없습니다."
              : "기록된 시스템 알림이 없습니다."}
          </div>
        </section>
      ) : (
        <>
          <Card as="section" padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {pager.pageItems.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </ul>
          </Card>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
          : "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      }
    >
      {label}
    </button>
  );
}
