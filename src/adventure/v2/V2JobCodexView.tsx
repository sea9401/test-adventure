"use client";

import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { CheckCircle, Lock } from "@phosphor-icons/react";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";

// 직업 도감 — 읽기 전용. 직업 해금·스킬 수집을 평면 목록으로 표기. 직군(계열) 묶음·정복 바·수집
//   포인트/칭호는 폐기(오너 요청 — 불필요한 복잡도). 파워 무관. 데이터는 /api/v2/me/job-codex 또는 mock(dev).
//   라이브 진입은 모험의 서(V2CodexView) "직업" 탭 — 거기선 JobCodexList 만 재사용(요약은 탭 부제가 담당).

// 직업 목록 카드(헤더·요약 없이) — 모험의 서 "직업" 탭이 그대로 재사용한다.
export function JobCodexList({ codex }: { codex: JobCodex }) {
  return (
    <Card padding="md">
      <ul className="space-y-1.5">
        {codex.jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
    </Card>
  );
}

// 독립 화면(dev 프리뷰 전용) — 목록에 헤더/요약을 덧댄다. 라이브 진입은 모험의 서 탭.
export function V2JobCodexView({
  codex,
  onBack,
}: {
  codex: JobCodex;
  onBack: () => void;
}) {
  const jobsUnlocked = codex.jobs.filter((j) => j.unlocked).length;
  const jobsTotal = codex.jobs.length;
  // 스킬 수집 완료 직업 수 — 그 직업의 시그니처 스킬을 전부 배운 직업.
  const jobsCollected = codex.jobs.filter(
    (j) => j.skillsTotal > 0 && j.skillsLearned === j.skillsTotal,
  ).length;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="직업 도감" onBack={onBack} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        거쳐온 직업과 모은 스킬의 기록.{" "}
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          해금 {jobsUnlocked}/{jobsTotal} · 스킬 수집 {jobsCollected}/
          {jobsTotal}
        </span>
      </p>
      <JobCodexList codex={codex} />
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
