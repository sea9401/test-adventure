"use client";

import { useEffect, useMemo, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import {
  CheckCircle,
  Lock,
  MagnifyingGlass,
  Star,
  X,
} from "@phosphor-icons/react";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";
import {
  JOB_GOAL_STORAGE_KEY,
  JOB_TAG_FILTERS,
  jobTags,
  matchesJobExplorerFilters,
} from "./jobExplorer";

// 직업 도감 — 읽기 전용. 직업 해금·스킬 수집을 평면 목록으로 표기. 직군(계열) 묶음·정복 바·수집
//   포인트/칭호는 폐기(오너 요청 — 불필요한 복잡도). 파워 무관. 데이터는 /api/v2/me/job-codex 또는 mock(dev).
//   라이브 진입은 모험의 서(V2CodexView) "직업" 탭 — 거기선 JobCodexList 만 재사용(요약은 탭 부제가 담당).

// 직업 목록 카드(헤더·요약 없이) — 모험의 서 "직업" 탭이 그대로 재사용한다.
export function JobCodexList({ codex }: { codex: JobCodex }) {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const [goalJobId, setGoalJobId] = useState<string | null>(null);
  const currentJobId = codex.jobs.find((job) => job.isCurrent)?.id ?? null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(JOB_GOAL_STORAGE_KEY);
      if (stored) queueMicrotask(() => setGoalJobId(stored));
    } catch {
      // ignore storage-disabled browsers
    }
  }, []);

  const setGoal = (jobId: string | null) => {
    setGoalJobId(jobId);
    try {
      if (jobId) localStorage.setItem(JOB_GOAL_STORAGE_KEY, jobId);
      else localStorage.removeItem(JOB_GOAL_STORAGE_KEY);
    } catch {
      // ignore storage-disabled browsers
    }
  };

  const filteredJobs = useMemo(
    () =>
      codex.jobs.filter((job) =>
        matchesJobExplorerFilters(job, query, activeTags, { currentJobId }),
      ),
    [activeTags, codex.jobs, currentJobId, query],
  );
  const goalJobs = filteredJobs.filter((job) => job.id === goalJobId);
  const currentJobs = filteredJobs.filter(
    (job) => job.isCurrent && job.id !== goalJobId,
  );
  const unlockedJobs = filteredJobs.filter(
    (job) => job.unlocked && !job.isCurrent && job.id !== goalJobId,
  );
  const lockedJobs = filteredJobs.filter(
    (job) => !job.unlocked && job.id !== goalJobId,
  );

  function toggleTag(key: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card padding="md" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">직업 찾기</h3>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {filteredJobs.length}/{codex.jobs.length}
        </span>
      </div>
      <div className="relative">
        <MagnifyingGlass
          size={15}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="직업명, 조건, 스탯 검색"
          className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-8 text-sm outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label="검색 지우기"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {JOB_TAG_FILTERS.map((tag) => {
          const active = activeTags.has(tag.key);
          return (
            <button
              key={tag.key}
              type="button"
              onClick={() => toggleTag(tag.key)}
              className={`h-7 shrink-0 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition ${
                active
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-300"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      {filteredJobs.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          조건에 맞는 직업이 없어요.
        </p>
      ) : (
        <div className="space-y-3">
          <JobSection
            title="목표 직업"
            jobs={goalJobs}
            goalJobId={goalJobId}
            currentJobId={currentJobId}
            onSetGoal={setGoal}
          />
          <JobSection
            title="현재 직업"
            jobs={currentJobs}
            goalJobId={goalJobId}
            currentJobId={currentJobId}
            onSetGoal={setGoal}
          />
          <JobSection
            title="해금된 직업"
            jobs={unlockedJobs}
            goalJobId={goalJobId}
            currentJobId={currentJobId}
            onSetGoal={setGoal}
          />
          <JobSection
            title="조건 부족"
            jobs={lockedJobs}
            goalJobId={goalJobId}
            currentJobId={currentJobId}
            onSetGoal={setGoal}
          />
        </div>
      )}
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
  // 목록 = 해금분만(잠긴 직업 제외). 분모는 전체 직업 수(codex.totalJobs)로 진척 유지.
  const jobsUnlocked = codex.jobs.filter((j) => j.unlocked).length;
  const jobsTotal = codex.totalJobs;
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

function JobSection({
  title,
  jobs,
  goalJobId,
  currentJobId,
  onSetGoal,
}: {
  title: string;
  jobs: JobCodex["jobs"];
  goalJobId: string | null;
  currentJobId: string | null;
  onSetGoal: (jobId: string | null) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {title}
        </h4>
        <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
          {jobs.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isGoal={job.id === goalJobId}
            currentJobId={currentJobId}
            onSetGoal={() => onSetGoal(job.id === goalJobId ? null : job.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function JobRow({
  job,
  isGoal,
  currentJobId,
  onSetGoal,
}: {
  job: JobCodex["jobs"][number];
  isGoal: boolean;
  currentJobId: string | null;
  onSetGoal: () => void;
}) {
  const tags = jobTags(job, { currentJobId }).slice(0, 4);
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        job.unlocked
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
          : "border-zinc-200/60 bg-zinc-50/40 opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900/40"
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
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
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
        <span className="text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
          숙련도 {job.mastery.toLocaleString("ko-KR")}
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          해금 · {job.condition}
        </span>
      </div>
      <button
        type="button"
        onClick={onSetGoal}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${
          isGoal
            ? "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-zinc-300 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:border-zinc-700 dark:hover:bg-zinc-800"
        }`}
        aria-label={isGoal ? "목표 해제" : "목표로 설정"}
        title={isGoal ? "목표 해제" : "목표로 설정"}
      >
        <Star size={15} weight={isGoal ? "fill" : "regular"} />
      </button>
    </li>
  );
}
