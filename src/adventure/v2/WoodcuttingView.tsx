"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  DEFAULT_WOODCUTTING_SPOT_ID,
  WOODCUTTING_SPOTS,
  WOODCUTTING_SPOT_IDS,
  woodcuttingTreeForSpot,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import { woodcuttingProgressionView } from "./woodcuttingProgression";

export type WoodcuttingLogView = {
  cuts: number;
  timberEarned: number;
};

export type WoodcuttingTreeView = {
  id: string;
  name: string;
  tier: string;
};

export type WoodcuttingStart = {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  tree: WoodcuttingTreeView;
  durationMs: number;
  chops: number;
};

export type WoodcuttingOutcome =
  | {
      success: true;
      tree: WoodcuttingTreeView;
      timberGained: number;
      timber: number;
      log: WoodcuttingLogView;
    }
  | {
      success: false;
      reason: string;
    };

export type WoodcuttingHandlers = {
  start: (spotId: WoodcuttingSpotId) => Promise<WoodcuttingStart>;
  finish: (sessionId: string) => Promise<WoodcuttingOutcome>;
  timber: number;
  log: WoodcuttingLogView;
};

type Phase = "idle" | "loading" | "cutting" | "finishing" | "result";

const TAU = Math.PI * 2;
const TREE_FALL_MS = 700;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function drawLeafCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (const [dx, dy, scale] of [
    [0, 0, 1],
    [-0.65, 0.2, 0.72],
    [0.65, 0.18, 0.76],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(
      x + radius * dx,
      y + radius * dy,
      radius * 1.08 * scale,
      radius * 0.68 * scale,
      0,
      0,
      TAU,
    );
    ctx.fill();
  }
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#bfdbfe");
  sky.addColorStop(0.58, "#dcfce7");
  sky.addColorStop(1, "#166534");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 127 + time * 8) % (width + 100)) - 50;
    const y = height * (0.1 + i * 0.045);
    ctx.beginPath();
    ctx.ellipse(x, y, 34 + i * 4, 9 + i, 0, 0, TAU);
    ctx.fill();
  }

  for (let layer = 0; layer < 3; layer += 1) {
    const baseY = height * (0.5 + layer * 0.08);
    ctx.fillStyle = layer === 0 ? "#14532d" : layer === 1 ? "#166534" : "#15803d";
    ctx.globalAlpha = 0.34 + layer * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= width + 30; x += 30) {
      ctx.lineTo(x, baseY + Math.sin(time * 0.6 + x * 0.04) * 4);
      ctx.lineTo(x + 15, baseY - 22 - layer * 7);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const ground = ctx.createLinearGradient(0, height * 0.72, 0, height);
  ground.addColorStop(0, "#4d7c0f");
  ground.addColorStop(1, "#14532d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, height * 0.73, width, height * 0.27);
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  damage: number,
  fall: number,
  shake: number,
) {
  const trunkX = width * 0.5;
  const groundY = height * 0.84;
  const trunkTop = height * 0.25;
  const trunkWidth = Math.max(52, width * 0.15);

  ctx.save();
  ctx.translate(trunkX, groundY);
  ctx.rotate(fall * 1.2 + Math.sin(damage * 90) * shake * 0.012);
  ctx.translate(-trunkX, -groundY);

  ctx.fillStyle = "rgba(15,23,42,0.24)";
  ctx.beginPath();
  ctx.ellipse(trunkX, groundY + 9, trunkWidth, 13, 0, 0, TAU);
  ctx.fill();

  const bark = ctx.createLinearGradient(
    trunkX - trunkWidth / 2,
    0,
    trunkX + trunkWidth / 2,
    0,
  );
  bark.addColorStop(0, "#4a2f1b");
  bark.addColorStop(0.35, "#8b572a");
  bark.addColorStop(0.7, "#a36a34");
  bark.addColorStop(1, "#513016");
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(trunkX - trunkWidth * 0.48, groundY);
  ctx.bezierCurveTo(
    trunkX - trunkWidth * 0.48,
    height * 0.62,
    trunkX - trunkWidth * 0.32,
    height * 0.4,
    trunkX - trunkWidth * 0.25,
    trunkTop,
  );
  ctx.lineTo(trunkX + trunkWidth * 0.25, trunkTop);
  ctx.bezierCurveTo(
    trunkX + trunkWidth * 0.32,
    height * 0.4,
    trunkX + trunkWidth * 0.48,
    height * 0.62,
    trunkX + trunkWidth * 0.48,
    groundY,
  );
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,237,213,0.22)";
  ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i += 1) {
    const x = trunkX + i * trunkWidth * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, groundY - 10);
    ctx.bezierCurveTo(x + 8, height * 0.65, x - 6, height * 0.45, x + 3, trunkTop + 20);
    ctx.stroke();
  }

  const cutY = height * 0.7;
  const cutDepth = trunkWidth * 0.7 * damage;
  ctx.fillStyle = "#fde0b0";
  ctx.beginPath();
  ctx.moveTo(trunkX + trunkWidth * 0.5, cutY - 13);
  ctx.lineTo(trunkX + trunkWidth * 0.5 - cutDepth, cutY);
  ctx.lineTo(trunkX + trunkWidth * 0.5, cutY + 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (damage > 0.35) {
    ctx.strokeStyle = "rgba(69,26,3,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(trunkX + 4, cutY);
    ctx.lineTo(trunkX - 7, cutY - 18 * damage);
    ctx.lineTo(trunkX - 2, cutY - 31 * damage);
    ctx.stroke();
  }

  drawLeafCluster(ctx, trunkX - width * 0.09, trunkTop + 10, 56, "#166534");
  drawLeafCluster(ctx, trunkX + width * 0.09, trunkTop + 8, 58, "#15803d");
  drawLeafCluster(ctx, trunkX, trunkTop - 28, 64, "#16a34a");
  drawLeafCluster(ctx, trunkX, trunkTop + 20, 48, "#22c55e");
  ctx.restore();
}

function drawAxe(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cycle: number,
  visible: boolean,
) {
  if (!visible) return;
  const strike = cycle < 0.72 ? easeOutCubic(cycle / 0.72) : 1 - (cycle - 0.72) / 0.28;
  const angle = -0.35 - strike * 1.25;
  const x = width * (0.84 - strike * 0.21);
  const y = height * (0.6 + strike * 0.08);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = "#854d0e";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-58, -8);
  ctx.stroke();
  ctx.fillStyle = "#d4d4d8";
  ctx.strokeStyle = "#52525b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-67, -25);
  ctx.lineTo(-38, -20);
  ctx.lineTo(-44, 4);
  ctx.lineTo(-74, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (cycle > 0.64 && cycle < 0.84) {
    const burst = (cycle - 0.64) / 0.2;
    ctx.fillStyle = `rgba(253,230,138,${1 - burst})`;
    for (let i = 0; i < 9; i += 1) {
      const angle2 = -1.2 + i * 0.28;
      const distance = 8 + burst * (24 + (i % 3) * 7);
      ctx.beginPath();
      ctx.arc(
        width * 0.58 + Math.cos(angle2) * distance,
        height * 0.7 + Math.sin(angle2) * distance,
        2.4,
        0,
        TAU,
      );
      ctx.fill();
    }
  }
}

function AutoWoodcuttingCanvas({
  durationMs,
  startedAt,
  phase,
}: {
  durationMs: number;
  startedAt: number;
  phase: Phase;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sceneStartedAt = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const elapsed = Math.max(0, now - startedAt);
        const damage = clamp01(elapsed / durationMs);
        const fall = easeOutCubic(clamp01((elapsed - durationMs) / TREE_FALL_MS));
        const cycle = reducedMotion ? 0.7 : (elapsed % 600) / 600;
        const impact = cycle > 0.66 && cycle < 0.82 ? 1 : 0;
        drawBackdrop(ctx, width, height, reducedMotion ? 0 : (now - sceneStartedAt) / 1000);
        drawTree(ctx, width, height, damage, fall, impact);
        drawAxe(ctx, width, height, cycle, phase === "cutting" && damage < 1);
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, phase, startedAt]);

  return (
    <div ref={wrapRef} className="woodcutting-canvas-scene pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} aria-hidden="true" className="woodcutting-scene-canvas" />
    </div>
  );
}

const FAILURE_MESSAGE: Record<string, string> = {
  no_session: "벌목 작업을 찾지 못했습니다.",
  stale: "다른 벌목 작업이 시작되었습니다.",
  expired: "통나무를 거둘 시간이 지나버렸습니다.",
};

export function WoodcuttingView({
  start,
  finish,
  timber,
  log,
  onBack,
  initialSpotId = DEFAULT_WOODCUTTING_SPOT_ID,
  onSpotChange,
}: WoodcuttingHandlers & {
  onBack: () => void;
  initialSpotId?: WoodcuttingSpotId;
  onSpotChange?: (spotId: WoodcuttingSpotId) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedSpotId, setSelectedSpotId] = useState<WoodcuttingSpotId>(
    initialSpotId,
  );
  const [run, setRun] = useState<WoodcuttingStart | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<WoodcuttingOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCut = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setResult(null);
    setRun(null);
    setElapsedMs(0);
    try {
      const next = await start(selectedSpotId);
      const now = performance.now();
      setRun(next);
      setStartedAt(now);
      setPhase("cutting");
    } catch {
      setError("벌목을 시작하지 못했습니다.");
      setPhase("idle");
    }
  }, [selectedSpotId, start]);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    const ticker = window.setInterval(() => {
      setElapsedMs(Math.min(run.durationMs, performance.now() - startedAt));
    }, 80);
    const fallTimer = window.setTimeout(() => {
      setElapsedMs(run.durationMs);
      setPhase("finishing");
    }, run.durationMs);
    const finishTimer = window.setTimeout(() => {
      void finish(run.sessionId)
        .then((outcome) => {
          if (!alive) return;
          setResult(outcome);
          if (!outcome.success) {
            setError(FAILURE_MESSAGE[outcome.reason] ?? "벌목 처리 중 문제가 생겼습니다.");
          } else if (navigator.vibrate) {
            navigator.vibrate([45, 40, 90]);
          }
          setPhase("result");
        })
        .catch(() => {
          if (!alive) return;
          setError("벌목 처리 중 문제가 생겼습니다.");
          setPhase("result");
        });
    }, run.durationMs + TREE_FALL_MS);
    return () => {
      alive = false;
      window.clearInterval(ticker);
      window.clearTimeout(fallTimer);
      window.clearTimeout(finishTimer);
    };
  }, [finish, run, startedAt]);

  const progress = run ? clamp01(elapsedMs / run.durationMs) : 0;
  const chopCount = useMemo(
    () => (run ? Math.min(run.chops, Math.floor(progress * run.chops) + (progress < 1 ? 1 : 0)) : 0),
    [progress, run],
  );
  const selectedSpot = WOODCUTTING_SPOTS[selectedSpotId];
  const busy = phase === "loading" || phase === "cutting" || phase === "finishing";
  const progression = woodcuttingProgressionView(log.cuts);
  const levelProgressPct = progression.maxLevel
    ? 100
    : Math.min(100, (progression.xpIntoLevel / progression.xpForNext) * 100);

  return (
    <main className="mx-auto my-2 w-[calc(100%-1rem)] max-w-[560px] space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5">
      <SubViewHeader title="벌목장" onBack={onBack} />

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">통나무</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{timber}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">벌목 완료</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.cuts}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">누적 획득</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.timberEarned}</div>
        </Card>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100">
              벌목 Lv {progression.level}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              벌목 1회당 +10 XP · 최대 Lv 50
            </div>
          </div>
          <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {progression.maxLevel
              ? "최고 레벨"
              : `${progression.xpIntoLevel}/${progression.xpForNext} XP`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${levelProgressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {WOODCUTTING_SPOT_IDS.map((spotId) => {
          const spot = WOODCUTTING_SPOTS[spotId];
          const selected = selectedSpotId === spotId;
          return (
            <button
              key={spotId}
              type="button"
              disabled={busy}
              onClick={() => {
                setSelectedSpotId(spotId);
                onSpotChange?.(spotId);
              }}
              className={`rounded-xl border p-2.5 text-left transition ${
                selected
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400 dark:border-emerald-500 dark:bg-emerald-950/40"
                  : "border-zinc-200 bg-white/75 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-800/70"
              } disabled:cursor-not-allowed disabled:opacity-65`}
            >
              <div className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100">
                {spot.name}
              </div>
              <div className="mt-1 text-[10px] leading-4 text-emerald-700 dark:text-emerald-300">
                {woodcuttingTreeForSpot(spot).name}
              </div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                {spot.description}
              </div>
            </button>
          );
        })}
      </div>

      {run ? (
        <div className="space-y-2">
          <div className="relative h-80 w-full overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
            <AutoWoodcuttingCanvas durationMs={run.durationMs} startedAt={startedAt} phase={phase} />
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-extrabold text-zinc-800 shadow dark:bg-zinc-900/90 dark:text-zinc-100">
                {WOODCUTTING_SPOTS[run.spotId].shortName} · {run.tree.name}
              </span>
              <span className="rounded-full bg-emerald-700/90 px-3 py-1.5 text-xs font-extrabold text-white shadow">
                {phase === "cutting"
                  ? `도끼질 ${chopCount}/${run.chops}`
                  : phase === "finishing"
                    ? "쓰러지는 중…"
                    : "벌목 완료"}
              </span>
            </div>
            <div className="absolute inset-x-4 bottom-4 z-10 overflow-hidden rounded-full border border-white/70 bg-black/25 p-0.5 shadow">
              <div
                className="h-2.5 rounded-full bg-amber-400 transition-[width] duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          {phase === "result" && (
            <Card padding="md" className="text-center">
              {error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              ) : result?.success ? (
                <div className="space-y-1">
                  <div className="font-bold">{result.tree.name} 벌목 완료</div>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    통나무 +{result.timberGained}
                  </div>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : (
        <Card padding="md" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          버튼을 누르면 나무가 쓰러질 때까지 자동으로 벌목합니다.
        </Card>
      )}

      {(phase === "idle" || phase === "result") && (
        <Button onClick={() => void startCut()} variant="success" size="md" fullWidth>
          {phase === "result" ? `${selectedSpot.shortName}에서 다시 벌목` : `${selectedSpot.shortName}에서 벌목 시작`}
        </Button>
      )}
      {(phase === "loading" || phase === "cutting" || phase === "finishing") && (
        <Button disabled variant="success" size="md" fullWidth>
          {phase === "loading" ? "나무를 고르는 중…" : "벌목 중…"}
        </Button>
      )}
    </main>
  );
}
