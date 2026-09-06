"use client";

import { type MulttaeConditionId } from "@/adventure/data/v2/multtae";
import {
  drawFishingCanvasScene,
  drawResultCanvasScene,
  FISHING_POND_SRC,
  type FishingSceneAssets,
} from "./fishingCanvasDrawing";
import { type FishingPhase, type ReelOutcome } from "./FishingView";
import { useEffect, useRef } from "react";
import { observeCanvasViewport } from "./canvasViewport";

export function FishingSceneCanvas({
  phase,
  preBite,
  tapSignal,
  tideId,
}: {
  phase: FishingPhase;
  preBite: boolean;
  tapSignal: number;
  tideId: MulttaeConditionId;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const preBiteRef = useRef(preBite);
  const phaseStartedAtRef = useRef(0);
  const preBiteStartedAtRef = useRef(-Infinity);
  const tapStartedAtRef = useRef(-Infinity);
  const tideIdRef = useRef<MulttaeConditionId>(tideId);
  const assetsRef = useRef<FishingSceneAssets>({ pond: null });

  useEffect(() => {
    phaseRef.current = phase;
    phaseStartedAtRef.current = performance.now();
  }, [phase]);

  useEffect(() => {
    preBiteRef.current = preBite;
    preBiteStartedAtRef.current = preBite ? performance.now() : -Infinity;
  }, [preBite]);

  useEffect(() => {
    if (tapSignal > 0) {
      tapStartedAtRef.current = performance.now();
    }
  }, [tapSignal]);

  useEffect(() => {
    tideIdRef.current = tideId;
  }, [tideId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let frameId = 0;
    let start = performance.now();
    phaseStartedAtRef.current = start;

    const loadImage = (key: keyof FishingSceneAssets, src: string) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        assetsRef.current = { ...assetsRef.current, [key]: image };
      };
      image.src = src;
    };
    loadImage("pond", FISHING_POND_SRC);

    const viewport = observeCanvasViewport(wrap);
    const draw = (now: number) => {
      const { width, height, dpr } = viewport.read();
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
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
          Math.max(0, now - preBiteStartedAtRef.current),
          Math.max(0, now - tapStartedAtRef.current),
          tideIdRef.current,
          assetsRef.current,
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
      viewport.dispose();
      mediaQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  const waiting = phase === "waiting";
  const biting = phase === "biting";

  return (
    <div ref={wrapRef} className="fish-canvas-scene pointer-events-none relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} aria-hidden="true" className="fish-scene-canvas" />
      {phase !== "idle" && (
        <div
          className={`fish-scene-status absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded px-3 py-1 text-center backdrop-blur-[1px] ${
            biting
              ? "bg-rose-600/95 text-white shadow-lg shadow-rose-950/30 ring-4 ring-white/80 dark:bg-rose-500/95 dark:ring-white/70"
              : "bg-white/75 shadow-sm dark:bg-zinc-900/70"
          }`}
        >
          {phase === "casting" && <span className="text-sm">던지는 중…</span>}
          {waiting && (
            <>
              <span className="block text-sm">입질을 기다리는 중…</span>
              <span className="mt-0.5 block text-[11px] opacity-70">아직 누르지 말 것</span>
            </>
          )}
          {biting && <span className="block text-xl font-extrabold drop-shadow">지금 챔질!</span>}
          {phase === "resolving" && <span className="text-sm">끌어올리는 중…</span>}
        </div>
      )}
    </div>
  );
}


export function FishingResultScene({
  result,
  tideId,
}: {
  result: ReelOutcome | null;
  tideId: MulttaeConditionId;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef(result);
  const tideIdRef = useRef<MulttaeConditionId>(tideId);
  const assetsRef = useRef<FishingSceneAssets>({ pond: null });

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    tideIdRef.current = tideId;
  }, [tideId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let frameId = 0;
    let start = performance.now();

    const loadImage = (key: keyof FishingSceneAssets, src: string) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        assetsRef.current = { ...assetsRef.current, [key]: image };
      };
      image.src = src;
    };
    loadImage("pond", FISHING_POND_SRC);

    const viewport = observeCanvasViewport(wrap);
    const draw = (now: number) => {
      const { width, height, dpr } = viewport.read();
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawResultCanvasScene(
          ctx,
          width,
          height,
          resultRef.current,
          now - start,
          reducedMotion,
          tideIdRef.current,
          assetsRef.current,
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
      viewport.dispose();
      mediaQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div ref={wrapRef} className="fish-result-canvas-scene absolute inset-0 overflow-hidden rounded-lg">
      <canvas ref={canvasRef} aria-hidden="true" className="fish-scene-canvas" />
    </div>
  );
}
