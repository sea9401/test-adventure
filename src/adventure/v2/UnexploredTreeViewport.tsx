"use client";

import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  UNEXPLORED_MAX_SCALE,
  UNEXPLORED_MIN_SCALE,
  UNEXPLORED_SCALE_STEP,
  panUnexploredBy,
  zoomUnexploredAt,
  type ViewportPoint,
  type ViewportTransform,
} from "./unexploredViewportModel";

const VIEWBOX_X = -80;
const VIEWBOX_Y = -80;
const VIEWBOX_SIZE = 1960;
const VIEWBOX_CENTER = {
  x: VIEWBOX_X + VIEWBOX_SIZE / 2,
  y: VIEWBOX_Y + VIEWBOX_SIZE / 2,
};
const DEFAULT_TRANSFORM: ViewportTransform = { scale: 1, x: 0, y: 0 };
const DRAG_THRESHOLD_PX = 4;

function clientPoint(event: { clientX: number; clientY: number }): ViewportPoint {
  return { x: event.clientX, y: event.clientY };
}

function midpoint(left: ViewportPoint, right: ViewportPoint): ViewportPoint {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function distance(left: ViewportPoint, right: ViewportPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function clientToSvgPoint(
  element: HTMLDivElement,
  point: ViewportPoint,
): ViewportPoint {
  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: VIEWBOX_X + ((point.x - rect.left) / width) * VIEWBOX_SIZE,
    y: VIEWBOX_Y + ((point.y - rect.top) / height) * VIEWBOX_SIZE,
  };
}

function clientDeltaToSvg(
  element: HTMLDivElement,
  delta: ViewportPoint,
): ViewportPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: (delta.x * VIEWBOX_SIZE) / (rect.width || 1),
    y: (delta.y * VIEWBOX_SIZE) / (rect.height || 1),
  };
}

export function UnexploredTreeViewport({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  const [transform, setTransform] = useState<ViewportTransform>(DEFAULT_TRANSFORM);
  const pointers = useRef(new Map<number, ViewportPoint>());
  const gestureDistance = useRef(0);
  const suppressNextClick = useRef(false);

  function zoomBy(delta: number) {
    setTransform((current) =>
      zoomUnexploredAt(current, current.scale + delta, VIEWBOX_CENTER),
    );
  }

  function resetViewport() {
    pointers.current.clear();
    gestureDistance.current = 0;
    suppressNextClick.current = false;
    setTransform(DEFAULT_TRANSFORM);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.deltaY === 0) return;
    const anchor = clientToSvgPoint(event.currentTarget, clientPoint(event));
    const delta = event.deltaY < 0 ? UNEXPLORED_SCALE_STEP : -UNEXPLORED_SCALE_STEP;
    setTransform((current) =>
      zoomUnexploredAt(current, current.scale + delta, anchor),
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.size === 0) {
      gestureDistance.current = 0;
      suppressNextClick.current = false;
    }
    pointers.current.set(event.pointerId, clientPoint(event));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 브라우저가 포인터 캡처를 지원하지 않아도 영역 안 제스처는 계속 처리한다.
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previousPoint = pointers.current.get(event.pointerId);
    if (!previousPoint) return;

    const before = new Map(pointers.current);
    const nextPoint = clientPoint(event);
    pointers.current.set(event.pointerId, nextPoint);
    gestureDistance.current += distance(previousPoint, nextPoint);
    if (gestureDistance.current > DRAG_THRESHOLD_PX) {
      suppressNextClick.current = true;
    }

    if (pointers.current.size === 1) {
      const delta = clientDeltaToSvg(event.currentTarget, {
        x: nextPoint.x - previousPoint.x,
        y: nextPoint.y - previousPoint.y,
      });
      setTransform((current) => panUnexploredBy(current, delta));
      return;
    }

    const previousPair = [...before.values()].slice(0, 2);
    const nextPair = [...pointers.current.values()].slice(0, 2);
    if (previousPair.length < 2 || nextPair.length < 2) return;
    const previousDistance = distance(previousPair[0], previousPair[1]);
    const nextDistance = distance(nextPair[0], nextPair[1]);
    if (previousDistance === 0 || nextDistance === 0) return;

    const previousMidpoint = midpoint(previousPair[0], previousPair[1]);
    const nextMidpoint = midpoint(nextPair[0], nextPair[1]);
    const panDelta = clientDeltaToSvg(event.currentTarget, {
      x: nextMidpoint.x - previousMidpoint.x,
      y: nextMidpoint.y - previousMidpoint.y,
    });
    const anchor = clientToSvgPoint(event.currentTarget, nextMidpoint);
    const scaleRatio = nextDistance / previousDistance;
    setTransform((current) => {
      const panned = panUnexploredBy(current, panDelta);
      return zoomUnexploredAt(panned, current.scale * scaleRatio, anchor);
    });
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 취소된 포인터는 이미 캡처가 해제되어 있을 수 있다.
    }
  }

  function losePointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  function suppressClickAfterDrag(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressNextClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextClick.current = false;
  }

  return (
    <div className="space-y-2">
      <div
        aria-label="탐사망 배율 조절"
        className={`${SURFACE_CARD} flex flex-wrap items-center justify-end gap-2 p-2`}
      >
        <Button
          size="xs"
          variant="secondary"
          aria-label="탐사망 축소"
          disabled={transform.scale <= UNEXPLORED_MIN_SCALE}
          onClick={() => zoomBy(-UNEXPLORED_SCALE_STEP)}
        >
          −
        </Button>
        <output
          aria-label="탐사망 현재 배율"
          aria-live="polite"
          className="min-w-14 text-center text-sm font-bold tabular-nums"
        >
          {Math.round(transform.scale * 100)}%
        </output>
        <Button
          size="xs"
          variant="secondary"
          aria-label="탐사망 확대"
          disabled={transform.scale >= UNEXPLORED_MAX_SCALE}
          onClick={() => zoomBy(UNEXPLORED_SCALE_STEP)}
        >
          +
        </Button>
        <Button
          size="xs"
          variant="secondary"
          aria-label="탐사망 화면 맞춤"
          onClick={resetViewport}
        >
          화면 맞춤
        </Button>
      </div>
      <div
        role="application"
        aria-label="탐사망 지도 조작 영역"
        className={`${SURFACE_INSET} aspect-square w-full min-w-0 touch-none overflow-hidden cursor-grab select-none active:cursor-grabbing`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={losePointerCapture}
        onClickCapture={suppressClickAfterDrag}
      >
        <svg
          viewBox={`${VIEWBOX_X} ${VIEWBOX_Y} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          className="block h-full w-full"
          aria-label={ariaLabel}
        >
          <g
            data-testid="unexplored-tree-transform"
            transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
          >
            {children}
          </g>
        </svg>
      </div>
    </div>
  );
}
