"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Sparkle, Scroll } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  acceptGuildQuest,
  fetchThisWeekGuildQuests,
  GuildError,
  type GuildQuestInstanceShape,
  type GuildQuestsThisWeekResponse,
} from "./api";
import {
  getGuildQuestById,
  type GuildQuestDef,
} from "@/adventure/data/guildQuests";
import { ITEMS } from "@/adventure/data/items";
import { MATERIALS } from "@/adventure/data/materials";

const GRADE_COLOR: Record<string, string> = {
  G: "text-zinc-500 dark:text-zinc-400",
  F: "text-zinc-600 dark:text-zinc-300",
  E: "text-emerald-600 dark:text-emerald-400",
  D: "text-sky-600 dark:text-sky-400",
  C: "text-blue-600 dark:text-blue-400",
  B: "text-violet-600 dark:text-violet-400",
  A: "text-amber-600 dark:text-amber-400",
  S: "text-rose-600 dark:text-rose-400",
};

export function GuildQuestsPanel({
  onUpdated,
}: {
  onUpdated?: () => void;
}) {
  const [data, setData] = useState<GuildQuestsThisWeekResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchThisWeekGuildQuests();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 기존 proposed 행 일괄 수락 (하위호환 — 신규 발행분은 즉시 active).
  const handleAcceptAll = async (firstProposedId: number) => {
    setBusy(true);
    setError(null);
    try {
      await acceptGuildQuest(firstProposedId);
      await load();
      onUpdated?.();
    } catch (e) {
      const msg =
        e instanceof GuildError
          ? e.message
          : e instanceof Error
            ? e.message
            : "수락 실패";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <Card padding="md">
        <Skeleton rows={3} />
      </Card>
    );
  }

  if (!data?.guild) {
    return null;
  }

  const { guild, active, proposed } = data;
  const hasActive = active.length > 0;
  const hasProposed = proposed.length > 0;

  return (
    <Card padding="md">
      <div className="space-y-3">
        <header>
          <div className="flex items-center gap-2">
            <Trophy size={18} weight="duotone" className="text-amber-500" />
            <h3 className="text-base font-semibold">길드 의뢰</h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            매주 월요일 00시(KST) 3종이 동시 발행됩니다.
          </p>
        </header>

        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        {/* 진행 중인 의뢰 목록 */}
        {hasActive && (
          <ul className="space-y-2">
            {active.map((inst) => (
              <ActiveQuestCard key={inst.id} instance={inst} />
            ))}
          </ul>
        )}

        {/* proposed 행 (구버전 DB 잔존분 — 마스터가 일괄 시작) */}
        {hasProposed && (
          <ProposedSection
            proposed={proposed}
            isMaster={guild.isMaster}
            busy={busy}
            onAcceptAll={handleAcceptAll}
          />
        )}

        {!hasActive && !hasProposed && (
          <EmptyState
            icon={<Scroll size={32} weight="duotone" />}
            title="이번 주 의뢰가 없습니다"
            message="다음 월요일 00시(KST) 에 새 의뢰가 발행됩니다."
          />
        )}
      </div>
    </Card>
  );
}

function ActiveQuestCard({ instance }: { instance: GuildQuestInstanceShape }) {
  const def = getGuildQuestById(instance.questDefId);
  if (!def) {
    return (
      <li className="rounded-md border border-zinc-200 p-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        알 수 없는 의뢰 ({instance.questDefId})
      </li>
    );
  }
  const pct = Math.min(100, (instance.progress / instance.target) * 100);
  const completed = instance.status === "completed";
  return (
    <li
      className={`space-y-2 rounded-md border p-3 ${
        completed
          ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40"
          : "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkle
            size={14}
            weight="fill"
            className={
              completed
                ? "text-zinc-400 dark:text-zinc-500"
                : "text-emerald-600 dark:text-emerald-400"
            }
          />
          <span className="text-sm font-semibold">{def.name}</span>
          <span
            className={`text-[11px] font-bold ${GRADE_COLOR[def.grade] ?? ""}`}
          >
            [{def.grade}]
          </span>
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {instance.progress} / {instance.target}
          {completed && (
            <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-400">
              완료
            </span>
          )}
        </span>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {def.description}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        {describeTask(def)}
      </p>
      {!completed && (
        <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <RewardLine def={def} />
    </li>
  );
}

function ProposedSection({
  proposed,
  isMaster,
  busy,
  onAcceptAll,
}: {
  proposed: GuildQuestInstanceShape[];
  isMaster: boolean;
  busy: boolean;
  onAcceptAll: (firstId: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        이번 주 의뢰 {proposed.length}종이 대기 중입니다.
        {isMaster ? " 아래 버튼으로 전체 시작하세요." : ""}
      </p>
      <ul className="space-y-1.5">
        {proposed.map((inst) => {
          const def = getGuildQuestById(inst.questDefId);
          return (
            <li
              key={inst.id}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{def?.name ?? inst.questDefId}</span>
                {def && (
                  <span className={`text-[11px] font-bold ${GRADE_COLOR[def.grade] ?? ""}`}>
                    [{def.grade}]
                  </span>
                )}
              </div>
              {def && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {describeTask(def)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {isMaster ? (
        <button
          type="button"
          onClick={() => onAcceptAll(proposed[0].id)}
          disabled={busy}
          className="w-full rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          이번 주 의뢰 전체 시작
        </button>
      ) : (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          마스터가 시작하면 의뢰가 활성화됩니다.
        </p>
      )}
    </div>
  );
}

function RewardLine({ def }: { def: GuildQuestDef }) {
  const r = def.reward;
  const parts: string[] = [];
  parts.push(`길드 명성 +${r.fame}`);
  parts.push(`멤버당 ${r.goldPerMember.toLocaleString()} G`);
  if (r.materialsPerMember && r.materialsPerMember.length > 0) {
    for (const m of r.materialsPerMember) {
      const name = MATERIALS[m.materialId as keyof typeof MATERIALS]?.name ?? m.materialId;
      parts.push(`${name} ×${m.count}`);
    }
  }
  if (r.itemsPerMember && r.itemsPerMember.length > 0) {
    for (const it of r.itemsPerMember) {
      const name = ITEMS[it.itemId]?.name ?? it.itemId;
      parts.push(`${name} ×${it.count}`);
    }
  }
  return (
    <p className="text-[11px] text-amber-700 dark:text-amber-400">
      🎁 {parts.join(" · ")}
    </p>
  );
}

function describeTask(def: GuildQuestDef): string {
  const t = def.task;
  if (t.kind === "kill_monster") {
    return `${t.monsterName} ${t.count}마리 처치`;
  }
  if (t.kind === "kill_boss") {
    return `보스 ${t.monsterName} ${t.count}회 처치`;
  }
  if (t.kind === "collect_material") {
    const name = MATERIALS[t.materialId as keyof typeof MATERIALS]?.name ?? t.materialId;
    return `${name} ${t.count}개 납품`;
  }
  return "";
}
