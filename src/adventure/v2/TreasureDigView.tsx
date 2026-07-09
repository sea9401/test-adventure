"use client";

import { TREASURE_SELL_GOLD_MULT } from "@/adventure/data/v2/antique";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUUpLeft,
  Bomb,
  Compass,
  HandCoins,
  MagnifyingGlass,
  MapTrifold,
  Shield,
  Shovel,
} from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import {
  TREASURE_ACTION_HELP,
  TREASURE_ACTION_LABEL,
  type TreasureAction,
  type TreasureActionTarget,
  type TreasureCellKind,
  type TreasureCellPublic,
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

const TOOL_ACTIONS: TreasureAction[] = [
  "scan",
  "secure",
  "rope",
  "retreat",
];

type Direction = "up" | "right" | "down" | "left";

const DIRECTION_META: Record<
  Direction,
  {
    label: string;
    Icon: ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" }>;
  }
> = {
  up: { label: "위", Icon: ArrowUp },
  right: { label: "오른쪽", Icon: ArrowRight },
  down: { label: "아래", Icon: ArrowDown },
  left: { label: "왼쪽", Icon: ArrowLeft },
};

const ACTION_ICON: Record<
  TreasureAction,
  ComponentType<{ size?: number; weight?: "regular" | "bold" | "fill" }>
> = {
  excavate: MapTrifold,
  move: Compass,
  scan: MagnifyingGlass,
  bomb: Bomb,
  secure: Shield,
  rope: ArrowUUpLeft,
  retreat: HandCoins,
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

function cellGlyph(cell: TreasureCellPublic): string {
  if (!cell.kind) return cell.adjacent ? "?" : "";
  switch (cell.kind) {
    case "camp":
      return "IN";
    case "soil":
      return "";
    case "dense":
      return "";
    case "rock":
      return "";
    case "clue":
      return "R";
    case "cache":
      return "C";
    case "supply":
      return "F";
    case "relic":
      return "A";
    case "fissure":
      return "!";
  }
}

function actionForCell(
  cell: TreasureCellPublic,
  mapMode: "excavate" | "bomb",
): TreasureAction | null {
  if (cell.current) return null;
  if (cell.adjacent && cell.revealed) return "move";
  if (cell.adjacent && !cell.revealed) return mapMode;
  return null;
}

function neighborIndex(site: TreasureSitePublic, direction: Direction): number | null {
  const x = site.position % site.gridSize;
  const y = Math.floor(site.position / site.gridSize);
  const next = {
    up: { x, y: y - 1 },
    right: { x: x + 1, y },
    down: { x, y: y + 1 },
    left: { x: x - 1, y },
  }[direction];
  if (next.x < 0 || next.x >= site.gridSize || next.y < 0 || next.y >= site.gridHeight) {
    return null;
  }
  return next.y * site.gridSize + next.x;
}

function targetLabelForCell(cell: TreasureCellPublic, mapMode: "excavate" | "bomb"): string {
  if (cell.revealed) return "이동";
  if (mapMode === "bomb") return "폭약";
  return "발굴";
}

type Result =
  | { kind: "hit"; antique: DugAntique }
  | {
      kind: "exhausted";
      message: string;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | null;

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

function TreasureMap({
  site,
  busy,
  result,
  mapMode,
  activeCell,
  onAction,
}: {
  site: TreasureSitePublic;
  busy: boolean;
  result: Result;
  mapMode: "excavate" | "bomb";
  activeCell: number | null;
  onAction: (action: TreasureAction, target?: TreasureActionTarget) => void;
}) {
  const directionTargets = (Object.keys(DIRECTION_META) as Direction[]).map((direction) => {
    const index = neighborIndex(site, direction);
    const cell = typeof index === "number" ? site.cells[index] : null;
    const action = cell ? actionForCell(cell, mapMode) : null;
    const disabled =
      busy ||
      !!result ||
      !cell ||
      !action ||
      site.forcedRetreat ||
      (action === "bomb" && site.tools.bombs <= 0);
    return { direction, cell, action, disabled };
  });

  return (
    <div className="overflow-hidden rounded-md border border-stone-700 bg-stone-950 text-stone-100 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-stone-800 bg-zinc-950 px-3 py-2 text-xs">
        <span className="font-semibold text-amber-200">지하 채굴</span>
        <div className="flex items-center gap-2 text-stone-400">
          <span>
            깊이 <b className="text-stone-100">{site.depth}</b>/{site.maxDepth}
          </span>
          <span>
            위치 <b className="text-stone-100">{site.position + 1}</b>
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_144px]">
        <div
          className="grid overflow-hidden rounded border border-stone-800 bg-stone-900 shadow-inner"
          style={{ gridTemplateColumns: `repeat(${site.gridSize}, minmax(0, 1fr))` }}
        >
          {site.cells.map((cell) => {
            const action = actionForCell(cell, mapMode);
            const disabled =
              busy ||
              !!result ||
              !action ||
              site.forcedRetreat ||
              (action === "bomb" && site.tools.bombs <= 0);
            const visible = cell.revealed || cell.scanned || cell.current;
            const tone = visible ? CELL_TONE[cell.kind ?? "hidden"] : CELL_TONE.hidden;
            const title = cell.kind
              ? `${cell.label} · ${cell.reward} · 비용 ${cell.cost}`
              : cell.adjacent
                ? mapMode === "bomb"
                  ? "흙벽 · 폭약 1개와 연료 1로 뚫습니다"
                  : "흙벽 · 연료 소모는 지층에 따라 달라집니다"
                : "아직 닿지 않는 흙벽";
            const isTunnel = cell.revealed || cell.current;
            const isTarget = !!action;
            const isActive = activeCell === cell.index;
            const depthShade =
              cell.y > site.gridHeight * 0.66
                ? "brightness-[0.78]"
                : cell.y > site.gridHeight * 0.36
                  ? "brightness-[0.9]"
                  : "";
            return (
              <button
                key={cell.index}
                type="button"
                disabled={disabled}
                title={title}
                onClick={() => {
                  if (action) onAction(action, { cell: cell.index });
                }}
                className={`group relative aspect-square min-h-9 overflow-hidden border border-black/20 text-[10px] font-bold transition disabled:cursor-not-allowed ${tone} ${depthShade} ${
                  cell.current
                    ? "z-20 ring-2 ring-sky-300"
                    : isTarget
                      ? "ring-1 ring-amber-300/60 hover:z-10 hover:brightness-125"
                      : ""
                } ${isActive ? "animate-pulse brightness-125" : ""}`}
              >
                {!isTunnel && (
                  <>
                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16),transparent_25%),radial-gradient(circle_at_70%_75%,rgba(0,0,0,0.18),transparent_30%)]" />
                    <span className="absolute inset-x-0 bottom-0 h-1/3 bg-black/15" />
                  </>
                )}
                {isTunnel && (
                  <span className="absolute inset-[12%] rounded-sm bg-zinc-950/80 shadow-inner" />
                )}
                {cell.kind === "rock" && !isTunnel && (
                  <span className="absolute inset-x-[18%] top-[28%] h-[36%] rounded-full bg-zinc-300/35" />
                )}
                {(cell.kind === "cache" ||
                  cell.kind === "relic" ||
                  cell.kind === "supply" ||
                  cell.kind === "clue") && (
                  <span className="absolute inset-[28%] rounded-full bg-current opacity-70 blur-[1px]" />
                )}
                {cell.current ? (
                  <span className="absolute inset-[13%] flex items-center justify-center rounded bg-sky-300 text-sky-950 shadow">
                    <Shovel size={18} weight="fill" />
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    {cellGlyph(cell)}
                  </span>
                )}
                {cell.scanned && !cell.revealed && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
                )}
                {isTarget && (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[9px] text-white">
                    {cell.kind ? cell.cost : "?"}
                  </span>
                )}
                {isTarget && !cell.revealed && (
                  <span className="absolute left-1 top-1 rounded bg-amber-300/90 px-1 text-[8px] font-black text-stone-950 opacity-0 transition group-hover:opacity-100">
                    {targetLabelForCell(cell, mapMode)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 grid-rows-3 gap-1.5 self-center">
          {directionTargets.map(({ direction, cell, action, disabled }) => {
            const { Icon, label } = DIRECTION_META[direction];
            const positionClass = {
              up: "col-start-2 row-start-1",
              right: "col-start-3 row-start-2",
              down: "col-start-2 row-start-3",
              left: "col-start-1 row-start-2",
            }[direction];
            return (
              <button
                key={direction}
                type="button"
                disabled={disabled}
                title={
                  cell && action
                    ? `${label} ${targetLabelForCell(cell, mapMode)}`
                    : `${label} 통로 없음`
                }
                onClick={() => {
                  if (cell && action) onAction(action, { cell: cell.index });
                }}
                className={`${positionClass} flex aspect-square items-center justify-center rounded border border-stone-700 bg-stone-800 text-stone-100 transition hover:border-amber-300 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-30`}
              >
                <Icon size={24} weight="bold" />
              </button>
            );
          })}
          <div className="col-start-2 row-start-2 flex aspect-square items-center justify-center rounded border border-sky-500/60 bg-sky-400 text-sky-950 shadow-[0_0_18px_rgba(56,189,248,0.25)]">
            <Shovel size={24} weight="fill" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 border-t border-stone-800 bg-zinc-950 px-3 py-2 text-[10px] text-stone-400 sm:grid-cols-8">
        {(["soil", "dense", "rock", "clue", "cache", "supply", "relic", "fissure"] as TreasureCellKind[]).map(
          (kind) => (
            <div key={kind} className="flex min-w-0 items-center gap-1">
              <span className={`h-3 w-3 shrink-0 rounded-sm ${CELL_TONE[kind]}`} />
              <span className="truncate">{cellLabelForView(kind)}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function cellLabelForView(kind: TreasureCellKind): string {
  switch (kind) {
    case "camp":
      return "입구";
    case "soil":
      return "흙";
    case "dense":
      return "단단";
    case "rock":
      return "암반";
    case "clue":
      return "반응";
    case "cache":
      return "상자";
    case "supply":
      return "보급";
    case "relic":
      return "유물층";
    case "fissure":
      return "균열";
  }
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
  const [notice, setNotice] = useState<string | null>(null);
  const [fragments, setFragments] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(Boolean(loadSession));
  const [mapMode, setMapMode] = useState<"excavate" | "bomb">("excavate");
  const [activeCell, setActiveCell] = useState<number | null>(null);

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
        setSite(r.site);
        setResult(null);
        setMapMode("excavate");
        setActiveCell(null);
      }
    } catch {
      setNotice("발굴 지점을 열 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }, [open]);

  const handleAction = useCallback(
    async (action: TreasureAction, target?: TreasureActionTarget) => {
      if (!site || busy || result) return;
      setBusy(true);
      setNotice(null);
      setActiveCell(typeof target?.cell === "number" ? target.cell : null);
      try {
        const r = await dig(site.siteId, action, target);
        switch (r.outcome) {
          case "hit":
            if (r.site) setSite(r.site);
            setResult({ kind: "hit", antique: r.antique });
            break;
          case "exhausted":
            setSite(r.site);
            setResult({
              kind: "exhausted",
              message: r.message,
              missed: r.missed,
            });
            break;
          case "progress":
            setSite(r.site);
            setNotice(r.message);
            break;
          case "invalid":
            setSite(r.site);
            break;
          case "error":
            setNotice("발굴 중 오류가 발생했습니다.");
            break;
        }
      } catch {
        setNotice("발굴 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
        window.setTimeout(() => setActiveCell(null), 180);
      }
    },
    [site, busy, result, dig],
  );

  const actionsRemaining = site ? site.actionsAllowed - site.actionsUsed : 0;
  const canProgress = !!site && !site.forcedRetreat && !result;
  const effectiveMapMode = site?.tools.bombs === 0 ? "excavate" : mapMode;

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
        지도 조각으로 드릴 연료를 채우고, 지하에서 챙긴 발견물을 들고 귀환합니다.
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
            <li>흙벽을 뚫거나 이미 열린 터널로 이동하며 연료를 씁니다.</li>
            <li>발견물을 들고 귀환해야 보상이 확정됩니다. 무너지면 발굴은 실패합니다.</li>
          </ol>
        </div>
      )}

      {site && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                남은 행동{" "}
                <b className="tabular-nums text-zinc-800 dark:text-zinc-100">
                  {Math.max(0, actionsRemaining)}
                </b>
                /{site.actionsAllowed}
              </span>
              <span>{site.forcedRetreat ? "귀환 판단 필요" : `주변 숨은 칸 ${site.adjacentHidden}`}</span>
            </div>
            <DepthTrack depth={site.depth} maxDepth={site.maxDepth} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Meter label="연료" value={site.energy} max={site.maxEnergy} tone="sky" />
              <Meter label="들고 있는 전리품" value={site.haul} max={320} tone="amber" />
              <Meter label="안정도" value={site.stability} max={100} suffix="%" tone="emerald" />
              <Meter label="붕괴 위험" value={site.risk} max={100} suffix="%" tone="rose" />
              <Meter label="판독" value={site.insight} max={100} suffix="%" tone="sky" />
            </div>
          </div>

          <TreasureMap
            site={site}
            busy={busy}
            result={result}
            mapMode={effectiveMapMode}
            activeCell={activeCell}
            onAction={handleAction}
          />

          {!result && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-white p-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setMapMode("excavate")}
                className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 font-semibold transition ${
                  effectiveMapMode === "excavate"
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                <Shovel size={16} weight="bold" />
                <span>일반 발굴</span>
              </button>
              <button
                type="button"
                disabled={site.tools.bombs <= 0}
                onClick={() => setMapMode("bomb")}
                className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  effectiveMapMode === "bomb"
                    ? "border-rose-700 bg-rose-700 text-white dark:border-rose-300 dark:bg-rose-300 dark:text-rose-950"
                    : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
                }`}
              >
                <Bomb size={16} weight="bold" />
                <span>폭약 발굴 {site.tools.bombs}개</span>
              </button>
            </div>
          )}

          <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">현재 판단</h2>
              {site.energy > 0 && !site.forcedRetreat && (
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  현재 깊이 {site.depth}
                </span>
              )}
            </div>
            {site.hints.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {site.hints.map((h) => (
                  <span
                    key={h.key}
                    className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {h.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                아직 챙긴 단서가 부족합니다. 탐지를 쓰거나 유물 반응 지층을 열면 판독이 빨라집니다.
              </p>
            )}
          </div>

          {!result && (
            <div className="grid gap-2 sm:grid-cols-3">
              {TOOL_ACTIONS.map((action) => {
                const Icon = ACTION_ICON[action];
                const isRetreat = action === "retreat";
                const isRope = action === "rope";
                const disabled =
                  busy ||
                  (isRetreat || isRope
                    ? !site.canRetreat || (isRope && site.tools.ropes <= 0)
                    : !canProgress);
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleAction(action)}
                    title={TREASURE_ACTION_HELP[action]}
                    className={`flex min-h-16 gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isRetreat
                        ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                        : isRope
                          ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100"
                        : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Icon size={18} weight="bold" />
                    <span className="min-w-0">
                      <span className="block">{TREASURE_ACTION_LABEL[action]}</span>
                      <span className="mt-1 block text-[11px] font-normal leading-snug opacity-70">
                        {action === "rope"
                          ? `${TREASURE_ACTION_HELP[action]} (${site.tools.ropes}개)`
                          : TREASURE_ACTION_HELP[action]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
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
