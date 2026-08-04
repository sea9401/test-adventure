"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Lock,
  Circle,
  Gift,
  Star,
  Trophy,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
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
  type AchievementSummary,
} from "@/adventure/data/v2/v2Quests";
import { TITLES } from "@/adventure/data/titles";
import type {
  RepeatBundleView as BaseRepeatBundleView,
  RepeatQuestView,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  FARM_CROPS,
  type FarmCropId,
  type FarmSeedInventory,
} from "./farm";
import type { MonsterHuntCodexView } from "@/adventure/data/v2/monsterHuntCodex";

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

type SeedPouchReward = {
  name: string;
  seeds: FarmSeedInventory;
};

type RepeatBundleView = BaseRepeatBundleView & {
  seedPouch?: SeedPouchReward | null;
};

type QuestsResponse = {
  ok?: boolean;
  lines?: QuestLine[];
  quests?: QuestView[];
  repeat?: RepeatSection;
  achievementSummary?: AchievementSummary;
  monsterCodex?: MonsterHuntCodexView;
  trackedQuestId?: string | null;
};

type TopTab = "tutorial" | "daily" | "weekly" | "achievement";
type ClaimAllScope = Extract<TopTab, "tutorial" | "achievement">;

export type ClaimAllReward = {
  gold: number;
  equipment: V2EquipmentId[];
  staminaPotions: number;
  titleIds: string[];
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

function seedPouchText(pouch: SeedPouchReward): string {
  const seeds = Object.entries(pouch.seeds)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(
      ([id, count]) =>
        `${FARM_CROPS[id as FarmCropId].seedName} ${count}개`,
    )
    .join(", ");
  return seeds ? `${pouch.name}(${seeds})` : pouch.name;
}

function namedRewardText(
  ids: readonly string[],
  resolveName: (id: string) => string,
): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const name = resolveName(id);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(", ");
}

export function claimAllRewardText(reward: ClaimAllReward): string {
  const parts: string[] = [];
  if (reward.gold > 0) {
    parts.push(`${reward.gold.toLocaleString()} 골드(은행 입금)`);
  }
  if (reward.equipment.length > 0) {
    parts.push(
      `장비: ${namedRewardText(
        reward.equipment,
        (id) => V2_EQUIPMENT[id as V2EquipmentId]?.name ?? id,
      )}`,
    );
  }
  if (reward.staminaPotions > 0) {
    parts.push(`스태미나 회복약 ${reward.staminaPotions}개`);
  }
  if (reward.titleIds.length > 0) {
    parts.push(
      `칭호: ${namedRewardText(
        reward.titleIds,
        (id) => TITLES[id]?.name ?? id,
      )}`,
    );
  }
  return parts.join(" · ");
}

export function V2QuestView({ onBack }: { onBack: () => void }) {
  const { refreshGameState } = useGameState();
  const { notifyReward, notifySystem } = useRewardToast();
  const [lines, setLines] = useState<QuestLine[]>([]);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [repeat, setRepeat] = useState<RepeatSection | null>(null);
  const [achievement, setAchievement] = useState<AchievementSummary | null>(null);
  const [monsterCodex, setMonsterCodex] =
    useState<MonsterHuntCodexView | null>(null);
  const [monsterCodexOpen, setMonsterCodexOpen] = useState(false);
  const [trackedQuestId, setTrackedQuestId] = useState<string | null>(null);
  const [trackingBusy, setTrackingBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [claimAllBusy, setClaimAllBusy] = useState<ClaimAllScope | null>(null);
  const [bundleBusy, setBundleBusy] = useState<"daily" | "weekly" | null>(null);
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
        setAchievement(j.achievementSummary ?? null);
        setMonsterCodex(j.monsterCodex ?? null);
        setTrackedQuestId(j.trackedQuestId ?? null);
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
          notifySystem(`✗ ${claimErr(j?.error, res.status)}`);
          return;
        }
        const text = rewardText(q.reward);
        if (text) notifyReward("보상 수령", text);
        else notifySystem("업적 완료로 기록했어요.");
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifyReward, notifySystem, refresh, refreshGameState],
  );

  // 마일스톤 번들 보상(스태미나 포션) 수령.
  const claimBundle = useCallback(
    async (scope: "daily" | "weekly") => {
      setBundleBusy(scope);
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
          seedPouch?: SeedPouchReward | null;
        } | null;
        if (!j?.ok) {
          notifySystem(`✗ ${claimErr(j?.error, res.status)}`);
          return;
        }
        const title = `${scope === "daily" ? "일일" : "주간"} 보상`;
        const detail = [
          `스태미나 포션 ${j.potions}개`,
          j.seedPouch ? seedPouchText(j.seedPouch) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        notifyReward(title, detail);
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBundleBusy(null);
      }
    },
    [notifyReward, notifySystem, refresh, refreshGameState],
  );

  const claimAll = useCallback(
    async (scope: ClaimAllScope) => {
      setClaimAllBusy(scope);
      try {
        const res = await fetch("/api/v2/me/quests/claim-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          count?: number;
          reward?: ClaimAllReward;
        } | null;
        if (!j?.ok || !j.reward || !j.count) {
          notifySystem(`✗ ${claimErr(j?.error, res.status)}`);
          return;
        }
        const groupLabel = scope === "tutorial" ? "튜토리얼" : "업적";
        notifyReward(
          `${groupLabel} 보상 ${j.count}개 수령`,
          claimAllRewardText(j.reward) || "완료로 기록했어요.",
        );
        await Promise.all([refresh(), refreshGameState()]);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setClaimAllBusy(null);
      }
    },
    [notifyReward, notifySystem, refresh, refreshGameState],
  );

  const toggleQuestTracking = useCallback(
    async (questId: string) => {
      const nextQuestId = trackedQuestId === questId ? null : questId;
      setTrackingBusy(questId);
      try {
        const response = await fetch("/api/v2/me/quests/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questId: nextQuestId }),
        });
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          trackedQuestId?: string | null;
        } | null;
        if (!response.ok || body?.ok !== true) {
          notifySystem(`✗ ${body?.error ?? `http ${response.status}`}`);
          return;
        }
        setTrackedQuestId(body.trackedQuestId ?? null);
        notifySystem(
          body.trackedQuestId
            ? "메인 화면에서 이 업적을 추적합니다."
            : "업적 추적을 해제했습니다.",
        );
        await refresh();
      } catch (error) {
        notifySystem(`✗ ${(error as Error).message}`);
      } finally {
        setTrackingBusy(null);
      }
    },
    [notifySystem, refresh, trackedQuestId],
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
    const claimAllScope: ClaimAllScope = forTutorial
      ? "tutorial"
      : "achievement";
    const claimableCount = scoped.filter(
      (q) => q.status === "claimable",
    ).length;
    const activeCount = scoped.filter((q) => !isDone(q)).length;
    const doneCount = scoped.filter(isDone).length;
    const shown = scoped.filter((q) => (tab === "done" ? isDone(q) : !isDone(q)));

    return (
      <>
        {!forTutorial && achievement && (
          <Card padding="md" className="space-y-2">
            <div className="flex items-center gap-3">
              <Trophy size={24} weight="duotone" className="shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">업적 점수</h2>
                  <strong className="text-lg tabular-nums text-zinc-800 dark:text-zinc-100">
                    {achievement.score.toLocaleString()}점
                  </strong>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {achievement.completed}/{achievement.total}개 달성 · 전체 {achievement.maxScore.toLocaleString()}점
                </p>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-amber-400 dark:bg-amber-600"
                style={{ width: `${Math.min(100, (achievement.score / Math.max(1, achievement.maxScore)) * 100)}%` }}
              />
            </div>
          </Card>
        )}
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

        {!forTutorial && monsterCodexOpen && monsterCodex && (
          <MonsterHuntCodexCard
            codex={monsterCodex}
            onClose={() => setMonsterCodexOpen(false)}
          />
        )}

        {tab === "active" && (
          <Card padding="sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                받을 수 있는 {groupLabel} 보상 {claimableCount}개
              </p>
              <Button
                onClick={() => claimAll(claimAllScope)}
                disabled={
                  claimableCount === 0 || busy !== null || claimAllBusy !== null
                }
                variant="warning"
                size="sm"
                className="shrink-0"
              >
                <Gift size={16} weight="fill" aria-hidden />
                {claimAllBusy === claimAllScope
                  ? "모두 받는 중…"
                  : `모두 받기 (${claimableCount})`}
              </Button>
            </div>
          </Card>
        )}

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
            return (
              <Card key={line.id} padding="md" className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{line.name}</h2>
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {tab === "done"
                      ? `${lineQuests.length}개 완료`
                      : `현재 목표 ${lineQuests.length}개`}
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
                      busy={busy === q.id || claimAllBusy !== null}
                      onClaim={() => claim(q)}
                      tracked={q.id === trackedQuestId}
                      trackingBusy={trackingBusy !== null}
                      onToggleTracking={
                        !forTutorial &&
                        (q.status === "active" || q.status === "claimable")
                          ? () => toggleQuestTracking(q.id)
                          : undefined
                      }
                      onOpenMonsterCodex={
                        q.detailKind === "monster_codex" && monsterCodex
                          ? () => setMonsterCodexOpen(true)
                          : undefined
                      }
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
  if (error === "nothing_to_claim") return "지금 받을 수 있는 보상이 없어요";
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
            퀘스트 {bundle.goal}개를 완료하면{" "}
            {[
              `스태미나 포션 ${bundle.potions}개`,
              bundle.seedPouch ? seedPouchText(bundle.seedPouch) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            를 받아요.
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

export function QuestRow({
  quest,
  busy,
  onClaim,
  tracked = false,
  trackingBusy = false,
  onToggleTracking,
  onOpenMonsterCodex,
}: {
  quest: QuestView;
  busy: boolean;
  onClaim: () => void;
  tracked?: boolean;
  trackingBusy?: boolean;
  onToggleTracking?: () => void;
  onOpenMonsterCodex?: () => void;
}) {
  const { status } = quest;
  const reward = rewardText(quest.reward);

  const icon =
    status === "claimed" ? (
      <CheckCircle
        size={18}
        weight="fill"
        className="shrink-0 text-emerald-600 dark:text-emerald-500"
      />
    ) : status === "claimable" ? (
      <Gift size={18} weight="fill" className="shrink-0 text-amber-500" />
    ) : status === "locked" ? (
      <Lock size={18} className="shrink-0 text-zinc-400 dark:text-zinc-600" />
    ) : (
      <Circle size={18} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
    );

  const mutedText = status === "locked" || status === "claimed";
  const hasProgress = quest.progress != null && quest.goal != null;
  const progress = hasProgress ? Math.min(quest.progress!, quest.goal!) : 0;
  const progressPct = hasProgress
    ? Math.min(100, (progress / Math.max(1, quest.goal!)) * 100)
    : 0;

  return (
    <li
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        status === "claimable"
          ? "border-amber-200 bg-zinc-50 dark:border-amber-900 dark:bg-zinc-900"
          : SURFACE_INSET
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`truncate text-sm font-semibold ${mutedText ? "text-zinc-500 dark:text-zinc-400" : ""}`}>{quest.title}</span>
          {quest.points > 0 && (
            <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              +{quest.points}점
            </span>
          )}
          {status === "active" && (
            <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              진행 중
            </span>
          )}
          {tracked && (
            <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              메인 추적 중
            </span>
          )}
        </div>
        {status !== "claimed" && (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {status === "locked" ? "앞선 목표를 먼저 완료하세요" : quest.desc}
          </p>
        )}
        {status !== "claimed" && hasProgress && (
          <>
            <div className="mt-1 flex justify-end text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {progress.toLocaleString()}/{quest.goal!.toLocaleString()}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full ${status === "claimable" ? "bg-amber-400 dark:bg-amber-600" : "bg-zinc-500 dark:bg-zinc-400"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
        {reward && (
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            보상 {reward}
          </p>
        )}
      </div>
      {(onToggleTracking || onOpenMonsterCodex || status === "claimable" || (status === "active" && quest.href)) && (
        <div className="flex shrink-0 flex-col gap-1">
          {onToggleTracking && (
            <Button
              onClick={onToggleTracking}
              disabled={trackingBusy || busy}
              variant={tracked ? "warning" : "secondary"}
              size="xs"
            >
              <Star size={12} weight={tracked ? "fill" : "regular"} aria-hidden />
              {trackingBusy ? "처리 중…" : tracked ? "추적 해제" : "메인 표시"}
            </Button>
          )}
          {onOpenMonsterCodex && (
            <Button
              onClick={onOpenMonsterCodex}
              variant="secondary"
              size="xs"
            >
              처치 현황
            </Button>
          )}
          {status === "claimable" && (
            <Button
              onClick={onClaim}
              disabled={busy}
              variant="secondary"
              size="xs"
            >
              {busy ? "처리 중…" : reward ? "받기" : "완료"}
            </Button>
          )}
          {status === "active" && quest.href && (
            <Link
              href={quest.href}
              aria-label={`${quest.title} 하러 가기`}
              className="ui-game-button inline-flex min-h-7 items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              이동
              <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

export function MonsterHuntCodexCard({
  codex,
  onClose,
}: {
  codex: MonsterHuntCodexView;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<"missing" | "all">("missing");
  const filtered =
    filter === "missing"
      ? codex.entries.filter((entry) => !entry.defeated)
      : codex.entries;
  const groups = new Map<string, typeof filtered>();
  for (const entry of filtered) {
    const area = entry.areas.join(" · ") || "기타";
    const entries = groups.get(area) ?? [];
    entries.push(entry);
    groups.set(area, entries);
  }

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">몬스터 처치 현황</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            현재 사냥 가능 {codex.currentKilled}/{codex.huntableSpecies}종 처치
            {codex.legacyKilled > 0
              ? ` · 과거 처치 기록 ${codex.legacyKilled}종 포함 업적 진행 ${codex.recordedSpecies}종`
              : ""}
          </p>
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          size="xs"
          aria-label="몬스터 처치 현황 닫기"
        >
          <X size={16} aria-hidden />
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => setFilter("missing")}
          variant={filter === "missing" ? "primary" : "secondary"}
          size="xs"
        >
          미처치 {codex.huntableSpecies - codex.currentKilled}종
        </Button>
        <Button
          onClick={() => setFilter("all")}
          variant={filter === "all" ? "primary" : "secondary"}
          size="xs"
        >
          전체 {codex.huntableSpecies}종
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className={`${SURFACE_INSET} p-3 text-sm text-emerald-700 dark:text-emerald-300`}>
          현재 사냥 가능한 몬스터를 모두 처치했습니다.
        </div>
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {[...groups.entries()].map(([area, entries]) => (
            <section key={area} className={`${SURFACE_INSET} p-3`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  {area}
                </h3>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {filter === "missing"
                    ? `${entries.length}종 미처치`
                    : `${entries.filter((entry) => entry.defeated).length}/${entries.length}종`}
                </span>
              </div>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {entries.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex min-h-8 items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200"
                  >
                    {entry.defeated ? (
                      <CheckCircle
                        size={15}
                        weight="fill"
                        className="shrink-0 text-emerald-500"
                        aria-label="처치 완료"
                      />
                    ) : (
                      <Circle
                        size={15}
                        className="shrink-0 text-zinc-400"
                        aria-label="미처치"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {entry.kills > 0 && (
                      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {entry.kills.toLocaleString()}회
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
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
