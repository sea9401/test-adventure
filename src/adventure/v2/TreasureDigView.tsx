"use client";

import { TREASURE_SELL_GOLD_MULT } from "@/adventure/data/v2/antique";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  HandCoins,
} from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import { useSystemMessageState } from "./RewardToastProvider";
import {
  TREASURE_ACTION_HELP,
  TREASURE_ACTION_LABEL,
  type TreasureAction,
  type TreasureActionTarget,
  type TreasureCellKind,
  type TreasureSitePublic,
} from "./treasureDig";
import { FRAGMENTS_PER_MAP } from "./treasureFragments";

// 발굴 미니게임 뷰 — 핸들러(open/action) 주입형. 실게임은 useTreasure(API), dev 는 로컬 mock.

export type DugAntique = {
  instanceId: string;
  antiqueId: string;
  name: string;
  tier: string;
  condition: number;
  appraisedValue: number;
};

export type OpenOutcome =
  | { ok: true; resumed: boolean; site: TreasureSitePublic; fragments?: number }
  | { ok: false; reason: "not_enough_fragments" | "error"; fragments?: number };

export type DigOutcome =
  | { outcome: "hit"; antique: DugAntique; codexCount: number; site?: TreasureSitePublic }
  | { outcome: "progress"; message: string; site: TreasureSitePublic }
  | {
      outcome: "exhausted";
      message: string;
      site: TreasureSitePublic;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | { outcome: "invalid"; site: TreasureSitePublic }
  | { outcome: "error" };

export type TreasureHandlers = {
  open: () => Promise<OpenOutcome>;
  dig: (
    siteId: string,
    action: TreasureAction,
    target?: TreasureActionTarget,
  ) => Promise<DigOutcome>;
  /** 보유 지도 조각 수 조회(표시용). 없으면 조각 수를 숨긴다. */
  loadFragments?: () => Promise<number | null>;
  /** 진행 중 발굴 세션 복원(읽기 전용). 마운트 시 상태를 이어 그린다. 없으면 복원 안 함. */
  loadSession?: () => Promise<TreasureSitePublic | null>;
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

const TIER_STYLE: Record<string, string> = {
  common: "text-zinc-600 dark:text-zinc-300",
  uncommon: "text-emerald-700 dark:text-emerald-300",
  rare: "text-sky-700 dark:text-sky-300",
  epic: "text-violet-700 dark:text-violet-300",
  legendary: "text-amber-600 dark:text-amber-300",
};

const CELL_TONE: Record<TreasureCellKind | "hidden", string> = {
  hidden:
    "bg-stone-700 text-stone-300 dark:bg-stone-950 dark:text-stone-600",
  camp:
    "bg-emerald-900 text-emerald-50 dark:bg-emerald-950 dark:text-emerald-100",
  soil:
    "bg-stone-800 text-stone-100 dark:bg-stone-900 dark:text-stone-100",
  dense:
    "bg-yellow-900 text-yellow-100 dark:bg-yellow-950 dark:text-yellow-100",
  rock:
    "bg-zinc-700 text-zinc-50 dark:bg-zinc-800 dark:text-zinc-100",
  clue:
    "bg-cyan-900 text-cyan-100 dark:bg-cyan-950 dark:text-cyan-100",
  cache:
    "bg-amber-800 text-amber-50 dark:bg-amber-950 dark:text-amber-100",
  supply:
    "bg-lime-800 text-lime-50 dark:bg-lime-950 dark:text-lime-100",
  relic:
    "bg-violet-900 text-violet-50 dark:bg-violet-950 dark:text-violet-100",
  fissure:
    "bg-rose-900 text-rose-50 dark:bg-rose-950 dark:text-rose-100",
};

function haulForKind(kind: TreasureCellKind | undefined): number {
  switch (kind) {
    case "soil":
      return 7;
    case "dense":
      return 24;
    case "rock":
      return 40;
    case "clue":
      return 10;
    case "cache":
      return 52;
    case "supply":
      return 6;
    case "relic":
      return 135;
    case "fissure":
      return 34;
    default:
      return 0;
  }
}

function energyForKind(kind: TreasureCellKind | undefined): number {
  return kind === "supply" ? 5 : 0;
}

type Result =
  | { kind: "hit"; antique: DugAntique }
  | {
      kind: "exhausted";
      message: string;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | null;

type ActionRunStatus = "continue" | "busy" | "stop";

function Meter({
  label,
  value,
  max,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone: "amber" | "emerald" | "rose" | "sky";
}) {
  const fill = {
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
  }[tone];
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
          {value.toLocaleString()}
          {suffix ?? ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function DepthTrack({ depth, maxDepth }: { depth: number; maxDepth: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${maxDepth}, minmax(0, 1fr))` }} aria-label={`최대 깊이 ${depth}`}>
      {Array.from({ length: maxDepth }, (_, idx) => {
        const layer = idx + 1;
        const active = layer <= depth;
        return (
          <div
            key={layer}
            className={`h-2.5 rounded-full ${
              active
                ? "bg-amber-500 dark:bg-amber-400"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          />
        );
      })}
    </div>
  );
}

type DrillDirection = {
  key: "left" | "down" | "right";
  label: string;
  dx: number;
  dy: number;
  Icon: typeof ArrowDown;
};

const DRILL_DIRECTIONS: DrillDirection[] = [
  { key: "left", label: "왼쪽", dx: -1, dy: 0, Icon: ArrowLeft },
  { key: "down", label: "아래", dx: 0, dy: 1, Icon: ArrowDown },
  { key: "right", label: "오른쪽", dx: 1, dy: 0, Icon: ArrowRight },
];

type DrillCommand = {
  action: TreasureAction;
  target: TreasureActionTarget;
  requiredFuel: number;
  targetCell: TreasureSitePublic["cells"][number];
};

function drillOptionForDirection(
  site: TreasureSitePublic,
  direction: DrillDirection,
): DrillCommand | null {
  const current = site.cells.find((cell) => cell.current);
  if (!current) return null;
  const target = site.cells.find(
    (cell) => cell.x === current.x + direction.dx && cell.y === current.y + direction.dy,
  );
  if (!target) return null;
  const action: TreasureAction = target.revealed ? "move" : "excavate";
  const requiredFuel = action === "move" ? 1 : target.cost;
  return {
    action,
    target: { cell: target.index },
    requiredFuel,
    targetCell: target,
  };
}

function drillCommandForDirection(
  site: TreasureSitePublic,
  direction: DrillDirection,
): DrillCommand | null {
  const option = drillOptionForDirection(site, direction);
  if (!option || site.energy < option.requiredFuel) return null;
  return option;
}

function DrillPanel({
  site,
  busy,
  result,
  activeHoldKey,
  onDirection,
  onHoldStart,
  onHoldEnd,
}: {
  site: TreasureSitePublic;
  busy: boolean;
  result: Result;
  activeHoldKey: DrillDirection["key"] | null;
  onDirection: (direction: DrillDirection) => void;
  onHoldStart: (direction: DrillDirection) => void;
  onHoldEnd: () => void;
}) {
  const markerTop = `${Math.min(88, Math.max(8, (site.depth / Math.max(1, site.maxDepth)) * 80 + 8))}%`;
  const options = DRILL_DIRECTIONS.map((direction) => ({
    ...direction,
    option: drillOptionForDirection(site, direction),
  }));

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="relative h-64 overflow-hidden rounded-md border border-stone-800 bg-stone-900 shadow-inner dark:border-stone-950 dark:bg-stone-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_10%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(180deg,rgba(180,120,60,0.28),rgba(40,24,16,0.9))]" />
        <div className="absolute left-1/2 top-0 h-full w-16 -translate-x-1/2 bg-zinc-950/70 shadow-[0_0_40px_rgba(0,0,0,0.55)_inset]" />
        <div className="absolute left-1/2 h-9 w-12 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-sky-400 text-center text-[10px] font-black leading-9 text-sky-950 shadow-lg" style={{ top: markerTop }}>
          DRILL
        </div>
        <div className="absolute bottom-3 left-3 rounded bg-black/40 px-2 py-1 text-xs font-semibold text-stone-100">
          깊이 {site.depth}/{site.maxDepth}
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ key, label, option, Icon, ...direction }) => {
          const target = option?.targetCell;
          const action = option?.action ?? null;
          const requiredFuel = option?.requiredFuel ?? 0;
          const haul = action === "excavate" ? haulForKind(target?.kind) : 0;
          const energyGain = action === "excavate" ? energyForKind(target?.kind) : 0;
          const disabled =
            busy ||
            !!result ||
            site.forcedRetreat ||
            !option ||
            site.energy < requiredFuel;
          const tone = target?.revealed
            ? "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            : target?.kind
              ? `${CELL_TONE[target.kind]} border-transparent`
              : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600";
          const active = activeHoldKey === key;
          const fullDirection: DrillDirection = { key, label, Icon, ...direction };
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              title={
                target
                  ? `${target.label ?? "흙벽"} · 연료 -${requiredFuel}${haul > 0 ? ` · 획득 +${haul}` : ""}`
                  : `${label}에는 더 팔 곳이 없습니다.`
              }
              onClick={() => onDirection(fullDirection)}
              onPointerDown={() => {
                if (!disabled) onHoldStart(fullDirection);
              }}
              onPointerUp={onHoldEnd}
              onPointerCancel={onHoldEnd}
              onPointerLeave={onHoldEnd}
              onBlur={onHoldEnd}
              onContextMenu={(event) => event.preventDefault()}
              className={`min-h-32 touch-manipulation select-none rounded-md border p-2 text-left transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 ${
                active ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900" : ""
              } ${tone}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Icon size={18} weight="bold" />
                <span className="text-[11px] font-semibold">{label}</span>
              </div>
              <div className="text-sm font-bold">
                {target
                  ? target.revealed
                    ? "이동"
                    : target.label ?? "흙벽"
                  : "막힘"}
              </div>
              {target ? (
                <span className="mt-2 block text-[11px] leading-relaxed opacity-80">
                  연료 -{requiredFuel}
                  {haul > 0 ? ` · 획득 +${haul}` : ""}
                  {energyGain > 0 ? ` · 연료 +${energyGain}` : ""}
                </span>
              ) : (
                <span className="mt-2 block text-[11px] opacity-70">팔 수 없음</span>
              )}
            </button>
          );
        })}
        </div>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          벽을 고르면 바로 파고 들어갑니다. 필요한 건 남은 연료와 들고 나올 전리품뿐입니다.
        </p>
      </div>
    </div>
  );
}

function RunSummary({ site }: { site: TreasureSitePublic | null }) {
  if (!site) return null;
  const items = [
    { label: "연 칸", value: site.summary.revealed },
    { label: "상자", value: site.summary.caches },
    { label: "유물층", value: site.summary.relics },
    { label: "보급", value: site.summary.supplies },
    { label: "균열", value: site.summary.fissures },
    { label: "최대 깊이", value: site.summary.deepestDistance },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs sm:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded border border-zinc-200 bg-white/70 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950/30"
        >
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{item.label}</div>
          <div className="font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TreasureDigView({
  open,
  dig,
  loadFragments,
  loadSession,
  onBack,
  onOpenCollection,
  onOpenLeaderboard,
  onOpenShop,
}: TreasureHandlers & {
  onBack?: () => void;
  onOpenCollection?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
}) {
  const [site, setSite] = useState<TreasureSitePublic | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useSystemMessageState();
  const [fragments, setFragments] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(Boolean(loadSession));
  const [activeHoldKey, setActiveHoldKey] = useState<DrillDirection["key"] | null>(null);
  const siteRef = useRef<TreasureSitePublic | null>(null);
  const resultRef = useRef<Result>(null);
  const busyRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const holdRef = useRef<{
    timeout: number | null;
    interval: number | null;
    running: boolean;
  } | null>(null);

  useEffect(() => {
    siteRef.current = site;
  }, [site]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const stopHolding = useCallback(() => {
    const hold = holdRef.current;
    if (hold?.timeout) window.clearTimeout(hold.timeout);
    if (hold?.interval) window.clearInterval(hold.interval);
    holdRef.current = null;
    setActiveHoldKey(null);
  }, []);

  useEffect(() => stopHolding, [stopHolding]);

  useEffect(() => {
    if (!loadFragments) return;
    let alive = true;
    void loadFragments().then((n) => {
      if (alive && typeof n === "number") setFragments(n);
    });
    return () => {
      alive = false;
    };
  }, [loadFragments]);

  useEffect(() => {
    if (!loadSession) return;
    let alive = true;
    void loadSession()
      .then((s) => {
        if (alive && s) {
          siteRef.current = s;
          resultRef.current = null;
          setSite(s);
          setResult(null);
        }
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [loadSession]);

  const handleOpen = useCallback(async () => {
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const r = await open();
      if (typeof r.fragments === "number") setFragments(r.fragments);
      if (!r.ok) {
        setNotice(
          r.reason === "not_enough_fragments"
            ? `지도 조각이 부족합니다 (${r.fragments ?? 0}/${FRAGMENTS_PER_MAP}). 낚시·사냥으로 모으세요.`
            : "발굴 지점을 열 수 없습니다.",
        );
      } else {
        siteRef.current = r.site;
        resultRef.current = null;
        setSite(r.site);
        setResult(null);
      }
    } catch {
      setNotice("발굴 지점을 열 수 없습니다.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [open, setNotice]);

  const runAction = useCallback(
    async (action: TreasureAction, target?: TreasureActionTarget): Promise<ActionRunStatus> => {
      const currentSite = siteRef.current;
      if (!currentSite || resultRef.current) return "stop";
      if (busyRef.current) return "busy";
      busyRef.current = true;
      setBusy(true);
      setNotice(null);
      try {
        const r = await dig(currentSite.siteId, action, target);
        switch (r.outcome) {
          case "hit":
            if (r.site) {
              siteRef.current = r.site;
              setSite(r.site);
            }
            resultRef.current = { kind: "hit", antique: r.antique };
            setResult(resultRef.current);
            return "stop";
          case "exhausted":
            siteRef.current = r.site;
            setSite(r.site);
            resultRef.current = {
              kind: "exhausted",
              message: r.message,
              missed: r.missed,
            };
            setResult(resultRef.current);
            return "stop";
          case "progress":
            siteRef.current = r.site;
            setSite(r.site);
            setNotice(r.message);
            return "continue";
          case "invalid":
            siteRef.current = r.site;
            setSite(r.site);
            return "stop";
          case "error":
            setNotice("발굴 중 오류가 발생했습니다.");
            return "stop";
        }
      } catch {
        setNotice("발굴 중 오류가 발생했습니다.");
        return "stop";
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return "stop";
    },
    [dig, setNotice],
  );

  const executeDirection = useCallback(
    async (direction: DrillDirection): Promise<ActionRunStatus> => {
      const currentSite = siteRef.current;
      if (!currentSite || resultRef.current) return "stop";
      const command = drillCommandForDirection(currentSite, direction);
      if (!command || currentSite.forcedRetreat) return "stop";
      return runAction(command.action, command.target);
    },
    [runAction],
  );

  const handleDirection = useCallback(
    (direction: DrillDirection) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      void executeDirection(direction);
    },
    [executeDirection],
  );

  const startHolding = useCallback(
    (direction: DrillDirection) => {
      stopHolding();
      setActiveHoldKey(direction.key);
      const tick = async () => {
        const hold = holdRef.current;
        if (!hold || hold.running) return;
        hold.running = true;
        try {
          const status = await executeDirection(direction);
          if (status === "stop") stopHolding();
        } finally {
          if (holdRef.current) holdRef.current.running = false;
        }
      };
      const timeout = window.setTimeout(() => {
        suppressNextClickRef.current = true;
        void tick();
        const hold = holdRef.current;
        if (hold) hold.interval = window.setInterval(() => void tick(), 520);
      }, 360);
      holdRef.current = { timeout, interval: null, running: false };
    },
    [executeDirection, stopHolding],
  );

  const handleAction = useCallback(
    (action: TreasureAction, target?: TreasureActionTarget) => {
      void runAction(action, target);
    },
    [runAction],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="보물 발굴"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            지도 조각 {fragments ?? "..."}개
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        드릴 방향을 고르고, 연료를 써서 발견물을 챙긴 뒤 귀환합니다.
      </p>

      <TreasureSubTabs
        active="dig"
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenCollection={onOpenCollection}
        onOpenShop={onOpenShop}
      />

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {notice}
        </div>
      )}

      {!site && !restoring && (
        <div className="rounded-md border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            지하 채굴형 발굴
          </p>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>지도 조각 {FRAGMENTS_PER_MAP}개를 드릴 연료로 바꿔 지하 입구를 엽니다.</li>
            <li>왼쪽, 아래, 오른쪽 중 하나를 골라 파고 들어갑니다.</li>
            <li>연료가 남아 있을 때 발견물을 들고 귀환하면 보상이 확정됩니다.</li>
          </ol>
        </div>
      )}

      {site && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>현재 깊이 {site.depth}</span>
              <span>{site.forcedRetreat ? "귀환 필요" : `팔 수 있는 방향 ${site.adjacentHidden}`}</span>
            </div>
            <DepthTrack depth={site.depth} maxDepth={site.maxDepth} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Meter label="연료" value={site.energy} max={site.maxEnergy} tone="sky" />
              <Meter label="들고 있는 전리품" value={site.haul} max={320} tone="amber" />
            </div>
          </div>

          <DrillPanel
            site={site}
            busy={busy}
            result={result}
            activeHoldKey={activeHoldKey}
            onDirection={handleDirection}
            onHoldStart={startHolding}
            onHoldEnd={stopHolding}
          />

          {!result && (
            <button
              type="button"
              disabled={busy || !site.canRetreat}
              onClick={() => handleAction("retreat")}
              title={TREASURE_ACTION_HELP.retreat}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <HandCoins size={18} weight="bold" />
              발견물 챙겨 귀환
            </button>
          )}

          {site.actions.length > 0 && (
            <div className="rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <div className="mb-2 font-semibold text-zinc-800 dark:text-zinc-100">
                발굴 기록
              </div>
              <div className="space-y-1.5">
                {site.actions.slice().reverse().map((a, idx) => (
                  <div key={`${a.action}-${site.actions.length - idx}`} className="flex gap-2">
                    <span className="shrink-0 text-zinc-400">
                      {site.actions.length - idx}회
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>{TREASURE_ACTION_LABEL[a.action]}</b> · {a.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result?.kind === "hit" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">발굴 성공</p>
          <p className="mt-1 text-lg font-bold">
            {result.antique.name}{" "}
            <span className={`text-sm ${TIER_STYLE[result.antique.tier] ?? ""}`}>
              ({TIER_LABEL[result.antique.tier] ?? result.antique.tier})
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            보존상태 {result.antique.condition}% · 판매가{" "}
            {(result.antique.appraisedValue * TREASURE_SELL_GOLD_MULT).toLocaleString()}골드
          </p>
          <RunSummary site={site} />
        </div>
      )}

      {result?.kind === "exhausted" && (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">발굴 실패</p>
          <p className="mt-1 text-sm">{result.message}</p>
          <p className="mt-1 text-sm">
            잃어버린 유물:{" "}
            <span className="font-bold">
              {result.missed.name}{" "}
              <span className={TIER_STYLE[result.missed.tier] ?? ""}>
                ({TIER_LABEL[result.missed.tier] ?? result.missed.tier})
              </span>
            </span>
          </p>
          <RunSummary site={site} />
        </div>
      )}

      {(!site || result) && !restoring ? (
        <button
          type="button"
          disabled={busy || (fragments !== null && fragments < FRAGMENTS_PER_MAP)}
          onClick={handleOpen}
          className="w-full rounded-md bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy
            ? "여는 중..."
            : fragments !== null && fragments < FRAGMENTS_PER_MAP
              ? `지도 조각 부족 (${fragments}/${FRAGMENTS_PER_MAP})`
              : `${result ? "다시 발굴하기" : "발굴 지점 열기"} (지도 조각 ${FRAGMENTS_PER_MAP}개)`}
        </button>
      ) : null}
    </main>
  );
}
