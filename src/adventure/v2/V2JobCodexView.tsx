"use client";

import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { Card } from "@/components/ui/Card";
import { CheckCircle, Lock } from "@phosphor-icons/react";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";
import { V2CollectionTitleShop } from "./V2CollectionTitleShop";

// 직업 도감(A 메타 PR-1) — 읽기 전용 수집 대시보드. 4 직군별 정복 진행 + 직업 해금·패시브 수집.
//   파워 무관(순수 표시). 데이터는 /api/v2/me/job-codex 또는 mock(dev).

export function V2JobCodexView({
  codex,
  onBack,
}: {
  codex: JobCodex;
  onBack: () => void;
}) {
  const jobsUnlocked = codex.jobs.filter((j) => j.unlocked).length;
  const jobsTotal = codex.jobs.length;
  const groupsMastered = codex.groups.filter((g) => g.mastered).length;
  // 스킬 수집 완료 직업 수 — 그 직업의 시그니처 스킬을 전부 배운 직업.
  const jobsCollected = codex.jobs.filter(
    (j) => j.skillsTotal > 0 && j.skillsLearned === j.skillsTotal,
  ).length;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <div>
          <h1 className="text-lg font-bold">직업 도감</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            거쳐온 직업과 모은 스킬의 기록.{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              해금 {jobsUnlocked}/{jobsTotal} · 직군 정복 {groupsMastered}/
              {codex.groups.length} · 스킬 수집 {jobsCollected}/{jobsTotal}
            </span>
          </p>
        </div>
        {/* 수집 포인트(수집한 패시브 수) + 등급(비파워 칭호) */}
        <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/70 px-3 py-2 dark:border-teal-800/60 dark:bg-teal-950/30">
          <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {codex.rank.title}
          </span>
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            수집 포인트{" "}
            <strong className="tabular-nums">{codex.collectionPoints}</strong>
            {codex.collectionPointsSpent > 0 && (
              <span className="text-zinc-400 dark:text-zinc-500">
                {" "}
                · 잔액{" "}
                <strong className="tabular-nums text-teal-700 dark:text-teal-400">
                  {codex.collectionPointsAvailable}
                </strong>
              </span>
            )}
          </span>
          {codex.rank.next && (
            <span className="ml-auto text-[11px] text-zinc-400 dark:text-zinc-500">
              다음 {codex.rank.next.title}까지{" "}
              {codex.rank.next.at - codex.collectionPoints}
            </span>
          )}
        </div>
      </HeaderPanel>

      {/* 수집 포인트 소비형 sink — 수집 칭호 상점(자체 fetch·코어루프 컨텍스트만 노출) */}
      <V2CollectionTitleShop />

      <div className="space-y-3">
        {codex.groups.map((group) => {
          const jobs = codex.jobs.filter((j) => j.group === group.group);
          const pct = Math.max(
            0,
            Math.min(1, group.cumLevel / group.masteredAt),
          );
          return (
            <Card key={group.group} padding="md" className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{group.name} 계열</h2>
                {group.mastered ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    정복
                  </span>
                ) : (
                  <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    정복 {group.cumLevel}/{group.masteredAt}
                  </span>
                )}
              </div>
              {/* 직군 정복(cumLevel) 진행 바 */}
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full transition-all ${group.mastered ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>

              <ul className="space-y-1.5">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function JobRow({ job }: { job: JobCodex["jobs"][number] }) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        job.unlocked
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          : "border-zinc-200/60 bg-zinc-50/40 opacity-50 dark:border-zinc-800/60 dark:bg-zinc-900/40"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{job.name}</span>
          {job.isCurrent && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              현재 직업
            </span>
          )}
          {!job.unlocked && (
            <Lock size={12} weight="duotone" className="shrink-0 text-zinc-400" />
          )}
        </div>
        {job.skillsTotal > 0 &&
          (() => {
            const done = job.skillsLearned >= job.skillsTotal;
            return (
              <span className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {done ? (
                  <CheckCircle
                    size={13}
                    weight="fill"
                    className="shrink-0 text-emerald-500"
                  />
                ) : (
                  <span className="inline-block h-[13px] w-[13px] shrink-0 rounded-full border border-zinc-300 dark:border-zinc-600" />
                )}
                {done ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    스킬 수집 완료
                  </span>
                ) : (
                  <span>
                    스킬 수집 {job.skillsLearned}/{job.skillsTotal}
                  </span>
                )}
              </span>
            );
          })()}
      </div>
    </li>
  );
}
