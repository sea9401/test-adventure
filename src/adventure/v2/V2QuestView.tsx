"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Lock, Circle, Gift } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { useGameState } from "./GameStateProvider";
import {
  type QuestLine,
  type QuestView,
  type QuestReward,
} from "@/adventure/data/v2/v2Quests";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

// 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 완료는 자동 감지, 보상만 "받기"로 수령.

type QuestsResponse = {
  ok?: boolean;
  lines?: QuestLine[];
  quests?: QuestView[];
};

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/quests");
      const j = (await res.json().catch(() => null)) as QuestsResponse | null;
      if (j?.ok) {
        setLines(j.lines ?? []);
        setQuests(j.quests ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const claim = useCallback(
    async (q: QuestView) => {
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
      <SubViewHeader title="성장 안내" onBack={onBack} />

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
        lines.map((line) => {
          const lineQuests = quests.filter((q) => q.line === line.id);
          if (lineQuests.length === 0) return null;
          const doneCount = lineQuests.filter(
            (q) => q.status === "claimed",
          ).length;
          return (
            <Card key={line.id} padding="md">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{line.name}</h2>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {doneCount}/{lineQuests.length}
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
    </main>
  );
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
