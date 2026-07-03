"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  MagnifyingGlass,
  Star,
  X,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import {
  JOB_GOAL_STORAGE_KEY,
  JOB_TAG_FILTERS,
  isJobVisibleInShrine,
  jobTags,
  matchesJobExplorerFilters,
} from "./jobExplorer";

// 직업 시스템 v2 전직 화면(직업 숙련도 점진 공개).
// 조건이 공개된 직업을 검색/태그/목표로 탐색하고, 해금된 직업과 조건 부족 직업을 현재 캐릭터 기준으로 나눈다.
// 스킬·패시브는 스킬 화면에서 학습·장착(여긴 직업명+해금조건만).

export type JobLadderEntry = {
  id: string;
  name: string;
  // 카탈로그 계층(정렬/디버그용). 전직 화면은 차수 UI 대신 직업명·조건·숙련도를 보여준다.
  tier: number;
  // 해금 조건 충족 여부. 해금 조건이 공개된 잠긴 직업만 조건/목표 표시를 위해 목록에 포함된다.
  unlocked?: boolean;
  // 해금 조건 공개 여부. false인 잠긴 직업은 성장의 신전 목록에서 숨긴다.
  conditionRevealed?: boolean;
  // 해금 조건(공유용 표기). 예: "Lv 100 달성" / "견습 병사 숙련도 100".
  condition: string;
  // 이 직업에 쌓은 숙련도(직업별/직군). 직업별 진행도 확인용.
  cumLevel?: number;
  // 직업 내장 스탯 보너스(현재 직업일 때 적용) 표기. 예: "활력 +12 · 힘 +6". 없으면 빈 문자열.
  bonus?: string;
  // 그 직업의 시그니처 스킬을 전부 배웠는가(직업 도감과 동일 기준) — "수집 완료" 배지용.
  skillsCollected?: boolean;
};

type Pending = { id: string; name: string; current: boolean };

export function V2JobLadder({
  level,
  currentJobName,
  currentJobId,
  atLevelCap,
  jobs,
  onChanged,
}: {
  level: number;
  // 현재 직업 표시명 — 서버가 전체 카탈로그 기준으로 산출(필터된 목록과 무관, 모험가 폴백 포함).
  currentJobName: string;
  currentJobId: string;
  atLevelCap: boolean;
  jobs: JobLadderEntry[];
  onChanged: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const [goalJobId, setGoalJobId] = useState<string | null>(null);

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

  const visibleJobs = useMemo(
    () => jobs.filter(isJobVisibleInShrine),
    [jobs],
  );
  const filteredJobs = useMemo(
    () =>
      visibleJobs.filter((job) =>
        matchesJobExplorerFilters(job, query, activeTags, { currentJobId }),
      ),
    [activeTags, currentJobId, query, visibleJobs],
  );
  const goalJobs = filteredJobs.filter((job) => job.id === goalJobId);
  const currentJobs = filteredJobs.filter(
    (job) => job.id === currentJobId && job.id !== goalJobId,
  );
  const availableJobs = filteredJobs.filter(
    (job) =>
      job.id !== currentJobId && job.id !== goalJobId && job.unlocked !== false,
  );
  const lockedJobs = filteredJobs.filter(
    (job) =>
      job.id !== currentJobId && job.id !== goalJobId && job.unlocked === false,
  );

  function toggleTag(key: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function confirmReJob() {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/advance-class", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId: pending.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `Lv${j.required ?? V2_LEVEL_CAP} 도달 후 전직할 수 있어요`
            : j?.error === "job_locked"
              ? "아직 해금되지 않은 직업이에요"
              : j?.error === "bad_target"
                ? "선택할 수 없는 직업이에요"
                : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(
        pending.current
          ? `✓ ${pending.name} 재전직 완료. 레벨 1로 돌아왔어요`
          : `✓ ${pending.name}(으)로 전직 완료. 레벨 1로 돌아왔어요`,
      );
      setPending(null);
      await onChanged();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 현재 직업 + 전직 안내 */}
      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">현재 {currentJobName}</h2>
          <span
            className={`text-xs tabular-nums ${
              atLevelCap
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            Lv {level} / {V2_LEVEL_CAP}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {atLevelCap
            ? "해금된 직업으로 전직할 수 있어요. 전직하면 레벨이 1로 돌아가고 다시 성장합니다."
            : `Lv ${V2_LEVEL_CAP}에 도달하면 전직할 수 있어요. 사냥으로 직업 숙련도를 쌓으면 새 직업이 해금됩니다.`}
        </p>
      </Card>

      {/* 전직 가능 직업 — 검색/태그/목표 기반 탐색. 해금 조건이 공개된 직업만 표시. */}
      <Card padding="md" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">직업 찾기</h3>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {filteredJobs.length}/{visibleJobs.length}
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
            className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-8 text-sm outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950"
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
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {tag.label}
              </button>
            );
          })}
        </div>

        {visibleJobs.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {atLevelCap
              ? "아직 해금된 전직 후보가 없어요. 사냥으로 직업 숙련도를 더 쌓아 보세요."
              : `Lv ${V2_LEVEL_CAP}에 도달하면 전직 후보가 표시됩니다.`}
          </p>
        ) : filteredJobs.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            조건에 맞는 직업이 없어요.
          </p>
        ) : (
          <div className="space-y-3">
            <JobSection
              title="목표 직업"
              jobs={goalJobs}
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={(job) =>
                setPending({
                  id: job.id,
                  name: job.name,
                  current: job.id === currentJobId,
                })
              }
            />
            <JobSection
              title="현재 직업"
              jobs={currentJobs}
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={(job) =>
                setPending({
                  id: job.id,
                  name: job.name,
                  current: job.id === currentJobId,
                })
              }
            />
            <JobSection
              title={atLevelCap ? "전직 가능" : "해금됨"}
              jobs={availableJobs}
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={(job) =>
                setPending({
                  id: job.id,
                  name: job.name,
                  current: job.id === currentJobId,
                })
              }
            />
            <JobSection
              title="조건 부족"
              jobs={lockedJobs}
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={(job) =>
                setPending({
                  id: job.id,
                  name: job.name,
                  current: job.id === currentJobId,
                })
              }
            />
          </div>
        )}
      </Card>

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
      )}

      {/* 전직 확인 모달 — 레벨 1 리셋은 되돌릴 수 없어 명시 확인. */}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              {pending.current
                ? `${pending.name} 재전직`
                : `${pending.name}(으)로 전직`}
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {pending.current
                ? "같은 직업으로 재전직해요. 레벨이 1로 돌아가고 스탯이 다시 자라기 시작하지만, 숙련도와 성장 한계치는 그대로 유지됩니다."
                : "전직하면 레벨이 1로 돌아가고 스탯이 다시 자라기 시작해요. 숙련도와 성장 한계치는 그대로 유지됩니다."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmReJob}
                disabled={busy}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy
                  ? pending.current
                    ? "재전직 중…"
                    : "전직 중…"
                  : pending.current
                    ? "재전직 (Lv 1로 초기화)"
                    : "전직 (Lv 1로 초기화)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobSection({
  title,
  jobs,
  currentJobId,
  atLevelCap,
  goalJobId,
  onSetGoal,
  onPick,
}: {
  title: string;
  jobs: JobLadderEntry[];
  currentJobId: string;
  atLevelCap: boolean;
  goalJobId: string | null;
  onSetGoal: (jobId: string | null) => void;
  onPick: (job: JobLadderEntry) => void;
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
            isCurrent={job.id === currentJobId}
            isGoal={job.id === goalJobId}
            atLevelCap={atLevelCap}
            currentJobId={currentJobId}
            onSetGoal={() => onSetGoal(job.id === goalJobId ? null : job.id)}
            onPick={() => onPick(job)}
          />
        ))}
      </ul>
    </section>
  );
}

function JobRow({
  job,
  isCurrent,
  isGoal,
  atLevelCap,
  currentJobId,
  onSetGoal,
  onPick,
}: {
  job: JobLadderEntry;
  isCurrent: boolean;
  isGoal: boolean;
  atLevelCap: boolean;
  currentJobId: string;
  onSetGoal: () => void;
  onPick: () => void;
}) {
  const unlocked = job.unlocked !== false;
  const tags = jobTags(job, { currentJobId }).slice(0, 4);
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        unlocked
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          : "border-zinc-200/70 bg-zinc-50/50 dark:border-zinc-800/70 dark:bg-zinc-900/50"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{job.name}</span>
          {isCurrent && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              현재 직업
            </span>
          )}
          {job.skillsCollected && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              <CheckCircle size={11} weight="fill" />
              수집 완료
            </span>
          )}
          {!unlocked && (
            <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              잠김
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          숙련도 {job.cumLevel ?? 0}
        </span>
        {job.bonus && (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            직업 보너스 · {job.bonus}
          </span>
        )}
        {job.conditionRevealed !== false && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            해금 조건 · {job.condition}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onSetGoal}
          className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
            isGoal
              ? "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-zinc-300 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
          aria-label={isGoal ? "목표 해제" : "목표로 설정"}
          title={isGoal ? "목표 해제" : "목표로 설정"}
        >
          <Star size={15} weight={isGoal ? "fill" : "regular"} />
        </button>
        {/* 현재 직업도 동일 직업 재전직(레벨1 리셋·숙련도/성장 한계 유지) 허용. */}
        <button
          type="button"
          onClick={onPick}
          disabled={!atLevelCap || !unlocked}
          className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
        >
          {!unlocked ? "조건 부족" : isCurrent ? "재전직" : "전직"}
        </button>
      </div>
    </li>
  );
}
