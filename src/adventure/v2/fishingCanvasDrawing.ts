"use client";

import { type FishTier } from "@/adventure/data/v2/fish";
import { type MulttaeConditionId } from "@/adventure/data/v2/multtae";
import { type FishingPhase, type ReelOutcome } from "./FishingView";

export const TAU = Math.PI * 2;

export const FISHING_POND_SRC = "/images/ui/fishing-pond.webp";


export type FishingSceneAssets = {
  pond: HTMLImageElement | null;
};


export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}


export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}


export function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}


export function easeOutBack(value: number): number {
  const t = clamp01(value);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}


export function tierImpact(tier: FishTier): number {
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


export function drawRoundedRect(
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


export function drawWaterLine(
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


export function drawReeds(ctx: CanvasRenderingContext2D, x: number, y: number, sway: number) {
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


export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (imageWidth <= 0 || imageHeight <= 0) return;

  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}


export function drawTideBackdropOverlay(
  ctx: CanvasRenderingContext2D,
  tideId: MulttaeConditionId,
  width: number,
  height: number,
  waterY: number,
  t: number,
  biting: boolean,
) {
  ctx.save();
  const full = ctx.createLinearGradient(0, 0, 0, height);
  switch (tideId) {
    case "dawn":
      full.addColorStop(0, "rgba(251, 146, 60, 0.28)");
      full.addColorStop(0.5, "rgba(254, 215, 170, 0.12)");
      full.addColorStop(1, "rgba(14, 116, 144, 0.06)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      break;
    case "starlit":
      full.addColorStop(0, "rgba(15, 23, 42, 0.42)");
      full.addColorStop(0.55, "rgba(30, 41, 59, 0.22)");
      full.addColorStop(1, "rgba(8, 47, 73, 0.18)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 47 + Math.sin(t * 0.4 + i) * 8) % width) + 2;
        const y = 14 + ((i * 23) % Math.max(24, waterY - 26));
        ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
      }
      break;
    case "mist":
      ctx.fillStyle = "rgba(226, 232, 240, 0.28)";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
      ctx.lineWidth = 13;
      for (let i = 0; i < 4; i += 1) {
        const y = waterY - 34 + i * 26 + Math.sin(t * 0.7 + i) * 5;
        ctx.beginPath();
        ctx.moveTo(-20, y);
        ctx.bezierCurveTo(width * 0.26, y - 12, width * 0.66, y + 14, width + 20, y);
        ctx.stroke();
      }
      break;
    case "tempest":
      full.addColorStop(0, "rgba(30, 41, 59, 0.46)");
      full.addColorStop(0.55, "rgba(14, 116, 144, 0.18)");
      full.addColorStop(1, "rgba(15, 23, 42, 0.28)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      if (biting || Math.sin(t * 1.7) > 0.86) {
        ctx.strokeStyle = "rgba(226, 232, 240, 0.52)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width * 0.2, 0);
        ctx.lineTo(width * 0.34, waterY * 0.32);
        ctx.lineTo(width * 0.28, waterY * 0.32);
        ctx.lineTo(width * 0.42, waterY * 0.78);
        ctx.stroke();
      }
      break;
    case "moonlit":
      full.addColorStop(0, "rgba(49, 46, 129, 0.34)");
      full.addColorStop(0.55, "rgba(30, 64, 175, 0.14)");
      full.addColorStop(1, "rgba(8, 47, 73, 0.12)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(226, 232, 240, 0.5)";
      ctx.beginPath();
      ctx.arc(width * 0.76, height * 0.14, 18, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(226, 232, 240, 0.18)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(width * 0.72, waterY + 18 + i * 14, 36 + i * 12, 4, 0, 0, TAU);
        ctx.stroke();
      }
      break;
    case "rapid":
      ctx.fillStyle = "rgba(240, 253, 250, 0.12)";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 8; i += 1) {
        const y = waterY + 12 + i * 18;
        ctx.beginPath();
        ctx.moveTo(-30 + ((t * 36 + i * 24) % 80), y);
        ctx.lineTo(width + 30, y + 18);
        ctx.stroke();
      }
      break;
    case "ebb":
      full.addColorStop(0, "rgba(250, 204, 21, 0.08)");
      full.addColorStop(0.62, "rgba(180, 83, 9, 0.10)");
      full.addColorStop(1, "rgba(120, 53, 15, 0.16)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(202, 138, 4, 0.14)";
      ctx.fillRect(0, waterY - 3, width, 16);
      break;
    case "deepcurrent":
      full.addColorStop(0, "rgba(6, 78, 59, 0.16)");
      full.addColorStop(0.48, "rgba(12, 74, 110, 0.18)");
      full.addColorStop(1, "rgba(2, 6, 23, 0.34)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(45, 212, 191, 0.18)";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(width * (0.2 + i * 0.18), waterY + 42 + i * 18, 42 + i * 12, 9, t * 0.4, 0, TAU);
        ctx.stroke();
      }
      break;
    case "still":
    default:
      full.addColorStop(0, "rgba(186, 230, 253, 0.10)");
      full.addColorStop(0.58, "rgba(240, 253, 250, 0.08)");
      full.addColorStop(1, "rgba(255, 255, 255, 0.10)");
      ctx.fillStyle = full;
      ctx.fillRect(0, 0, width, height);
      break;
  }
  ctx.restore();
}


export function drawProceduralPondFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterY: number,
  t: number,
  biting: boolean,
) {
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

  const dockY = height - 42;
  ctx.fillStyle = "#8b5a2b";
  ctx.save();
  ctx.translate(width * 0.68, dockY);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillRect(0, 0, width * 0.36, 42);
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(0, 5, width * 0.36, 3);
  ctx.restore();

  drawReeds(ctx, 12, waterY + 8, Math.sin(t * 2) * 5);
  drawReeds(ctx, width * 0.76, waterY + 9, -Math.sin(t * 2.4) * 4);
}


export function drawPondBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterY: number,
  t: number,
  biting: boolean,
  tideId: MulttaeConditionId,
  assets: FishingSceneAssets,
) {
  if (assets.pond?.complete) {
    drawCoverImage(ctx, assets.pond, width, height);
    if (biting) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.12)";
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawProceduralPondFallback(ctx, width, height, waterY, t, biting);
  }
  drawTideBackdropOverlay(ctx, tideId, width, height, waterY, t, biting);

  const haze = ctx.createLinearGradient(0, waterY - 18, 0, height);
  haze.addColorStop(0, "rgba(255, 255, 255, 0.04)");
  haze.addColorStop(0.42, "rgba(255, 255, 255, 0.11)");
  haze.addColorStop(1, "rgba(8, 47, 73, 0.12)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, waterY - 18, width, height - waterY + 18);

  for (let i = 0; i < 5; i += 1) {
    drawWaterLine(ctx, waterY + 12 + i * 20, width, t * (1.3 + i * 0.12) + i, 0.2 - i * 0.02);
  }
}


export function drawRodGrip(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  angle: number,
  motion: number,
  scale = 1,
) {
  const wobble = motion * 0.035;
  const handleLength = 44 * scale;
  const handleWidth = 8.5 * scale;
  const reelRadius = 10 * scale;

  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(angle + wobble);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.fillStyle = "rgba(15, 23, 42, 0.24)";
  ctx.beginPath();
  ctx.ellipse(-handleLength * 0.36, handleWidth * 1.8, handleLength * 0.48, 4.2 * scale, 0.08, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#241407";
  ctx.lineWidth = handleWidth + 4 * scale;
  ctx.beginPath();
  ctx.moveTo(-handleLength, 0);
  ctx.lineTo(9 * scale, 0);
  ctx.stroke();

  ctx.strokeStyle = "#a9632a";
  ctx.lineWidth = handleWidth;
  ctx.beginPath();
  ctx.moveTo(-handleLength + 2 * scale, -0.7 * scale);
  ctx.lineTo(6 * scale, -0.7 * scale);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 237, 213, 0.34)";
  ctx.lineWidth = 1.2 * scale;
  for (let mark = -handleLength + 8 * scale; mark < 0; mark += 9 * scale) {
    ctx.beginPath();
    ctx.moveTo(mark, -handleWidth * 0.42);
    ctx.lineTo(mark + 3 * scale, handleWidth * 0.36);
    ctx.stroke();
  }

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3.2 * scale;
  ctx.beginPath();
  ctx.moveTo(-7 * scale, 0);
  ctx.lineTo(-9 * scale, 11 * scale);
  ctx.stroke();

  ctx.fillStyle = "#d1d5db";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2.2 * scale;
  ctx.beginPath();
  ctx.arc(-10 * scale, 17 * scale, reelRadius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.arc(-10 * scale, 17 * scale, reelRadius * 0.46, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-18 * scale, 22 * scale);
  ctx.lineTo(-26 * scale, 29 * scale + motion * 1.5);
  ctx.lineTo(-30 * scale, 27 * scale + motion * 1.5);
  ctx.stroke();

  ctx.restore();
}


export function cubicPoint(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const u = 1 - t;
  return u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3;
}


export function drawRodShaft(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  control1X: number,
  control1Y: number,
  control2X: number,
  control2Y: number,
  tipX: number,
  tipY: number,
  stress: number,
) {
  const pull = clamp01(stress);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "#2b1a0b";
  ctx.lineWidth = 7.2 - pull * 1.2;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.bezierCurveTo(control1X, control1Y, control2X, control2Y, tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = "#c58a3f";
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(baseX - 1, baseY - 2);
  ctx.bezierCurveTo(control1X, control1Y - 2, control2X, control2Y - 2, tipX - 1, tipY - 1);
  ctx.stroke();

  ctx.strokeStyle = `rgba(15, 23, 42, ${0.35 + pull * 0.18})`;
  ctx.lineWidth = 1.2;
  for (const marker of [0.42, 0.68, 0.88]) {
    const x = cubicPoint(baseX, control1X, control2X, tipX, marker);
    const y = cubicPoint(baseY, control1Y, control2Y, tipY, marker);
    ctx.beginPath();
    ctx.arc(x, y, 2.1 - marker * 0.9, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}


export function drawFishingLine(
  ctx: CanvasRenderingContext2D,
  rodTipX: number,
  rodTipY: number,
  bobberX: number,
  bobberY: number,
  tension: number,
  tremor: number,
  tapSnap: number,
) {
  const tight = clamp01(tension);
  const controlX = (rodTipX + bobberX) / 2 + tremor * 4 + tapSnap * 5;
  const slackY = 12 * (1 - tight);
  const controlY = (rodTipY + bobberY) / 2 + slackY - tight * 10 - tapSnap * 7;

  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(15, 23, 42, ${0.1 + tight * 0.16})`;
  ctx.lineWidth = 3.2 + tight * 0.8;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo(controlX, controlY, bobberX, bobberY - 14);
  ctx.stroke();

  ctx.strokeStyle = `rgba(245, 251, 255, ${0.58 + tight * 0.34})`;
  ctx.lineWidth = 1.1 + tight * 1.2;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo(controlX, controlY, bobberX, bobberY - 14);
  ctx.stroke();
}


export function drawFishShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  size: number,
  alpha: number,
  urgency: number,
) {
  const pulse = 1 + Math.sin(t * 5.4) * 0.05 + urgency * 0.18;
  ctx.save();
  ctx.fillStyle = `rgba(4, 47, 46, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, size * pulse, size * 0.22 * pulse, -0.14 - urgency * 0.12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(4, 47, 46, ${alpha * 0.65})`;
  ctx.beginPath();
  ctx.ellipse(x + size * 0.72, y - size * 0.03, size * 0.22, size * 0.13, -0.26, 0, TAU);
  ctx.fill();
  ctx.restore();
}


export function drawPreBiteWake(
  ctx: CanvasRenderingContext2D,
  bobberX: number,
  bobberY: number,
  t: number,
  preBiteElapsedMs: number,
) {
  const progress = clamp01(preBiteElapsedMs / 360);
  const approach = easeOutCubic(progress);
  const sweep = Math.sin(t * 14) * 5;
  const shadowX = bobberX - 58 + approach * 42 + sweep;
  const shadowY = bobberY + 22 + Math.sin(t * 8) * 2;

  drawFishShadow(ctx, shadowX, shadowY, t, 26 + progress * 16, 0.18 + progress * 0.24, progress);

  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + progress * 0.22})`;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 2; i += 1) {
    const p = (progress + i * 0.34) % 1;
    ctx.beginPath();
    ctx.ellipse(
      bobberX - 12 + sweep * 0.3,
      bobberY + 8,
      14 + p * 24,
      4 + p * 8,
      0,
      0,
      TAU,
    );
    ctx.stroke();
  }
  ctx.restore();
}


export function drawSpriteBobber(
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


export function drawPixelSplash(
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


export function drawFishingCanvasScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: FishingPhase,
  sceneElapsedMs: number,
  phaseElapsedMs: number,
  reducedMotion: boolean,
  preBite: boolean,
  preBiteElapsedMs: number,
  tapElapsedMs: number,
  tideId: MulttaeConditionId,
  assets: FishingSceneAssets,
) {
  const t = reducedMotion ? 0 : sceneElapsedMs / 1000;
  const phaseT = reducedMotion ? 0.6 : phaseElapsedMs / 1000;
  const tapT = reducedMotion ? 1 : tapElapsedMs / 1000;
  const waterY = Math.round(height * 0.52);
  const bobberRestX = Math.round(width * 0.45);
  const bobberRestY = Math.round(waterY + height * 0.17);
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
  drawPondBackdrop(ctx, width, height, waterY, t, biting, tideId, assets);

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

  const rodBaseX = width * 0.84;
  const rodBaseY = height * 0.55;
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
  const lineTension = biting
    ? 0.76 + biteImpact * 0.24
    : resolving
      ? 0.9
      : preBite && waiting
        ? 0.35 + cuePulse * 0.28
        : tapSnap > 0
          ? 0.72
          : 0.18;
  const rodControl1X = lerp(rodBaseX, rodTipX, 0.32);
  const rodControl1Y = rodBaseY - height * 0.16 + bend * 0.15;
  const rodControl2X = lerp(rodBaseX, rodTipX, 0.68);
  const rodControl2Y = rodTipY + bend;
  const rodBaseAngle = Math.atan2(rodControl1Y - rodBaseY, rodControl1X - rodBaseX);
  drawRodShaft(
    ctx,
    rodBaseX,
    rodBaseY,
    rodControl1X,
    rodControl1Y,
    rodControl2X,
    rodControl2Y,
    rodTipX,
    rodTipY,
    lineTension,
  );

  drawFishingLine(ctx, rodTipX, rodTipY, bobberX, bobberY, lineTension, biting ? biteTremor : 0, tapSnap);
  drawRodGrip(
    ctx,
    rodBaseX,
    rodBaseY,
    rodBaseAngle,
    biting ? 0.7 : resolving ? -0.55 : casting ? 0.35 : cuePulse * 0.22,
    biting ? 1.03 : 1,
  );

  if (waiting || biting) {
    const shadowScale = biting
      ? 1 + biteImpact * 0.55 + Math.abs(biteTremor) * 0.18
      : 0.75 + Math.sin(t * 1.4) * 0.08 + cuePulse * 0.3;
    drawFishShadow(
      ctx,
      bobberX - 8 + Math.sin(t * 1.5) * (preBite ? 8 : 18) - biteImpact * 12,
      bobberY + 15 + biteImpact * 3 + cuePulse * 3,
      t,
      42 * shadowScale,
      biting ? 0.48 : preBite ? 0.38 : 0.24,
      biteImpact + cuePulse * 0.25,
    );
  }

  if (waiting || biting || phase === "idle") {
    const rippleCount = biting ? 4 : 2;
    for (let i = 0; i < rippleCount; i += 1) {
      const rippleClock = biting ? phaseT : t;
      const p = reducedMotion ? 0.55 : (rippleClock * (biting ? 2.8 : 0.9) + i * 0.33) % 1;
      ctx.strokeStyle = biting ? `rgba(244, 63, 94, ${(1 - p) * 0.9})` : `rgba(255,255,255,${(1 - p) * 0.32})`;
      ctx.lineWidth = biting ? 2.8 : 1.2;
      ctx.beginPath();
      ctx.ellipse(bobberX, bobberY + 4, 12 + p * (biting ? 42 : 26), 4 + p * (biting ? 13 : 8), 0, 0, TAU);
      ctx.stroke();
    }
  }
  if (preBite && waiting) {
    drawPreBiteWake(ctx, bobberX, bobberY, t, preBiteElapsedMs);
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
    biting ? "#f43f5e" : phase === "idle" ? "#38bdf8" : "#e11d48",
    biting
      ? biteTremor * 0.08 - biteImpact * 0.18
      : waitPulse * 0.025 + cuePulse * 0.05 + tapSnap * 0.12,
  );
}


export function drawResultCanvasScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: ReelOutcome | null,
  elapsedMs: number,
  reducedMotion: boolean,
  tideId: MulttaeConditionId,
  assets: FishingSceneAssets,
) {
  const t = reducedMotion ? 0.72 : elapsedMs / 1000;
  const caughtResult = result?.caught ? result : null;
  const caught = caughtResult != null;
  const impact = caughtResult ? tierImpact(caughtResult.tier) : 0.9;
  const p = clamp01(t / 0.9);
  const waterY = Math.round(height * 0.58);
  const centerX = width * 0.48;

  ctx.clearRect(0, 0, width, height);
  drawPondBackdrop(ctx, width, height, waterY, t * 0.85, caught, tideId, assets);
  ctx.fillStyle = caught ? "rgba(255, 255, 255, 0.08)" : "rgba(37, 99, 235, 0.08)";
  ctx.fillRect(0, 0, width, height);

  const rodBaseX = width * 0.84;
  const rodBaseY = height * 0.55;
  const rodTipX = centerX + 12;
  const rodTipY = caught ? waterY - 32 - easeOutCubic(p) * 22 : waterY - 15;
  const rodControl1X = lerp(rodBaseX, rodTipX, 0.32);
  const rodControl1Y = rodBaseY - height * 0.18;
  const rodControl2X = lerp(rodBaseX, rodTipX, 0.68);
  const rodControl2Y = rodTipY - (caught ? 16 : 6);
  const rodBaseAngle = Math.atan2(rodControl1Y - rodBaseY, rodControl1X - rodBaseX);
  drawRodShaft(
    ctx,
    rodBaseX,
    rodBaseY,
    rodControl1X,
    rodControl1Y,
    rodControl2X,
    rodControl2Y,
    rodTipX,
    rodTipY,
    caught ? 0.86 : 0.24,
  );
  drawFishingLine(
    ctx,
    rodTipX,
    rodTipY,
    centerX - 4,
    waterY + (caught ? -8 : 10),
    caught ? 0.86 : 0.24,
    caught ? Math.sin(t * 16) * 0.5 : 0,
    0,
  );
  drawRodGrip(ctx, rodBaseX, rodBaseY, rodBaseAngle, caught ? -0.65 : 0.25, 0.94);

  if (caught) {
    drawFishShadow(
      ctx,
      centerX - 6,
      waterY + 19 + Math.sin(t * 8) * 2,
      t,
      28 * impact,
      0.28 + Math.min(0.18, impact * 0.05),
      0.35,
    );
    drawPixelSplash(ctx, centerX, waterY + 4, Math.min(1, t / 0.55), 0.62 * impact);
    if (impact > 1.3) {
      drawPixelSplash(ctx, centerX - 14, waterY + 8, (t * 2.1 + 0.32) % 1, 0.16 * impact);
    }
  } else {
    const dart = easeOutCubic(p);
    const fishX = centerX - dart * width * 0.36;
    const fishY = waterY + 17 + Math.sin(t * 12) * 2;
    drawPixelSplash(ctx, centerX, waterY + 8, Math.min(1, t / 0.45), 0.28);
    drawFishShadow(ctx, fishX, fishY, t, 32, 0.42, 0.15);
  }
}
