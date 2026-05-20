"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { ArrowsOut, Crosshair, Minus, Plus } from "@phosphor-icons/react";

// 월드맵 SVG 팬·줌 컨테이너. 한 손가락 드래그 = 팬, 두 손가락 핀치 / 마우스 휠 = 줌,
// "현재 위치" 버튼 = 포커스 좌표(보통 플레이어 현재 지역)로 리센터.
//
// 구현 모델: 외곽 SVG 의 viewBox 를 dynamic 으로 조정 (vbX/Y/W/H). 컨테이너 CSS 크기 ↔
// viewBox 픽셀 비율을 맞춰 좌표 변환을 단순화. preserveAspectRatio="xMidYMid slice" 로
// 컨테이너를 꽉 채우고 넘치는 부분만 clip.
//
// 클릭 vs 드래그: pointerdown 이후 일정 픽셀 이상 움직였으면 draggedRef=true 로 마킹,
// onClickCapture 에서 stopPropagation 해 노드 onClick 이 발화되지 않도록.
export function MapCanvas({
  world,
  focusX,
  focusY,
  fitBounds,
  fitNonce = 0,
  background,
  children,
  height = "min(54vh, 460px)",
}: {
  // SVG viewBox 호환 — world.x/y 미지정 시 원점 (0,0). 북쪽으로 추가된 영역(음수 y)을
  // 표현하려면 world.y 에 음수를 넘긴다.
  world: { x?: number; y?: number; width: number; height: number };
  focusX: number;
  focusY: number;
  // 권역(zone) 포커스 — 지정되면 초기 진입·fitNonce 변경 시 이 bounds 가 화면에 꽉 차게 맞춘다.
  // 권역 탭으로 클러스터에 한 번에 줌하기 위한 용도. 미지정이면 focusX/Y 리센터로 fallback.
  fitBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  // 권역 탭을 누를 때마다 +1. 같은 권역 재선택에도 다시 맞춰지도록 nonce 로 트리거.
  fitNonce?: number;
  // 노드 뒤에 깔리는 배경 이미지 경로(`/images/...`). world 영역 전체를 덮으며 콘텐츠와
  // 함께 팬/줌된다. 미지정이면 컨테이너의 평면 배경만 보인다.
  background?: string;
  children: ReactNode;
  height?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const originX = world.x ?? 0;
  const originY = world.y ?? 0;
  // viewBox 상태. 초기 originX/Y W H 는 SSR / 측정 전 fallback — useLayoutEffect 로 바로 교체.
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number }>(
    () => ({ x: originX, y: originY, w: world.width, h: world.height }),
  );

  const INITIAL_ZOOM = 2.5;
  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 4.5;
  // viewBox 폭 = world.width / zoom. 큰 zoom = 작은 viewBox = 확대된 것처럼 보임.
  const minVbW = world.width / MAX_ZOOM;
  const maxVbW = world.width / MIN_ZOOM;

  const recenter = useCallback(
    (zoom: number = INITIAL_ZOOM) => {
      const { w, h } = containerSize;
      if (w === 0 || h === 0) return;
      const vbW = world.width / zoom;
      const vbH = vbW * (h / w);
      setVb({ x: focusX - vbW / 2, y: focusY - vbH / 2, w: vbW, h: vbH });
    },
    [containerSize, focusX, focusY, world.width],
  );

  // 권역 bounds 가 화면에 꽉 차게 viewBox 를 맞춘다 (여백 포함). 단일 노드 등 너무 작은
  // 권역은 줌 한계(minVbW/maxVbW)로 클램프해 과도 확대를 막는다. fitAll 과 같은 ratio 로직.
  const fitToBounds = useCallback(
    (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const { w: cw, h: ch } = containerSize;
      if (cw === 0 || ch === 0) return;
      const pad = 80; // world 단위 여백
      const bw = Math.max(1, b.maxX - b.minX) + pad * 2;
      const bh = Math.max(1, b.maxY - b.minY) + pad * 2;
      const containerRatio = ch / cw;
      const boundsRatio = bh / bw;
      let vbW = containerRatio >= boundsRatio ? bw : bh / containerRatio;
      vbW = Math.max(minVbW, Math.min(maxVbW, vbW));
      const vbH = vbW * containerRatio;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      setVb({ x: cx - vbW / 2, y: cy - vbH / 2, w: vbW, h: vbH });
    },
    [containerSize, minVbW, maxVbW],
  );

  // 컨테이너 사이즈 추적 — 회전·resize 대응.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // 사이즈 측정되면 즉시 1회 리센터. focusX/Y 가 바뀌어도 자동 재센터하지 않음 (사용자가
  // 직접 드래그·줌해 둔 상태를 보존). 명시적인 "현재 위치" 버튼으로만 갱신.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    if (containerSize.w === 0 || containerSize.h === 0) return;
    didInitRef.current = true;
    // 초기 진입은 활성 권역 bounds 로 맞춘다 (있으면). 없으면 현재 위치 리센터.
    if (fitBounds) fitToBounds(fitBounds);
    else recenter(INITIAL_ZOOM);
  }, [containerSize, recenter, fitBounds, fitToBounds]);

  // 권역 탭 클릭(fitNonce 증가) 시 그 권역 bounds 로 다시 맞춘다.
  useEffect(() => {
    if (fitNonce <= 0) return;
    if (containerSize.w === 0 || containerSize.h === 0) return;
    if (fitBounds) fitToBounds(fitBounds);
    // fitBounds 는 fire 시점 값으로 읽음 — nonce 변화로만 트리거.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // 포인터 추적 — Map 으로 멀티터치 지원.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startVb: typeof vb } | null>(
    null,
  );
  const draggedRef = useRef(false);
  const downAtRef = useRef<{ x: number; y: number } | null>(null);

  const clampVb = useCallback(
    (next: { x: number; y: number; w: number; h: number }) => {
      // w/h 클램프
      let w = Math.max(minVbW, Math.min(maxVbW, next.w));
      const ratio = next.h / next.w;
      let h = w * ratio;
      // 컨테이너 측정 전이면 그대로
      const cw = containerSize.w;
      const ch = containerSize.h;
      if (cw > 0 && ch > 0) {
        h = w * (ch / cw);
      }
      // 위치 클램프 — 월드 밖으로 너무 멀리 못 가게. 30% 마진 허용.
      const marginX = world.width * 0.3;
      const marginY = world.height * 0.3;
      const minX = originX - marginX;
      const maxX = originX + world.width - w + marginX;
      const minY = originY - marginY;
      const maxY = originY + world.height - h + marginY;
      return {
        x: Math.max(minX, Math.min(maxX, next.x)),
        y: Math.max(minY, Math.min(maxY, next.y)),
        w,
        h,
      };
    },
    [
      containerSize.h,
      containerSize.w,
      maxVbW,
      minVbW,
      originX,
      originY,
      world.height,
      world.width,
    ],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // setPointerCapture 는 드래그 임계를 넘긴 뒤 (혹은 핀치 진입 시) 호출. pointerdown
    // 단계에서 미리 캡처하면 데스크탑 마우스에서 자식 SVG <g> 의 click 이 컨테이너로
    // 리다이렉트돼 MapNode 클릭이 통째로 안 먹는 문제가 생긴다 (터치는 click 합성 경로가
    // 달라 영향 없음).
    if (pointersRef.current.size === 1) {
      downAtRef.current = { x: e.clientX, y: e.clientY };
      draggedRef.current = false;
    }
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startVb: vb,
      };
      // 핀치 시작하면 클릭 후보 아님 — 두 포인터 모두 즉시 캡처해 컨테이너 밖으로
      // 손가락이 흘러도 핀치가 끊기지 않도록.
      draggedRef.current = true;
      for (const id of pointersRef.current.keys()) {
        try {
          e.currentTarget.setPointerCapture(id);
        } catch {}
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;

    if (pointersRef.current.size === 2 && pinchRef.current) {
      // 핀치 줌 — 두 손가락 거리 변화로 줌, 두 손가락 중점을 focal point 로.
      const pts = Array.from(pointersRef.current.values());
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const ratio = pinchRef.current.startDist / newDist; // newW = startW * ratio
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const rect = containerRef.current!.getBoundingClientRect();
      const focalCx = cx - rect.left;
      const focalCy = cy - rect.top;
      const start = pinchRef.current.startVb;
      const newW = start.w * ratio;
      const newH = newW * (ch / cw);
      // focal 픽셀이 viewBox 좌표상 같은 위치에 머무르도록.
      const focalVBx = start.x + (focalCx / cw) * start.w;
      const focalVBy = start.y + (focalCy / ch) * start.h;
      const newX = focalVBx - (focalCx / cw) * newW;
      const newY = focalVBy - (focalCy / ch) * newH;
      setVb(clampVb({ x: newX, y: newY, w: newW, h: newH }));
      return;
    }

    if (pointersRef.current.size === 1) {
      // 팬
      if (downAtRef.current && !draggedRef.current) {
        const moved =
          Math.abs(e.clientX - downAtRef.current.x) +
          Math.abs(e.clientY - downAtRef.current.y);
        if (moved > 5) {
          draggedRef.current = true;
          // 임계 통과 시점에 캡처 — 컨테이너 밖으로 포인터가 흘러도 드래그 유지.
          // pointerdown 단계에서 미리 안 잡는 이유는 위 onPointerDown 주석 참고.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        }
      }
      // 드래그 확정 전엔 viewBox 갱신 X — 미세한 마우스 떨림으로 클릭이 팬으로 오인되는 걸 방지.
      if (!draggedRef.current) return;
      const pxToVB = vb.w / cw;
      setVb((cur) =>
        clampVb({
          x: cur.x - dx * pxToVB,
          y: cur.y - dy * (cur.h / ch),
          w: cur.w,
          h: cur.h,
        }),
      );
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) downAtRef.current = null;
  };

  // 마우스 휠 — 데스크탑 줌. ctrl+휠 일반 페이지 줌과 충돌 안 하도록 그냥 휠만.
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (containerSize.w === 0 || containerSize.h === 0) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12; // newW = w * factor
    const rect = containerRef.current!.getBoundingClientRect();
    const focalCx = e.clientX - rect.left;
    const focalCy = e.clientY - rect.top;
    setVb((cur) => {
      const newW = cur.w * factor;
      const newH = newW * (containerSize.h / containerSize.w);
      const focalVBx = cur.x + (focalCx / containerSize.w) * cur.w;
      const focalVBy = cur.y + (focalCy / containerSize.h) * cur.h;
      const newX = focalVBx - (focalCx / containerSize.w) * newW;
      const newY = focalVBy - (focalCy / containerSize.h) * newH;
      return clampVb({ x: newX, y: newY, w: newW, h: newH });
    });
  };

  // 드래그 직후 발화되는 click 을 노드까지 전달되기 전에 차단.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      draggedRef.current = false;
    }
  };

  // 줌 버튼 — 컨테이너 중앙 focal 로 1 step 확대/축소.
  const zoomBy = (factor: number) => {
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;
    const focalCx = cw / 2;
    const focalCy = ch / 2;
    setVb((cur) => {
      const newW = cur.w * factor;
      const newH = newW * (ch / cw);
      const focalVBx = cur.x + (focalCx / cw) * cur.w;
      const focalVBy = cur.y + (focalCy / ch) * cur.h;
      return clampVb({
        x: focalVBx - (focalCx / cw) * newW,
        y: focalVBy - (focalCy / ch) * newH,
        w: newW,
        h: newH,
      });
    });
  };

  // 전체 보기 — 월드 전체가 컨테이너에 들어가도록.
  const fitAll = () => {
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;
    const containerRatio = ch / cw;
    const worldRatio = world.height / world.width;
    let vbW: number;
    let vbH: number;
    if (containerRatio >= worldRatio) {
      vbW = world.width;
      vbH = vbW * containerRatio;
    } else {
      vbH = world.height;
      vbW = vbH / containerRatio;
    }
    setVb({
      x: originX + world.width / 2 - vbW / 2,
      y: originY + world.height / 2 - vbH / 2,
      w: vbW,
      h: vbH,
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full touch-none select-none overflow-hidden bg-zinc-50 dark:bg-zinc-900/40"
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onClickCapture={onClickCapture}
    >
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
        role="img"
        aria-label="월드맵"
      >
        {background && (
          <image
            href={background}
            x={originX}
            y={originY}
            width={world.width}
            height={world.height}
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        {children}
      </svg>
      <div className="pointer-events-none absolute right-2 top-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => recenter(INITIAL_ZOOM)}
          aria-label="현재 위치로"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Crosshair size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={fitAll}
          aria-label="전체 보기"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowsOut size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.25)}
          aria-label="확대"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          aria-label="축소"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Minus size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
