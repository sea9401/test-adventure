"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

export type WoodcuttingSpot = "root" | "left" | "center" | "right";
export type WoodcuttingHitGrade = "perfect" | "good" | "clean" | "miss";

export type WoodcuttingRoundView = {
  index: number;
  total: number;
  weakSpot: WoodcuttingSpot;
  readyDelayMs: number;
  windowMs: number;
};

export type WoodcuttingHitView = {
  round: number;
  spot: WoodcuttingSpot;
  weakSpot: WoodcuttingSpot;
  reactionMs: number;
  grade: WoodcuttingHitGrade;
  score: number;
  reason: "ok" | "expired" | "too_early" | "missed_window" | "wrong_spot";
};

export type WoodcuttingLogView = {
  cuts: number;
  perfectCuts: number;
  timberEarned: number;
  bestReactionMs: number | null;
  bestCombo: number;
};

export type WoodcuttingTreeView = { id: string; name: string; tier: string };

export type WoodcuttingLane = -2 | -1 | 0 | 1 | 2;
export type WoodcuttingBackCut = "low" | "level" | "high";

export type WoodcuttingChallengeView = {
  wind: -1 | 0 | 1;
  safeLane: WoodcuttingLane;
  idealBackCut: WoodcuttingBackCut;
};

export type WoodcuttingJudgmentView = WoodcuttingChallengeView & {
  selectedLane: WoodcuttingLane;
  backCut: WoodcuttingBackCut;
  landingLane: WoodcuttingLane;
  directionError: number;
  backCutError: number;
  score: number;
  grade: "perfect" | "good" | "clean" | null;
  reason: "ok" | "unsafe_fall";
};

export type WoodcuttingStart = {
  sessionId: string;
  tree: WoodcuttingTreeView;
  challenge: WoodcuttingChallengeView;
};

export type WoodcuttingOutcome =
  | {
      complete: true;
      success: true;
      tree: WoodcuttingTreeView;
      grade: "perfect" | "good" | "clean";
      timberGained: number;
      timber: number;
      judgment: WoodcuttingJudgmentView;
      log: WoodcuttingLogView;
    }
  | {
      complete: true;
      success: false;
      reason: string;
      tree: WoodcuttingTreeView | null;
      judgment: WoodcuttingJudgmentView | null;
      log: WoodcuttingLogView;
    };

export type WoodcuttingHandlers = {
  start: () => Promise<WoodcuttingStart>;
  fell: (
    sessionId: string,
    selectedLane: WoodcuttingLane,
    backCut: WoodcuttingBackCut,
  ) => Promise<WoodcuttingOutcome>;
  timber: number;
  log: WoodcuttingLogView;
};

type Phase = "idle" | "readying" | "strike" | "resolving" | "result";

const SPOT_LABEL: Record<WoodcuttingSpot, string> = {
  root: "밑동",
  left: "왼결",
  center: "속결",
  right: "오른결",
};

const SPOT_CLASS: Record<WoodcuttingSpot, string> = {
  root: "bottom-10 left-1/2 -translate-x-1/2",
  left: "bottom-28 left-[30%]",
  center: "bottom-36 left-1/2 -translate-x-1/2",
  right: "bottom-28 right-[30%]",
};

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function woodcuttingSpotPoint(
  spot: WoodcuttingSpot,
  width: number,
  height: number,
): { x: number; y: number } {
  const trunkX = width * 0.5;
  const groundY = height * 0.84;
  const trunkTop = height * 0.26;
  switch (spot) {
    case "root":
      return { x: trunkX, y: groundY - height * 0.12 };
    case "left":
      return { x: trunkX - width * 0.18, y: lerp(groundY, trunkTop, 0.46) };
    case "right":
      return { x: trunkX + width * 0.18, y: lerp(groundY, trunkTop, 0.46) };
    case "center":
    default:
      return { x: trunkX, y: lerp(groundY, trunkTop, 0.65) };
  }
}

function drawLeafCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 1.15, radius * 0.72, -0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.55, y + radius * 0.2, radius * 0.78, radius * 0.54, 0.25, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.56, y + radius * 0.18, radius * 0.78, radius * 0.54, -0.25, 0, TAU);
  ctx.fill();
}

function drawWoodcuttingBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  strike: boolean,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, strike ? "#fed7aa" : "#bfdbfe");
  sky.addColorStop(0.52, strike ? "#fde68a" : "#d9f99d");
  sky.addColorStop(1, "#166534");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  for (let i = 0; i < 4; i += 1) {
    const x = ((i * 113 + t * 8) % (width + 80)) - 40;
    const y = height * (0.1 + i * 0.045);
    ctx.beginPath();
    ctx.ellipse(x, y, 28 + i * 5, 8 + i * 2, 0, 0, TAU);
    ctx.fill();
  }

  for (let layer = 0; layer < 3; layer += 1) {
    const baseY = height * (0.51 + layer * 0.08);
    const color = layer === 0 ? "#14532d" : layer === 1 ? "#166534" : "#15803d";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= width + 32; x += 32) {
      const y = baseY + Math.sin(t * 0.5 + x * 0.035 + layer) * 5;
      ctx.lineTo(x, y);
      ctx.lineTo(x + 16, y - 22 - layer * 8);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.globalAlpha = 0.34 + layer * 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const ground = ctx.createLinearGradient(0, height * 0.72, 0, height);
  ground.addColorStop(0, "#4d7c0f");
  ground.addColorStop(1, "#14532d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, height * 0.74, width, height * 0.26);

  ctx.strokeStyle = "rgba(236, 253, 245, 0.28)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i += 1) {
    const x = (i * 41 + Math.sin(t + i) * 5) % width;
    const y = height * 0.79 + (i % 4) * 12;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.quadraticCurveTo(x + 4 + Math.sin(t * 1.4 + i) * 3, y + 4, x + 9, y);
    ctx.stroke();
  }
}

function drawWoodcuttingTree(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  impact: number,
) {
  const trunkX = width * 0.5 + Math.sin(t * 36) * impact * 2.5;
  const groundY = height * 0.84;
  const trunkTop = height * 0.24;
  const trunkW = Math.max(54, width * 0.16);
  const trunkGradient = ctx.createLinearGradient(trunkX - trunkW / 2, 0, trunkX + trunkW / 2, 0);
  trunkGradient.addColorStop(0, "#4a2f1b");
  trunkGradient.addColorStop(0.28, "#7c4a27");
  trunkGradient.addColorStop(0.7, "#9a632f");
  trunkGradient.addColorStop(1, "#513016");

  ctx.save();
  ctx.translate(trunkX, groundY);
  ctx.rotate(Math.sin(t * 24) * impact * 0.015);
  ctx.translate(-trunkX, -groundY);

  ctx.fillStyle = "rgba(15, 23, 42, 0.22)";
  ctx.beginPath();
  ctx.ellipse(trunkX, groundY + 8, trunkW * 0.95, 13, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = trunkGradient;
  ctx.beginPath();
  ctx.moveTo(trunkX - trunkW * 0.47, groundY);
  ctx.bezierCurveTo(
    trunkX - trunkW * 0.54,
    height * 0.62,
    trunkX - trunkW * 0.36,
    height * 0.4,
    trunkX - trunkW * 0.28,
    trunkTop,
  );
  ctx.lineTo(trunkX + trunkW * 0.26, trunkTop);
  ctx.bezierCurveTo(
    trunkX + trunkW * 0.34,
    height * 0.4,
    trunkX + trunkW * 0.52,
    height * 0.62,
    trunkX + trunkW * 0.47,
    groundY,
  );
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 237, 213, 0.22)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i += 1) {
    const x = trunkX - trunkW * 0.24 + i * trunkW * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, groundY - 12);
    ctx.bezierCurveTo(
      x + Math.sin(t + i) * 5,
      height * 0.68,
      x + 8 - i * 2,
      height * 0.48,
      x + Math.cos(i) * 6,
      trunkTop + 18,
    );
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(69, 26, 3, 0.42)";
  ctx.lineWidth = 2;
  for (let y = groundY - 28; y > trunkTop + 20; y -= 38) {
    ctx.beginPath();
    ctx.moveTo(trunkX - trunkW * 0.24, y);
    ctx.quadraticCurveTo(trunkX, y + 11, trunkX + trunkW * 0.24, y - 2);
    ctx.stroke();
  }

  drawLeafCluster(ctx, trunkX - width * 0.09, trunkTop + 12, 58, "#166534");
  drawLeafCluster(ctx, trunkX + width * 0.09, trunkTop + 8, 60, "#15803d");
  drawLeafCluster(ctx, trunkX, trunkTop - 26, 66, "#16a34a");
  drawLeafCluster(ctx, trunkX - width * 0.01, trunkTop + 20, 50, "#22c55e");
  ctx.restore();
}

function drawWeakSpotCue(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spot: WoodcuttingSpot,
  t: number,
  strike: boolean,
) {
  const p = woodcuttingSpotPoint(spot, width, height);
  const pulse = 0.5 + Math.sin(t * (strike ? 18 : 5)) * 0.5;
  const radius = strike ? 28 + pulse * 8 : 18 + pulse * 5;

  const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 1.9);
  glow.addColorStop(0, strike ? "rgba(251, 191, 36, 0.9)" : "rgba(251, 191, 36, 0.56)");
  glow.addColorStop(0.65, "rgba(251, 191, 36, 0.16)");
  glow.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * 1.9, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = strike ? "#fef3c7" : "#f59e0b";
  ctx.lineWidth = strike ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(p.x - radius * 0.54, p.y - radius * 0.28);
  ctx.lineTo(p.x + radius * 0.2, p.y);
  ctx.lineTo(p.x - radius * 0.14, p.y + radius * 0.62);
  ctx.stroke();
}

function drawAxeSwing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: Phase,
  phaseElapsedMs: number,
  t: number,
) {
  const swing = phase === "strike" ? Math.sin(t * 12) * 0.08 : 0;
  const resolving = phase === "resolving";
  const resolveT = resolving ? easeOutCubic(phaseElapsedMs / 320) : 0;
  const angle = -0.7 + swing - resolveT * 1.2;
  const x = lerp(width * 0.82, width * 0.62, resolveT);
  const y = lerp(height * 0.68, height * 0.53, resolveT);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#854d0e";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-54, -10);
  ctx.stroke();

  ctx.fillStyle = "#d1d5db";
  ctx.strokeStyle = "#71717a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-62, -25);
  ctx.lineTo(-34, -20);
  ctx.lineTo(-42, 4);
  ctx.lineTo(-72, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (resolving) {
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.55 * (1 - resolveT)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width * 0.56, height * 0.52, 48 + resolveT * 24, -0.7, 0.5);
    ctx.stroke();
  }
}

function drawHitParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lastHit: WoodcuttingHitView | null,
  phaseElapsedMs: number,
) {
  if (!lastHit || phaseElapsedMs > 720) return;
  const p = woodcuttingSpotPoint(lastHit.weakSpot, width, height);
  const progress = clamp01(phaseElapsedMs / 720);
  const success = lastHit.score > 0;
  ctx.fillStyle = success
    ? `rgba(251, 191, 36, ${1 - progress})`
    : `rgba(244, 63, 94, ${0.85 * (1 - progress)})`;
  for (let i = 0; i < 10; i += 1) {
    const angle = i * 0.68 + lastHit.round;
    const dist = 8 + progress * (success ? 44 : 24) + (i % 3) * 3;
    ctx.beginPath();
    ctx.arc(
      p.x + Math.cos(angle) * dist,
      p.y + Math.sin(angle) * dist - progress * 14,
      success ? 2.5 : 2,
      0,
      TAU,
    );
    ctx.fill();
  }
}

function drawWoodcuttingCanvasScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: Phase,
  round: WoodcuttingRoundView | null,
  lastHit: WoodcuttingHitView | null,
  sceneElapsedMs: number,
  phaseElapsedMs: number,
  reducedMotion: boolean,
) {
  const t = reducedMotion ? 0 : sceneElapsedMs / 1000;
  const phaseT = reducedMotion ? 1 : phaseElapsedMs / 1000;
  const strike = phase === "strike";
  const impact =
    phase === "resolving" ? Math.max(0, 1 - phaseT / 0.35) : lastHit ? Math.max(0, 1 - phaseT / 0.7) * 0.35 : 0;

  ctx.clearRect(0, 0, width, height);
  drawWoodcuttingBackdrop(ctx, width, height, t, strike);
  drawWoodcuttingTree(ctx, width, height, t, impact);

  if (round && (phase === "readying" || phase === "strike")) {
    drawWeakSpotCue(ctx, width, height, round.weakSpot, t, strike);
  }
  drawAxeSwing(ctx, width, height, phase, phaseElapsedMs, t);
  drawHitParticles(ctx, width, height, lastHit, phaseElapsedMs);

  if (phase === "readying") {
    ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
    ctx.fillRect(0, 0, width, height);
  }
}

function WoodcuttingSceneCanvas({
  phase,
  round,
  lastHit,
}: {
  phase: Phase;
  round: WoodcuttingRoundView | null;
  lastHit: WoodcuttingHitView | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const roundRef = useRef(round);
  const lastHitRef = useRef(lastHit);
  const phaseStartedAtRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
    phaseStartedAtRef.current = performance.now();
  }, [phase]);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    lastHitRef.current = lastHit;
  }, [lastHit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let frameId = 0;
    let start = performance.now();
    phaseStartedAtRef.current = start;

    const draw = (now: number) => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWoodcuttingCanvasScene(
          ctx,
          width,
          height,
          phaseRef.current,
          roundRef.current,
          lastHitRef.current,
          now - start,
          Math.max(0, now - phaseStartedAtRef.current),
          reducedMotion,
        );
      }
      frameId = requestAnimationFrame(draw);
    };

    const onMotionChange = () => {
      reducedMotion = mediaQuery.matches;
      start = performance.now();
    };
    mediaQuery.addEventListener("change", onMotionChange);
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div ref={wrapRef} className="woodcutting-canvas-scene pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} aria-hidden="true" className="woodcutting-scene-canvas" />
    </div>
  );
}

const MISS_MESSAGE: Record<string, string> = {
  too_early: "도끼가 너무 일찍 들어갔다.",
  missed_window: "박자가 지나갔다.",
  expired: "자세가 풀렸다.",
  wrong_spot: "약점이 아닌 결을 찍었다.",
  not_felled: "나무가 버텼다.",
  no_session: "벌목 자세가 풀렸다.",
  stale: "다른 벌목 작업이 먼저 진행됐다.",
};

function missMessage(reason: string): string {
  return MISS_MESSAGE[reason] ?? "나무를 제대로 베지 못했다.";
}

function gradeLabel(grade: WoodcuttingHitGrade | "perfect" | "good" | "clean"): string {
  if (grade === "perfect") return "완벽";
  if (grade === "good") return "좋음";
  if (grade === "clean") return "성공";
  return "실패";
}

function _hitTone(hit: WoodcuttingHitView | null): string {
  if (!hit) return "text-zinc-500 dark:text-zinc-400";
  if (hit.grade === "perfect") return "text-emerald-600 dark:text-emerald-400";
  if (hit.grade === "good") return "text-sky-600 dark:text-sky-400";
  if (hit.grade === "clean") return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function gradePips(hits: WoodcuttingHitView[], total: number) {
  return Array.from({ length: total }, (_, i) => {
    const hit = hits[i];
    const tone =
      hit?.grade === "perfect"
        ? "bg-emerald-500"
        : hit?.grade === "good"
          ? "bg-sky-500"
          : hit?.grade === "clean"
            ? "bg-amber-500"
            : hit
              ? "bg-rose-500"
              : "bg-zinc-300 dark:bg-zinc-700";
    return <span key={i} className={`h-2 flex-1 rounded ${tone}`} />;
  });
}

function _WoodcuttingScene({
  phase,
  round,
  hits,
  lastHit,
  onSpot,
}: {
  phase: Phase;
  round: WoodcuttingRoundView | null;
  hits: WoodcuttingHitView[];
  lastHit: WoodcuttingHitView | null;
  onSpot: (spot: WoodcuttingSpot) => void;
}) {
  const active = phase === "readying" || phase === "strike";
  const strike = phase === "strike";
  return (
    <div
      className={`relative h-72 w-full overflow-hidden rounded-lg border-2 transition ${
        strike
          ? "border-amber-400 bg-amber-100 dark:bg-amber-950/50"
          : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
      }`}
    >
      <WoodcuttingSceneCanvas phase={phase} round={round} lastHit={lastHit} />

      {round &&
        (Object.keys(SPOT_LABEL) as WoodcuttingSpot[]).map((spot) => {
          const weak = spot === round.weakSpot;
          const selected = lastHit?.spot === spot && lastHit.round === round.index - 1;
          return (
            <button
              key={spot}
              type="button"
              disabled={!active}
              onClick={() => onSpot(spot)}
              className={`absolute z-10 ${SPOT_CLASS[spot]} grid h-14 w-14 place-items-center rounded-full border text-[11px] font-bold shadow-sm transition ${
                weak
                  ? strike
                    ? "border-amber-200 bg-amber-400/95 text-white shadow-[0_0_22px_rgba(251,191,36,0.9)]"
                    : "border-amber-300 bg-amber-100/90 text-amber-900 dark:bg-amber-950/90 dark:text-amber-100"
                  : "border-white/80 bg-white/80 text-zinc-700 backdrop-blur-[1px] dark:border-zinc-700 dark:bg-zinc-900/75 dark:text-zinc-200"
              } ${selected ? "ring-2 ring-zinc-900/20 dark:ring-white/30" : ""}`}
            >
              {SPOT_LABEL[spot]}
            </button>
          );
        })}

      <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-2">
        <span className="rounded bg-white/80 px-3 py-1 text-xs font-bold text-zinc-700 shadow-sm dark:bg-zinc-900/80 dark:text-zinc-200">
          {round ? `${round.index}/${round.total}` : "대기"}
        </span>
        <span
          className={`rounded px-3 py-1 text-xs font-extrabold shadow-sm ${
            strike
              ? "bg-amber-500 text-white"
              : "bg-white/80 text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
          }`}
        >
          {phase === "readying" ? "결 확인" : strike ? "지금" : phase === "resolving" ? "타격" : "준비"}
        </span>
      </div>

      <div className="absolute inset-x-4 bottom-4 z-10 flex gap-1">
        {gradePips(hits, round?.total ?? 3)}
      </div>
    </div>
  );
}

type PlanPhase = "idle" | "loading" | "direction" | "backcut" | "resolving" | "result";

const LANE_LABEL: Record<WoodcuttingLane, string> = {
  [-2]: "왼쪽 끝",
  [-1]: "왼쪽",
  [0]: "정면",
  [1]: "오른쪽",
  [2]: "오른쪽 끝",
};

const BACK_CUT_LABEL: Record<WoodcuttingBackCut, string> = {
  low: "낮게",
  level: "수평",
  high: "높게",
};

function windLabel(wind: -1 | 0 | 1): string {
  if (wind < 0) return "← 왼바람";
  if (wind > 0) return "오른바람 →";
  return "바람 없음";
}

function DirectionalWoodcuttingCanvas({
  challenge,
  judgment,
  phase,
}: {
  challenge: WoodcuttingChallengeView;
  judgment: WoodcuttingJudgmentView | null;
  phase: PlanPhase;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phaseStartedAt = useRef(0);

  useEffect(() => {
    phaseStartedAt.current = performance.now();
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const started = performance.now();

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
        const t = media.matches ? 0 : (now - started) / 1000;
        drawWoodcuttingBackdrop(ctx, width, height, t, false);

        const laneX = (lane: WoodcuttingLane) => width * (0.16 + (lane + 2) * 0.17);
        const targetX = laneX(challenge.safeLane);
        ctx.fillStyle = "rgba(250, 204, 21, 0.26)";
        ctx.strokeStyle = "rgba(254, 240, 138, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(targetX, height * 0.88, width * 0.09, 18, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fef9c3";
        ctx.font = "700 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("안전 구역", targetX, height * 0.885);

        const fallProgress =
          phase === "result" && judgment
            ? easeOutCubic(Math.min(1, (now - phaseStartedAt.current) / 900))
            : 0;
        const fallDirection = judgment ? Math.sign(judgment.landingLane || 1) : 1;
        ctx.save();
        ctx.translate(width * 0.5, height * 0.84);
        ctx.rotate(fallDirection * fallProgress * 1.17);
        ctx.translate(-width * 0.5, -height * 0.84);
        drawWoodcuttingTree(ctx, width, height, t, phase === "resolving" ? 0.6 : 0);
        ctx.restore();

        const grainY =
          challenge.idealBackCut === "low"
            ? height * 0.75
            : challenge.idealBackCut === "level"
              ? height * 0.69
              : height * 0.63;
        if (phase !== "result") {
          ctx.setLineDash([7, 5]);
          ctx.strokeStyle = "#fde68a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(width * 0.43, grainY);
          ctx.lineTo(width * 0.57, grainY);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (judgment && phase === "result") {
          const landingX = laneX(judgment.landingLane);
          ctx.fillStyle = judgment.directionError <= 1 ? "#dcfce7" : "#fecdd3";
          ctx.beginPath();
          ctx.arc(landingX, height * 0.91, 7, 0, TAU);
          ctx.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [challenge, judgment, phase]);

  return (
    <div ref={wrapRef} className="woodcutting-canvas-scene pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} aria-hidden="true" className="woodcutting-scene-canvas" />
    </div>
  );
}

function DirectionalWoodcuttingScene({
  challenge,
  phase,
  selectedLane,
  judgment,
  onLane,
  onBackCut,
}: {
  challenge: WoodcuttingChallengeView;
  phase: PlanPhase;
  selectedLane: WoodcuttingLane | null;
  judgment: WoodcuttingJudgmentView | null;
  onLane: (lane: WoodcuttingLane) => void;
  onBackCut: (cut: WoodcuttingBackCut) => void;
}) {
  return (
    <div className="relative h-80 w-full overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
      <DirectionalWoodcuttingCanvas challenge={challenge} judgment={judgment} phase={phase} />

      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 text-xs font-extrabold">
        <span className="rounded-full bg-white/90 px-3 py-1.5 text-zinc-800 shadow dark:bg-zinc-900/90 dark:text-zinc-100">
          {windLabel(challenge.wind)}
        </span>
        <span className="rounded-full bg-emerald-700/90 px-3 py-1.5 text-white shadow">
          {phase === "direction"
            ? "① 앞베기 방향"
            : phase === "backcut"
              ? "② 뒤베기 높이"
              : phase === "resolving"
                ? "쓰러지는 중…"
                : "벌목 결과"}
        </span>
      </div>

      {(phase === "direction" || phase === "backcut") && (
        <div className="absolute inset-x-2 bottom-3 z-10 grid grid-cols-5 gap-1">
          {([-2, -1, 0, 1, 2] as WoodcuttingLane[]).map((lane) => (
            <button
              key={lane}
              type="button"
              onClick={() => onLane(lane)}
              aria-label={`앞베기 ${LANE_LABEL[lane]}`}
              className={`min-h-11 rounded-lg border px-1 text-[10px] font-bold shadow-sm transition ${
                selectedLane === lane
                  ? "border-amber-300 bg-amber-400 text-white"
                  : "border-white/80 bg-white/85 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/85 dark:text-zinc-100"
              }`}
            >
              {LANE_LABEL[lane]}
            </button>
          ))}
        </div>
      )}

      {phase === "backcut" && (
        <div className="absolute right-3 top-20 z-20 flex flex-col gap-2">
          {(["high", "level", "low"] as WoodcuttingBackCut[]).map((cut) => (
            <button
              key={cut}
              type="button"
              onClick={() => onBackCut(cut)}
              className={`rounded-lg border px-3 py-2 text-xs font-extrabold shadow transition ${
                challenge.idealBackCut === cut
                  ? "border-amber-200 bg-amber-400/95 text-white shadow-[0_0_18px_rgba(251,191,36,0.7)]"
                  : "border-white/80 bg-white/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100"
              }`}
            >
              {BACK_CUT_LABEL[cut]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WoodcuttingView({
  start,
  fell,
  timber,
  log,
  onBack,
}: WoodcuttingHandlers & { onBack: () => void }) {
  const [phase, setPhase] = useState<PlanPhase>("idle");
  const [sessionId, setSessionId] = useState("");
  const [tree, setTree] = useState<WoodcuttingTreeView | null>(null);
  const [challenge, setChallenge] = useState<WoodcuttingChallengeView | null>(null);
  const [selectedLane, setSelectedLane] = useState<WoodcuttingLane | null>(null);
  const [result, setResult] = useState<WoodcuttingOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCut = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setResult(null);
    setSelectedLane(null);
    try {
      const next = await start();
      setSessionId(next.sessionId);
      setTree(next.tree);
      setChallenge(next.challenge);
      setPhase("direction");
    } catch {
      setError("벌목을 시작하지 못했다.");
      setPhase("idle");
    }
  }, [start]);

  const chooseBackCut = useCallback(
    async (backCut: WoodcuttingBackCut) => {
      if (selectedLane == null || phase !== "backcut") return;
      setPhase("resolving");
      try {
        const outcome = await fell(sessionId, selectedLane, backCut);
        setResult(outcome);
        setPhase("result");
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(outcome.success ? [35, 35, 70] : 80);
        }
      } catch {
        setError("벌목 처리 중 문제가 생겼다.");
        setPhase("result");
      }
    },
    [fell, phase, selectedLane, sessionId],
  );

  const judgment = result?.judgment ?? null;

  return (
    <main className="mx-auto my-2 w-[calc(100%-1rem)] max-w-[560px] space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5">
      <SubViewHeader title="벌목장" onBack={onBack} />

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">통나무</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{timber}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">벌목</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.cuts}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">완벽</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.perfectCuts}</div>
        </Card>
        <Card padding="sm">
          <div className="text-zinc-500 dark:text-zinc-400">누적 획득</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{log.timberEarned}</div>
        </Card>
      </div>

      {tree && challenge && (
        <>
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/80">
            <span className="font-bold">{tree.name}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              바람 반대편으로 앞베기 · 빛나는 결에 뒤베기
            </span>
          </div>
          <DirectionalWoodcuttingScene
            challenge={challenge}
            phase={phase}
            selectedLane={selectedLane}
            judgment={judgment}
            onLane={(lane) => {
              setSelectedLane(lane);
              setPhase("backcut");
            }}
            onBackCut={(cut) => void chooseBackCut(cut)}
          />
        </>
      )}

      {phase === "idle" && !error && (
        <Card padding="md" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          안전 구역과 바람을 읽어 나무가 쓰러질 방향을 설계하세요.
        </Card>
      )}

      {(phase === "result" || error) && (
        <Card padding="md" className="text-center">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.success ? (
            <div className="space-y-1">
              <div className="text-base font-bold">{result.tree.name}</div>
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                통나무 +{result.timberGained}
              </div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {gradeLabel(result.grade)} · {result.judgment.score}점 · {LANE_LABEL[result.judgment.landingLane]}에 안전하게 낙하
              </div>
            </div>
          ) : result ? (
            <div className="space-y-1">
              <div className="text-base font-bold">{result.tree?.name ?? "나무"}</div>
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {result.reason === "unsafe_fall"
                  ? "안전 구역을 벗어나 목재를 건지지 못했다."
                  : missMessage(result.reason)}
              </p>
              {result.judgment && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  실제 낙하: {LANE_LABEL[result.judgment.landingLane]} · {result.judgment.score}점
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {(phase === "idle" || phase === "result") && (
        <Button onClick={() => void startCut()} variant="success" size="md" fullWidth>
          {phase === "result" ? "다시 벌목" : "벌목 시작"}
        </Button>
      )}
      {phase === "loading" && (
        <Button disabled variant="success" size="md" fullWidth>
          숲을 살피는 중…
        </Button>
      )}
    </main>
  );
}
