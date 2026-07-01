"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Lock, Circle, Gift } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "./GameStateProvider";
import { useRewardToast } from "./RewardToastProvider";
import {
  type QuestLine,
  type QuestView,
  type QuestReward,
  isTutorialLine,
} from "@/adventure/data/v2/v2Quests";
import { TITLES } from "@/adventure/data/titles";
import type {
  RepeatBundleView,
  RepeatQuestView,
} from "@/adventure/data/v2/v2RepeatQuests";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

// 퀘스트 — 일일/주간/업적 3탭.
//   업적(가이드 퀘스트): 튜토리얼 겸 성장 안내. 완료 자동 감지, 개별 보상 "받기".
//   일일/주간: 개별 보상 폐지 — 4개/3개 "완료"(진행도≥목표) 시 마일스톤 번들 보상(스태미나 포션) 수령.

type RepeatSection = {
  daily: RepeatQuestView[];
  weekly: RepeatQuestView[];
  dailyResetAt: number;
  weeklyResetAt: number;
  dailyBundle: RepeatBundleView;
  weeklyBundle: RepeatBundleView;
};

type QuestsResponse = {
  ok?: boolean;
  lines?: QuestLine[];
  quests?: QuestView[];
  repeat?: RepeatSection;
};

type TopTab = "tutorial" | "daily" | "weekly" | "achievement";

// 리셋 카운트다운 — "11시간 후" / "32분 후" (마운트 시점 고정 — 분 단위 정밀도면 충분).
function resetLabel(at: number, nowMs: number): string {
  const ms = Math.max(0, at - nowMs);
  const h = Math.floor(ms / 3600_000);
  if (h >= 1) return `${h}시간 후 리셋`;
  return `${Math.max(1, Math.floor(ms / 60_000))}분 후 리셋`;
}

function rewardText(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold.toLocaleString()} 골드(은행 입금)`);
  if (reward.equip) {
    parts.push(V2_EQUIPMENT[reward.equip]?.name ?? reward.equip);
  }
  if (reward.staminaPotions) {
    parts.push(`스태미나 회복약 ${reward.staminaPotions}개`);
  }
  if (reward.titleId) {
    parts.push(`칭호: ${TITLES[reward.titleId]?.name ?? reward.titleId}`);
  }
  return parts.join(" · ");
}

export function V2QuestView({ onBack }: { onBack: () => void }) {
  const { refreshGameState } = useGameState();
  const { notifyReward } = useRewardToast();
  const [lines, setLines] = useState<QuestLine[]>([]);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [repeat, setRepeat] = useState<RepeatSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bundleBusy, setBundleBusy] = useState<"daily" | "weekly" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 초기 탭 — 홈 튜토리얼 배너가 ?tab=tutorial 로 딥링크. 그 외 기본 일일.
  const tabParam = useSearchParams().get("tab");
  const [topTab, setTopTab] = useState<TopTab>(
    tabParam === "tutorial" ||
      tabParam === "weekly" ||
      tabParam === "achievement"
      ? tabParam
      : "daily",
  );
  // 업적(가이드) 안 진행중/완료 분리.
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 퀘스트 fetch
    refresh();
  }, [refresh]);

  // 가이드(업적) 퀘 보상 수령.
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
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${claimErr(j?.error, res.status)}`);
          return;
        }
        const text = rewardText(q.reward);
        setMsg(`✓ 보상 수령 — ${text}`);
        notifyReward("보상 수령", text);
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifyReward, refresh, refreshGameState],
  );

  // 마일스톤 번들 보상(스태미나 포션) 수령.
  const claimBundle = useCallback(
    async (scope: "daily" | "weekly") => {
      setBundleBusy(scope);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/quests/claim-bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          potions?: number;
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${claimErr(j?.error, res.status)}`);
          return;
        }
        const title = `${scope === "daily" ? "일일" : "주간"} 보상`;
        const detail = `스태미나 포션 ${j.potions}개`;
        setMsg(`✓ ${title} — ${detail}`);
        notifyReward(title, detail);
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBundleBusy(null);
      }
    },
    [notifyReward, refresh, refreshGameState],
  );

  return (
    <PageShell spacing="tight">
      <SubViewHeader title="퀘스트" onBack={onBack} />

      <TabBar
        tabs={[
          { key: "tutorial", label: "튜토리얼" },
          { key: "daily", label: "일일" },
          { key: "weekly", label: "주간" },
          { key: "achievement", label: "업적" },
        ]}
        active={topTab}
        onChange={setTopTab}
        ariaLabel="퀘스트 분류"
        size="md"
      />

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
      )}

      {loading ? (
        <Card padding="md">
          <Skeleton rows={4} />
        </Card>
      ) : topTab === "tutorial" ? (
        renderGuide(true)
      ) : topTab === "achievement" ? (
        renderGuide(false)
      ) : (
        renderRepeatTab(topTab)
      )}
    </PageShell>
  );

  function renderRepeatTab(scope: "daily" | "weekly") {
    if (!repeat) return null;
    const now = Date.now();
    const list = scope === "daily" ? repeat.daily : repeat.weekly;
    const bundle = scope === "daily" ? repeat.dailyBundle : repeat.weeklyBundle;
    const resetAt =
      scope === "daily" ? repeat.dailyResetAt : repeat.weeklyResetAt;
    const completed = list.filter((q) => q.complete).length;
    return (
      <>
        <BundleCard
          scope={scope}
          bundle={bundle}
          busy={bundleBusy === scope}
          onClaim={() => claimBundle(scope)}
        />
        <Card padding="md" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {scope === "daily" ? "일일 퀘스트" : "주간 퀘스트"}
            </h2>
            <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {completed}/{list.length} 완료 · {resetLabel(resetAt, now)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {list.map((q) => (
              <RepeatRow key={q.id} quest={q} />
            ))}
          </ul>
        </Card>
      </>
    );
  }

  function renderGuide(forTutorial: boolean) {
    const isDone = (q: QuestView) => q.status === "claimed";
    // 가이드 퀘를 라인 tutorial 플래그로 분리 — 튜토리얼 탭 vs 업적 탭.
    const scoped = quests.filter((q) => isTutorialLine(q.line) === forTutorial);
    const groupLabel = forTutorial ? "튜토리얼" : "업적";
    const activeCount = scoped.filter((q) => !isDone(q)).length;
    const doneCount = scoped.filter(isDone).length;
    const shown = scoped.filter((q) => (tab === "done" ? isDone(q) : !isDone(q)));

    return (
      <>
        <TabBar
          tabs={[
            { key: "active", label: `진행 중 (${activeCount})` },
            { key: "done", label: `완료 (${doneCount})` },
          ]}
          active={tab}
          onChange={setTab}
          ariaLabel={`${groupLabel} 탭`}
          size="sm"
        />

        {shown.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {tab === "done"
                ? `아직 완료한 ${groupLabel} 항목이 없어요.`
                : `진행 중인 ${groupLabel} 항목이 없어요. 🎉`}
            </p>
          </Card>
        ) : (
          lines
            .filter((line) => isTutorialLine(line.id) === forTutorial)
            .map((line) => {
            const lineQuests = shown.filter((q) => q.line === line.id);
            if (lineQuests.length === 0) return null;
            const all = scoped.filter((q) => q.line === line.id);
            const done = all.filter(isDone).length;
            return (
              <Card key={line.id} padding="md" className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{line.name}</h2>
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {done}/{all.length}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {line.subtitle}
                </p>
                <ul className="space-y-1.5">
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

function claimErr(error: string | undefined, status: number): string {
  if (error === "not_complete") return "아직 완료 조건을 채우지 못했어요";
  if (error === "already_claimed") return "이미 수령했어요";
  return error ?? `http ${status}`;
}

// 일일/주간 마일스톤 번들 — 완료 개수 달성 시 스태미나 포션 수령.
function BundleCard({
  scope,
  bundle,
  busy,
  onClaim,
}: {
  scope: "daily" | "weekly";
  bundle: RepeatBundleView;
  busy: boolean;
  onClaim: () => void;
}) {
  const pct = Math.min(100, Math.round((bundle.completed / bundle.goal) * 100));
  return (
    <Card
      padding="md"
      className={
        bundle.claimable
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950"
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {bundle.claimed ? (
          <CheckCircle
            size={20}
            weight="fill"
            className="shrink-0 text-emerald-500"
          />
        ) : bundle.claimable ? (
          <Gift size={20} weight="fill" className="shrink-0 text-amber-500" />
        ) : (
          <Circle size={20} className="shrink-0 text-zinc-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">
              {scope === "daily" ? "일일" : "주간"} 마일스톤
            </span>
            <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {bundle.completed}/{bundle.goal} 완료
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            퀘스트 {bundle.goal}개를 완료하면 스태미나 포션 {bundle.potions}개를
            받아요.
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                bundle.claimable || bundle.claimed
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {bundle.claimed ? (
          <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            수령 완료
          </span>
        ) : (
          <Button
            onClick={onClaim}
            disabled={!bundle.claimable || busy}
            variant="warning"
            size="xs"
            className="shrink-0"
          >
            {busy ? "수령 중…" : "받기"}
          </Button>
        )}
      </div>
    </Card>
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
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950"
        : status === "active"
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950"
            : SURFACE_INSET
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
        <Button
          onClick={onClaim}
          disabled={busy}
          variant="warning"
          size="xs"
          className="shrink-0"
        >
          {busy ? "수령 중…" : "받기"}
        </Button>
      )}
    </li>
  );
}

// 일일/주간 반복 퀘 한 줄 — 개별 보상 폐지로 진행도만 표시(받기 버튼 없음, 완료 시 체크).
function RepeatRow({ quest }: { quest: RepeatQuestView }) {
  const pct = Math.min(100, Math.round((quest.progress / quest.goal) * 100));
  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        quest.complete
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950"
          : SURFACE_INSET
      }`}
    >
      <div className="flex items-center gap-3">
        {quest.complete ? (
          <CheckCircle
            size={18}
            weight="fill"
            className="shrink-0 text-emerald-500"
          />
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
          {!quest.complete && (
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {quest.desc}
            </p>
          )}
          {!quest.complete && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
