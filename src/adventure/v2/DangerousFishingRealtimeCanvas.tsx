"use client";

import { useEffect, useRef, useState } from "react";
import type { DangerousDepthId } from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_REALTIME_TICK_MS,
  type DangerousRealtimeView,
} from "./dangerousFishingRealtime";
import {
  fishPoseAt,
  lineCurveAt,
  sceneEffectsFor,
  staticFallbackFor,
  tailWeightForSlice,
  type FishFacing,
  type FishPose,
} from "./dangerousFishingRealtimeRender";

export type DangerousFishingRealtimeCanvasProps = {
  view: DangerousRealtimeView;
  scene: {
    encounterImageSrc: string;
    depth: DangerousDepthId;
    risk: number;
    description: string;
  };
  target: {
    imageSrc: string;
    struggleSpriteSrc?: string;
    name: string;
    facing?: FishFacing;
  };
  reducedMotion: boolean;
  className?: string;
};

type LoadedSceneImages = {
  background: HTMLImageElement;
  fish: HTMLImageElement;
  struggle: HTMLImageElement | null;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load scene image: ${src}`));
    image.src = src;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

function drawParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: number,
  now: number,
) {
  context.fillStyle = "rgba(210, 245, 255, 0.42)";
  const count = density * 10;
  for (let index = 0; index < count; index += 1) {
    const x =
      ((index * 79 + now * (0.003 + (index % 3) * 0.001)) % 100) / 100;
    const yTravel = index * 47 - now * (0.006 + (index % 4) * 0.001);
    const y = (((yTravel % 100) + 100) % 100) / 100;
    const radius = 0.7 + (index % 3) * 0.55;
    context.beginPath();
    context.arc(x * width, y * height, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawLine(
  context: CanvasRenderingContext2D,
  pose: FishPose,
  tensionRatio: number,
  width: number,
  height: number,
) {
  const curve = lineCurveAt(pose, tensionRatio);
  context.beginPath();
  context.moveTo(curve.start.x * width, curve.start.y * height);
  context.quadraticCurveTo(
    curve.control.x * width,
    curve.control.y * height,
    curve.end.x * width,
    curve.end.y * height,
  );
  context.lineWidth = Math.max(1.2, width / 520);
  context.strokeStyle = "rgba(226, 232, 240, 0.9)";
  context.shadowBlur = 3;
  context.shadowColor = "rgba(3, 105, 161, 0.75)";
  context.stroke();
  context.shadowBlur = 0;
}

function drawFishFromVerticalSlices(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  pose: FishPose,
  width: number,
  height: number,
  frame: number | null,
  facing: FishFacing,
) {
  const frameCount = frame === null ? 1 : 4;
  const sourceFrameWidth = image.naturalWidth / frameCount;
  const sourceFrameX = frame === null ? 0 : frame * sourceFrameWidth;
  const maximumWidth = Math.min(width * 0.48, height * 0.92);
  const drawnWidth = maximumWidth * pose.scale;
  const drawnHeight =
    drawnWidth * (image.naturalHeight / Math.max(1, sourceFrameWidth));
  const sliceCount = 28;
  const sourceSliceWidth = sourceFrameWidth / sliceCount;
  const drawnSliceWidth = drawnWidth / sliceCount;

  context.save();
  context.translate(pose.x * width, pose.y * height);
  context.rotate(pose.tilt);
  context.shadowBlur = 16;
  context.shadowColor = "rgba(2, 8, 23, 0.72)";

  for (let slice = 0; slice < sliceCount; slice += 1) {
    const tailWeight = tailWeightForSlice(slice, sliceCount, facing);
    const offsetY =
      Math.sin(pose.tailPhase + tailWeight * Math.PI * 1.6) *
      pose.tailAmplitude *
      drawnHeight *
      tailWeight;
    context.drawImage(
      image,
      sourceFrameX + slice * sourceSliceWidth,
      0,
      sourceSliceWidth + 0.5,
      image.naturalHeight,
      -drawnWidth / 2 + slice * drawnSliceWidth,
      -drawnHeight / 2 + offsetY,
      drawnSliceWidth + 0.75,
      drawnHeight,
    );
  }

  context.restore();
}

function drawScene(
  context: CanvasRenderingContext2D,
  images: LoadedSceneImages,
  view: DangerousRealtimeView,
  previousView: DangerousRealtimeView,
  depth: DangerousDepthId,
  risk: number,
  reducedMotion: boolean,
  elapsedSinceTickMs: number,
  now: number,
  width: number,
  height: number,
  facing: FishFacing,
) {
  const effects = sceneEffectsFor(depth, risk, reducedMotion);
  const animatedPose = fishPoseAt(
    view,
    reducedMotion ? DANGEROUS_REALTIME_TICK_MS : elapsedSinceTickMs,
    previousView,
  );
  const pose = reducedMotion
    ? { ...animatedPose, tailAmplitude: 0, tailPhase: 0 }
    : animatedPose;
  const shakeX =
    effects.shakeStrength * Math.sin(now * 0.036 + view.tick * 0.7);
  const shakeY =
    effects.shakeStrength * 0.6 * Math.cos(now * 0.031 + view.tick * 0.5);

  context.save();
  context.clearRect(0, 0, width, height);
  context.translate(shakeX, shakeY);
  drawCoverImage(context, images.background, width, height);

  const depthShade = context.createLinearGradient(0, 0, 0, height);
  depthShade.addColorStop(
    0,
    `rgba(2, 20, 38, ${0.04 + (1 - effects.lightLevel) * 0.18})`,
  );
  depthShade.addColorStop(
    1,
    `rgba(2, 8, 23, ${0.16 + effects.vignetteStrength})`,
  );
  context.fillStyle = depthShade;
  context.fillRect(0, 0, width, height);
  drawParticles(
    context,
    width,
    height,
    effects.particleDensity,
    reducedMotion ? 0 : now,
  );
  drawLine(
    context,
    pose,
    view.tension / Math.max(1, view.maxTension),
    width,
    height,
  );

  const struggleFrame = images.struggle
    ? reducedMotion
      ? 0
      : Math.floor(now / 140) % 4
    : null;
  drawFishFromVerticalSlices(
    context,
    images.struggle ?? images.fish,
    pose,
    width,
    height,
    struggleFrame,
    facing,
  );
  context.restore();
}

export function DangerousFishingRealtimeCanvas({
  view,
  scene,
  target,
  reducedMotion,
  className = "",
}: DangerousFishingRealtimeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  const previousViewRef = useRef(view);
  const tickStartedAtRef = useRef(0);
  const assetKey = `${scene.encounterImageSrc}|${target.imageSrc}|${target.struggleSpriteSrc ?? ""}`;
  const [failedAssetKey, setFailedAssetKey] = useState<string | null>(null);
  const failed = failedAssetKey === assetKey;
  const sceneDescription = `${scene.description}에서 ${target.name}과 벌이는 위험 해역 낚시 장면`;

  useEffect(() => {
    const previousView = viewRef.current;
    if (previousView.tick !== view.tick) {
      previousViewRef.current = previousView;
      tickStartedAtRef.current = performance.now();
    } else if (tickStartedAtRef.current === 0) {
      tickStartedAtRef.current = performance.now();
    }
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (failed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let images: LoadedSceneImages | null = null;
    let observer: ResizeObserver | null = null;

    const fail = () => {
      if (!disposed) setFailedAssetKey(assetKey);
    };

    try {
      const context = canvas.getContext("2d");
      if (!context || typeof ResizeObserver === "undefined") {
        fail();
        return;
      }

      const resize = (): boolean => {
        try {
          const bounds = canvas.getBoundingClientRect();
          width = Math.max(1, bounds.width);
          height = Math.max(1, bounds.height);
          const pixelRatio = Math.min(
            2,
            Math.max(1, window.devicePixelRatio || 1),
          );
          canvas.width = Math.round(width * pixelRatio);
          canvas.height = Math.round(height * pixelRatio);
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          return true;
        } catch {
          fail();
          return false;
        }
      };

      observer = new ResizeObserver(() => {
        resize();
      });
      observer.observe(canvas);
      if (resize()) {
        const frame = (now: number) => {
          if (disposed) return;
          if (images && width > 0 && height > 0) {
            drawScene(
              context,
              images,
              viewRef.current,
              previousViewRef.current,
              scene.depth,
              scene.risk,
              reducedMotion,
              now - tickStartedAtRef.current,
              now,
              width,
              height,
              target.facing ?? "right",
            );
          }
          animationFrame = window.requestAnimationFrame(frame);
        };

        Promise.all([
          loadImage(scene.encounterImageSrc),
          loadImage(target.imageSrc),
          target.struggleSpriteSrc
            ? loadImage(target.struggleSpriteSrc)
            : Promise.resolve(null),
        ])
          .then(([background, fish, struggle]) => {
            if (disposed) return;
            images = { background, fish, struggle };
            animationFrame = window.requestAnimationFrame(frame);
          })
          .catch(fail);
      }
    } catch {
      fail();
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [
    assetKey,
    failed,
    reducedMotion,
    scene.depth,
    scene.encounterImageSrc,
    scene.risk,
    target.imageSrc,
    target.facing,
    target.struggleSpriteSrc,
  ]);

  if (failed) {
    const fallback = staticFallbackFor(view);
    return (
      <div
        role="img"
        aria-label={sceneDescription}
        data-renderer={fallback.background}
        className={`relative aspect-video overflow-hidden bg-cyan-950 ${className}`}
      >
        <svg
          viewBox="0 0 160 96"
          aria-hidden="true"
          data-fallback-fish="silhouette"
          className="absolute h-auto max-h-[72%] w-[48%] overflow-visible drop-shadow-2xl"
          style={{
            left: `${fallback.pose.x * 100}%`,
            top: `${fallback.pose.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${fallback.pose.scale})`,
          }}
        >
          <path
            d="M42 48 8 19v58l34-29c18-25 68-31 104 0-36 31-86 25-104 0Z"
            fill="#67e8f9"
            stroke="#cffafe"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <circle cx="125" cy="42" r="4" fill="#082f49" />
        </svg>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={sceneDescription}
      data-renderer="canvas"
      className={`block aspect-video w-full bg-slate-950 ${className}`}
    />
  );
}
