"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  MINING_MATERIALS,
  MINING_NODES,
  MINING_SPOTS,
  type MiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  miningDurationForLevel,
  miningFailureRate,
  miningProgressionView,
  miningTimeReduction,
} from "./miningProgression";
import { MINING_SETTLE_MS, miningAnimationFrame } from "./miningAnimation";
import { ActivityVerificationGate } from "./ActivityVerificationGate";
import {
  AutoGatheringCard,
  type AutoGatheringResultView,
  type AutoGatheringSessionView,
} from "./AutoGatheringCard";
import {
  ActivityVerificationRequiredError,
  type ActivityVerificationChallenge,
  type ActivityVerificationSubmission,
  useActivityCooldown,
} from "./useActivityVerification";

export type MiningLogView = {
  successes: number;
  xp: number;
  oreEarned: number;
  byproductsEarned: number;
};

export type MiningNodeView = {
  id: string;
  name: string;
  materialId: string;
  xp: number;
};

export type MiningStart = {
  sessionId: string;
  spotId: MiningSpotId;
  node: MiningNodeView;
  durationMs: number;
  strikes: number;
  failureRate: number;
};

export type MiningByproductView = {
  materialId: string;
  name: string;
  amount: number;
};

export type MiningOutcome =
  | {
      success: true;
      node: MiningNodeView;
      materialName: string;
      materialGained: number;
      nextActionAt?: number | null;
      byproducts: MiningByproductView[];
      xpGained: number;
      log: MiningLogView;
    }
  | { success: false; reason: string; nextActionAt?: number | null };

export type MiningHandlers = {
  start: (spotId: MiningSpotId) => Promise<MiningStart>;
  finish: (sessionId: string) => Promise<MiningOutcome>;
  materials: Record<string, number>;
  log: MiningLogView;
  autoSession: AutoGatheringSessionView | null;
  autoResult: AutoGatheringResultView | null;
  autoLoading: boolean;
  startAuto: (spotId: MiningSpotId) => Promise<void>;
  claimAuto: () => Promise<void>;
  verification?: ActivityVerificationChallenge | null;
  verifyHuman?: (submission: ActivityVerificationSubmission) => Promise<boolean>;
};

type Phase = "idle" | "loading" | "mining" | "finishing" | "result";

const QUARRY_BACKGROUND_SRC = "/images/ui/quarry.webp";
const MINING_ORES_SRC = "/images/ui/mining-ores.webp";
const MINING_PICKAXE_SRC = "/images/ui/mining-pickaxe.webp";
const ORE_CELL: Record<string, { column: number; row: number }> = {
  iron: { column: 0, row: 0 },
  copper: { column: 1, row: 0 },
  silver: { column: 2, row: 0 },
  gold: { column: 0, row: 1 },
  mythril: { column: 1, row: 1 },
  adamantite: { column: 2, row: 1 },
};

type MiningSceneAssets = {
  background: HTMLImageElement | null;
  ores: HTMLImageElement | null;
  pickaxe: HTMLImageElement | null;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}초`;
}

function formatRate(rate: number): string {
  return `${(clamp01(rate) * 100).toFixed(1)}%`;
}

function isMiningShortcutTargetIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, button, a, [role='button'], [role='link']"),
  );
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  ctx.drawImage(
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

function drawMiningBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: HTMLImageElement | null,
) {
  if (background?.complete && background.naturalWidth > 0) {
    drawCoverImage(ctx, background, width, height);
  } else {
    const cave = ctx.createLinearGradient(0, 0, 0, height);
    cave.addColorStop(0, "#292524");
    cave.addColorStop(1, "#0c0a09");
    ctx.fillStyle = cave;
    ctx.fillRect(0, 0, width, height);
  }
  const shade = ctx.createRadialGradient(
    width * 0.5,
    height * 0.58,
    20,
    width * 0.5,
    height * 0.58,
    width * 0.72,
  );
  shade.addColorStop(0, "rgba(251,191,36,0.08)");
  shade.addColorStop(0.62, "rgba(15,23,42,0.2)");
  shade.addColorStop(1, "rgba(2,6,23,0.62)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

function drawOre(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodeId: string,
  damage: number,
  impact: number,
  image: HTMLImageElement | null,
) {
  const centerX = width * 0.5;
  const groundY = height * 0.93;
  const size = Math.min(height * 0.88, width * 0.62);
  const shakeX = Math.sin(impact * 29) * impact * 4;
  const shakeY = impact * 2;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  if (image?.complete && image.naturalWidth > 0) {
    const cell = ORE_CELL[nodeId] ?? ORE_CELL.iron;
    const sourceWidth = image.naturalWidth / 3;
    const sourceHeight = image.naturalHeight / 2;
    ctx.drawImage(
      image,
      cell.column * sourceWidth,
      cell.row * sourceHeight,
      sourceWidth,
      sourceHeight,
      centerX - size / 2,
      groundY - size,
      size,
      size,
    );
  } else {
    ctx.fillStyle = "#57534e";
    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.35, groundY);
    ctx.lineTo(centerX - size * 0.28, groundY - size * 0.48);
    ctx.lineTo(centerX, groundY - size * 0.72);
    ctx.lineTo(centerX + size * 0.33, groundY - size * 0.38);
    ctx.lineTo(centerX + size * 0.4, groundY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const crackAlpha = 0.18 + damage * 0.55;
  ctx.save();
  ctx.strokeStyle = `rgba(254,243,199,${crackAlpha})`;
  ctx.lineWidth = 1.5 + damage * 1.5;
  ctx.lineCap = "round";
  for (let index = 0; index < Math.ceil(damage * 7); index += 1) {
    const angle = -1.1 + index * 0.33;
    const length = 18 + index * 3;
    ctx.beginPath();
    ctx.moveTo(centerX, height * 0.67);
    ctx.lineTo(
      centerX + Math.cos(angle) * length,
      height * 0.67 + Math.sin(angle) * length,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickaxe(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cycle: number,
  impact: number,
  visible: boolean,
  image: HTMLImageElement | null,
) {
  if (!visible) return;
  const swing =
    cycle < 0.38
      ? easeOutCubic(cycle / 0.38)
      : 1 - clamp01((cycle - 0.38) / 0.62);
  const pickaxeWidth = Math.min(210, width * 0.42);
  const pickaxeHeight = pickaxeWidth;
  const gripX = width * 0.83;
  const gripY = height * 0.74;
  const rotation = 0.22 - swing * 0.9;

  if (cycle > 0.08 && cycle < 0.42) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + swing * 0.22})`;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(gripX, gripY, pickaxeWidth * 0.88, 3.8, 2.28, true);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(gripX, gripY);
  ctx.rotate(rotation);
  if (image?.complete && image.naturalWidth > 0) {
    ctx.drawImage(
      image,
      -pickaxeWidth * 0.92,
      -pickaxeHeight * 0.92,
      pickaxeWidth,
      pickaxeHeight,
    );
  } else {
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-120, -120);
    ctx.stroke();
  }
  ctx.restore();

  if (impact > 0) {
    const hitX = width * 0.5;
    const hitY = height * 0.67;
    ctx.strokeStyle = `rgba(254,240,138,${impact * 0.9})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hitX, hitY, 8 + (1 - impact) * 24, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const distance = 10 + (1 - impact) * (28 + (index % 3) * 8);
      ctx.fillStyle = index % 3 === 0 ? "#fef08a" : "#a8a29e";
      ctx.beginPath();
      ctx.arc(
        hitX + Math.cos(angle) * distance,
        hitY + Math.sin(angle) * distance,
        1.5 + impact * 1.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function MiningCanvas({
  durationMs,
  startedAt,
  phase,
  nodeId,
  strikes,
}: {
  durationMs: number;
  startedAt: number;
  phase: Phase;
  nodeId: string;
  strikes: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const assetsRef = useRef<MiningSceneAssets>({
    background: null,
    ores: null,
    pickaxe: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loadImage = (key: keyof MiningSceneAssets, src: string) => {
      const image = new Image();
      image.decoding = "async";
      assetsRef.current = { ...assetsRef.current, [key]: image };
      image.src = src;
    };
    loadImage("background", QUARRY_BACKGROUND_SRC);
    loadImage("ores", MINING_ORES_SRC);
    loadImage("pickaxe", MINING_PICKAXE_SRC);

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      reducedMotion = mediaQuery.matches;
    };
    mediaQuery.addEventListener("change", onMotionChange);

    const draw = (now: number) => {
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const elapsed = Math.max(0, Math.min(durationMs, now - startedAt));
      const animation = miningAnimationFrame(elapsed, durationMs, strikes);
      const impact = reducedMotion ? 0 : animation.impact;
      const assets = assetsRef.current;
      drawMiningBackdrop(context, width, height, assets.background);
      context.save();
      if (impact > 0) {
        context.translate(
          Math.sin(now * 0.14) * impact * 4,
          Math.cos(now * 0.18) * impact * 2.5,
        );
      }
      drawOre(
        context,
        width,
        height,
        nodeId,
        animation.damage,
        impact,
        assets.ores,
      );
      drawPickaxe(
        context,
        width,
        height,
        reducedMotion ? 0.38 : animation.cycle,
        impact,
        phase === "mining",
        assets.pickaxe,
      );
      context.restore();
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", onMotionChange);
    };
  }, [durationMs, nodeId, phase, startedAt, strikes]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />
    </div>
  );
}

const FAILURE_MESSAGE: Record<string, string> = {
  no_session: "채광 작업을 찾지 못했습니다.",
  stale: "다른 채광 작업이 시작되었습니다.",
  expired: "광석을 거둘 시간이 지나버렸습니다.",
  failed: "채광에 실패했습니다. 광석과 채광 XP를 획득하지 못했습니다.",
};

export function MiningView({
  start,
  finish,
  materials,
  log,
  autoSession,
  autoResult,
  autoLoading,
  startAuto,
  claimAuto,
  verification,
  verifyHuman,
  onBack,
  spotId,
}: MiningHandlers & { onBack: () => void; spotId: MiningSpotId }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<MiningStart | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<MiningOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    applyNextActionAt,
    handleCooldownError,
    cooldownRemainingSec,
  } = useActivityCooldown();

  const startMining = useCallback(async () => {
    if (cooldownRemainingSec > 0 || autoSession) return;
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
      setPhase("mining");
    } catch (caught) {
      if (caught instanceof ActivityVerificationRequiredError) {
        setPhase("idle");
        return;
      }
      if (handleCooldownError(caught)) {
        setPhase("idle");
        return;
      }
      setError("채광을 시작하지 못했습니다.");
      setPhase("idle");
    }
  }, [autoSession, cooldownRemainingSec, handleCooldownError, spotId, start]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isMiningShortcutTargetIgnored(event.target)) return;
      if (event.key !== " " && event.key !== "Enter") return;
      if (phase !== "idle" && phase !== "result") return;
      if (cooldownRemainingSec > 0) return;
      if (autoSession) return;
      event.preventDefault();
      void startMining();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoSession, cooldownRemainingSec, phase, startMining]);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    const ticker = window.setInterval(() => {
      setElapsedMs(Math.min(run.durationMs, performance.now() - startedAt));
    }, 80);
    const settleTimer = window.setTimeout(() => {
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
            setError(FAILURE_MESSAGE[outcome.reason] ?? "채광 처리 중 문제가 생겼습니다.");
          } else if (navigator.vibrate) {
            navigator.vibrate([35, 30, 65]);
          }
          setPhase("result");
        })
        .catch(() => {
          if (!alive) return;
          setError("채광 처리 중 문제가 생겼습니다.");
          setPhase("result");
        });
    }, run.durationMs + MINING_SETTLE_MS);
    return () => {
      alive = false;
      window.clearInterval(ticker);
      window.clearTimeout(settleTimer);
      window.clearTimeout(finishTimer);
    };
  }, [applyNextActionAt, finish, run, startedAt]);

  const selectedSpot = MINING_SPOTS[spotId];
  const selectedNode = MINING_NODES[selectedSpot.nodeId];
  const selectedMaterial = MINING_MATERIALS[selectedNode.materialId];
  const selectedMaterialCount = materials[selectedNode.materialId] ?? 0;
  const progression = miningProgressionView(log.successes, log.xp);
  const expectedDurationMs = miningDurationForLevel(
    selectedNode.durationMs,
    progression.level,
  );
  const expectedFailureRate = miningFailureRate(
    selectedNode.baseFailureRate,
    progression.level,
  );
  const timeReductionPct = miningTimeReduction(progression.level) * 100;
  const levelProgressPct = progression.maxLevel
    ? 100
    : Math.min(100, (progression.xpIntoLevel / progression.xpForNext) * 100);
  const progress = run ? clamp01(elapsedMs / run.durationMs) : 0;
  const strikeCount = useMemo(
    () =>
      run
        ? miningAnimationFrame(elapsedMs, run.durationMs, run.strikes).strikeCount
        : 0,
    [elapsedMs, run],
  );

  return (
    <main className="mx-auto my-2 w-[calc(100%-1rem)] max-w-[720px] space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-zinc-900 shadow-lg backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-5">
      <SubViewHeader title="채광장" onBack={onBack} />

      {verification && verifyHuman ? (
        <ActivityVerificationGate challenge={verification} onVerify={verifyHuman} />
      ) : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/70 dark:bg-amber-950/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-amber-900 dark:text-amber-100">
              채광 Lv {progression.level}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              시간 단축 {timeReductionPct.toFixed(1)}% · 최대 Lv 50
            </div>
          </div>
          <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {progression.maxLevel
              ? "최고 레벨"
              : `${progression.xpIntoLevel}/${progression.xpForNext} XP`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900">
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            style={{ width: `${levelProgressPct}%` }}
          />
        </div>
      </div>

      <Card padding="sm">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-amber-500"
            />
            보유 재료
          </span>
          <span className="min-w-0 truncate text-right text-sm font-bold text-zinc-800 dark:text-zinc-100">
            {selectedMaterial.name}
            <span className="ml-2 tabular-nums text-amber-700 dark:text-amber-300">
              {selectedMaterialCount.toLocaleString()}개
            </span>
          </span>
        </div>
      </Card>

      {(phase === "idle" || phase === "result") && !verification ? (
        <AutoGatheringCard
          activityName="채광"
          spotId={spotId}
          session={autoSession}
          result={autoResult}
          loading={autoLoading}
          buttonVariant="warning"
          onStart={(selectedSpotId) => startAuto(selectedSpotId as MiningSpotId)}
          onClaim={claimAuto}
        />
      ) : null}

      {run ? (
        <div className="space-y-2">
          <div className="relative h-80 w-full overflow-hidden rounded-xl border-2 border-amber-300 bg-stone-900 dark:border-amber-800">
            <MiningCanvas
              durationMs={run.durationMs}
              startedAt={startedAt}
              phase={phase}
              nodeId={run.node.id}
              strikes={run.strikes}
            />
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-extrabold text-zinc-800 shadow dark:bg-zinc-900/90 dark:text-zinc-100">
                {MINING_SPOTS[run.spotId].shortName} · {run.node.name}
              </span>
              <span className="rounded-full bg-amber-700/90 px-3 py-1.5 text-xs font-extrabold text-white shadow">
                {phase === "mining"
                  ? `곡괭이질 ${strikeCount}/${run.strikes}`
                  : phase === "finishing"
                    ? "광맥 확인 중…"
                    : "채광 완료"}
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
                  <div className="font-bold">{result.node.name} 채광 완료</div>
                  <div className="ui-result-highlight text-sm font-bold text-amber-600 dark:text-amber-400">
                    {result.materialName} +{result.materialGained}
                  </div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    채광 XP +{result.xpGained}
                  </div>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : (
        <Card padding="md" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          <div>버튼·Space·Enter로 광맥을 자동 채광합니다.</div>
          <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {selectedNode.grade}등급 · 성공률 {formatRate(1 - expectedFailureRate)} · 예상{" "}
            {formatDuration(expectedDurationMs)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            성공 시 {selectedMaterial.name} 1개 · XP +{selectedNode.xp}
          </div>
        </Card>
      )}

      {(phase === "idle" || phase === "result") && !verification && (
        <Button
          disabled={cooldownRemainingSec > 0 || Boolean(autoSession)}
          onClick={() => void startMining()}
          variant="warning"
          size="md"
          fullWidth
        >
          {autoSession
            ? "자동 채광 진행 중"
            : cooldownRemainingSec > 0
            ? `다음 채광까지 ${cooldownRemainingSec}초`
            : phase === "result"
              ? `${selectedSpot.shortName}에서 다시 채광`
              : "채광 시작"}
        </Button>
      )}
      {(phase === "loading" || phase === "mining" || phase === "finishing") && (
        <Button disabled variant="warning" size="md" fullWidth>
          {phase === "loading" ? "광맥을 고르는 중…" : "채광 중…"}
        </Button>
      )}
    </main>
  );
}
