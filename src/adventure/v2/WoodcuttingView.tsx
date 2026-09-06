"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOTS,
  WOODCUTTING_TREES,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
  woodcuttingTotalTimeReduction,
} from "./woodcuttingProgression";
import {
  WOODCUTTING_TREE_FALL_MS,
  woodcuttingAnimationFrame,
} from "./woodcuttingAnimation";
import { ActivityVerificationGate } from "./ActivityVerificationGate";
import {
  AutoGatheringCard,
  type AutoGatheringResultView,
  type AutoGatheringSessionView,
} from "./AutoGatheringCard";
import type {
  AutoGatheringActivity,
  AutoGatheringPlanId,
} from "./autoGathering";
import {
  ActivityVerificationRequiredError,
  type ActivityVerificationChallenge,
  type ActivityVerificationSubmission,
  useActivityCooldown,
} from "./useActivityVerification";
import { ProductionJobAdvanceNotice } from "./ProductionJobAdvanceNotice";
import { LifeFieldEnvironmentCard } from "./LifeFieldPanels";
import { GatheringResourceStockCard } from "./GatheringResourceStockCard";
import { LifeLevelMilestoneNotice } from "./LifeLevelMilestoneNotice";

export type WoodcuttingLogView = {
  cuts: number;
  xp: number;
  timberEarned: number;
};

export type WoodcuttingTreeView = {
  id: string;
  name: string;
  materialId: string;
  xp: number;
};

export type WoodcuttingStart = {
  sessionId: string;
  spotId: WoodcuttingSpotId;
  tree: WoodcuttingTreeView;
  durationMs: number;
  chops: number;
  failureRate: number;
};

export type WoodcuttingOutcome =
  | {
      success: true;
      tree: WoodcuttingTreeView;
      materialName: string;
      materialGained: number;
      bonusMaterialGained: number;
      nextActionAt?: number | null;
      recovered: boolean;
      xpGained: number;
      jobName: string | null;
      masteryGained: number;
      masteryAfter: number | null;
      seedDrop: {
        cropId: string;
        seedName: string;
        quantity: number;
      } | null;
      log: WoodcuttingLogView;
    }
  | {
      success: false;
      reason: string;
      nextActionAt?: number | null;
    };

export type WoodcuttingHandlers = {
  start: (spotId: WoodcuttingSpotId) => Promise<WoodcuttingStart>;
  finish: (sessionId: string) => Promise<WoodcuttingOutcome>;
  materials: Record<string, number>;
  log: WoodcuttingLogView;
  failureReductionPct?: number;
  durationReductionPct: number;
  autoSession: AutoGatheringSessionView | null;
  autoResult: AutoGatheringResultView | null;
  autoLoading: boolean;
  activeAutoActivity: AutoGatheringActivity | null;
  startAuto: (
    spotId: WoodcuttingSpotId,
    planId: AutoGatheringPlanId,
  ) => Promise<void>;
  claimAuto: () => Promise<void>;
  cancelAuto: () => Promise<void>;
  verification?: ActivityVerificationChallenge | null;
  verifyHuman?: (submission: ActivityVerificationSubmission) => Promise<boolean>;
};

type Phase = "idle" | "loading" | "cutting" | "finishing" | "result";
type ViewMode = "choice" | "manual";

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}초`;
}

function formatRate(rate: number): string {
  return `${(clamp01(rate) * 100).toFixed(1)}%`;
}

function isWoodcuttingShortcutTargetIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, button, a, [role='button'], [role='link']"),
  );
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

type TreeCanopy = "round" | "conifer" | "willow" | "column";

type TreeVisual = {
  skyTop: string;
  skyBottom: string;
  groundTop: string;
  groundBottom: string;
  barkDark: string;
  barkMid: string;
  barkLight: string;
  heartwood: string;
  leafDark: string;
  leafMid: string;
  leafLight: string;
  canopy: TreeCanopy;
  trunkScale: number;
};

const TREE_VISUALS: Record<string, TreeVisual> = {
  pine: {
    skyTop: "#bae6fd",
    skyBottom: "#dcfce7",
    groundTop: "#4d7c0f",
    groundBottom: "#14532d",
    barkDark: "#422006",
    barkMid: "#854d0e",
    barkLight: "#b45309",
    heartwood: "#fde68a",
    leafDark: "#14532d",
    leafMid: "#15803d",
    leafLight: "#22c55e",
    canopy: "conifer",
    trunkScale: 0.92,
  },
  birch: {
    skyTop: "#dbeafe",
    skyBottom: "#ecfccb",
    groundTop: "#65a30d",
    groundBottom: "#166534",
    barkDark: "#57534e",
    barkMid: "#d6d3d1",
    barkLight: "#fafaf9",
    heartwood: "#fef3c7",
    leafDark: "#3f6212",
    leafMid: "#65a30d",
    leafLight: "#a3e635",
    canopy: "round",
    trunkScale: 0.78,
  },
  willow: {
    skyTop: "#bae6fd",
    skyBottom: "#ccfbf1",
    groundTop: "#0f766e",
    groundBottom: "#134e4a",
    barkDark: "#3f3f1f",
    barkMid: "#717344",
    barkLight: "#a3a56b",
    heartwood: "#fef3c7",
    leafDark: "#166534",
    leafMid: "#4d7c0f",
    leafLight: "#84cc16",
    canopy: "willow",
    trunkScale: 0.86,
  },
  oak: {
    skyTop: "#bfdbfe",
    skyBottom: "#dcfce7",
    groundTop: "#4d7c0f",
    groundBottom: "#14532d",
    barkDark: "#3f2a1d",
    barkMid: "#6b4423",
    barkLight: "#9a6737",
    heartwood: "#fcd9a4",
    leafDark: "#14532d",
    leafMid: "#166534",
    leafLight: "#16a34a",
    canopy: "round",
    trunkScale: 1.12,
  },
  cedar: {
    skyTop: "#c7d2fe",
    skyBottom: "#d1fae5",
    groundTop: "#3f6212",
    groundBottom: "#14352a",
    barkDark: "#4c1d13",
    barkMid: "#9a3412",
    barkLight: "#c2410c",
    heartwood: "#fed7aa",
    leafDark: "#134e4a",
    leafMid: "#0f766e",
    leafLight: "#10b981",
    canopy: "column",
    trunkScale: 1.02,
  },
  cypress: {
    skyTop: "#ddd6fe",
    skyBottom: "#cffafe",
    groundTop: "#0f766e",
    groundBottom: "#164e63",
    barkDark: "#3f2d24",
    barkMid: "#785548",
    barkLight: "#a77968",
    heartwood: "#fde4c4",
    leafDark: "#064e3b",
    leafMid: "#047857",
    leafLight: "#34d399",
    canopy: "column",
    trunkScale: 1.08,
  },
};

const DEFAULT_TREE_VISUAL = TREE_VISUALS.oak;

const WOODCUTTING_FOREST_SRC = "/images/ui/forest.webp";
const WOODCUTTING_TREE_SHEET_SRC = "/images/ui/woodcutting-trees.webp";
const WOODCUTTING_AXE_SRC = "/images/ui/woodcutting-axe.webp";
const TREE_SPRITE_CELL: Record<string, { column: number; row: number }> = {
  pine: { column: 0, row: 0 },
  birch: { column: 1, row: 0 },
  willow: { column: 2, row: 0 },
  oak: { column: 0, row: 1 },
  cedar: { column: 1, row: 1 },
  cypress: { column: 2, row: 1 },
};

type WoodcuttingSceneAssets = {
  forest: HTMLImageElement | null;
  trees: HTMLImageElement | null;
  axe: HTMLImageElement | null;
};

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

function drawCanopy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  visual: TreeVisual,
  time: number,
) {
  const sway = Math.sin(time * 1.35) * 3;
  ctx.save();
  ctx.translate(sway, 0);

  if (visual.canopy === "conifer" || visual.canopy === "column") {
    const layers = visual.canopy === "column" ? 5 : 4;
    for (let index = 0; index < layers; index += 1) {
      const layerY = y - 54 + index * 29;
      const halfWidth =
        width * (visual.canopy === "column" ? 0.44 : 0.58) * (0.68 + index * 0.13);
      ctx.fillStyle =
        index % 3 === 0
          ? visual.leafLight
          : index % 2 === 0
            ? visual.leafMid
            : visual.leafDark;
      ctx.beginPath();
      ctx.moveTo(x, layerY - 42);
      ctx.quadraticCurveTo(x - halfWidth * 0.36, layerY - 4, x - halfWidth, layerY + 24);
      ctx.quadraticCurveTo(x, layerY + 14, x + halfWidth, layerY + 24);
      ctx.quadraticCurveTo(x + halfWidth * 0.35, layerY - 4, x, layerY - 42);
      ctx.fill();
    }
  } else {
    drawLeafCluster(ctx, x - width * 0.25, y + 4, width * 0.35, visual.leafDark);
    drawLeafCluster(ctx, x + width * 0.25, y + 2, width * 0.37, visual.leafMid);
    drawLeafCluster(ctx, x, y - width * 0.23, width * 0.42, visual.leafLight);
    drawLeafCluster(ctx, x, y + width * 0.18, width * 0.32, visual.leafMid);
  }

  if (visual.canopy === "willow") {
    ctx.strokeStyle = visual.leafMid;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let index = -4; index <= 4; index += 1) {
      const branchX = x + index * width * 0.11;
      const drop = 38 + Math.abs(index) * 5 + Math.sin(time * 1.6 + index) * 4;
      ctx.beginPath();
      ctx.moveTo(branchX, y + 4);
      ctx.quadraticCurveTo(branchX + index * 2, y + drop * 0.55, branchX + index, y + drop);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  visual: TreeVisual,
  forestImage: HTMLImageElement | null,
) {
  if (forestImage?.complete && forestImage.naturalWidth > 0) {
    const sourceRatio = forestImage.naturalWidth / forestImage.naturalHeight;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = forestImage.naturalWidth;
    let sourceHeight = forestImage.naturalHeight;
    if (sourceRatio > targetRatio) {
      sourceWidth = forestImage.naturalHeight * targetRatio;
      sourceX = (forestImage.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = forestImage.naturalWidth / targetRatio;
      sourceY = (forestImage.naturalHeight - sourceHeight) / 2;
    }
    ctx.drawImage(
      forestImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );
    const atmosphere = ctx.createLinearGradient(0, 0, 0, height);
    atmosphere.addColorStop(0, "rgba(15,23,42,0.04)");
    atmosphere.addColorStop(0.58, "rgba(255,255,255,0.03)");
    atmosphere.addColorStop(1, "rgba(20,83,45,0.24)");
    ctx.fillStyle = atmosphere;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, visual.skyTop);
  sky.addColorStop(0.62, visual.skyBottom);
  sky.addColorStop(1, visual.groundTop);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.18;
  const sunY = height * 0.18;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 70);
  sunGlow.addColorStop(0, "rgba(255,255,224,0.95)");
  sunGlow.addColorStop(0.24, "rgba(254,240,138,0.55)");
  sunGlow.addColorStop(1, "rgba(254,240,138,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunX - 72, sunY - 72, 144, 144);

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

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = visual.leafDark;
  for (let index = 0; index < 9; index += 1) {
    const x = (index / 8) * width + Math.sin(index * 4.7) * 12;
    const base = height * 0.74;
    const treeHeight = 44 + (index % 3) * 14;
    ctx.fillRect(x - 3, base - treeHeight * 0.45, 6, treeHeight * 0.45);
    ctx.beginPath();
    ctx.moveTo(x, base - treeHeight);
    ctx.lineTo(x - 18, base - treeHeight * 0.28);
    ctx.lineTo(x + 18, base - treeHeight * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const ground = ctx.createLinearGradient(0, height * 0.72, 0, height);
  ground.addColorStop(0, visual.groundTop);
  ground.addColorStop(1, visual.groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, height * 0.73, width, height * 0.27);

  ctx.strokeStyle = "rgba(220,252,231,0.32)";
  ctx.lineWidth = 1.5;
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 47) % Math.max(1, width);
    const y = height * (0.8 + ((index * 17) % 17) / 100);
    const lean = Math.sin(time * 1.4 + index) * 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.quadraticCurveTo(x + lean, y + 4, x + lean * 1.4, y - 4 - (index % 4));
    ctx.stroke();
  }
}

function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fall: number,
  impact: number,
  time: number,
  treeImage: HTMLImageElement,
  treeId: string,
) {
  const cell = TREE_SPRITE_CELL[treeId] ?? TREE_SPRITE_CELL.oak;
  const sourceWidth = treeImage.naturalWidth / 3;
  const sourceHeight = treeImage.naturalHeight / 2;
  const size = Math.min(height * 0.8, width * 0.58);
  const trunkX = width * 0.5;
  const groundY = height * 0.85;
  const destinationX = trunkX - size / 2;
  const destinationY = groundY - size;
  const fallAngle = easeOutCubic(fall) * 1.4;

  ctx.fillStyle = `rgba(15,23,42,${0.18 + fall * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(
    trunkX + fall * size * 0.3,
    groundY + 5,
    size * (0.18 + fall * 0.28),
    8 + fall * 5,
    0,
    0,
    TAU,
  );
  ctx.fill();

  ctx.save();
  ctx.translate(trunkX, groundY);
  ctx.rotate(fallAngle + Math.sin(time * 20) * impact * 0.006);
  ctx.translate(-trunkX, -groundY);
  ctx.drawImage(
    treeImage,
    cell.column * sourceWidth,
    cell.row * sourceHeight,
    sourceWidth,
    sourceHeight,
    destinationX,
    destinationY,
    size,
    size,
  );
  ctx.restore();
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  damage: number,
  fall: number,
  impact: number,
  time: number,
  visual: TreeVisual,
  treeImage: HTMLImageElement | null,
  treeId: string,
) {
  if (treeImage?.complete && treeImage.naturalWidth > 0) {
    drawTreeSprite(
      ctx,
      width,
      height,
      fall,
      impact,
      time,
      treeImage,
      treeId,
    );
    return;
  }

  const trunkX = width * 0.5;
  const groundY = height * 0.84;
  const cutY = height * 0.69;
  const trunkTop = height * 0.24;
  const trunkWidth = Math.max(46, width * 0.135 * visual.trunkScale);
  const fallAngle = easeOutCubic(fall) * 1.46;

  ctx.fillStyle = `rgba(15,23,42,${0.2 + fall * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(
    trunkX + fall * height * 0.18,
    groundY + 9,
    trunkWidth * (1.1 + fall * 1.8),
    11 + fall * 5,
    0,
    0,
    TAU,
  );
  ctx.fill();

  const stumpGradient = ctx.createLinearGradient(
    trunkX - trunkWidth / 2,
    0,
    trunkX + trunkWidth / 2,
    0,
  );
  stumpGradient.addColorStop(0, visual.barkDark);
  stumpGradient.addColorStop(0.38, visual.barkMid);
  stumpGradient.addColorStop(0.72, visual.barkLight);
  stumpGradient.addColorStop(1, visual.barkDark);
  ctx.fillStyle = stumpGradient;
  ctx.beginPath();
  ctx.moveTo(trunkX - trunkWidth * 0.5, groundY);
  ctx.lineTo(trunkX - trunkWidth * 0.43, cutY - 2);
  ctx.lineTo(trunkX + trunkWidth * 0.42, cutY - 2);
  ctx.lineTo(trunkX + trunkWidth * 0.5, groundY);
  ctx.closePath();
  ctx.fill();

  if (fall > 0.02) {
    ctx.fillStyle = visual.heartwood;
    ctx.strokeStyle = visual.barkDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(trunkX, cutY - 2, trunkWidth * 0.43, 8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,53,15,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(trunkX, cutY - 2, trunkWidth * 0.22, 4, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(trunkX, cutY);
  ctx.rotate(fallAngle + Math.sin(time * 20) * impact * 0.009);
  ctx.translate(-trunkX, -cutY);

  const upperGradient = ctx.createLinearGradient(
    trunkX - trunkWidth / 2,
    0,
    trunkX + trunkWidth / 2,
    0,
  );
  upperGradient.addColorStop(0, visual.barkDark);
  upperGradient.addColorStop(0.32, visual.barkMid);
  upperGradient.addColorStop(0.65, visual.barkLight);
  upperGradient.addColorStop(1, visual.barkDark);
  ctx.fillStyle = upperGradient;
  ctx.beginPath();
  ctx.moveTo(trunkX - trunkWidth * 0.43, cutY + 5);
  ctx.bezierCurveTo(
    trunkX - trunkWidth * 0.4,
    height * 0.52,
    trunkX - trunkWidth * 0.3,
    height * 0.37,
    trunkX - trunkWidth * 0.22,
    trunkTop,
  );
  ctx.lineTo(trunkX + trunkWidth * 0.22, trunkTop);
  ctx.bezierCurveTo(
    trunkX + trunkWidth * 0.3,
    height * 0.37,
    trunkX + trunkWidth * 0.4,
    height * 0.52,
    trunkX + trunkWidth * 0.43,
    cutY + 5,
  );
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,247,237,0.24)";
  ctx.lineWidth = 2.4;
  for (let index = -2; index <= 2; index += 1) {
    const x = trunkX + index * trunkWidth * 0.13;
    ctx.beginPath();
    ctx.moveTo(x, cutY - 6);
    ctx.bezierCurveTo(x + 5, height * 0.56, x - 5, height * 0.4, x + 2, trunkTop + 18);
    ctx.stroke();
  }

  drawCanopy(ctx, trunkX, trunkTop + 12, Math.min(76, width * 0.15), visual, time);
  ctx.restore();

  if (fall < 0.98) {
    const cutDepth = trunkWidth * 0.74 * damage;
    ctx.fillStyle = visual.heartwood;
    ctx.beginPath();
    ctx.moveTo(trunkX + trunkWidth * 0.44, cutY - 15);
    ctx.lineTo(trunkX + trunkWidth * 0.44 - cutDepth, cutY);
    ctx.lineTo(trunkX + trunkWidth * 0.44, cutY + 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = visual.barkDark;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (damage > 0.28) {
      ctx.strokeStyle = "rgba(69,26,3,0.82)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trunkX + 2, cutY);
      ctx.lineTo(trunkX - 7, cutY - 13 - damage * 12);
      ctx.lineTo(trunkX - 2, cutY - 22 - damage * 18);
      ctx.stroke();
    }
  }
}

function drawAxe(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cycle: number,
  impact: number,
  visible: boolean,
  visual: TreeVisual,
  axeImage: HTMLImageElement | null,
) {
  if (!visible) return;
  const strike = cycle < 0.66 ? easeOutCubic(cycle / 0.66) : 1 - (cycle - 0.66) / 0.34;
  if (axeImage?.complete && axeImage.naturalWidth > 0) {
    const axeWidth = Math.min(160, width * 0.32);
    const axeHeight = axeWidth * (axeImage.naturalHeight / axeImage.naturalWidth);
    const gripX = width * 0.8;
    const gripY = height * 0.42;
    const rotation = 0.04 - strike * 1.08;

    if (cycle > 0.18 && cycle < 0.68) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + strike * 0.2})`;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(gripX, gripY, axeWidth * 0.82, 3.85, 2.42, true);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(gripX, gripY);
    ctx.rotate(rotation);
    ctx.drawImage(
      axeImage,
      -axeWidth * 0.94,
      -axeHeight * 0.91,
      axeWidth,
      axeHeight,
    );
    ctx.restore();
  } else {
    const angle = -0.35 - strike * 1.25;
    const x = width * (0.84 - strike * 0.21);
    const y = height * (0.6 + strike * 0.08);

    if (cycle > 0.22 && cycle < 0.68) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.1 + strike * 0.24})`;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(width * 0.72, height * 0.59, 58, 3.72, 2.12, true);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const handle = ctx.createLinearGradient(-64, 0, 0, 0);
    handle.addColorStop(0, "#713f12");
    handle.addColorStop(0.5, "#d97706");
    handle.addColorStop(1, "#92400e");
    ctx.strokeStyle = handle;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-58, -8);
    ctx.stroke();
    const steel = ctx.createLinearGradient(-74, -25, -39, 4);
    steel.addColorStop(0, "#f8fafc");
    steel.addColorStop(0.48, "#cbd5e1");
    steel.addColorStop(1, "#64748b");
    ctx.fillStyle = steel;
    ctx.strokeStyle = "#334155";
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
  }

  if (impact > 0) {
    const cutX = width * 0.56;
    const cutY = height * 0.69;
    ctx.strokeStyle = `rgba(254,249,195,${impact * 0.78})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cutX, cutY, 8 + (1 - impact) * 22, 0, TAU);
    ctx.stroke();
    for (let index = 0; index < 14; index += 1) {
      const angle2 = -1.35 + index * 0.19;
      const distance = 8 + (1 - impact) * (24 + (index % 4) * 8);
      ctx.fillStyle = index % 3 === 0 ? visual.barkLight : visual.heartwood;
      ctx.save();
      ctx.translate(
        cutX + Math.cos(angle2) * distance,
        cutY + Math.sin(angle2) * distance + (1 - impact) ** 2 * 18,
      );
      ctx.rotate(angle2 + (1 - impact) * 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.2 + (index % 2), 1.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawFallingDebris(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  impact: number,
  fall: number,
  visual: TreeVisual,
) {
  const intensity = Math.max(impact, Math.sin(Math.min(1, fall) * Math.PI) * 0.45);
  if (intensity <= 0.01) return;
  for (let index = 0; index < 12; index += 1) {
    const seed = index * 7.31;
    const drift = (time * (12 + (index % 3) * 4) + seed * 11) % (height * 0.38);
    const x = width * 0.5 + Math.sin(seed + time * 1.8) * (42 + index * 3);
    const y = height * 0.31 + drift;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 2.4 + seed);
    ctx.globalAlpha = intensity * (0.38 + (index % 4) * 0.12);
    ctx.fillStyle = index % 2 === 0 ? visual.leafLight : visual.leafMid;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawFallImpact(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fall: number,
) {
  if (fall < 0.72) return;
  const burst = clamp01((fall - 0.72) / 0.28);
  const opacity = 1 - burst;
  const impactX = width * 0.76;
  const impactY = height * 0.83;
  for (let index = 0; index < 10; index += 1) {
    const direction = index % 2 === 0 ? -1 : 1;
    const distance = 12 + burst * (24 + index * 5);
    ctx.fillStyle = `rgba(214,211,209,${opacity * 0.48})`;
    ctx.beginPath();
    ctx.arc(
      impactX + direction * distance,
      impactY - Math.sin((index + 1) * 0.7) * 12 - burst * 9,
      5 + (index % 3) * 2,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(254,240,138,${opacity * 0.62})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(impactX, impactY, 20 + burst * 54, 7 + burst * 9, 0, 0, TAU);
  ctx.stroke();
}

function drawCompletionGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  visual: TreeVisual,
) {
  const centerX = width * 0.5;
  const centerY = height * 0.68;
  const pulse = 0.72 + Math.sin(time * 3.2) * 0.12;
  const glow = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, 78);
  glow.addColorStop(0, `rgba(254,240,138,${pulse * 0.42})`);
  glow.addColorStop(0.45, `rgba(253,186,116,${pulse * 0.16})`);
  glow.addColorStop(1, "rgba(253,186,116,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(centerX - 82, centerY - 82, 164, 164);

  for (let index = 0; index < 14; index += 1) {
    const orbit = time * (0.6 + (index % 3) * 0.12) + index * 2.4;
    const radius = 24 + (index % 5) * 10;
    const rise = (time * (13 + (index % 4) * 3) + index * 17) % 92;
    ctx.globalAlpha = 0.35 + (index % 4) * 0.13;
    ctx.fillStyle = index % 3 === 0 ? visual.leafLight : "#fef08a";
    ctx.beginPath();
    ctx.arc(
      centerX + Math.cos(orbit) * radius,
      centerY + 34 - rise,
      1.7 + (index % 2) * 0.8,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function AutoWoodcuttingCanvas({
  durationMs,
  startedAt,
  phase,
  treeId,
  chops,
}: {
  durationMs: number;
  startedAt: number;
  phase: Phase;
  treeId: string;
  chops: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const assetsRef = useRef<WoodcuttingSceneAssets>({
    forest: null,
    trees: null,
    axe: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    const sceneStartedAt = performance.now();
    let frame = 0;
    const visual = TREE_VISUALS[treeId] ?? DEFAULT_TREE_VISUAL;

    const loadImage = (key: keyof WoodcuttingSceneAssets, src: string) => {
      if (assetsRef.current[key]) return;
      const image = new Image();
      image.decoding = "async";
      assetsRef.current = { ...assetsRef.current, [key]: image };
      image.src = src;
    };
    loadImage("forest", WOODCUTTING_FOREST_SRC);
    loadImage("trees", WOODCUTTING_TREE_SHEET_SRC);
    loadImage("axe", WOODCUTTING_AXE_SRC);

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
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const elapsed = Math.max(0, now - startedAt);
        const animation = woodcuttingAnimationFrame(elapsed, durationMs, chops, reducedMotion);
        const { cycle, damage, fall, impact } = animation;
        const sceneTime = reducedMotion ? 0 : (now - sceneStartedAt) / 1_000;
        const assets = assetsRef.current;
        drawBackdrop(ctx, width, height, sceneTime, visual, assets.forest);
        const shakeX = impact * Math.sin(now * 0.13) * 4;
        const shakeY = impact * Math.cos(now * 0.17) * 2.5;
        ctx.save();
        ctx.translate(shakeX, shakeY);
        drawTree(
          ctx,
          width,
          height,
          damage,
          fall,
          impact,
          sceneTime,
          visual,
          assets.trees,
          treeId,
        );
        drawAxe(
          ctx,
          width,
          height,
          cycle,
          impact,
          phase === "cutting" && elapsed < durationMs,
          visual,
          assets.axe,
        );
        drawFallingDebris(ctx, width, height, sceneTime, impact, fall, visual);
        drawFallImpact(ctx, width, height, fall);
        if (phase === "result") {
          drawCompletionGlow(ctx, width, height, sceneTime, visual);
        }
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };

    const onMotionChange = () => {
      reducedMotion = mediaQuery.matches;
    };
    mediaQuery.addEventListener("change", onMotionChange);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", onMotionChange);
    };
  }, [chops, durationMs, phase, startedAt, treeId]);

  return (
    <div ref={wrapRef} className="woodcutting-canvas-scene pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} aria-hidden="true" className="woodcutting-scene-canvas" />
    </div>
  );
}

const FAILURE_MESSAGE: Record<string, string> = {
  no_session: "벌목 작업을 찾지 못했습니다.",
  stale: "다른 벌목 작업이 시작되었습니다.",
  expired: "원목을 거둘 시간이 지나버렸습니다.",
  failed: "벌목에 실패했습니다. 원목과 벌목 XP를 획득하지 못했습니다.",
};

export function WoodcuttingView({
  start,
  finish,
  materials,
  log,
  failureReductionPct = 0,
  durationReductionPct,
  autoSession,
  autoResult,
  autoLoading,
  activeAutoActivity,
  startAuto,
  claimAuto,
  cancelAuto,
  verification,
  verifyHuman,
  onBack,
  spotId,
}: WoodcuttingHandlers & {
  onBack: () => void;
  spotId: WoodcuttingSpotId;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("choice");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<WoodcuttingStart | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<WoodcuttingOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    applyNextActionAt,
    handleCooldownError,
    cooldownRemainingSec,
  } = useActivityCooldown();

  const startCut = useCallback(async () => {
    if (cooldownRemainingSec > 0 || activeAutoActivity) return;
    setViewMode("manual");
    setPhase("loading");
    setError(null);
    setResult(null);
    setRun(null);
    setElapsedMs(0);
    try {
      const next = await start(spotId);
      const now = performance.now();
      setRun(next);
      setStartedAt(now);
      setPhase("cutting");
    } catch (caught) {
      if (caught instanceof ActivityVerificationRequiredError) {
        setPhase("idle");
        return;
      }
      if (handleCooldownError(caught)) {
        setPhase("idle");
        return;
      }
      setError("벌목을 시작하지 못했습니다.");
      setPhase("idle");
    }
  }, [activeAutoActivity, cooldownRemainingSec, handleCooldownError, spotId, start]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isWoodcuttingShortcutTargetIgnored(event.target)) return;
      if (event.key !== " " && event.key !== "Enter") return;
      if (viewMode !== "manual") return;
      if (phase !== "idle" && phase !== "result") return;
      if (cooldownRemainingSec > 0) return;
      if (activeAutoActivity) return;

      event.preventDefault();
      void startCut();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAutoActivity, cooldownRemainingSec, phase, startCut, viewMode]);

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
          applyNextActionAt(outcome.nextActionAt);
          setResult(outcome);
          if (!outcome.success) {
            setError(FAILURE_MESSAGE[outcome.reason] ?? "벌목 처리 중 문제가 생겼습니다.");
          } else {
            window.dispatchEvent(new Event("life-field:refresh"));
            if (navigator.vibrate) navigator.vibrate([45, 40, 90]);
          }
          setPhase("result");
        })
        .catch(() => {
          if (!alive) return;
          setError("벌목 처리 중 문제가 생겼습니다.");
          setPhase("result");
        });
    }, run.durationMs + WOODCUTTING_TREE_FALL_MS);
    return () => {
      alive = false;
      window.clearInterval(ticker);
      window.clearTimeout(fallTimer);
      window.clearTimeout(finishTimer);
    };
  }, [applyNextActionAt, finish, run, startedAt]);

  const progress = run ? clamp01(elapsedMs / run.durationMs) : 0;
  const chopCount = useMemo(
    () =>
      run
        ? woodcuttingAnimationFrame(elapsedMs, run.durationMs, run.chops).chopCount
        : 0,
    [elapsedMs, run],
  );
  const selectedSpot = WOODCUTTING_SPOTS[spotId];
  const selectedTree = WOODCUTTING_TREES[selectedSpot.treeId];
  const selectedMaterial = WOODCUTTING_MATERIALS[selectedTree.materialId];
  const selectedMaterialCount = materials[selectedTree.materialId] ?? 0;
  const progression = woodcuttingProgressionView(log.cuts, log.xp);
  const expectedDurationMs = woodcuttingDurationWithPassive(
    selectedTree.durationMs,
    progression.level,
    durationReductionPct,
  );
  const expectedFailureRate =
    woodcuttingFailureRate(selectedTree.baseFailureRate, progression.level) *
    (1 - failureReductionPct / 100);
  const timeReductionPct =
    woodcuttingTotalTimeReduction(progression.level, durationReductionPct) * 100;
  const levelProgressPct = progression.maxLevel
    ? 100
    : Math.min(100, (progression.xpIntoLevel / progression.xpForNext) * 100);

  return (
    <main className={`${SURFACE_CARD} mx-auto my-2 w-[calc(100%-1rem)] max-w-[720px] space-y-3 rounded-2xl p-3 text-zinc-900 shadow-lg dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5`}>
      <SubViewHeader
        title={viewMode === "choice" ? "벌목장" : `${selectedSpot.shortName} 벌목`}
        onBack={onBack}
      />

      <ProductionJobAdvanceNotice refreshKey={progression.level} />
      <LifeLevelMilestoneNotice
        activity="woodcutting"
        level={progression.level}
      />

      <LifeFieldEnvironmentCard activity="woodcutting" spotId={spotId} />

      {verification && verifyHuman ? (
        <ActivityVerificationGate
          challenge={verification}
          onVerify={verifyHuman}
        />
      ) : null}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/70 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-emerald-900 dark:text-emerald-100">
              벌목 Lv {progression.level} / 100
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              시간 단축 {timeReductionPct.toFixed(1)}% · 최대 Lv 100
            </div>
          </div>
          <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {progression.maxLevel
              ? "최종 숙련 달성 · MAX"
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

      {viewMode === "choice" ? (
        <>
      <GatheringResourceStockCard
        resourceName={selectedMaterial.name}
        count={selectedMaterialCount}
        tone="woodcutting"
      />

      {!verification ? (
        <AutoGatheringCard
          activityName="벌목"
          spotId={spotId}
          session={autoSession}
          result={autoResult}
          loading={autoLoading}
          blockedByActivity={
            activeAutoActivity && activeAutoActivity !== "woodcutting"
              ? activeAutoActivity
              : null
          }
          buttonVariant="success"
          onStart={(selectedSpotId, planId) =>
            startAuto(selectedSpotId as WoodcuttingSpotId, planId)
          }
          onClaim={claimAuto}
          onCancel={cancelAuto}
        />
      ) : null}

      {!verification ? (
        <Card padding="md" className="space-y-3">
          <div>
            <div className="text-sm font-extrabold">직접 벌목</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              짧은 작업을 직접 진행하고 완료 즉시 재료와 경험치를 획득합니다.
            </div>
          </div>
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {selectedTree.grade}등급 · 성공률 {formatRate(1 - expectedFailureRate)} · 예상{" "}
            {formatDuration(expectedDurationMs)}
          </div>
          <Button
            disabled={cooldownRemainingSec > 0 || Boolean(activeAutoActivity)}
            onClick={() => void startCut()}
            variant="success"
            size="md"
            fullWidth
          >
            {activeAutoActivity
              ? `자동 ${activeAutoActivity === "woodcutting" ? "벌목" : "채광"} 진행 중`
              : cooldownRemainingSec > 0
                ? `다음 벌목까지 ${cooldownRemainingSec}초`
                : `${selectedSpot.shortName}에서 벌목 시작`}
          </Button>
        </Card>
      ) : null}
        </>
      ) : (
        <>

      <GatheringResourceStockCard
        resourceName={selectedMaterial.name}
        count={selectedMaterialCount}
        tone="woodcutting"
      />

      {(phase === "idle" || phase === "result") && !verification && (
        <Button
          disabled={cooldownRemainingSec > 0 || Boolean(activeAutoActivity)}
          onClick={() => void startCut()}
          variant="success"
          size="md"
          fullWidth
        >
          {activeAutoActivity
            ? `자동 ${activeAutoActivity === "woodcutting" ? "벌목" : "채광"} 진행 중`
            : cooldownRemainingSec > 0
              ? `다음 벌목까지 ${cooldownRemainingSec}초`
              : phase === "result"
                ? `${selectedSpot.shortName}에서 다시 벌목`
                : "벌목 시작"}
        </Button>
      )}
      {(phase === "loading" || phase === "cutting" || phase === "finishing") && (
        <Button disabled variant="success" size="md" fullWidth>
          {phase === "loading" ? "나무를 고르는 중…" : "벌목 중…"}
        </Button>
      )}

      {run ? (
        <div className="space-y-2">
          <div className="relative h-80 w-full overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
            <AutoWoodcuttingCanvas
              durationMs={run.durationMs}
              startedAt={startedAt}
              phase={phase}
              treeId={run.tree.id}
              chops={run.chops}
            />
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
            <div className="absolute right-3 top-14 z-10 rounded-full bg-zinc-900/75 px-2.5 py-1 text-[10px] font-bold text-white shadow">
              성공률 {formatRate(1 - run.failureRate)}
            </div>
            <div className="absolute inset-x-4 bottom-4 z-10 overflow-hidden rounded-full border border-white/70 bg-black/25 p-0.5 shadow">
              <div
                className="h-2.5 rounded-full bg-amber-400 transition-[width] duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          {phase === "result" && (
            <Card padding="md" className="ui-action-result text-center">
              {error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              ) : result?.success ? (
                <div className="space-y-1">
                  <div className="font-bold">{result.tree.name} 벌목 완료</div>
                  {result.recovered && (
                    <div className="text-xs font-bold text-sky-700 dark:text-sky-300">
                      벌목 명인의 위기 수습으로 실패를 만회했습니다.
                    </div>
                  )}
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {result.materialName} +{result.materialGained}
                  </div>
                  {result.bonusMaterialGained > 0 && (
                    <div className="ui-result-highlight text-xs font-semibold text-amber-700 dark:text-amber-300">
                      전설의 벌목 추가 원목 +{result.bonusMaterialGained}
                    </div>
                  )}
                  {result.seedDrop && (
                    <div className="ui-result-highlight text-xs font-bold text-violet-700 dark:text-violet-300">
                      숨은 씨앗 발견 · {result.seedDrop.seedName} +
                      {result.seedDrop.quantity}
                    </div>
                  )}
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    벌목 XP +{result.xpGained}
                  </div>
                  {result.masteryGained > 0 && (
                    <div className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                      {result.jobName ?? "나무꾼"} 숙련도 +{result.masteryGained}
                      {result.masteryAfter == null ? "" : ` · 누적 ${result.masteryAfter}`}
                    </div>
                  )}
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : (
        <Card padding="md" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          <div>버튼·Space·Enter로 나무가 쓰러질 때까지 자동 벌목합니다.</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {selectedTree.grade}등급 · 성공률 {formatRate(1 - expectedFailureRate)} · 예상{" "}
            {formatDuration(expectedDurationMs)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            성공 시 {selectedMaterial.name} 1개 · XP +{selectedTree.xp}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            아주 낮은 확률로 농장 씨앗을 발견하며, 고등급 작물일수록 더 희귀합니다.
          </div>
        </Card>
      )}

        </>
      )}
    </main>
  );
}
