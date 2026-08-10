"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  BookOpen,
  CaretLeft,
  CaretRight,
  CheckCircle,
  LockKey,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Star,
  X,
} from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { jobCultivationSummary } from "./jobExplorer";
import { SkillEffectChips } from "./SkillEffectChips";
import {
  buildJobRoadmap,
  type JobRoadmapNode,
} from "./jobRoadmapModel";

export type JobRoadmapPlayerJob = {
  id: string;
  name: string;
  tier: number;
  unlocked?: boolean;
  visited?: boolean;
  condition: string;
  conditionRevealed?: boolean;
  cumLevel?: number;
  bonus?: string;
  signatureSkills?: Array<{
    id: string;
    name: string;
    kind: "active" | "passive";
  }>;
  skillsCollected?: boolean;
};

export function JobRoadmapDialog({
  jobs,
  currentJobId,
  goalJobId,
  onSetGoal,
  onClose,
}: {
  jobs: readonly JobRoadmapPlayerJob[];
  currentJobId: string;
  goalJobId: string | null;
  onSetGoal: (jobId: string | null) => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedJobId, setSelectedJobId] = useState(currentJobId);
  const root = useMemo(() => buildJobRoadmap(), []);
  const jobById = useMemo(
    () => new Map(jobs.map((job) => [job.id, job])),
    [jobs],
  );
  const selectedJob = jobById.get(selectedJobId) ?? null;
  useEscapeKey(onClose);
  useModalA11y(contentRef);

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-stretch justify-center bg-black/65 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-roadmap-dialog-title"
        className={`${SURFACE_CARD} flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden rounded-none sm:h-[min(92dvh,900px)] sm:rounded-xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4 dark:border-zinc-700">
          <div>
            <h2
              id="job-roadmap-dialog-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              전직 로드맵
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              현재 직업과 전직 이력 또는 해금된 직업의 스킬 정보를 확인할 수
              있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="전직 로드맵 닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <StatusLegend tone="current" label="현재 직업" />
              <StatusLegend tone="visited" label="전직 이력" />
              <StatusLegend tone="available" label="해금됨" />
              <StatusLegend tone="locked" label="조건 부족" />
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              드래그하여 이동 · 두 손가락 또는 Ctrl/⌘+휠로 확대
            </div>
          </div>

          <RoadmapScroller>
            <ul className="shrine-job-tree">
              <RoadmapBranch
                node={root}
                jobById={jobById}
                currentJobId={currentJobId}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
              />
            </ul>
          </RoadmapScroller>

          {selectedJob ? (
            <JobRoadmapDetails
              job={selectedJob}
              currentJobId={currentJobId}
              goalJobId={goalJobId}
              onSetGoal={onSetGoal}
            />
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3 dark:border-zinc-700">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            복합 직업은 여러 선행 직업의 숙련도가 필요합니다.
          </p>
          <Link
            href="/manual/jobs"
            onClick={onClose}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <BookOpen size={14} />
            자세한 안내
          </Link>
        </footer>
        <style>{ROADMAP_CSS}</style>
      </div>
    </div>,
    document.body,
  );
}

export function JobRoadmapDetails({
  job,
  currentJobId,
  goalJobId,
  onSetGoal,
}: {
  job: JobRoadmapPlayerJob;
  currentJobId: string;
  goalJobId: string | null;
  onSetGoal: (jobId: string | null) => void;
}) {
  const cultivation = jobCultivationSummary(job.id);
  const tierLabel = job.tier <= 0 ? "루트 직업" : `${job.tier}차 직업`;
  const canInspectSkills =
    job.id === currentJobId || job.visited === true || job.unlocked !== false;

  return (
    <section
      aria-live="polite"
      aria-label={`${job.name} 직업 정보`}
      className={`${SURFACE_INSET} mt-3 p-3`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              {job.name}
            </h3>
            <DetailBadge tone="tier">{tierLabel}</DetailBadge>
            {job.id === currentJobId ? (
              <DetailBadge tone="current">현재 직업</DetailBadge>
            ) : job.visited ? (
              <DetailBadge tone="visited">전직 이력</DetailBadge>
            ) : job.unlocked !== false ? (
              <DetailBadge tone="available">해금됨</DetailBadge>
            ) : (
              <DetailBadge tone="locked">조건 부족</DetailBadge>
            )}
            {job.skillsCollected ? (
              <DetailBadge tone="collected">스킬 수집 완료</DetailBadge>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
            내 숙련도{" "}
            {Math.max(0, job.cumLevel ?? 0).toLocaleString("ko-KR")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSetGoal(job.id === goalJobId ? null : job.id)}
          className={`flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${
            job.id === goalJobId
              ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <Star
            size={14}
            weight={job.id === goalJobId ? "fill" : "regular"}
          />
          {job.id === goalJobId ? "목표 해제" : "목표로 설정"}
        </button>
      </div>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">해금 조건</dt>
          <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
            {job.conditionRevealed === false
              ? "선행 직업을 해금하면 조건이 공개됩니다."
              : job.condition}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">직업 보너스</dt>
          <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
            {job.bonus || "별도 고정 보너스 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">수행 성장</dt>
          <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
            {cultivation || "수행 성장 정보 없음"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-zinc-500 dark:text-zinc-400">
            <span>대표 스킬</span>
            {canInspectSkills && job.signatureSkills?.length ? (
              <span className="text-[10px]">스킬명을 눌러 상세 확인</span>
            ) : null}
          </dt>
          <dd className="mt-1 grid gap-1.5 text-zinc-800 dark:text-zinc-200 sm:grid-cols-2">
            {!canInspectSkills ? (
              <span className="text-zinc-500 dark:text-zinc-400">
                직업을 해금하면 스킬 정보를 확인할 수 있습니다.
              </span>
            ) : job.signatureSkills?.length ? (
              job.signatureSkills.map((skill) => {
                const skillDef = V2_SKILLS[skill.id as V2SkillId];
                return (
                  <details
                    key={skill.id}
                    className={`${SURFACE_CARD} group overflow-hidden`}
                  >
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-semibold transition hover:bg-zinc-100 [&::-webkit-details-marker]:hidden dark:hover:bg-zinc-800">
                      <CaretRight
                        size={13}
                        className="shrink-0 text-zinc-400 transition-transform group-open:rotate-90"
                      />
                      <span>{skill.name}</span>
                      <span className="ml-auto text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">
                        {skill.kind === "passive" ? "패시브" : "액티브"}
                      </span>
                    </summary>
                    <div className="border-t border-zinc-200 px-2.5 py-2 dark:border-zinc-700">
                      <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {skillDef?.description ??
                          "등록된 스킬 설명이 없습니다."}
                      </p>
                      <SkillEffectChips skillId={skill.id} />
                    </div>
                  </details>
                );
              })
            ) : (
              <span>전용 스킬 정보 없음</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

const ROADMAP_ZOOM_MIN = 0.5;
const ROADMAP_ZOOM_MAX = 1.5;
const ROADMAP_ZOOM_STEP = 0.1;
export const ROADMAP_DRAG_THRESHOLD_PX = 6;

function clampRoadmapZoom(value: number) {
  return Math.min(ROADMAP_ZOOM_MAX, Math.max(ROADMAP_ZOOM_MIN, value));
}

export function isRoadmapDragGesture(startX: number, currentX: number) {
  return Math.abs(currentX - startX) >= ROADMAP_DRAG_THRESHOLD_PX;
}

function touchDistance(touches: TouchList) {
  const first = touches[0];
  const second = touches[1];
  return first && second
    ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    : 0;
}

export function RoadmapScroller({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    x: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomRef = useRef(1);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);

  const zoomAt = useCallback(
    (nextValue: number, clientX?: number, snap = true) => {
      const scroller = scrollerRef.current;
      const currentZoom = zoomRef.current;
      const nextZoom = clampRoadmapZoom(
        snap
          ? Math.round(nextValue / ROADMAP_ZOOM_STEP) * ROADMAP_ZOOM_STEP
          : nextValue,
      );
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      let contentX: number | null = null;
      let localX = 0;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        localX = (clientX ?? rect.left + rect.width / 2) - rect.left;
        contentX = (scroller.scrollLeft + localX) / currentZoom;
      }

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      if (scroller && contentX != null) {
        requestAnimationFrame(() => {
          scroller.scrollLeft = Math.max(0, contentX * nextZoom - localX);
        });
      }
    },
    [],
  );

  const move = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(320, scroller.clientWidth * 0.75),
      behavior: "smooth",
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      left: scroller.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.id !== event.pointerId) return;
    if (!drag.moved) {
      if (!isRoadmapDragGesture(drag.x, event.clientX)) return;
      drag.moved = true;
      scroller.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const moved = dragRef.current?.id === event.pointerId && dragRef.current.moved;
    if (
      scroller &&
      dragRef.current?.id === event.pointerId &&
      scroller.hasPointerCapture(event.pointerId)
    ) {
      scroller.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (scroller?.hasPointerCapture(event.pointerId)) return;
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAt(
        zoomRef.current +
          (event.deltaY < 0 ? ROADMAP_ZOOM_STEP : -ROADMAP_ZOOM_STEP),
        event.clientX,
      );
    };
    const handleTouchStart = (event: globalThis.TouchEvent) => {
      if (event.touches.length !== 2) return;
      const distance = touchDistance(event.touches);
      if (distance > 0) {
        pinchRef.current = { distance, zoom: zoomRef.current };
      }
    };
    const handleTouchMove = (event: globalThis.TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      const distance = touchDistance(event.touches);
      if (distance <= 0) return;
      event.preventDefault();
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      zoomAt(pinch.zoom * (distance / pinch.distance), centerX, false);
    };
    const endPinch = (event: globalThis.TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
    scroller.addEventListener("touchmove", handleTouchMove, { passive: false });
    scroller.addEventListener("touchend", endPinch, { passive: true });
    scroller.addEventListener("touchcancel", endPinch, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      scroller.removeEventListener("touchstart", handleTouchStart);
      scroller.removeEventListener("touchmove", handleTouchMove);
      scroller.removeEventListener("touchend", endPinch);
      scroller.removeEventListener("touchcancel", endPinch);
    };
  }, [zoomAt]);

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="shrine-job-roadmap-wrap">
      <div className="shrine-job-roadmap-controls">
        <button
          type="button"
          className="shrine-job-roadmap-button"
          aria-label={`로드맵 축소, 현재 ${zoomPct}%`}
          title="축소"
          disabled={zoom <= ROADMAP_ZOOM_MIN}
          onClick={() => zoomAt(zoomRef.current - ROADMAP_ZOOM_STEP)}
        >
          <MagnifyingGlassMinus size={15} weight="bold" />
        </button>
        <button
          type="button"
          className="shrine-job-roadmap-button is-zoom-level"
          aria-label={`확대/축소 초기화, 현재 ${zoomPct}%`}
          title="100%로 초기화"
          onClick={() => zoomAt(1)}
        >
          <span aria-live="polite">{zoomPct}%</span>
        </button>
        <button
          type="button"
          className="shrine-job-roadmap-button"
          aria-label={`로드맵 확대, 현재 ${zoomPct}%`}
          title="확대"
          disabled={zoom >= ROADMAP_ZOOM_MAX}
          onClick={() => zoomAt(zoomRef.current + ROADMAP_ZOOM_STEP)}
        >
          <MagnifyingGlassPlus size={15} weight="bold" />
        </button>
        <button
          type="button"
          className="shrine-job-roadmap-button"
          aria-label="로드맵 왼쪽으로 이동"
          onClick={() => move(-1)}
        >
          <CaretLeft size={15} weight="bold" />
        </button>
        <button
          type="button"
          className="shrine-job-roadmap-button"
          aria-label="로드맵 오른쪽으로 이동"
          onClick={() => move(1)}
        >
          <CaretRight size={15} weight="bold" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        className={`shrine-job-roadmap ${dragging ? "is-dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
      >
        <div className="shrine-job-roadmap-canvas" style={{ zoom }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function RoadmapBranch({
  node,
  jobById,
  currentJobId,
  selectedJobId,
  onSelectJob,
}: {
  node: JobRoadmapNode;
  jobById: Map<string, JobRoadmapPlayerJob>;
  currentJobId: string;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
}) {
  const job = jobById.get(node.id);
  const current = node.id === currentJobId;
  const visited = current || job?.visited === true;
  const unlocked = job?.unlocked !== false;
  const selected = node.id === selectedJobId;
  const tierLabel =
    node.tier === "start" ? "" : node.tier === 0 ? "루트" : `${node.tier}차`;
  const nodeClass = `shrine-job-node shrine-job-${node.group} ${
    node.hybrid ? "shrine-job-hybrid" : ""
  } ${job ? "is-player-job" : ""} ${current ? "is-current" : ""} ${
    visited && !current ? "is-visited" : ""
  } ${job && !unlocked ? "is-locked" : ""} ${selected ? "is-selected" : ""}`;
  const label = [
    node.name,
    current ? "현재 직업" : visited ? "전직 이력 있음" : unlocked ? "해금됨" : "조건 부족",
    job ? `숙련도 ${job.cumLevel ?? 0}` : null,
  ].filter(Boolean).join(", ");

  return (
    <li>
      {job ? (
        <button
          type="button"
          className={nodeClass}
          onClick={() => onSelectJob(node.id)}
          aria-pressed={selected}
          aria-label={label}
          title={job.conditionRevealed === false ? undefined : job.condition}
        >
          <RoadmapNodeContent
            node={node}
            tierLabel={tierLabel}
            job={job}
            current={current}
            visited={visited}
            unlocked={unlocked}
          />
        </button>
      ) : (
        <div className={nodeClass} title={node.prereqText || undefined}>
          <RoadmapNodeContent
            node={node}
            tierLabel={tierLabel}
            job={null}
            current={false}
            visited={false}
            unlocked
          />
        </div>
      )}
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <RoadmapBranch
              key={child.id}
              node={child}
              jobById={jobById}
              currentJobId={currentJobId}
              selectedJobId={selectedJobId}
              onSelectJob={onSelectJob}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RoadmapNodeContent({
  node,
  tierLabel,
  job,
  current,
  visited,
  unlocked,
}: {
  node: JobRoadmapNode;
  tierLabel: string;
  job: JobRoadmapPlayerJob | null;
  current: boolean;
  visited: boolean;
  unlocked: boolean;
}) {
  return (
    <>
      {tierLabel ? <span className="shrine-job-tier">{tierLabel}</span> : null}
      <span className="shrine-job-copy">
        <span className="shrine-job-name">{node.name}</span>
        {job ? (
          <span className="shrine-job-mastery">
            숙련 {Math.max(0, job.cumLevel ?? 0).toLocaleString("ko-KR")}
          </span>
        ) : null}
      </span>
      {current ? (
        <span className="shrine-job-status">현재</span>
      ) : visited ? (
        <CheckCircle className="shrine-job-check" size={15} weight="fill" />
      ) : !unlocked ? (
        <LockKey className="shrine-job-lock" size={14} weight="fill" />
      ) : null}
      {node.hybrid ? <span className="shrine-job-badge">복합</span> : null}
    </>
  );
}

function StatusLegend({
  tone,
  label,
}: {
  tone: "current" | "visited" | "available" | "locked";
  label: string;
}) {
  return <span className={`shrine-job-state-legend is-${tone}`}>{label}</span>;
}

function DetailBadge({
  tone,
  children,
}: {
  tone:
    | "current"
    | "visited"
    | "available"
    | "locked"
    | "collected"
    | "tier";
  children: React.ReactNode;
}) {
  const toneClass = {
    current: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    visited: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    available: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    locked: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    collected: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    tier: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  }[tone];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

const ROADMAP_CSS = `
.shrine-job-roadmap-wrap{position:relative;max-width:100%}
.shrine-job-roadmap-controls{position:absolute;right:10px;top:10px;z-index:2;display:flex;gap:6px}
.shrine-job-roadmap-button{display:inline-flex;height:30px;width:30px;align-items:center;justify-content:center;border:1px solid rgba(248,250,252,.18);border-radius:7px;background:#211b2a;color:#f8fafc;box-shadow:0 8px 18px rgba(0,0,0,.28);transition:background-color .15s ease,border-color .15s ease,transform .12s ease}
.shrine-job-roadmap-button.is-zoom-level{width:46px;font-size:10px;font-variant-numeric:tabular-nums}
.shrine-job-roadmap-button:hover{border-color:rgba(248,250,252,.34);background:#342b40}
.shrine-job-roadmap-button:active{transform:translateY(1px)}
.shrine-job-roadmap-button:disabled{cursor:not-allowed;color:#71717a;border-color:rgba(248,250,252,.1);background:#211b2a;box-shadow:none}
.shrine-job-roadmap{max-width:100%;overflow-x:auto;overflow-y:hidden;border:1px solid #3f3549;border-radius:8px;color:#f8fafc;background:#17131d;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;cursor:grab}
.shrine-job-roadmap.is-dragging{cursor:grabbing}
.shrine-job-roadmap-canvas{display:flow-root;width:max-content;min-width:100%;transform-origin:top left}
.shrine-job-tree{display:flex;width:max-content;min-width:max(100%,1560px);justify-content:flex-start;margin:0;padding:38px 24px 20px}
.shrine-job-tree ul{position:relative;display:flex;justify-content:center;margin:0;padding:38px 0 0}
.shrine-job-tree li{position:relative;display:flex;flex-direction:column;align-items:center;list-style:none;margin:0;padding:38px 8px 0}
.shrine-job-tree li::before,.shrine-job-tree li::after{content:"";position:absolute;top:0;right:50%;width:50%;height:38px;border-top:2px solid #5e526e}
.shrine-job-tree li::after{right:auto;left:50%;border-left:2px solid #5e526e}
.shrine-job-tree li:only-child::before,.shrine-job-tree li:only-child::after{display:none}
.shrine-job-tree li:only-child{padding-top:0}
.shrine-job-tree li:first-child::before,.shrine-job-tree li:last-child::after{border:0}
.shrine-job-tree li:last-child::before{border-right:2px solid #5e526e;border-radius:0 8px 0 0}
.shrine-job-tree li:first-child::after{border-radius:8px 0 0 0}
.shrine-job-tree>li>ul::before,.shrine-job-tree ul ul::before{content:"";position:absolute;top:0;left:50%;width:0;height:38px;border-left:2px solid #5e526e}
.shrine-job-node{--accent:#d9b45a;position:relative;display:inline-flex;min-width:132px;min-height:48px;align-items:center;justify-content:center;gap:7px;padding:5px 10px 5px 8px;border:1px solid color-mix(in srgb,var(--accent) 74%,#fff 8%);border-left:5px solid var(--accent);border-radius:7px;background:#fffaf0;color:#211827;font:inherit;font-size:12px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 9px 20px rgba(0,0,0,.28),inset 0 -2px 0 rgba(0,0,0,.08);transition:filter .15s ease,outline-color .15s ease,transform .12s ease}
button.shrine-job-node{cursor:pointer}
button.shrine-job-node:hover{filter:brightness(1.04);transform:translateY(-1px)}
.shrine-job-tier{display:inline-flex;align-items:center;justify-content:center;min-width:27px;height:18px;padding:0 4px;border-radius:5px;background:color-mix(in srgb,var(--accent) 22%,#211827);color:#fff;font-size:9px;font-weight:900}
.shrine-job-copy{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.shrine-job-name{font-size:12px}
.shrine-job-mastery{font-size:9px;font-weight:800;color:#645b68;font-variant-numeric:tabular-nums}
.shrine-job-root{--accent:#f3c64b;background:#fff0a8;color:#2b2105}
.shrine-job-warrior{--accent:#ff5f5f}
.shrine-job-martial{--accent:#41d68a}
.shrine-job-mage{--accent:#5aa8ff}
.shrine-job-rogue{--accent:#c07cff}
.shrine-job-survivor{--accent:#ff9c4a}
.shrine-job-node.shrine-job-hybrid{background:#fff2f6;border-color:#ff6b8b;color:#32111d}
.shrine-job-node.shrine-job-hybrid::after{content:"";position:absolute;inset:-5px;border:1px dashed #ff89a3;border-radius:8px;pointer-events:none}
.shrine-job-badge{position:absolute;right:7px;top:-17px;display:inline-flex;align-items:center;justify-content:center;height:16px;padding:0 5px;border:1px solid #ff89a3;border-radius:5px;background:#3a1e2a;color:#ffd5df;font-size:9px;font-weight:900;box-shadow:0 7px 14px rgba(0,0,0,.25)}
.shrine-job-node.is-current{outline:3px solid #34d399;outline-offset:2px}
.shrine-job-node.is-visited:not(.is-current){outline:2px solid #38bdf8;outline-offset:1px}
.shrine-job-node.is-selected{box-shadow:0 0 0 3px #fbbf24,0 10px 24px rgba(0,0,0,.35)}
.shrine-job-node.is-locked{--accent:#71717a;background:#e4e4e7;color:#52525b;border-color:#71717a}
.shrine-job-node.is-locked .shrine-job-mastery{color:#71717a}
.shrine-job-status{position:absolute;left:7px;top:-17px;height:16px;padding:0 5px;border-radius:5px;background:#065f46;color:#d1fae5;font-size:9px;line-height:16px}
.shrine-job-check{position:absolute;right:6px;top:5px;color:#0284c7}
.shrine-job-lock{position:absolute;right:6px;top:5px;color:#52525b}
.shrine-job-state-legend{display:inline-flex;align-items:center;height:22px;border:1px solid;border-radius:6px;padding:0 7px;background:#211b2a}
.shrine-job-state-legend.is-current{border-color:#34d399;color:#a7f3d0}
.shrine-job-state-legend.is-visited{border-color:#38bdf8;color:#bae6fd}
.shrine-job-state-legend.is-available{border-color:#fbbf24;color:#fde68a}
.shrine-job-state-legend.is-locked{border-color:#71717a;color:#d4d4d8}
`;
