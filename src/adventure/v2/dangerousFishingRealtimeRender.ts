import type {
  DangerousDepthId,
  DangerousFishBehavior,
} from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_REALTIME_BEHAVIOR_BALANCE,
  DANGEROUS_REALTIME_TICK_MS,
  type DangerousRealtimeView,
} from "./dangerousFishingRealtime";

export type FishDirection = "left" | "right" | "up" | "down";
export type FishFacing = "left" | "right";

export type FishPose = {
  x: number;
  y: number;
  tilt: number;
  scale: number;
  direction: FishDirection;
  tailPhase: number;
  tailAmplitude: number;
};

export type LineCurve = {
  start: { x: number; y: number };
  control: { x: number; y: number };
  end: { x: number; y: number };
};

export type SceneEffects = {
  particleDensity: number;
  shakeStrength: number;
  lightLevel: number;
  vignetteStrength: number;
};

export type StaticFallbackModel = {
  background: "solid-underwater";
  animated: false;
  pose: FishPose;
};

const DIRECTION_BY_BEHAVIOR: Record<DangerousFishBehavior, FishDirection> = {
  charge: "left",
  thrash: "up",
  turn: "right",
  dive: "down",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

export function tailWeightForSlice(
  slice: number,
  sliceCount: number,
  facing: FishFacing,
): number {
  const progress = clamp(slice / Math.max(1, sliceCount - 1), 0, 1);
  const tailProgress = facing === "right" ? 1 - progress : progress;
  return tailProgress ** 2;
}

function poseForSnapshot(
  view: DangerousRealtimeView,
): Omit<FishPose, "direction"> {
  const tick = view.tick;
  const distanceRatio = clamp(
    view.distance / Math.max(1, view.startDistance),
    0,
    1.5,
  );
  const staminaRatio = clamp(
    view.stamina / Math.max(1, view.maxStamina),
    0,
    1,
  );
  const active = view.phase === "active";
  const activeTicks =
    DANGEROUS_REALTIME_BEHAVIOR_BALANCE[view.behavior].activeTicks;
  const phaseProgress = active
    ? clamp(
        (activeTicks - view.phaseTicksRemaining) / activeTicks,
        0,
        1,
      )
    : 0;
  const activityEnvelope = Math.sin(phaseProgress * Math.PI);
  const wave = Math.sin(tick * 0.62);
  const crossWave = Math.cos(tick * 0.43);
  let x = 0.72 - distanceRatio * 0.36;
  let y = 0.5 + wave * 0.012;
  let tilt = crossWave * 0.035;

  if (active) {
    switch (view.behavior) {
      case "charge":
        x -= activityEnvelope * 0.06;
        tilt -= activityEnvelope * 0.14;
        break;
      case "thrash":
        x += wave * activityEnvelope * 0.018;
        y += crossWave * activityEnvelope * 0.04;
        tilt += wave * activityEnvelope * 0.18;
        break;
      case "turn":
        x += activityEnvelope * 0.04;
        tilt += activityEnvelope * 0.16;
        break;
      case "dive":
        y += activityEnvelope * 0.09;
        tilt += activityEnvelope * 0.12;
        break;
    }
  }

  return {
    x: clamp(x, 0.18, 0.78),
    y: clamp(y, 0.22, 0.82),
    tilt,
    scale: 0.82 + (1 - staminaRatio) * 0.08,
    tailPhase: tick * 0.62,
    tailAmplitude:
      0.04 +
      activityEnvelope * (view.behavior === "thrash" ? 0.07 : 0.035),
  };
}

/**
 * Returns a normalized visual pose interpolated from the previous 50ms
 * gameplay snapshot to the current snapshot.
 */
export function fishPoseAt(
  view: DangerousRealtimeView,
  elapsedSinceTickMs: number,
  previousView: DangerousRealtimeView = view,
): FishPose {
  const progress = clamp(
    elapsedSinceTickMs / DANGEROUS_REALTIME_TICK_MS,
    0,
    1,
  );
  const previous = poseForSnapshot(previousView);
  const current = poseForSnapshot(view);

  return {
    x: lerp(previous.x, current.x, progress),
    y: lerp(previous.y, current.y, progress),
    tilt: lerp(previous.tilt, current.tilt, progress),
    scale: lerp(previous.scale, current.scale, progress),
    direction: DIRECTION_BY_BEHAVIOR[view.behavior],
    tailPhase: lerp(previous.tailPhase, current.tailPhase, progress),
    tailAmplitude: lerp(
      previous.tailAmplitude,
      current.tailAmplitude,
      progress,
    ),
  };
}

/** Builds a normalized quadratic fishing-line path from the rod to the fish. */
export function lineCurveAt(pose: FishPose, tensionRatio: number): LineCurve {
  const tension = clamp(tensionRatio, 0, 1);
  const start = { x: 0.9, y: 0.06 };
  const end = {
    x: clamp(pose.x - 0.12 * pose.scale, 0.04, 0.92),
    y: clamp(pose.y - Math.sin(pose.tilt) * 0.06, 0.08, 0.92),
  };
  return {
    start,
    control: {
      x: (start.x + end.x) / 2 + 0.03,
      y: (start.y + end.y) / 2 + (1 - tension) * 0.2,
    },
    end,
  };
}

export function sceneEffectsFor(
  depth: DangerousDepthId,
  risk: number,
  reducedMotion: boolean,
): SceneEffects {
  const lightLevel = depth === "surface" ? 1 : depth === "midwater" ? 0.5 : 0;
  const baseParticleDensity = depth === "surface" ? 1 : 2;
  const particleDensity = reducedMotion
    ? 1
    : Math.min(3, baseParticleDensity + (risk >= 4 ? 1 : 0));
  const shakeStrength = reducedMotion ? 0 : risk >= 5 ? 2 : risk >= 3 ? 1 : 0;

  return {
    particleDensity,
    shakeStrength,
    lightLevel,
    vignetteStrength: clamp(
      0.1 + risk * 0.06 + (1 - lightLevel) * 0.18,
      0,
      0.6,
    ),
  };
}

export function staticFallbackFor(
  view: DangerousRealtimeView,
): StaticFallbackModel {
  const distanceRatio = clamp(
    view.distance / Math.max(1, view.startDistance),
    0,
    1.5,
  );
  const staminaRatio = clamp(
    view.stamina / Math.max(1, view.maxStamina),
    0,
    1,
  );

  return {
    background: "solid-underwater",
    animated: false,
    pose: {
      x: clamp(0.72 - distanceRatio * 0.36, 0.18, 0.78),
      y: 0.5,
      tilt: 0,
      scale: 0.82 + (1 - staminaRatio) * 0.08,
      direction: DIRECTION_BY_BEHAVIOR[view.behavior],
      tailPhase: 0,
      tailAmplitude: 0,
    },
  };
}
