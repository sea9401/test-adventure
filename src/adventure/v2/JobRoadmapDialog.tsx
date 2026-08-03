"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
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
  Star,
  X,
} from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
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
              직업을 선택하면 전직 이력, 숙련도와 해금 조건을 확인할 수 있습니다.
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
              카드를 눌러 상세 정보 확인
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
            <div className={`${SURFACE_INSET} mt-3 p-3`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedJob.name}
                    </h3>
                    {selectedJob.id === currentJobId ? (
                      <DetailBadge tone="current">현재 직업</DetailBadge>
                    ) : selectedJob.visited ? (
                      <DetailBadge tone="visited">전직 이력</DetailBadge>
                    ) : selectedJob.unlocked !== false ? (
                      <DetailBadge tone="available">해금됨</DetailBadge>
                    ) : (
                      <DetailBadge tone="locked">조건 부족</DetailBadge>
                    )}
                    {selectedJob.skillsCollected ? (
                      <DetailBadge tone="collected">스킬 수집 완료</DetailBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                    현재 숙련도 {Math.max(0, selectedJob.cumLevel ?? 0).toLocaleString("ko-KR")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSetGoal(
                      selectedJob.id === goalJobId ? null : selectedJob.id,
                    )
                  }
                  className={`flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${
                    selectedJob.id === goalJobId
                      ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Star
                    size={14}
                    weight={selectedJob.id === goalJobId ? "fill" : "regular"}
                  />
                  {selectedJob.id === goalJobId ? "목표 해제" : "목표로 설정"}
                </button>
              </div>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">해금 조건</dt>
                  <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
                    {selectedJob.conditionRevealed === false
                      ? "선행 직업을 해금하면 조건이 공개됩니다."
                      : selectedJob.condition}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">직업 보너스</dt>
                  <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
                    {selectedJob.bonus || "별도 고정 보너스 없음"}
                  </dd>
                </div>
              </dl>
            </div>
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

function RoadmapScroller({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);

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
    };
    scroller.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.id !== event.pointerId) return;
    scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (
      scroller &&
      dragRef.current?.id === event.pointerId &&
      scroller.hasPointerCapture(event.pointerId)
    ) {
      scroller.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className="shrine-job-roadmap-wrap">
      <div className="shrine-job-roadmap-controls">
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
        onPointerLeave={endDrag}
      >
        {children}
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
  tone: "current" | "visited" | "available" | "locked" | "collected";
  children: React.ReactNode;
}) {
  const toneClass = {
    current: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    visited: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    available: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    locked: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    collected: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
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
.shrine-job-roadmap-button:hover{border-color:rgba(248,250,252,.34);background:#342b40}
.shrine-job-roadmap-button:active{transform:translateY(1px)}
.shrine-job-roadmap{max-width:100%;overflow-x:auto;overflow-y:hidden;border:1px solid #3f3549;border-radius:8px;color:#f8fafc;background:#17131d;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;cursor:grab}
.shrine-job-roadmap.is-dragging{cursor:grabbing}
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
