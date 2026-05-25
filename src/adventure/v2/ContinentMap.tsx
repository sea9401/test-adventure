"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { ArrowsOut, Minus, Plus } from "@phosphor-icons/react";
import {
  OUTPOSTS,
  MAP_BOUNDS,
  CONTINENT_NAME,
} from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";

// 종류별 색 — tier 2+ marker fill.
const TYPE_COLOR: Record<OutpostType, string> = {
  mine: "#8a6a43",
  tower: "#845fc4",
  fort: "#5d5d68",
  village: "#bd713b",
};

const TIER_RADIUS: Record<OutpostTier, number> = {
  1: 38,
  2: 55,
  3: 75,
  4: 110,
};

const TIER_LABEL_VISIBLE: Record<OutpostTier, boolean> = {
  1: false,
  2: false,
  3: true,
  4: true,
};

function starPoints(cx: number, cy: number, r: number): string {
  const inner = r * 0.4;
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

const KINGDOM_FILL = "#b04535";

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

// 줌 한계 — viewBox 너비. 작을수록 확대. 0.15 * world = 약 6.6배 확대 max.
const MIN_VB_W = MAP_BOUNDS.width * 0.15;
const MAX_VB_W = MAP_BOUNDS.width * 1.0;

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
};

type Vb = { x: number; y: number; w: number; h: number };

export function ContinentMap({
  onOutpostEnter,
  occupations,
  viewerUserId,
}: {
  onOutpostEnter?: (o: Outpost) => void;
  occupations?: OccupationLite[];
  viewerUserId?: string | null;
} = {}) {
  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) {
    for (const o of occupations) occByOutpost.set(o.outpostId, o);
  }
  const [selected, setSelected] = useState<Outpost | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // 컨테이너 크기 측정 — viewBox 비율 + 좌표 변환에 사용.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // viewBox state — 동적 (핀치·팬·휠·버튼 조작).
  const [vb, setVb] = useState<Vb>({
    x: 0,
    y: 0,
    w: MAP_BOUNDS.width,
    h: MAP_BOUNDS.height,
  });

  const fitAll = useCallback(() => {
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;
    const containerRatio = ch / cw;
    const worldRatio = MAP_BOUNDS.height / MAP_BOUNDS.width;
    let vbW: number;
    let vbH: number;
    if (containerRatio >= worldRatio) {
      vbW = MAP_BOUNDS.width;
      vbH = vbW * containerRatio;
    } else {
      vbH = MAP_BOUNDS.height;
      vbW = vbH / containerRatio;
    }
    setVb({
      x: MAP_BOUNDS.width / 2 - vbW / 2,
      y: MAP_BOUNDS.height / 2 - vbH / 2,
      w: vbW,
      h: vbH,
    });
  }, [containerSize]);

  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (containerSize.w === 0 || containerSize.h === 0) return;
    fitAll();
    didFitRef.current = true;
  }, [containerSize, fitAll]);

  const clampVb = useCallback(
    (next: Vb): Vb => {
      const w = Math.max(MIN_VB_W, Math.min(MAX_VB_W, next.w));
      const { w: cw, h: ch } = containerSize;
      const h = cw > 0 && ch > 0 ? w * (ch / cw) : (next.h / next.w) * w;
      // viewBox 가 월드보다 크면(축 별로) 그 축은 중앙 정렬 강제 — 화면 좌하단
      // drift 누적 방지. 그 외엔 가장자리를 화면에 맞춤 (월드 밖 X).
      let x: number;
      if (w >= MAP_BOUNDS.width) {
        x = (MAP_BOUNDS.width - w) / 2;
      } else {
        x = Math.max(0, Math.min(MAP_BOUNDS.width - w, next.x));
      }
      let y: number;
      if (h >= MAP_BOUNDS.height) {
        y = (MAP_BOUNDS.height - h) / 2;
      } else {
        y = Math.max(0, Math.min(MAP_BOUNDS.height - h, next.y));
      }
      return { x, y, w, h };
    },
    [containerSize],
  );

  // 포인터 — 다중 포인터로 핀치/팬 구분.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startVb: Vb } | null>(null);
  const draggedRef = useRef(false);
  const downAtRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
      const pts = Array.from(pointersRef.current.values());
      const newDist =
        Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const ratio = pinchRef.current.startDist / newDist;
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const rect = containerRef.current!.getBoundingClientRect();
      const focalCx = cx - rect.left;
      const focalCy = cy - rect.top;
      const start = pinchRef.current.startVb;
      const newW = start.w * ratio;
      const newH = newW * (ch / cw);
      const focalVBx = start.x + (focalCx / cw) * start.w;
      const focalVBy = start.y + (focalCy / ch) * start.h;
      const newX = focalVBx - (focalCx / cw) * newW;
      const newY = focalVBy - (focalCy / ch) * newH;
      setVb(clampVb({ x: newX, y: newY, w: newW, h: newH }));
      return;
    }

    if (pointersRef.current.size === 1) {
      if (downAtRef.current && !draggedRef.current) {
        const moved =
          Math.abs(e.clientX - downAtRef.current.x) +
          Math.abs(e.clientY - downAtRef.current.y);
        if (moved > 5) {
          draggedRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        }
      }
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

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const rect = containerRef.current!.getBoundingClientRect();
    const focalCx = e.clientX - rect.left;
    const focalCy = e.clientY - rect.top;
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

  // 드래그 직후 click 차단 — 마커 click 으로 잘못 전달 방지.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      draggedRef.current = false;
    }
  };

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3 p-4">
      <div
        ref={containerRef}
        className="relative h-[70vh] w-full touch-none select-none overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40"
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
          aria-label="대륙 지도"
        >
          <image
            href="/images/ui/v2-continent.webp"
            x={0}
            y={0}
            width={MAP_BOUNDS.width}
            height={MAP_BOUNDS.height}
            preserveAspectRatio="none"
          />

          {[1, 2, 3, 4].flatMap((tier) =>
            OUTPOSTS.filter((o) => o.tier === tier).map((o) => {
              const r = TIER_RADIUS[o.tier];
              const isKingdom = o.tier === 4;
              const isNeutral = o.neutral === true;
              const isSelected = selected?.id === o.id;
              const isHover = hover === o.id;
              const fill = isKingdom ? KINGDOM_FILL : TYPE_COLOR[o.type];
              const showLabel = isSelected || isHover;
              const occ = occByOutpost.get(o.id);
              const isMine =
                !!occ &&
                !!viewerUserId &&
                occ.occupiedByUserId === viewerUserId;
              const isHostile =
                !!occ &&
                occ.occupiedByUserId !== null &&
                occ.occupiedByUserId !== viewerUserId;
              const markerFill = isNeutral
                ? "#f4c842"
                : isMine
                  ? "#10b981"
                  : isHostile
                    ? "#dc2626"
                    : fill;
              const markerStroke = showLabel ? "#fff1a8" : "#ffffff";
              const innerStroke = "#000";
              return (
                <g
                  key={o.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(o);
                  }}
                  onMouseEnter={() => setHover(o.id)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  {isKingdom ? (
                    <>
                      <polygon
                        points={starPoints(o.position.x, o.position.y, r + 6)}
                        fill="none"
                        stroke={innerStroke}
                        strokeWidth={8}
                        strokeLinejoin="round"
                      />
                      <polygon
                        points={starPoints(o.position.x, o.position.y, r)}
                        fill={markerFill}
                        stroke={markerStroke}
                        strokeWidth={showLabel ? 16 : 10}
                        strokeLinejoin="round"
                      />
                    </>
                  ) : (
                    <>
                      <circle
                        cx={o.position.x}
                        cy={o.position.y}
                        r={(showLabel ? r * 1.2 : r) + 4}
                        fill="none"
                        stroke={innerStroke}
                        strokeWidth={5}
                      />
                      <circle
                        cx={o.position.x}
                        cy={o.position.y}
                        r={showLabel ? r * 1.2 : r}
                        fill={markerFill}
                        stroke={markerStroke}
                        strokeWidth={showLabel ? 12 : 8}
                      />
                    </>
                  )}
                  {(TIER_LABEL_VISIBLE[o.tier] || showLabel) && (
                    <text
                      x={o.position.x}
                      y={o.position.y - r - 14}
                      textAnchor="middle"
                      fontSize={isKingdom ? 95 : o.tier === 3 ? 65 : 60}
                      fontWeight={700}
                      fill="#fff"
                      paintOrder="stroke"
                      stroke="#000"
                      strokeWidth={12}
                    >
                      {o.name}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
        {/* 줌 컨트롤 — 우상단 floating */}
        <div className="pointer-events-none absolute right-2 top-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={fitAll}
            aria-label="전체 보기"
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowsOut size={16} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.25)}
            aria-label="확대"
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus size={16} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="축소"
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Minus size={16} weight="bold" />
          </button>
        </div>
      </div>

      <aside className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <header className="space-y-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            대륙
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {CONTINENT_NAME}
          </div>
          <div className="text-xs text-zinc-500">
            거점 {OUTPOSTS.length} (왕국{" "}
            {OUTPOSTS.filter((o) => o.tier === 4).length}
            · 도시 {OUTPOSTS.filter((o) => o.tier === 3).length} · 거점{" "}
            {OUTPOSTS.filter((o) => o.tier === 2).length} · 마을{" "}
            {OUTPOSTS.filter((o) => o.tier === 1).length})
          </div>
        </header>

        {selected ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {selected.name}
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
                {TIER_LABEL[selected.tier]}
              </span>
              <span
                className="rounded px-2 py-0.5 text-white"
                style={{ backgroundColor: TYPE_COLOR[selected.type] }}
              >
                {TYPE_LABEL[selected.type]}
              </span>
              {selected.neutral && (
                <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
                  절대 중립
                </span>
              )}
            </div>
            {selected.description && (
              <div className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                {selected.description}
              </div>
            )}
            <div className="rounded border border-zinc-200 bg-zinc-100 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-medium text-zinc-700 dark:text-zinc-300">
                점령 상태
              </div>
              <div className="text-zinc-500">
                {(() => {
                  if (selected.neutral) return "NPC 영구 운영 (점령 불가)";
                  const occ = occByOutpost.get(selected.id);
                  if (!occ) return "비점령 (점령 시도 가능)";
                  if (viewerUserId && occ.occupiedByUserId === viewerUserId)
                    return "내 점령지";
                  return "다른 세력 점령 중";
                })()}
              </div>
            </div>
            {onOutpostEnter && (
              <button
                type="button"
                onClick={() => onOutpostEnter(selected)}
                className="block w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                이 거점 진입 →
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 text-xs text-zinc-500">
            지도에서 거점을 선택하세요. 핀치/휠 로 확대, 드래그 로 이동.
          </div>
        )}
      </aside>
    </div>
  );
}
