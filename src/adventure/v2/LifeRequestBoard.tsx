"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle,
  ClockCountdown,
  LockKey,
  Notebook,
  Package,
  Path,
  SealCheck,
  UsersThree,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  LIFE_REQUEST_DAILY_LIMIT,
  LIFE_REQUEST_GRADES,
  LIFE_REQUEST_REQUESTERS,
  LIFE_REQUEST_WEEKLY_LIMIT,
  type LifeRequestActivity,
  type LifeRequestGrade,
  type LifeRequestLane,
  type LifeRequestRequesterId,
  type LifeRequestScope,
  type LifeRequestsState,
} from "./lifeRequests";

type WorkshopDestination = "process" | "craft";
type BoardTab = "requests" | "requesters" | "records";

type RequestView = {
  id: string;
  scope: LifeRequestScope;
  grade: LifeRequestGrade;
  requesterId: LifeRequestRequesterId;
  lane: LifeRequestLane;
  activity: LifeRequestActivity;
  title: string;
  description: string;
  itemName: string;
  quantity: number;
  balance: number;
  shortage: number;
  rewardGold: number;
  rewardXp: number;
  completed: boolean;
  unlocked: boolean;
  requesterUnlocked: boolean;
  chainLocked: boolean;
  requiredRequesterTrust?: number;
  chainStage?: 1 | 2 | 3;
  chainTotal?: 3;
  trustGain: number;
  source: {
    label: string;
    href?: string;
    workshopTab?: WorkshopDestination;
  };
};

type BoardPayload = {
  ok: true;
  now: number;
  nextDailyResetAt: number;
  nextWeeklyResetAt: number;
  state: LifeRequestsState;
  daily: RequestView[];
  weekly: RequestView[];
  chain: RequestView[];
  special: RequestView[];
  requesterProgress: Array<{
    id: LifeRequestRequesterId;
    name: string;
    role: string;
    description: string;
    regularTitleId: string;
    trust: number;
    level: {
      label: string;
      min: number;
      next: { label: string; min: number; remaining: number } | null;
    };
    milestones: {
      extraRerollCandidate: boolean;
      specialRequest: boolean;
      regularTitle: boolean;
    };
  }>;
  reroll: {
    used: boolean;
    rerolledLane: LifeRequestLane | null;
    rerolledOffset: number | null;
    lanes: Array<{
      lane: LifeRequestLane;
      title: string;
      completed: boolean;
      candidates: Array<{ offset: number; title: string; itemName: string }>;
    }>;
  };
  gradeProgress: {
    currentGrade: LifeRequestGrade;
    grades: Array<{
      grade: LifeRequestGrade;
      label: string;
      unlockDeliveries: number;
      unlocked: boolean;
    }>;
    next: {
      grade: LifeRequestGrade;
      label: string;
      unlockDeliveries: number;
      remaining: number;
    } | null;
  };
  linkedSources: Array<{
    id: "farm" | "cooking" | "fishing";
    title: string;
    description: string;
    href: string;
    progressLabel: string;
  }>;
  result?:
    | {
        action?: "deliver";
        title: string;
        itemName: string;
        quantity: number;
        rewardGold: number;
        rewardXp: number;
        grantedTitleNames: string[];
      }
    | { action: "reroll"; lane: LifeRequestLane; title: string };
};

const LANE_LABEL: Record<LifeRequestLane, string> = {
  woodcutting: "벌목 재료",
  mining: "채광 재료",
  processing: "가공품",
  crafting: "생활 보조품",
};

const ACTIVITY_LABEL: Record<LifeRequestActivity, string> = {
  woodcutting: "벌목",
  mining: "채광",
  farming: "농사",
  fishing: "낚시",
  cooking: "요리",
};

const GRADE_STYLE: Record<LifeRequestGrade, string> = {
  normal: "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
  skilled: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  expert: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

const ERROR_TEXT: Record<string, string> = {
  not_enough_items: "납품할 물품이 부족합니다.",
  already_completed: "이미 완료한 의뢰입니다.",
  period_limit: "이번 기간에 완료할 수 있는 의뢰 수를 모두 채웠습니다.",
  grade_locked: "아직 해당 의뢰 등급이 열리지 않았습니다.",
  requester_locked: "해당 의뢰인과 신뢰 관계를 더 쌓아야 합니다.",
  chain_locked: "앞 단계 연계 의뢰를 먼저 완료해 주세요.",
  reroll_used: "오늘의 의뢰 교체 기회를 이미 사용했습니다.",
  reroll_completed: "이미 납품한 분야의 의뢰는 교체할 수 없습니다.",
  reroll_candidate_locked: "해당 교체 후보는 의뢰인과 안면을 튼 뒤 선택할 수 있습니다.",
  request_unavailable: "현재 게시된 의뢰가 아닙니다.",
};

export function LifeRequestBoard({
  onChanged,
  onOpenWorkshopTab,
}: {
  onChanged?: () => void;
  onOpenWorkshopTab?: (tab: WorkshopDestination) => void;
}) {
  const [data, setData] = useState<BoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<LifeRequestGrade | "all" | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [rerollLane, setRerollLane] = useState<LifeRequestLane>("woodcutting");
  const [showRecords, setShowRecords] = useState(false);
  const [boardTab, setBoardTab] = useState<BoardTab>("requests");
  const [rerollOffset, setRerollOffset] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/life-requests", { cache: "no-store" });
      const json = await response.json() as BoardPayload & { error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "load_failed");
      setData(json);
      setSelectedGrade((current) => current ?? json.gradeProgress.currentGrade);
    } catch {
      setNotice("생활 의뢰를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 게시판 상태를 불러온다.
    void refresh();
  }, [refresh]);

  const deliver = useCallback(async (request: RequestView) => {
    setBusy(request.id);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/life-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: request.id, scope: request.scope }),
      });
      const json = await response.json() as BoardPayload & { error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "delivery_failed");
      setData(json);
      const result = json.result?.action === "reroll" ? undefined : json.result;
      setNotice(
        `${result?.title ?? request.title} 완료 · ` +
        `${result?.rewardGold.toLocaleString() ?? request.rewardGold.toLocaleString()}골드 · ` +
        `${ACTIVITY_LABEL[request.activity]} XP +${result?.rewardXp ?? request.rewardXp}` +
        (result?.grantedTitleNames.length ? ` · 칭호 획득: ${result.grantedTitleNames.join(", ")}` : ""),
      );
      onChanged?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(ERROR_TEXT[code] ?? "납품을 완료하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [onChanged]);

  const reroll = useCallback(async () => {
    setBusy("reroll");
    setNotice(null);
    try {
      const response = await fetch("/api/v2/life-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reroll", lane: rerollLane, offset: rerollOffset }),
      });
      const json = await response.json() as BoardPayload & { error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "reroll_failed");
      setData(json);
      const result = json.result?.action === "reroll" ? json.result : null;
      setNotice(`${result?.title ?? "새 의뢰"}(으)로 교체했습니다. 오늘은 더 교체할 수 없습니다.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(ERROR_TEXT[code] ?? "의뢰를 교체하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [rerollLane, rerollOffset]);

  const dailyDone = data?.state.daily.completedIds.length ?? 0;
  const filteredDaily = useMemo(() => {
    if (!data) return [];
    return data.daily.filter((request) => {
      if (selectedGrade && selectedGrade !== "all" && request.grade !== selectedGrade) {
        return false;
      }
      if (!availableOnly) return true;
      return request.unlocked && !request.completed && request.shortage === 0 && dailyDone < LIFE_REQUEST_DAILY_LIMIT;
    });
  }, [availableOnly, dailyDone, data, selectedGrade]);

  if (loading && !data) {
    return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>게시판을 정리하는 중...</div>;
  }
  if (!data) {
    return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}><Button size="sm" onClick={() => void refresh()}>다시 불러오기</Button></div>;
  }

  const weeklyDone = data.state.weekly.completedIds.length;
  const chainDone = data.state.chain.completedIds.length;
  const selectedRerollLane = data.reroll.lanes.find((entry) => entry.lane === rerollLane);
  const selectedRerollCandidate = selectedRerollLane?.candidates.find((entry) => entry.offset === rerollOffset);
  const mostTrusted = [...data.requesterProgress].sort((left, right) => right.trust - left.trust)[0];
  return (
    <div className="space-y-3">
      {notice ? <div role="status" className={`${SURFACE_ACCENT} px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-100`}>{notice}</div> : null}

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {([
          { id: "requests", label: "의뢰", icon: CalendarCheck },
          { id: "requesters", label: "의뢰인", icon: UsersThree },
          { id: "records", label: "기록부", icon: Notebook },
        ] as const).map((entry) => {
          const Icon = entry.icon;
          return (
            <button key={entry.id} type="button" onClick={() => setBoardTab(entry.id)} className={`flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${boardTab === entry.id ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-800 dark:text-amber-300" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}>
              <Icon size={15} />{entry.label}
            </button>
          );
        })}
      </div>

      <section className={`${SURFACE_CARD} ${boardTab === "requests" ? "" : "hidden"} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">의뢰 등급</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">누적 납품 기록이 쌓이면 요구량과 보상이 함께 커지는 상위 등급이 열립니다.</p>
          </div>
          <div className="text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            누적 {data.state.stats.totalDeliveries.toLocaleString()}건
            {data.gradeProgress.next ? <div className="mt-1 text-[10px] font-normal text-zinc-500">{data.gradeProgress.next.label}까지 {data.gradeProgress.next.remaining}건</div> : <div className="mt-1 text-[10px] font-normal text-violet-600 dark:text-violet-300">모든 등급 해금</div>}
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {data.gradeProgress.grades.map((entry) => (
            <div key={entry.grade} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-3`}>
              <div>
                <div className="text-sm font-bold">{entry.label} 의뢰</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">누적 {entry.unlockDeliveries}건</div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${entry.unlocked ? GRADE_STYLE[entry.grade] : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"}`}>
                {entry.unlocked ? <CheckCircle size={12} weight="fill" /> : <LockKey size={12} />}
                {entry.unlocked ? "해금" : "잠김"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requesters" ? "" : "hidden"} p-4`}>
        <div>
          <h2 className="text-sm font-bold">의뢰인 신뢰도</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">의뢰를 해결한 기록이 의뢰인별로 영구 누적됩니다. 신뢰도는 소모되지 않습니다.</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {data.requesterProgress.map((requester) => (
            <div key={requester.id} className={`${SURFACE_INSET} p-3`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">{requester.name}</div>
                  <div className="text-[10px] text-zinc-500">{requester.role}</div>
                </div>
                <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{requester.level.label}</span>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{requester.description}</p>
              <div className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">신뢰 {requester.trust.toLocaleString()}</div>
              <div className="mt-1 text-[10px] text-zinc-500">{requester.level.next ? `${requester.level.next.label}까지 ${requester.level.next.remaining}` : "최고 관계 달성"}</div>
              <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-[10px] dark:border-zinc-700">
                <MilestoneRow unlocked={requester.milestones.extraRerollCandidate} text="신뢰 5 · 교체 후보 +1" />
                <MilestoneRow unlocked={requester.milestones.specialRequest} text="신뢰 15 · 전용 주간 의뢰" />
                <MilestoneRow unlocked={requester.milestones.regularTitle} text="신뢰 35 · 전용 칭호" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requesters" ? "" : "hidden"} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">의뢰인 전용 주간 의뢰</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">각 의뢰인 신뢰 15부터 열립니다. 일반 주간 대량 의뢰와 완료 한도를 공유하므로 이번 주에는 하나만 선택할 수 있습니다.</p>
          </div>
          <div className="text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300">{weeklyDone}/{LIFE_REQUEST_WEEKLY_LIMIT}건 완료</div>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {data.special.map((request) => <RequestCard key={request.id} request={request} periodLimitReached={weeklyDone >= LIFE_REQUEST_WEEKLY_LIMIT} busy={busy === request.id} onDeliver={() => void deliver(request)} onOpenWorkshopTab={onOpenWorkshopTab} />)}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requests" ? "" : "hidden"} p-4`}>
        <div>
          <h2 className="text-sm font-bold">기존 생활 의뢰</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">기존 납품과 과제는 각 생활 화면에서 그대로 진행합니다. 이 게시판에서 보상을 중복 지급하지 않습니다.</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {data.linkedSources.map((source) => (
            <Link key={source.id} href={source.href} className={`${SURFACE_INSET} group flex min-h-28 flex-col p-3 transition-colors hover:border-emerald-400 dark:hover:border-emerald-500`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold">{source.title}</h3>
                <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-0.5" size={16} />
              </div>
              <p className="mt-1 flex-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{source.description}</p>
              <div className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{source.progressLabel}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requests" ? "" : "hidden"} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold"><CalendarCheck size={20} weight="duotone" />오늘의 생활 의뢰</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">벌목·채광·가공·생활 보조품 중 하루 최대 {LIFE_REQUEST_DAILY_LIMIT}건을 원하는 등급으로 납품할 수 있습니다.</p>
          </div>
          <div className="text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <div>{dailyDone}/{LIFE_REQUEST_DAILY_LIMIT}건 완료</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-zinc-500"><ClockCountdown size={12} />{resetText(data.nextDailyResetAt)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(["all", "normal", "skilled", "expert"] as const).map((grade) => (
              <Button key={grade} size="xs" variant={selectedGrade === grade ? "primary" : "secondary"} onClick={() => setSelectedGrade(grade)}>
                {grade === "all" ? "전체 등급" : LIFE_REQUEST_GRADES[grade].label}
              </Button>
            ))}
          </div>
          <Button size="xs" variant={availableOnly ? "success" : "secondary"} onClick={() => setAvailableOnly((current) => !current)}>
            <CheckCircle size={14} /> 납품 가능만 보기
          </Button>
        </div>
        <div className={`${SURFACE_INSET} mt-2 flex flex-col gap-2 p-2 sm:flex-row sm:items-center`}>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold">하루 1회 의뢰 교체</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">선택한 분야의 품목만 바뀌며 등급과 납품 횟수는 유지됩니다.</div>
          </div>
          <select
            aria-label="교체할 생활 의뢰 분야"
            value={rerollLane}
            disabled={data.reroll.used || busy !== null}
            onChange={(event) => {
              setRerollLane(event.target.value as LifeRequestLane);
              setRerollOffset(1);
            }}
            className="min-h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {data.reroll.lanes.map((entry) => <option key={entry.lane} value={entry.lane}>{LANE_LABEL[entry.lane]} · {entry.title}</option>)}
          </select>
          <select
            aria-label="새 생활 의뢰 후보"
            value={rerollOffset}
            disabled={data.reroll.used || busy !== null}
            onChange={(event) => setRerollOffset(Number(event.target.value))}
            className="min-h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {selectedRerollLane?.candidates.map((candidate) => <option key={candidate.offset} value={candidate.offset}>{candidate.title} · {candidate.itemName}</option>)}
          </select>
          <Button size="xs" disabled={data.reroll.used || selectedRerollLane?.completed || busy !== null} onClick={() => void reroll()}>
            {busy === "reroll" ? "교체 중..." : data.reroll.used ? "오늘 교체 완료" : selectedRerollLane?.completed ? "납품한 분야" : selectedRerollCandidate ? "선택 의뢰 교체" : "후보 없음"}
          </Button>
        </div>
        {filteredDaily.length > 0 ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {filteredDaily.map((request) => <RequestCard key={request.id} request={request} periodLimitReached={dailyDone >= LIFE_REQUEST_DAILY_LIMIT} busy={busy === request.id} onDeliver={() => void deliver(request)} onOpenWorkshopTab={onOpenWorkshopTab} />)}
          </div>
        ) : (
          <div className={`${SURFACE_INSET} mt-3 p-4 text-center text-xs text-zinc-500`}>현재 필터에 맞는 의뢰가 없습니다.</div>
        )}
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requests" ? "" : "hidden"} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold"><Path size={20} weight="duotone" />주간 연계 의뢰</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">숙련 등급부터 원재료 확보, 가공, 보조품 지원을 차례로 진행합니다. 일일·주간 선택 횟수를 소모하지 않습니다.</p>
          </div>
          <div className="text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <div>{chainDone}/{data.chain.length}단계 완료</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-zinc-500"><ClockCountdown size={12} />{resetText(data.nextWeeklyResetAt)}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {data.chain.map((request) => <RequestCard key={request.id} request={request} periodLimitReached={false} busy={busy === request.id} onDeliver={() => void deliver(request)} onOpenWorkshopTab={onOpenWorkshopTab} />)}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "requests" ? "" : "hidden"} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold"><Package size={20} weight="duotone" />주간 대량 의뢰</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">가공품과 생활 보조품 대량 주문 중 하나만 선택할 수 있습니다. 연계 의뢰와는 별도입니다.</p>
          </div>
          <div className="text-right text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <div>{weeklyDone}/{LIFE_REQUEST_WEEKLY_LIMIT}건 완료</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-zinc-500"><ClockCountdown size={12} />{resetText(data.nextWeeklyResetAt)}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.weekly.map((request) => <RequestCard key={request.id} request={request} periodLimitReached={weeklyDone >= LIFE_REQUEST_WEEKLY_LIMIT} busy={busy === request.id} onDeliver={() => void deliver(request)} onOpenWorkshopTab={onOpenWorkshopTab} />)}
        </div>
      </section>

      <section className={`${SURFACE_CARD} ${boardTab === "records" ? "" : "hidden"} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold"><Notebook size={20} weight="duotone" />생활 의뢰 기록부</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">분야와 등급별 누적 실적, 획득 보상, 최근 납품 20건을 보관합니다.</p>
          </div>
          <Button size="xs" onClick={() => setShowRecords((current) => !current)}>{showRecords ? "기록 접기" : "기록 펼치기"}</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={`${SURFACE_INSET} p-3`}><div className="text-[10px] text-zinc-500">총 납품</div><div className="mt-1 text-sm font-extrabold">{data.state.stats.totalDeliveries.toLocaleString()}건</div></div>
          <div className={`${SURFACE_INSET} p-3`}><div className="text-[10px] text-zinc-500">누적 골드</div><div className="mt-1 text-sm font-extrabold">{data.state.records.goldEarned.toLocaleString()}</div></div>
          <div className={`${SURFACE_INSET} p-3`}><div className="text-[10px] text-zinc-500">누적 생활 XP</div><div className="mt-1 text-sm font-extrabold">{data.state.records.xpEarned.toLocaleString()}</div></div>
          <div className={`${SURFACE_INSET} p-3`}><div className="text-[10px] text-zinc-500">가장 가까운 의뢰인</div><div className="mt-1 truncate text-sm font-extrabold">{mostTrusted?.trust ? mostTrusted.name : "아직 없음"}</div></div>
        </div>
        {showRecords ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className={`${SURFACE_INSET} p-3`}>
                <div className="text-xs font-bold">등급별 완료</div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px]">
                  {(["normal", "skilled", "expert"] as const).map((grade) => <div key={grade}><div className="text-zinc-500">{LIFE_REQUEST_GRADES[grade].label}</div><div className="font-bold">{data.state.records.byGrade[grade].toLocaleString()}건</div></div>)}
                </div>
              </div>
              <div className={`${SURFACE_INSET} p-3`}>
                <div className="text-xs font-bold">분야별 완료</div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                  {(["woodcutting", "mining", "processing", "crafting"] as const).map((lane) => <div key={lane}><div className="text-zinc-500">{LANE_LABEL[lane]}</div><div className="font-bold">{data.state.records.byLane[lane].toLocaleString()}건</div></div>)}
                </div>
              </div>
            </div>
            <div className={`${SURFACE_INSET} p-3`}>
              <div className="text-xs font-bold">최근 납품</div>
              {data.state.history.length > 0 ? (
                <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-700">
                  {[...data.state.history].reverse().map((entry) => (
                    <div key={`${entry.completedAt}:${entry.requestId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{entry.title} · {entry.itemName} {entry.quantity.toLocaleString()}개</div>
                        <div className="text-zinc-500">{LIFE_REQUEST_REQUESTERS[entry.requesterId].name} · {LIFE_REQUEST_GRADES[entry.grade].label} · {new Date(entry.completedAt).toLocaleString("ko-KR")}</div>
                      </div>
                      <div className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">{entry.rewardGold.toLocaleString()}골드 · XP +{entry.rewardXp}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="mt-2 text-xs text-zinc-500">아직 기록된 납품이 없습니다.</div>}
            </div>
          </div>
        ) : null}
      </section>

      <div className={`${SURFACE_INSET} px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300`}>
        누적 생활 납품 {data.state.stats.totalDeliveries.toLocaleString()}건 · 연계 의뢰 {data.state.stats.chainDeliveries.toLocaleString()}단계 · 별도 의뢰 화폐는 사용하지 않습니다.
      </div>
    </div>
  );
}

function RequestCard({
  request,
  periodLimitReached,
  busy,
  onDeliver,
  onOpenWorkshopTab,
}: {
  request: RequestView;
  periodLimitReached: boolean;
  busy: boolean;
  onDeliver: () => void;
  onOpenWorkshopTab?: (tab: WorkshopDestination) => void;
}) {
  const enough = request.shortage === 0;
  const ready = request.unlocked && request.requesterUnlocked && !request.chainLocked && !request.completed && !periodLimitReached && enough;
  const buttonText = busy
    ? "납품 중..."
    : request.completed
      ? "납품 완료"
      : !request.unlocked
        ? `누적 ${LIFE_REQUEST_GRADES[request.grade].unlockDeliveries}건에 해금`
        : !request.requesterUnlocked
          ? `신뢰 ${request.requiredRequesterTrust ?? 15}에 해금`
          : request.chainLocked
            ? "앞 단계 완료 필요"
            : periodLimitReached
              ? "선택 횟수 마감"
              : enough
                ? "즉시 납품"
                : `부족 ${request.shortage.toLocaleString()}개`;
  return (
    <article className={`${SURFACE_INSET} flex flex-col p-3 ${ready ? "ring-1 ring-emerald-400 dark:ring-emerald-600" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            {request.completed ? <SealCheck size={14} weight="fill" /> : null}
            {LANE_LABEL[request.lane]}
            {request.chainStage ? <span>· {request.chainStage}/{request.chainTotal}단계</span> : null}
          </div>
          <h3 className="mt-0.5 text-sm font-bold">{request.title}</h3>
          <div className="mt-0.5 text-[10px] text-zinc-500">의뢰인 · {LIFE_REQUEST_REQUESTERS[request.requesterId].name}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${request.unlocked ? GRADE_STYLE[request.grade] : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"}`}>
          {LIFE_REQUEST_GRADES[request.grade].label}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{request.description}</p>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
        <div className={`${SURFACE_CARD} px-1 py-1.5`}><div className="text-zinc-500">보유</div><div className="font-bold">{request.balance.toLocaleString()}</div></div>
        <div className={`${SURFACE_CARD} px-1 py-1.5`}><div className="text-zinc-500">필요</div><div className="font-bold">{request.quantity.toLocaleString()}</div></div>
        <div className={`${SURFACE_CARD} px-1 py-1.5`}><div className="text-zinc-500">부족</div><div className={`font-bold ${request.shortage > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}`}>{request.shortage.toLocaleString()}</div></div>
      </div>
      <div className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">보상 {request.rewardGold.toLocaleString()}골드 · {ACTIVITY_LABEL[request.activity]} XP +{request.rewardXp} · 신뢰 +{request.trustGain}</div>
      <div className="mt-3 grid grid-cols-2 gap-1">
        <SourceAction request={request} onOpenWorkshopTab={onOpenWorkshopTab} />
        <Button size="xs" disabled={busy || request.completed || !request.unlocked || !request.requesterUnlocked || request.chainLocked || periodLimitReached || !enough} onClick={onDeliver}>
          {buttonText}
        </Button>
      </div>
    </article>
  );
}

function MilestoneRow({ unlocked, text }: { unlocked: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-1 ${unlocked ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-zinc-500"}`}>
      {unlocked ? <CheckCircle size={11} weight="fill" /> : <LockKey size={11} />}{text}
    </div>
  );
}

function SourceAction({
  request,
  onOpenWorkshopTab,
}: {
  request: RequestView;
  onOpenWorkshopTab?: (tab: WorkshopDestination) => void;
}) {
  if (request.source.href) {
    return (
      <Link href={request.source.href} className="inline-flex min-h-7 items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
        {request.source.label}<ArrowRight size={13} />
      </Link>
    );
  }
  return (
    <Button size="xs" variant="secondary" disabled={!request.source.workshopTab || !onOpenWorkshopTab} onClick={() => request.source.workshopTab && onOpenWorkshopTab?.(request.source.workshopTab)}>
      {request.source.label}<ArrowRight size={13} />
    </Button>
  );
}

function resetText(resetAt: number): string {
  return `${new Date(resetAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 갱신`;
}
