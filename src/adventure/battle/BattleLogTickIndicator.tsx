"use client";

import { useEffect, useState, type RefObject } from "react";
import { SURFACE_CARD } from "@/components/ui/surfaces";

export type BattleLogTickGroupPosition = {
  tick: number;
  top: number;
  bottom: number;
};

export function currentBattleLogTickForViewport(
  groups: BattleLogTickGroupPosition[],
  viewportTop: number,
  viewportBottom: number,
  maxTick: number,
): number | null {
  if (groups.length === 0) return null;
  const visible = groups.find(
    (group) => group.bottom > viewportTop && group.top < viewportBottom,
  );
  const selected =
    visible ??
    (groups[0].top >= viewportBottom ? groups[0] : groups[groups.length - 1]);
  return Math.min(maxTick, Math.max(0, Math.round(selected.tick)));
}

function tickGroupPositions(
  viewport: HTMLElement,
): BattleLogTickGroupPosition[] {
  return Array.from(
    viewport.querySelectorAll<HTMLElement>("[data-battle-log-group-tick]"),
  ).flatMap((element) => {
    const tick = Number(element.dataset.battleLogGroupTick);
    if (!Number.isFinite(tick)) return [];
    const rect = element.getBoundingClientRect();
    return [{ tick, top: rect.top, bottom: rect.bottom }];
  });
}

function overlayScrollContainer(viewport: HTMLElement): HTMLElement | null {
  return viewport.closest<HTMLElement>(
    '[data-battle-log-scroll-container="true"]',
  );
}

function viewportBounds(overlay: HTMLElement | null): {
  top: number;
  bottom: number;
} {
  if (overlay) {
    const rect = overlay.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  }
  return { top: 0, bottom: window.innerHeight };
}

export function useBattleLogCurrentTick(
  viewportRef: RefObject<HTMLDivElement | null>,
  initialTick: number | null,
  enabled: boolean,
  updateKey: unknown,
): number | null {
  const [currentTick, setCurrentTick] = useState(initialTick);

  useEffect(() => {
    if (!enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nodes = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-battle-log-group-tick]"),
    );
    if (nodes.length === 0) return;

    const overlay = overlayScrollContainer(viewport);
    const scrollTarget: Window | HTMLElement = overlay ?? window;
    let animationFrame: number | null = null;

    const update = () => {
      animationFrame = null;
      const bounds = viewportBounds(overlay);
      const nextTick = currentBattleLogTickForViewport(
        tickGroupPositions(viewport),
        bounds.top,
        bounds.bottom,
        Number.POSITIVE_INFINITY,
      );
      if (nextTick != null) {
        setCurrentTick((previous) =>
          previous === nextTick ? previous : nextTick,
        );
      }
    };
    const scheduleUpdate = () => {
      if (animationFrame == null) {
        animationFrame = window.requestAnimationFrame(update);
      }
    };

    update();
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(scheduleUpdate, {
        root: overlay,
      });
      for (const node of nodes) observer.observe(node);
    } else {
      scrollTarget.addEventListener("scroll", scheduleUpdate, {
        passive: true,
      });
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer?.disconnect();
      if (!observer) {
        scrollTarget.removeEventListener("scroll", scheduleUpdate);
      }
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled, updateKey, viewportRef]);

  return enabled ? currentTick : null;
}

export function BattleLogTickIndicator({
  currentTick,
  maxTick,
  compact = false,
}: {
  currentTick: number;
  maxTick: number;
  compact?: boolean;
}) {
  const clampedCurrentTick = Math.min(
    maxTick,
    Math.max(0, Math.round(currentTick)),
  );
  const value = `${clampedCurrentTick.toLocaleString("ko-KR")} / ${maxTick.toLocaleString("ko-KR")}틱`;
  if (compact) {
    return (
      <div
        data-battle-log-tick-indicator="compact"
        aria-live="polite"
        className={`${SURFACE_CARD} inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300`}
      >
        <span className="font-medium">현재 시간대</span>
        <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
          {value}
        </strong>
      </div>
    );
  }

  return (
    <div
      data-battle-log-tick-indicator="full"
      aria-live="polite"
      className={`${SURFACE_CARD} px-3 py-2.5`}
    >
      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        현재 시간대
      </div>
      <div className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}
