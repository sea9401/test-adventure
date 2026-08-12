"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  MagnifyingGlass,
  Star,
  TreeStructure,
  X,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import { useSystemMessageState } from "./RewardToastProvider";
import { JobRoadmapDialog } from "./JobRoadmapDialog";
import {
  JOB_GOAL_STORAGE_KEY,
  JOB_TAG_FILTERS,
  compareJobExplorerLineOrder,
  isJobVisibleInShrine,
  jobCardTags,
  jobCultivationSummary,
  matchesJobExplorerFilters,
  resolveJobAdvanceAction,
  toggleJobTagFilter,
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
  // 실제 전직 이력. 단순 해금과 구분하며, 레거시 계정은 숙련도 기록으로 보완한다.
  visited?: boolean;
  // 직업 내장 스탯 보너스(현재 직업일 때 적용) 표기. 예: "활력 +12 · 힘 +6". 없으면 빈 문자열.
  bonus?: string;
  // 로드맵에서 다른 직업을 선택했을 때 보여주는 대표 스킬의 가벼운 미리보기.
  signatureSkills?: Array<{
    id: string;
    name: string;
    kind: "active" | "passive";
  }>;
  // 그 직업의 시그니처 스킬을 전부 배웠는가(직업 도감과 동일 기준) — "수집 완료" 배지용.
  skillsCollected?: boolean;
};

type Pending = { id: string; name: string; current: boolean };

export function V2JobLadder({
  level,
  currentJobId,
  atLevelCap,
  revisitExpedited,
  rejobRequiredLevel,
  jobs,
  onChanged,
}: {
  level: number;
  // 현재 직업 표시명 — 서버가 전체 카탈로그 기준으로 산출(필터된 목록과 무관, 모험가 폴백 포함).
  currentJobName: string;
  currentJobId: string;
  atLevelCap: boolean;
  /** 과거에 수련한 현 직업에서 다른 직업으로 즉시 빠져나갈 수 있는 상태. */
  revisitExpedited: boolean;
  /** 현재 직업에서 다른 직업으로 전직할 때 필요한 캐릭터 레벨. 생산직은 1(제한 없음). */
  rejobRequiredLevel: number;
  jobs: JobLadderEntry[];
  onChanged: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());
  const [goalJobId, setGoalJobId] = useState<string | null>(null);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const closeRoadmap = useCallback(() => setRoadmapOpen(false), []);

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
    () => jobs.filter(isJobVisibleInShrine).sort(compareJobExplorerLineOrder),
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
  const isFiltering = query.trim().length > 0 || activeTags.size > 0;
  const hasNoCharacterLevelRequirement = rejobRequiredLevel <= 1;
  // 재방문 패스는 다른 직업으로 이동할 때만 적용한다. 같은 직업을 반복 초기화해
  // 환생 기록 등을 우회하지 못하도록 현재 직업 재전직은 원래 레벨 조건을 요구한다.
  const currentJobSelectable = revisitExpedited
    ? level >= rejobRequiredLevel
    : atLevelCap;

  function toggleTag(key: string) {
    setActiveTags((prev) => toggleJobTagFilter(prev, key));
  }

  function pickJob(job: Pick<JobLadderEntry, "id" | "name">) {
    setMsg(null);
    setPending({
      id: job.id,
      name: job.name,
      current: job.id === currentJobId,
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
            ? `전투 Lv ${j.required ?? V2_LEVEL_CAP} 도달 후 전직할 수 있어요`
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
      setRoadmapOpen(false);
      await onChanged();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {revisitExpedited ? (
        <StatusBanner tone="info">
          <strong>이전에 수련한 직업이라 전직 레벨 제한이 없어요.</strong>{" "}
          놓친 스킬을 배운 뒤 바로 다른 직업으로 이동할 수 있습니다.
        </StatusBanner>
      ) : hasNoCharacterLevelRequirement ? (
        <StatusBanner tone="info">
          <strong>생산직 전직에는 캐릭터 레벨 제한이 없어요.</strong>{" "}
          생산직 계보는 아래에 표시된 생활 숙련 조건만 충족하면 바로 전직할 수
          있습니다.
        </StatusBanner>
      ) : null}

      {/* 전직 가능 직업 — 검색/태그/목표 기반 탐색. 해금 조건이 공개된 직업만 표시. */}
      <Card padding="md" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">직업 찾기</h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {filteredJobs.length}/{visibleJobs.length}
            </span>
            <button
              type="button"
              onClick={() => setRoadmapOpen(true)}
              className="flex min-h-8 items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
            >
              <TreeStructure size={14} weight="duotone" />
              전직 로드맵
            </button>
          </div>
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

        {visibleJobs.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {atLevelCap
              ? "아직 해금된 전직 후보가 없어요. 사냥으로 직업 숙련도를 더 쌓아 보세요."
              : `전투 Lv ${rejobRequiredLevel}에 도달하면 전직 후보가 표시됩니다.`}
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
              currentJobSelectable={currentJobSelectable}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={pickJob}
            />
            <JobSection
              title="현재 직업"
              jobs={currentJobs}
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              currentJobSelectable={currentJobSelectable}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={pickJob}
            />
            <JobSection
              title={atLevelCap ? "전직 가능" : "해금됨"}
              jobs={availableJobs}
              previewLimit={4}
              forceExpanded={isFiltering}
              useGrid
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              currentJobSelectable={currentJobSelectable}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={pickJob}
            />
            <JobSection
              title="조건 부족"
              jobs={lockedJobs}
              collapsedByDefault
              forceExpanded={isFiltering}
              useGrid
              currentJobId={currentJobId}
              atLevelCap={atLevelCap}
              currentJobSelectable={currentJobSelectable}
              goalJobId={goalJobId}
              onSetGoal={setGoal}
              onPick={pickJob}
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
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
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

      {roadmapOpen ? (
        <JobRoadmapDialog
          jobs={jobs}
          currentJobId={currentJobId}
          goalJobId={goalJobId}
          atLevelCap={atLevelCap}
          currentJobSelectable={currentJobSelectable}
          onSetGoal={setGoal}
          onPickJob={pickJob}
          onClose={closeRoadmap}
        />
      ) : null}
    </div>
  );
}

function JobSection({
  title,
  jobs,
  currentJobId,
  atLevelCap,
  currentJobSelectable,
  goalJobId,
  onSetGoal,
  onPick,
  previewLimit,
  collapsedByDefault = false,
  forceExpanded = false,
  useGrid = false,
}: {
  title: string;
  jobs: JobLadderEntry[];
  currentJobId: string;
  atLevelCap: boolean;
  currentJobSelectable: boolean;
  goalJobId: string | null;
  onSetGoal: (jobId: string | null) => void;
  onPick: (job: JobLadderEntry) => void;
  previewLimit?: number;
  collapsedByDefault?: boolean;
  forceExpanded?: boolean;
  useGrid?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (jobs.length === 0) return null;

  const isOpen = forceExpanded || !collapsedByDefault || expanded;
  const isPreviewing =
    isOpen &&
    !forceExpanded &&
    !expanded &&
    previewLimit !== undefined &&
    jobs.length > previewLimit;
  const visibleJobs = !isOpen
    ? []
    : isPreviewing
      ? jobs.slice(0, previewLimit)
      : jobs;
  const hiddenCount = jobs.length - visibleJobs.length;
  const canReturnToPreview =
    !forceExpanded &&
    !collapsedByDefault &&
    expanded &&
    previewLimit !== undefined &&
    jobs.length > previewLimit;

  return (
    <section className="space-y-1.5">
      {collapsedByDefault && !forceExpanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={isOpen}
          className={`${SURFACE_INSET} flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800`}
        >
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {title} <span className="tabular-nums text-zinc-400">{jobs.length}</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {isOpen ? "접기" : "펼치기"}
            {isOpen ? <CaretUp size={13} /> : <CaretDown size={13} />}
          </span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {title}
          </h4>
          <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
            {jobs.length}
          </span>
        </div>
      )}

      {visibleJobs.length > 0 && (
        <ul className={useGrid ? "grid gap-1.5 sm:grid-cols-2" : "space-y-1.5"}>
          {visibleJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              isCurrent={job.id === currentJobId}
              isGoal={job.id === goalJobId}
              atLevelCap={atLevelCap}
              currentJobSelectable={currentJobSelectable}
              currentJobId={currentJobId}
              onSetGoal={() => onSetGoal(job.id === goalJobId ? null : job.id)}
              onPick={() => onPick(job)}
            />
          ))}
        </ul>
      )}

      {isPreviewing && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`${SURFACE_INSET} flex min-h-10 w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800`}
        >
          {hiddenCount}개 더 보기
          <CaretDown size={13} />
        </button>
      )}

      {canReturnToPreview && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex min-h-9 w-full items-center justify-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          간단히 보기
          <CaretUp size={13} />
        </button>
      )}
    </section>
  );
}

function JobRow({
  job,
  isCurrent,
  isGoal,
  atLevelCap,
  currentJobSelectable,
  currentJobId,
  onSetGoal,
  onPick,
}: {
  job: JobLadderEntry;
  isCurrent: boolean;
  isGoal: boolean;
  atLevelCap: boolean;
  currentJobSelectable: boolean;
  currentJobId: string;
  onSetGoal: () => void;
  onPick: () => void;
}) {
  const unlocked = job.unlocked !== false;
  const tags = jobCardTags(job, { currentJobId }).slice(0, 4);
  const cultivation = jobCultivationSummary(job.id);
  const advanceAction = resolveJobAdvanceAction({
    job,
    currentJobId,
    atLevelCap,
    currentJobSelectable,
  });
  return (
    <li
      aria-current={isCurrent ? "true" : undefined}
      className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
        isCurrent
          ? "border-emerald-500 ring-2 ring-emerald-500 ring-offset-1 ring-offset-white dark:border-emerald-400 dark:ring-emerald-400 dark:ring-offset-zinc-900"
          : ""
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
              className="rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
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
        {cultivation && (
          <span
            className={`text-[11px] font-medium ${
              cultivation === "생활직은 수행할 수 없음"
                ? "text-amber-700 dark:text-amber-300"
                : "text-violet-700 dark:text-violet-300"
            }`}
          >
            {cultivation === "생활직은 수행할 수 없음"
              ? cultivation
              : `수행 스탯 · ${cultivation}`}
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
          disabled={!advanceAction.enabled}
          aria-label={advanceAction.ariaLabel}
          className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
        >
          {advanceAction.label}
        </button>
      </div>
    </li>
  );
}
