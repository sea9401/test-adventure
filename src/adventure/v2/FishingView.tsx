"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  FISH_TIERS,
  formatFishSize,
  FISH_TOTAL,
  type FishTier,
} from "@/adventure/data/v2/fish";
import { REACTION_WINDOW_MS } from "@/adventure/v2/fishingSession";
import { MulttaeBadge } from "@/adventure/v2/MulttaeBadge";
import { FishingSubTabs } from "@/adventure/v2/FishingSubTabs";
import { FishIcon } from "@/adventure/v2/FishIcon";
import {
  FISHING_LURES,
  FISHING_RODS,
  type FishingProgressionView,
} from "@/adventure/v2/fishingProgression";
import type { FishingProgressNotice } from "@/adventure/v2/fishingChallengeProgress";

// 완전 수동·반응형 낚시 미니게임 UI.
//
// 설계: docs/fishing-content-plan.md §2
// 표현/상호작용만 담당하고 서버 권위 판정은 주입된 cast/reel 콜백이 한다 —
// 실게임(useFishing)은 API 를, /dev 하니스는 로컬 mock 을 주입한다(로그인·DB 없이 QA).

export type CastOutcome = { castId: string; biteDelayMs: number };

export type ReelOutcome =
  | {
      caught: true;
      fishId: string;
      name: string;
      tier: FishTier;
      size: number;
      isNewSpecies: boolean;
      isPersonalBest: boolean;
      prevBest: number;
      codexCount: number;
      /** 이번 챔질로 받은 낚시 코인(티어 소량·일일 상한 도달 시 0). */
      coinsGained?: number;
      /** 낚시 레벨 상승으로 받은 별도 낚시 코인 보상. */
      levelRewardCoins?: number;
      /** 성공한 챔질로 얻은 낚시 숙련도 경험치. */
      fishingXpGained?: number;
      fishingLevel?: number;
      fishingLevelUp?: boolean;
      fishingCatches?: number;
      /** 물때 한정 특별 손님이면 그 물때 정보(없으면 일반 어종). */
      special?: { id: string; label: string; emoji: string } | null;
      /** 서버 권위 연속 성공 기록과 현재 버프. */
      streak?: {
        current: number;
        best: number;
        buffTier: number;
        coinBonus: number;
        fragmentChanceBonusPct: number;
      };
      /** 이번 어획으로 오른 오늘의 의뢰/일일 과제/누적 목표. */
      challengeProgress?: FishingProgressNotice[];
    }
  | { caught: false; reason: string };

type CaughtReelOutcome = Extract<ReelOutcome, { caught: true }>;

export type FishingHandlers = {
  cast: () => Promise<CastOutcome>;
  reel: (castId: string, reactionMs: number) => Promise<ReelOutcome>;
  progression?: FishingProgressionView | null;
  progressionLoading?: boolean;
  challengeBadgeCount?: number;
};

type Phase = "idle" | "casting" | "waiting" | "biting" | "resolving" | "result";

const MISS_MESSAGE: Record<string, string> = {
  too_early: "너무 일찍 챘다. 물고기가 달아났다.",
  missed_window: "입질을 놓쳤다. 한 발 늦었다.",
  expired: "타이밍을 놓쳐 줄을 놓쳤다.",
  no_session: "낚싯줄이 풀렸다. 다시 던져 보자.",
  stale: "다른 캐스팅이 진행 중이었다. 다시 던져 보자.",
};

function missMessage(reason: string): string {
  return MISS_MESSAGE[reason] ?? "물고기를 놓쳤다.";
}

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function easeOutBack(value: number): number {
  const t = clamp01(value);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function tierImpact(tier: FishTier): number {
  switch (tier) {
    case "legendary":
      return 1.9;
    case "epic":
      return 1.65;
    case "rare":
      return 1.35;
    case "uncommon":
      return 1.12;
    case "common":
    default:
      return 1;
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawWaterLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  phase: number,
  alpha: number,
) {
  ctx.beginPath();
  for (let x = -20; x <= width + 20; x += 18) {
    const waveY = y + Math.sin(x * 0.035 + phase) * 2.2;
    if (x === -20) ctx.moveTo(x, waveY);
    else ctx.lineTo(x, waveY);
  }
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawReeds(ctx: CanvasRenderingContext2D, x: number, y: number, sway: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(35, 98, 61, 0.9)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i += 1) {
    const offset = i * 7;
    const height = 24 + (i % 3) * 8;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.quadraticCurveTo(offset + sway + i - 4, -height * 0.55, offset + sway, -height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRodGrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  motion: number,
) {
  const baseX = width * 0.86;
  const baseY = height * 0.2;
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(-0.28 + motion * 0.05);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "rgba(23, 37, 42, 0.24)";
  ctx.beginPath();
  ctx.ellipse(7, 15, 25, 5, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#2f1a0b";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 7);
  ctx.lineTo(35, 22);
  ctx.stroke();

  ctx.strokeStyle = "#7c4a21";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(32, 17);
  ctx.stroke();

  ctx.fillStyle = "#f1c27d";
  ctx.fillRect(9, 13, 17, 9);
  ctx.fillStyle = "rgba(120, 53, 15, 0.38)";
  ctx.fillRect(22, 14, 5, 7);

  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(5, 8, 8, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.fillRect(3, 6, 4, 4);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(11, 13);
  ctx.lineTo(16, 17 + motion * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSpriteBobber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  tilt: number,
) {
  const unit = 3.4 * scale;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(tilt);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "rgba(18, 30, 38, 0.72)";
  ctx.fillRect(-unit * 0.35, -unit * 6, unit * 0.7, unit * 4);

  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(-unit * 2.1, -unit * 1.7, unit * 4.2, unit * 4.2);
  ctx.fillStyle = color;
  ctx.fillRect(-unit * 1.7, -unit * 1.3, unit * 3.4, unit * 1.7);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(-unit * 1.7, unit * 0.25, unit * 3.4, unit * 1.4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(-unit * 1.1, -unit * 0.95, unit * 0.8, unit * 0.5);
  ctx.fillStyle = "rgba(15, 23, 42, 0.34)";
  ctx.fillRect(unit * 0.9, unit * 0.45, unit * 0.8, unit * 0.85);
  ctx.restore();
}

function drawPixelSplash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  strength: number,
) {
  const p = clamp01(progress);
  const alpha = (1 - p) * strength;
  const spread = 12 + p * 34;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  for (let i = 0; i < 9; i += 1) {
    const angle = -Math.PI + (i / 8) * Math.PI;
    const dotX = x + Math.cos(angle) * spread;
    const dotY = y + Math.sin(angle) * (spread * 0.42) - p * 14;
    const size = Math.max(1.6, (1 - p) * (5 - (i % 3)));
    ctx.fillRect(Math.round(dotX), Math.round(dotY), size, size);
  }
  ctx.fillStyle = `rgba(250, 204, 21, ${alpha * 0.5})`;
  ctx.fillRect(Math.round(x - spread * 0.45), Math.round(y - p * 8), 5, 3);
  ctx.fillRect(Math.round(x + spread * 0.28), Math.round(y - p * 11), 4, 3);
  ctx.restore();
}

function drawFishingCanvasScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: Phase,
  sceneElapsedMs: number,
  phaseElapsedMs: number,
  reducedMotion: boolean,
  preBite: boolean,
  tapElapsedMs: number,
) {
  const t = reducedMotion ? 0 : sceneElapsedMs / 1000;
  const phaseT = reducedMotion ? 0.6 : phaseElapsedMs / 1000;
  const tapT = reducedMotion ? 1 : tapElapsedMs / 1000;
  const waterY = Math.round(height * 0.48);
  const bobberRestX = Math.round(width * 0.45);
  const bobberRestY = Math.round(waterY + height * 0.22);
  const castProgress = phase === "casting" ? easeOutCubic(phaseElapsedMs / 720) : 1;
  const cuePulse = preBite && phase === "waiting" ? 0.5 + Math.sin(t * 22) * 0.5 : 0;
  const biteImpact = phase === "biting" ? Math.max(0, 1 - phaseT / 0.18) ** 2 : 0;
  const biteTremor = phase === "biting" ? Math.sin(phaseT * 54) * Math.max(0.18, 1 - phaseT * 0.95) : 0;
  const bitePull = phase === "biting" ? 1 + biteImpact * 1.25 + Math.abs(biteTremor) * 0.35 : 0;
  const rodCatchup = phase === "biting" ? easeOutBack((phaseElapsedMs - 65) / 260) : 0;
  const waitPulse = Math.sin(t * 2.2);
  const liftProgress = phase === "resolving" ? easeOutCubic(phaseElapsedMs / 520) : 0;
  const liftPulse = phase === "resolving" ? Math.sin(phaseT * 9) * (1 - liftProgress * 0.45) : 0;
  const tapSnap = tapT < 0.18 ? 1 - tapT / 0.18 : 0;
  const biting = phase === "biting";
  const waiting = phase === "waiting";
  const resolving = phase === "resolving";
  const casting = phase === "casting";

  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, waterY);
  sky.addColorStop(0, "#bae6fd");
  sky.addColorStop(0.72, "#e0f7ff");
  sky.addColorStop(1, "#f8fafc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, waterY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  drawRoundedRect(ctx, width * 0.08 + Math.sin(t * 0.25) * 8, height * 0.12, 60, 11, 8);
  drawRoundedRect(ctx, width * 0.64 - Math.sin(t * 0.18) * 10, height * 0.08, 72, 10, 8);

  ctx.fillStyle = "#4d7c54";
  ctx.beginPath();
  ctx.moveTo(0, waterY - 8);
  for (let x = 0; x <= width; x += 28) {
    ctx.lineTo(x, waterY - 10 - Math.sin(x * 0.04 + 0.7) * 11);
  }
  ctx.lineTo(width, waterY + 9);
  ctx.lineTo(0, waterY + 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(36, 84, 60, 0.72)";
  ctx.fillRect(0, waterY, width, 12);

  const water = ctx.createLinearGradient(0, waterY, 0, height);
  water.addColorStop(0, biting ? "#38bdf8" : "#67e8f9");
  water.addColorStop(1, biting ? "#0e7490" : "#0891b2");
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, width, height - waterY);
  for (let i = 0; i < 6; i += 1) {
    drawWaterLine(ctx, waterY + 13 + i * 20, width, t * (1.2 + i * 0.12) + i, 0.28 - i * 0.025);
  }

  const dockY = height - 42;
  ctx.fillStyle = "#8b5a2b";
  ctx.save();
  ctx.translate(width * 0.68, dockY);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillRect(0, 0, width * 0.36, 42);
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(0, 5, width * 0.36, 3);
  ctx.strokeStyle = "rgba(54, 31, 16, 0.45)";
  ctx.lineWidth = 2;
  for (let x = 24; x < width * 0.34; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 42);
    ctx.stroke();
  }
  ctx.restore();

  drawReeds(ctx, 12, waterY + 8, Math.sin(t * 2) * 5);
  drawReeds(ctx, width * 0.76, waterY + 9, -Math.sin(t * 2.4) * 4);

  let bobberX = bobberRestX;
  let bobberY = bobberRestY + waitPulse * 2;
  if (phase === "idle") {
    bobberY = waterY + height * 0.18 + Math.sin(t * 1.6) * 2;
  }
  if (casting) {
    const castArc = Math.sin(castProgress * Math.PI);
    bobberX = lerp(width * 0.86, bobberRestX, castProgress);
    bobberY =
      lerp(height * 0.24, bobberRestY, castProgress) -
      castArc * height * 0.24 +
      Math.sin(phaseT * 18) * (1 - castProgress) * 3;
  }
  if (biting) {
    bobberX = bobberRestX + biteTremor * 4 - biteImpact * 3;
    bobberY = bobberRestY + 9 * bitePull + biteImpact * 9;
  } else if (preBite && waiting) {
    bobberX += Math.sin(t * 16) * 1.5;
    bobberY += cuePulse * 3;
  }
  if (resolving) {
    bobberX = bobberRestX + liftPulse * 2;
    bobberY = lerp(bobberRestY, waterY + height * 0.1, liftProgress) + liftPulse * 5;
  }

  const rodBaseX = width * 0.88;
  const rodBaseY = height * 0.19;
  const castWindup = casting ? Math.sin(castProgress * Math.PI) : 0;
  const rodTipX = bobberX - 18 + (casting ? (1 - castProgress) * 34 : 0);
  const rodTipY =
    bobberY -
    38 -
    (resolving ? 18 + liftProgress * 24 : 0) -
    (casting ? castWindup * 18 : 0);
  const bend = biting
    ? 16 + rodCatchup * 38 + Math.abs(biteTremor) * 12
    : waiting
      ? 12 + waitPulse * 5 + cuePulse * 7 + tapSnap * 12
      : resolving
        ? -10 - liftProgress * 18
        : casting
          ? -8 + castWindup * 22
          : 2;
  drawRodGrip(ctx, width, height, biting ? 1 : resolving ? -0.45 : casting ? 0.35 : cuePulse * 0.25);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#3f2610";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(rodBaseX, rodBaseY);
  ctx.bezierCurveTo(width * 0.76, height * 0.26 + bend * 0.15, width * 0.62, rodTipY + bend, rodTipX, rodTipY);
  ctx.stroke();
  ctx.strokeStyle = "#d69b4a";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(rodBaseX - 2, rodBaseY - 2);
  ctx.bezierCurveTo(width * 0.76, height * 0.25 + bend * 0.1, width * 0.62, rodTipY + bend - 3, rodTipX - 1, rodTipY - 2);
  ctx.stroke();
  ctx.fillStyle = "#2f1a0b";
  ctx.fillRect(rodBaseX - 6, rodBaseY - 5, 18, 10);

  ctx.strokeStyle =
    biting || tapSnap > 0
      ? "rgba(255, 255, 255, 0.9)"
      : "rgba(226, 244, 255, 0.82)";
  ctx.lineWidth = biting || tapSnap > 0 ? 2.2 : 1.1;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo(
    (rodTipX + bobberX) / 2 + (biting ? biteTremor * 4 : 0) + tapSnap * 5,
    (rodTipY + bobberY) / 2 + (biting ? 1 - biteImpact * 4 : 10) - tapSnap * 7,
    bobberX,
    bobberY - 14,
  );
  ctx.stroke();

  if (waiting || biting) {
    const shadowScale = biting
      ? 1 + biteImpact * 0.55 + Math.abs(biteTremor) * 0.18
      : 0.75 + Math.sin(t * 1.4) * 0.08 + cuePulse * 0.3;
    ctx.fillStyle = biting
      ? "rgba(4, 47, 46, 0.48)"
      : preBite
        ? "rgba(4, 47, 46, 0.38)"
        : "rgba(4, 47, 46, 0.24)";
    ctx.beginPath();
    ctx.ellipse(
      bobberX - 8 + Math.sin(t * 1.5) * (preBite ? 8 : 18) - biteImpact * 12,
      bobberY + 15 + biteImpact * 3 + cuePulse * 3,
      44 * shadowScale,
      10 * shadowScale,
      biteImpact * -0.2,
      0,
      TAU,
    );
    ctx.fill();
  }

  if (waiting || biting || phase === "idle") {
    const rippleCount = biting ? 4 : 2;
    for (let i = 0; i < rippleCount; i += 1) {
      const rippleClock = biting ? phaseT : t;
      const p = reducedMotion ? 0.55 : (rippleClock * (biting ? 2.8 : 0.9) + i * 0.33) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * (biting ? 0.62 : 0.32)})`;
      ctx.lineWidth = biting ? 2 : 1.2;
      ctx.beginPath();
      ctx.ellipse(bobberX, bobberY + 4, 12 + p * (biting ? 42 : 26), 4 + p * (biting ? 13 : 8), 0, 0, TAU);
      ctx.stroke();
    }
  }
  if (preBite && waiting) {
    drawPixelSplash(ctx, bobberX, bobberY + 8, (t * 3.2) % 1, 0.28 + cuePulse * 0.18);
  }

  if (biting) {
    drawPixelSplash(ctx, bobberX, bobberY + 7, Math.min(1, phaseT / 0.36), 0.9);
    drawPixelSplash(ctx, bobberX, bobberY + 7, (phaseT * 2.4 + 0.45) % 1, 0.42);
    for (let i = 0; i < 7; i += 1) {
      const p = reducedMotion ? 0.5 : (phaseT * 3.5 + i * 0.17) % 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - p})`;
      ctx.beginPath();
      ctx.arc(bobberX + Math.cos(i * 1.7) * (10 + p * 20), bobberY - p * 24, 1.8 + (1 - p) * 1.5, 0, TAU);
      ctx.fill();
    }
  }
  if (resolving) {
    drawPixelSplash(ctx, bobberX, bobberY + 22, Math.min(1, phaseT / 0.42), 0.65);
  }

  drawSpriteBobber(
    ctx,
    bobberX,
    bobberY,
    biting ? 1.12 : 1,
    biting ? "#f59e0b" : phase === "idle" ? "#38bdf8" : "#e11d48",
    biting
      ? biteTremor * 0.08 - biteImpact * 0.18
      : waitPulse * 0.025 + cuePulse * 0.05 + tapSnap * 0.12,
  );
}

function FishingSceneCanvas({
  phase,
  preBite,
  tapSignal,
}: {
  phase: Phase;
  preBite: boolean;
  tapSignal: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const preBiteRef = useRef(preBite);
  const phaseStartedAtRef = useRef(0);
  const tapStartedAtRef = useRef(-Infinity);

  useEffect(() => {
    phaseRef.current = phase;
    phaseStartedAtRef.current = performance.now();
  }, [phase]);

  useEffect(() => {
    preBiteRef.current = preBite;
  }, [preBite]);

  useEffect(() => {
    if (tapSignal > 0) {
      tapStartedAtRef.current = performance.now();
    }
  }, [tapSignal]);

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
        drawFishingCanvasScene(
          ctx,
          width,
          height,
          phaseRef.current,
          now - start,
          Math.max(0, now - phaseStartedAtRef.current),
          reducedMotion,
          preBiteRef.current,
          Math.max(0, now - tapStartedAtRef.current),
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

  const waiting = phase === "waiting";
  const biting = phase === "biting";

  return (
    <div ref={wrapRef} className="fish-canvas-scene pointer-events-none relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} aria-hidden="true" className="fish-scene-canvas" />
      {phase !== "idle" && (
        <div className="fish-scene-status absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded bg-white/75 px-3 py-1 text-center shadow-sm backdrop-blur-[1px] dark:bg-zinc-950/70">
          {phase === "casting" && <span className="text-sm">던지는 중…</span>}
          {waiting && (
            <>
              <span className="block text-sm">입질을 기다리는 중…</span>
              <span className="mt-0.5 block text-[11px] opacity-70">아직 누르지 말 것</span>
            </>
          )}
          {biting && <span className="block text-xl font-extrabold">지금 챔질!</span>}
          {phase === "resolving" && <span className="text-sm">끌어올리는 중…</span>}
        </div>
      )}
    </div>
  );
}

function drawResultCanvasScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: ReelOutcome | null,
  elapsedMs: number,
  reducedMotion: boolean,
) {
  const t = reducedMotion ? 0.72 : elapsedMs / 1000;
  const caughtResult = result?.caught ? result : null;
  const caught = caughtResult != null;
  const impact = caughtResult ? tierImpact(caughtResult.tier) : 0.9;
  const p = clamp01(t / 0.9);
  const waterY = Math.round(height * 0.58);
  const centerX = width * 0.48;

  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, waterY);
  sky.addColorStop(0, "#bae6fd");
  sky.addColorStop(1, "#e0f7ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, waterY);
  const water = ctx.createLinearGradient(0, waterY, 0, height);
  water.addColorStop(0, caught ? "#7dd3fc" : "#93c5fd");
  water.addColorStop(1, caught ? "#0891b2" : "#2563eb");
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, width, height - waterY);
  for (let i = 0; i < 4; i += 1) {
    drawWaterLine(ctx, waterY + 8 + i * 15, width, t * 1.8 + i, 0.24 - i * 0.035);
  }

  const rodBaseX = width * 0.87;
  const rodBaseY = height * 0.22;
  const rodTipX = centerX + 12;
  const rodTipY = caught ? waterY - 32 - easeOutCubic(p) * 22 : waterY - 15;
  drawRodGrip(ctx, width, height, caught ? -0.65 : 0.25);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#3f2610";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(rodBaseX, rodBaseY);
  ctx.bezierCurveTo(width * 0.73, rodBaseY + 12, width * 0.62, rodTipY - 12, rodTipX, rodTipY);
  ctx.stroke();
  ctx.strokeStyle = caught ? "rgba(255, 255, 255, 0.92)" : "rgba(226, 244, 255, 0.48)";
  ctx.lineWidth = caught ? 2 : 1.2;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo(centerX + 8, waterY - 14, centerX - 4, waterY + (caught ? -8 : 10));
  ctx.stroke();

  if (caught) {
    drawPixelSplash(ctx, centerX, waterY + 4, Math.min(1, t / 0.55), 0.62 * impact);
    if (impact > 1.3) {
      drawPixelSplash(ctx, centerX - 14, waterY + 8, (t * 2.1 + 0.32) % 1, 0.16 * impact);
    }
  } else {
    const dart = easeOutCubic(p);
    const fishX = centerX - dart * width * 0.36;
    const fishY = waterY + 17 + Math.sin(t * 12) * 2;
    drawPixelSplash(ctx, centerX, waterY + 8, Math.min(1, t / 0.45), 0.28);
    ctx.fillStyle = "rgba(4, 47, 46, 0.42)";
    ctx.beginPath();
    ctx.ellipse(fishX, fishY, 32, 7, -0.18, 0, TAU);
    ctx.fill();
  }
}

function FishingResultScene({ result }: { result: ReelOutcome | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef(result);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let frameId = 0;
    let start = performance.now();

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
        drawResultCanvasScene(ctx, width, height, resultRef.current, now - start, reducedMotion);
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
    <div ref={wrapRef} className="fish-result-canvas-scene absolute inset-0 overflow-hidden rounded-lg">
      <canvas ref={canvasRef} aria-hidden="true" className="fish-scene-canvas" />
    </div>
  );
}

// 반응속도 → 등급 라벨. 연출용일 뿐 보상·판정엔 영향 없음(공정성 유지).
function reactionGrade(ms: number): { label: string; cls: string } {
  if (ms < 250)
    return { label: "완벽!", cls: "text-emerald-600 dark:text-emerald-400" };
  if (ms < 450)
    return { label: "좋음", cls: "text-sky-600 dark:text-sky-400" };
  if (ms < 700)
    return { label: "무난", cls: "text-zinc-500 dark:text-zinc-400" };
  return { label: "아슬아슬", cls: "text-amber-600 dark:text-amber-400" };
}

// 티어별 "잡는 순간" 강조 — 희귀·대물일수록 크게 등장 + 발광.
const TIER_REVEAL: Record<FishTier, { iconCls: string; glow: boolean }> = {
  common: { iconCls: "h-12 w-12", glow: false },
  uncommon: { iconCls: "h-14 w-14", glow: false },
  rare: { iconCls: "h-16 w-16", glow: true },
  epic: { iconCls: "h-[4.5rem] w-[4.5rem]", glow: true },
  legendary: { iconCls: "h-20 w-20", glow: true },
};

function levelBonusLabels(progression: FishingProgressionView): string[] {
  return [
    `씨알 +${progression.levelBonuses.sizeBonusPct}%`,
    `특별 손님 +${progression.levelBonuses.specialWeightPct}%`,
  ];
}

function rewardSummaryLabels(result: CaughtReelOutcome): string[] {
  const labels: string[] = [];
  if (result.coinsGained != null && result.coinsGained > 0) {
    labels.push(`코인 +${result.coinsGained}`);
  }
  if (result.levelRewardCoins != null && result.levelRewardCoins > 0) {
    labels.push(`레벨업 보상 +${result.levelRewardCoins}`);
  }
  if (result.fishingXpGained != null && result.fishingXpGained > 0) {
    labels.push(
      `숙련도 +${result.fishingXpGained}${
        result.fishingLevel ? ` · Lv ${result.fishingLevel}` : ""
      }${result.fishingLevelUp ? " 상승" : ""}`,
    );
  }
  return labels;
}

function challengeProgressSummary(
  items: readonly FishingProgressNotice[] | undefined,
): string | null {
  if (!items || items.length === 0) return null;
  const completed = items.filter((item) => item.justCompleted).length;
  const claimable = items.filter((item) => item.claimable).length;
  return [
    `의뢰/목표 ${items.length}개 진행`,
    completed > 0 ? `${completed}개 완료` : null,
    claimable > 0 ? `${claimable}개 수령 가능` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function CatchRewardSummary({ result }: { result: CaughtReelOutcome }) {
  const labels = rewardSummaryLabels(result);
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5 pt-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function ChallengeProgressSummary({
  items,
}: {
  items: readonly FishingProgressNotice[] | undefined;
}) {
  const summary = challengeProgressSummary(items);
  if (!summary) return null;
  return (
    <div className="mx-auto mt-2 max-w-sm rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-center text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      {summary}
    </div>
  );
}

export function FishingView({
  cast,
  reel,
  onBack,
  onOpenLeaderboard,
  onOpenShop,
  onOpenChallenges,
  onOpenHallOfFame,
  progression,
  progressionLoading,
  challengeBadgeCount,
}: FishingHandlers & {
  onBack?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
  onOpenChallenges?: () => void;
  onOpenHallOfFame?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ReelOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 성공 시 결과에 보여줄 "입질→챔질" 반응시간(ms). 판정과 무관한 표시용.
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  // 이번 판(세션) 기세 — 클라 표시뿐, 서버 저장·판정 무관.
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionBest, setSessionBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [preBite, setPreBite] = useState(false);
  const [tapSignal, setTapSignal] = useState(0);

  const biteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preBiteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteShownAt = useRef<number>(0);
  const castId = useRef<string>("");
  // 한 캐스팅당 reel 1회 — 탭과 윈도우 타임아웃이 동시에 발생해도 이중 호출 방지.
  const resolved = useRef<boolean>(false);
  // 언마운트 후 async(cast/reel) resolve 가 죽은 컴포넌트에 타이머·setState 를 걸지 않도록.
  const mounted = useRef<boolean>(true);

  const clearTimers = useCallback(() => {
    if (biteTimer.current) clearTimeout(biteTimer.current);
    if (preBiteTimer.current) clearTimeout(preBiteTimer.current);
    if (windowTimer.current) clearTimeout(windowTimer.current);
    biteTimer.current = null;
    preBiteTimer.current = null;
    windowTimer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const resolveReel = useCallback(
    async (reactionMs: number) => {
      if (resolved.current) return;
      resolved.current = true;
      clearTimers();
      setPreBite(false);
      setPhase("resolving");
      try {
        const outcome = await reel(castId.current, reactionMs);
        if (!mounted.current) return;
        if (outcome.caught) {
          setSessionCount((c) => c + 1);
          setSessionBest((b) => Math.max(b, outcome.size));
          setStreak((s) => outcome.streak?.current ?? s + 1);
        } else {
          setStreak(0);
        }
        setResult(outcome);
        setPhase("result");
      } catch {
        if (!mounted.current) return;
        setError("낚시 처리 중 문제가 생겼다.");
        setPhase("result");
      }
    },
    [reel, clearTimers],
  );

  const onBite = useCallback(() => {
    biteShownAt.current = Date.now();
    setPreBite(false);
    setPhase("biting");
    // 입질 햅틱 — 모바일에서 진동으로 입질을 알림(시각 신호와 동시 발생, 정보 우위 없음).
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(35);
    }
    // 윈도우를 넘기면 자동 실패(여유를 약간 둬 네트워크 탭 지연 흡수).
    windowTimer.current = setTimeout(
      () => resolveReel(REACTION_WINDOW_MS + 500),
      REACTION_WINDOW_MS + 400,
    );
  }, [resolveReel]);

  const startCast = useCallback(async () => {
    setError(null);
    setResult(null);
    setLastReactionMs(null);
    setPreBite(false);
    resolved.current = false;
    setPhase("casting");
    try {
      const { castId: id, biteDelayMs } = await cast();
      if (!mounted.current) return;
      castId.current = id;
      setPhase("waiting");
      preBiteTimer.current = setTimeout(
        () => {
          if (mounted.current) setPreBite(true);
        },
        Math.max(0, biteDelayMs - 360),
      );
      biteTimer.current = setTimeout(onBite, biteDelayMs);
    } catch {
      if (!mounted.current) return;
      setError("찌를 던지지 못했다. 잠시 후 다시 시도해 보자.");
      setPhase("idle");
    }
  }, [cast, onBite]);

  // 큰 탭 존 클릭 — 단계에 따라 의미가 다르다.
  const onTapZone = useCallback(() => {
    setTapSignal((value) => value + 1);
    if (phase === "waiting") {
      // 입질 전 챔질 = 성급함. 서버가 too_early 로 판정하도록 reel 호출(세션 소비).
      resolveReel(-1);
    } else if (phase === "biting") {
      const rms = Date.now() - biteShownAt.current;
      setLastReactionMs(rms);
      resolveReel(rms);
    }
  }, [phase, resolveReel]);

  const tapActive = phase === "waiting" || phase === "biting";
  const biting = phase === "biting";
  const idleActionClass =
    "w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.99]";
  const resultActionClass =
    "fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-700 active:scale-[0.99]";

  return (
    <>
      <main className="mx-auto my-4 w-[calc(100%-2rem)] max-w-[520px] space-y-4 rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-lg backdrop-blur-md text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100">
        <SubViewHeader title="낚시터" onBack={onBack} />

        <FishingSubTabs
          active="fishing"
          challengeBadgeCount={challengeBadgeCount}
          onOpenChallenges={onOpenChallenges}
          onOpenLeaderboard={onOpenLeaderboard}
          onOpenHallOfFame={onOpenHallOfFame}
          onOpenShop={onOpenShop}
        />

      <MulttaeBadge />

      {progression ? (
        <>
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1.5 text-[11px] dark:border-sky-900/60 dark:bg-sky-950/30 sm:hidden">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-bold text-sky-900 dark:text-sky-100">
                Lv {progression.level}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width]"
                  style={{
                    width: `${Math.round(
                      (progression.xpIntoLevel / progression.xpForNext) * 100,
                    )}%`,
                  }}
                />
              </div>
              <span className="shrink-0 font-medium text-sky-800 dark:text-sky-200">
                씨알 +{progression.levelBonuses.sizeBonusPct}%
              </span>
              <span className="shrink-0 font-medium text-sky-800 dark:text-sky-200">
                손님 +{progression.levelBonuses.specialWeightPct}%
              </span>
            </div>
          </div>

          <div className="hidden rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs dark:border-sky-900/60 dark:bg-sky-950/30 sm:block">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-sky-900 dark:text-sky-100">
                  낚시 Lv {progression.level}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {progression.catches.toLocaleString()}마리 ·{" "}
                  {progression.xpIntoLevel}/{progression.xpForNext} XP
                </div>
              </div>
              <div className="min-w-0 text-right text-[11px] text-zinc-600 dark:text-zinc-300">
                <div className="truncate">
                  {FISHING_RODS[progression.equippedRodId].name}
                </div>
                <div className="truncate">
                  {FISHING_LURES[progression.equippedLureId].name}
                </div>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width]"
                style={{
                  width: `${Math.round(
                    (progression.xpIntoLevel / progression.xpForNext) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {levelBonusLabels(progression).map((label) => (
                <span
                  key={label}
                  className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200"
                >
                  숙련도 효과 · {label}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : progressionLoading ? (
        <div className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-center text-[11px] text-zinc-400 dark:border-zinc-800 sm:rounded-xl sm:p-3 sm:text-xs">
          낚시 숙련도 불러오는 중…
        </div>
      ) : null}

      {sessionCount > 0 && (
        <div className="flex items-center justify-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            이번 판{" "}
            <b className="text-zinc-700 dark:text-zinc-200">{sessionCount}</b>마리
          </span>
          {sessionBest > 0 && (
            <span>
              최대{" "}
              <b className="text-zinc-700 dark:text-zinc-200">
                {formatFishSize(sessionBest)}
              </b>
            </span>
          )}
          {streak > 1 && (
            <span className="text-amber-600 dark:text-amber-400">
              🔥 연속 {streak}
            </span>
          )}
        </div>
      )}

      {/* 탭 존 — 대기 중엔 찌가 잔잔히 까닥, 입질엔 확 빨려들며 떨린다.
          결과 화면(result)에선 숨김 — 그땐 아래 결과 박스가 본문이라 탭존은 빈 박스가 됨. */}
      {phase !== "result" && (
        <button
          type="button"
          disabled={!tapActive}
          onClick={onTapZone}
          className={`ui-fishing-zone relative flex h-56 w-full select-none flex-col items-center justify-center overflow-hidden rounded-lg border-2 text-center transition ${
            biting
              ? "is-biting border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200"
              : tapActive
                ? "border-sky-300 bg-gradient-to-b from-sky-50 to-sky-100 text-sky-800 dark:border-sky-800 dark:from-sky-950/40 dark:to-sky-900/40 dark:text-sky-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500"
          }`}
        >
          <FishingSceneCanvas phase={phase} preBite={preBite} tapSignal={tapSignal} />
        </button>
      )}

      {/* 결과 */}
      {phase === "result" && (
        <div className="ui-fishing-result rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-800">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : result?.caught ? (
            <div className="space-y-1">
              <div className="relative mx-auto flex h-20 w-full items-center justify-center overflow-hidden rounded-lg border border-sky-200 dark:border-sky-900/60">
                <FishingResultScene result={result} />
                {/* 희귀·대물 발광 */}
                {TIER_REVEAL[result.tier].glow && (
                  <span className="fish-glow absolute left-1/2 top-[44%] h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/35 blur-md" />
                )}
                <FishIcon
                  fishId={result.fishId}
                  name={result.name}
                  className={`fish-reveal relative z-10 -mt-1 drop-shadow-md ${TIER_REVEAL[result.tier].iconCls}`}
                />
              </div>
              <div className="text-base font-bold">
                {result.name}{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {formatFishSize(result.size)}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {FISH_TIERS[result.tier].label}
              </div>
              {result.special && (
                <div className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  {result.special.emoji} {result.special.label}의 특별한 손님
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {result.isNewSpecies && (
                  <span className="rounded bg-emerald-200/70 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                    어보 신규 등록
                  </span>
                )}
                {!result.isNewSpecies && result.isPersonalBest && (
                  <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                    개인 최고 기록 갱신 (이전 {formatFishSize(result.prevBest)})
                  </span>
                )}
              </div>
              <div className="pt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                어보 {result.codexCount}/{FISH_TOTAL}종
              </div>
              <CatchRewardSummary result={result} />
              {result.streak && result.streak.buffTier > 0 && (
                <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  연속 {result.streak.current} 버프 · 코인 +
                  {result.streak.coinBonus} · 지도 조각 +
                  {result.streak.fragmentChanceBonusPct}%p
                </div>
              )}
              <ChallengeProgressSummary items={result.challengeProgress} />
              {lastReactionMs != null && (
                <div className="text-[11px] font-medium">
                  <span className={reactionGrade(lastReactionMs).cls}>
                    {reactionGrade(lastReactionMs).label}
                  </span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {(lastReactionMs / 1000).toFixed(2)}초 만에 챔질!
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="relative mx-auto h-16 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                <FishingResultScene result={result} />
                <FishIcon
                  fishId="minnow"
                  decorative
                  className="fish-dart-away absolute bottom-2 left-1/2 h-7 w-7"
                />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {missMessage(result?.reason ?? "")}
              </p>
            </div>
          )}
        </div>
      )}

        {/* 액션 */}
        {phase === "idle" && (
          <button type="button" onClick={startCast} className={idleActionClass}>
            찌 던지기
          </button>
        )}
        {phase === "result" && <div aria-hidden className="h-16" />}
      </main>

      {phase === "result" && (
        <button type="button" onClick={startCast} className={resultActionClass}>
          다시 던지기
        </button>
      )}
    </>
  );
}
