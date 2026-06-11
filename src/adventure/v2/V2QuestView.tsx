"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Lock, Circle, Gift } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "./GameStateProvider";
import {
  type QuestLine,
  type QuestView,
  type QuestReward,
} from "@/adventure/data/v2/v2Quests";
import type { RepeatQuestView } from "@/adventure/data/v2/v2RepeatQuests";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

// 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 완료는 자동 감지, 보상만 "받기"로 수령.

type RepeatSection = {
  daily: RepeatQuestView[];
  weekly: RepeatQuestView[];
  dailyResetAt: number;
  weeklyResetAt: number;
};

type QuestsResponse = {
  ok?: boolean;
  lines?: QuestLine[];
  quests?: QuestView[];
  repeat?: RepeatSection;
};

// 리셋 카운트다운 — "11시간 후" / "32분 후" (마운트 시점 고정 — 분 단위 정밀도면 충분).
function resetLabel(at: number, nowMs: number): string {
  const ms = Math.max(0, at - nowMs);
  const h = Math.floor(ms / 3600_000);
  if (h >= 1) return `${h}시간 후 리셋`;
  return `${Math.max(1, Math.floor(ms / 60_000))}분 후 리셋`;
}

function rewardText(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold.toLocaleString()} 골드`);
  if (reward.equip) {
    parts.push(V2_EQUIPMENT[reward.equip]?.name ?? reward.equip);
  }
  return parts.join(" · ");
}

export function V2QuestView({ onBack }: { onBack: () => void }) {
  const { refreshGameState } = useGameState();
  const [lines, setLines] = useState<QuestLine[]>([]);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [repeat, setRepeat] = useState<RepeatSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 탭 — 진행 중(미수령 = claimable/active/locked) / 완료(claimed). 퀘스트가 늘어도 깔끔히 분리.
  const [tab, setTab] = useState<"active" | "done">("active");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/quests");
      const j = (await res.json().catch(() => null)) as QuestsResponse | null;
      if (j?.ok) {
        setLines(j.lines ?? []);
        setQuests(j.quests ?? []);
        setRepeat(j.repeat ?? null);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const claim = useCallback(
    async (q: { id: string; reward: QuestReward }) => {
      setBusy(q.id);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/quests/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questId: q.id }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          reward?: QuestReward;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "not_complete"
              ? "아직 완료되지 않았어요"
              : j?.error === "already_claimed"
                ? "이미 수령했어요"
                : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ 보상 수령 — ${rewardText(q.reward)}`);
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh, refreshGameState],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="퀘스트" onBack={onBack} />

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <Card padding="md">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        </Card>
      ) : (
        <>
          {repeat && renderRepeat(repeat)}
          {renderTabs()}
        </>
      )}
    </main>
  );

  function renderRepeat(r: RepeatSection) {
    const now = Date.now();
    const sections: {
      key: string;
      label: string;
      quests: RepeatQuestView[];
      resetAt: number;
    }[] = [
      { key: "daily", label: "일일 퀘스트", quests: r.daily, resetAt: r.dailyResetAt },
      { key: "weekly", label: "주간 퀘스트", quests: r.weekly, resetAt: r.weeklyResetAt },
    ];
    return sections.map(({ key, label, quests: list, resetAt }) => {
      if (list.length === 0) return null;
      const done = list.filter((q) => q.claimed).length;
      return (
        <Card key={key} padding="md">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{label}</h2>
            <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {done}/{list.length} · {resetLabel(resetAt, now)}
            </span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {list.map((q) => (
              <RepeatRow
                key={q.id}
                quest={q}
                busy={busy === q.id}
                onClaim={() => claim(q)}
              />
            ))}
          </ul>
        </Card>
      );
    });
  }

  function renderTabs() {
    const isDone = (q: QuestView) => q.status === "claimed";
    const activeCount = quests.filter((q) => !isDone(q)).length;
    const doneCount = quests.filter(isDone).length;
    const shown = quests.filter((q) => (tab === "done" ? isDone(q) : !isDone(q)));

    return (
      <>
        <TabBar
          tabs={[
            { key: "active", label: `진행 중 (${activeCount})` },
            { key: "done", label: `완료 (${doneCount})` },
          ]}
          active={tab}
          onChange={setTab}
          ariaLabel="퀘스트 탭"
          size="md"
        />

        {shown.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {tab === "done"
                ? "아직 완료한 퀘스트가 없어요."
                : "진행 중인 퀘스트가 없어요. 🎉"}
            </p>
          </Card>
        ) : (
          lines.map((line) => {
            const lineQuests = shown.filter((q) => q.line === line.id);
            if (lineQuests.length === 0) return null;
            // 진행도 표기는 탭 무관 전체 기준(라인 N개 중 완료 M).
            const all = quests.filter((q) => q.line === line.id);
            const done = all.filter(isDone).length;
            return (
              <Card key={line.id} padding="md">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{line.name}</h2>
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {done}/{all.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {line.subtitle}
                </p>

                <ul className="mt-3 space-y-1.5">
                  {lineQuests.map((q) => (
                    <QuestRow
                      key={q.id}
                      quest={q}
                      busy={busy === q.id}
                      onClaim={() => claim(q)}
                    />
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </>
    );
  }
}

function QuestRow({
  quest,
  busy,
  onClaim,
}: {
  quest: QuestView;
  busy: boolean;
  onClaim: () => void;
}) {
  const { status } = quest;
  const reward = rewardText(quest.reward);

  const icon =
    status === "claimed" ? (
      <CheckCircle
        size={18}
        weight="fill"
        className="shrink-0 text-emerald-500"
      />
    ) : status === "claimable" ? (
      <Gift size={18} weight="fill" className="shrink-0 text-amber-500" />
    ) : status === "locked" ? (
      <Lock size={18} className="shrink-0 text-zinc-400 dark:text-zinc-600" />
    ) : (
      <Circle size={18} className="shrink-0 text-emerald-500" />
    );

  const dim = status === "locked" || status === "claimed";

  return (
    <li
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        status === "claimable"
          ? "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40"
          : status === "active"
            ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/30"
            : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      {icon}
      <div className={`min-w-0 flex-1 ${dim ? "opacity-60" : ""}`}>
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{quest.title}</span>
          {status === "active" && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              진행 중
            </span>
          )}
        </div>
        {status !== "claimed" && (
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {status === "locked" ? "앞선 목표를 먼저 완료하세요" : quest.desc}
          </p>
        )}
        {reward && (
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            보상 {reward}
          </p>
        )}
      </div>
      {status === "claimable" && (
        <button
          type="button"
          onClick={onClaim}
          disabled={busy}
          className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "수령 중…" : "받기"}
        </button>
      )}
    </li>
  );
}

function RepeatRow({
  quest,
  busy,
  onClaim,
}: {
  quest: RepeatQuestView;
  busy: boolean;
  onClaim: () => void;
}) {
  const pct = Math.min(100, Math.round((quest.progress / quest.goal) * 100));
  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        quest.claimable
          ? "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40"
          : quest.claimed
            ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-3">
        {quest.claimed ? (
          <CheckCircle size={18} weight="fill" className="shrink-0 text-emerald-500" />
        ) : quest.claimable ? (
          <Gift size={18} weight="fill" className="shrink-0 text-amber-500" />
        ) : (
          <Circle size={18} className="shrink-0 text-zinc-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{quest.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {quest.progress}/{quest.goal}
            </span>
          </div>
          {!quest.claimed && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {quest.desc}
            </p>
          )}
          {/* 진행 바 */}
          {!quest.claimed && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all ${
                  quest.claimable ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            보상 {quest.reward.gold.toLocaleString()} 골드
          </p>
        </div>
        {quest.claimable && (
          <button
            type="button"
            onClick={onClaim}
            disabled={busy}
            className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "수령 중…" : "받기"}
          </button>
        )}
      </div>
    </li>
  );
}
