"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ArrowsOut,
  CastleTurret,
  Crown,
  House,
  MapPin,
  Minus,
  Mountains,
  Plus,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import {
  OUTPOSTS,
  MAP_BOUNDS,
  kingdomColorOf,
  kingdomNameOf,
  KINGDOM_COLORS,
  OUTPOST_CONFLICT_COLOR,
} from "@/adventure/data/v2/outposts";
import {
  OUTPOST_EDGES,
  shortestOutpostPath,
  CONFLICT_ZONE_IDS,
  areOutpostsAdjacent,
} from "@/adventure/data/v2/outpostGraph";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";

// 마커 채움색은 종류가 아니라 소속 왕국으로 칠한다(종류는 아이콘으로 구분). kingdomColorOf 참고.

const TIER_RADIUS: Record<OutpostTier, number> = {
  1: 38,
  2: 55,
  3: 75,
  4: 110,
};

// 상시 라벨 = 왕국(tier4)만. tier3 이하는 hover/선택 시에만(개요 라벨 밀도↓, Codex 가독성 권고).
const TIER_LABEL_VISIBLE: Record<OutpostTier, boolean> = {
  1: false,
  2: false,
  3: false,
  4: true,
};

// 거점 종류별 플랫 아이콘 — 마커 타일 위에 흰색 글리프로. 왕국(tier4)은 종류 무관 Crown.
const TYPE_ICON: Record<OutpostType, typeof House> = {
  mine: Mountains,
  tower: Sparkle,
  fort: CastleTurret,
  village: House,
};

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};

// 줌 한계 — viewBox 너비. 작을수록 확대. 0.15 * world = 약 6.6배 확대 max.
const MIN_VB_W = MAP_BOUNDS.width * 0.15;
const MAX_VB_W = MAP_BOUNDS.width * 1.0;

// id → Outpost 빠른 조회 — 연결선 좌표 + 현재 위치 판정용.
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));

// 범례용 왕국 색 목록 — 채움색이 어느 왕국인지 한눈에. 이름은 " 왕국" 접미사 떼어 간결히.
const KINGDOM_LEGEND: { id: string; name: string; color: string }[] =
  Object.entries(KINGDOM_COLORS).map(([id, color]) => ({
    id,
    color,
    name: (OUTPOST_BY_ID.get(id)?.name ?? id).replace(/\s*왕국$/, ""),
  }));

// 바이옴 권역 — 5 왕국 영역(점선 박스) + 중앙 분쟁지대(박스 없음).
// 중심 좌표는 outposts.ts 상단 주석의 5 왕국 + 중앙 평원. 중립 거점은 어느 세력 영역도
// 아니라 박스에서 제외(맵 가장자리라 박스를 늘려 지저분해지는 것도 방지).
// 배정 규칙(2026-06-08): 중앙에서 CONFLICT_RADIUS 안의 땅만 무소속 분쟁지대로 남고, 그 밖의
// 모든 땅은 최근접 왕국 영역에 소속된다(종전엔 중앙이 먼 땅까지 빨아들였음 — 예: 서리 관문).
const BIOME_REGIONS = [
  { label: "북부 빙원", center: { x: 1800, y: 1000 } },
  { label: "동부 삼림", center: { x: 6500, y: 800 } },
  { label: "서부 광산지대", center: { x: 1500, y: 3500 } },
  { label: "동남 화산지대", center: { x: 8000, y: 3300 } },
  { label: "남부 사막", center: { x: 5000, y: 4900 } },
  { label: "중앙 분쟁지대", center: { x: 5000, y: 2800 } },
] as const;

// 박스를 그리지 않는 권역 — 중앙 분쟁지대는 어느 세력 영역도 아닌 가운데 격전지라
// 점선 박스를 생략한다(거점 배정에는 계속 쓰여 주변 영역이 가운데로 늘어나는 것도 막음).
const NO_BOX_LABELS = new Set<string>(["중앙 분쟁지대"]);

// 중앙 분쟁지대 핵심 반경 — 중심에서 이 거리(맵 좌표) 안의 땅만 무소속 분쟁지대로 남고,
// 그 밖은 전부 최근접 왕국 소속. 키우면 분쟁지대가 넓어지고 줄이면 왕국령이 넓어진다.
const CONFLICT_LABEL = "중앙 분쟁지대";
const CONFLICT_RADIUS = 800;
const CONFLICT_CENTER = BIOME_REGIONS.find((r) => r.label === CONFLICT_LABEL)!
  .center;
const KINGDOM_REGIONS = BIOME_REGIONS.filter((r) => r.label !== CONFLICT_LABEL);

type RegionBox = { label: string; x: number; y: number; w: number; h: number };

const REGION_BOXES: RegionBox[] = (() => {
  const acc = new Map<
    string,
    { minX: number; minY: number; maxX: number; maxY: number }
  >();
  for (const o of OUTPOSTS) {
    if (o.neutral) continue;
    // 중앙 핵심 반경 안이면 분쟁지대(무소속), 아니면 최근접 왕국 영역에 배정.
    const cdx = o.position.x - CONFLICT_CENTER.x;
    const cdy = o.position.y - CONFLICT_CENTER.y;
    let bestLabel: string;
    if (cdx * cdx + cdy * cdy <= CONFLICT_RADIUS * CONFLICT_RADIUS) {
      bestLabel = CONFLICT_LABEL;
    } else {
      bestLabel = KINGDOM_REGIONS[0].label;
      let bestD = Infinity;
      for (const reg of KINGDOM_REGIONS) {
        const dx = o.position.x - reg.center.x;
        const dy = o.position.y - reg.center.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestLabel = reg.label;
        }
      }
    }
    const cur = acc.get(bestLabel);
    if (!cur) {
      acc.set(bestLabel, {
        minX: o.position.x,
        minY: o.position.y,
        maxX: o.position.x,
        maxY: o.position.y,
      });
    } else {
      cur.minX = Math.min(cur.minX, o.position.x);
      cur.minY = Math.min(cur.minY, o.position.y);
      cur.maxX = Math.max(cur.maxX, o.position.x);
      cur.maxY = Math.max(cur.maxY, o.position.y);
    }
  }
  const PAD = 260;
  return [...acc.entries()]
    .filter(([label]) => !NO_BOX_LABELS.has(label))
    .map(([label, b]) => ({
      label,
      x: b.minX - PAD,
      y: b.minY - PAD,
      w: b.maxX - b.minX + PAD * 2,
      h: b.maxY - b.minY + PAD * 2,
    }));
})();

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  // 성벽 — 재생 반영 현재값(occupations GET). 최대 미만이면 교전 중 표시.
  fortHp?: number;
  fortMaxHp?: number;
};

type Vb = { x: number; y: number; w: number; h: number };

export function ContinentMap({
  onOutpostEnter,
  onTravelTo,
  onWarp,
  occupations,
  treasuries,
  viewerUserId,
  viewerGuildId,
  currentOutpostId,
  discoveredIds,
  visibleIds,
  warMode,
  onAttack,
  attackBusy,
}: {
  // 현재 거점 자신 재진입(둘러보기)용 — 이동 없이 그 거점 화면을 연다.
  onOutpostEnter?: (o: Outpost) => void;
  // 이동(1홉 진입 또는 다중 홉 자동 이동)용 — 경로를 따라 한 칸씩 진입한다.
  onTravelTo?: (o: Outpost) => void;
  // 워프 — 발견한 비인접 거점으로 즉시 이동한다. 일반 항법 지도에서만 노출한다.
  onWarp?: (o: Outpost) => void;
  occupations?: OccupationLite[];
  // 금고 쌓인 거점 — 팝업에 "금고 N G" 표시(점령 유인).
  treasuries?: Array<{ outpostId: string; gold: number }>;
  viewerUserId?: string | null;
  // 플레이어의 현재 거점 — 인접 거점만 진입 가능하게 게이트 + 닿는 길 강조 + 마커 표식.
  currentOutpostId?: string | null;
  // 발견(안개) — 공개된 거점 id 집합. 미공개는 흐리게+비활성, 이동 목적지에서 제외.
  // 미지정이면 전부 공개로 취급(예: 순수 시각 프리뷰 페이지).
  discoveredIds?: ReadonlySet<string>;
  // 국지 모드 — 이 집합의 거점만 렌더(마커·간선)하고 권역 박스는 숨김, 초기 프레이밍은
  // 집합의 bounding box 로. 전쟁 탭의 "현 위치 2홉" 작전 지도 등에 사용. 미지정=전체 지도.
  visibleIds?: ReadonlySet<string>;
  // 전쟁 모드 — 팝업 액션이 이동/둘러보기 대신 "공격"(인접 1칸·공격 가능 거점만).
  // 이동 기능은 마을 탭 지도 전용. viewerGuildId 는 아군 거점 판정용.
  warMode?: boolean;
  viewerGuildId?: number | null;
  onAttack?: (o: Outpost) => void;
  attackBusy?: boolean;
} = {}) {
  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) {
    for (const o of occupations) occByOutpost.set(o.outpostId, o);
  }
  const treasuryByOutpost = new Map<string, number>();
  if (treasuries) {
    for (const t of treasuries) treasuryByOutpost.set(t.outpostId, t.gold);
  }
  // 국지 모드 — 미지정이면 전부 보임.
  const isVisible = (id: string) => !visibleIds || visibleIds.has(id);
  const [selected, setSelected] = useState<Outpost | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

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

  // 전체보기 기준 영역 — 국지 모드(visibleIds)면 보이는 거점들의 bounding box(+여백).
  const fitBounds = useMemo(() => {
    if (!visibleIds || visibleIds.size === 0) {
      return { x: 0, y: 0, w: MAP_BOUNDS.width, h: MAP_BOUNDS.height };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of visibleIds) {
      const o = OUTPOST_BY_ID.get(id);
      if (!o) continue;
      minX = Math.min(minX, o.position.x);
      minY = Math.min(minY, o.position.y);
      maxX = Math.max(maxX, o.position.x);
      maxY = Math.max(maxY, o.position.y);
    }
    if (minX > maxX) {
      return { x: 0, y: 0, w: MAP_BOUNDS.width, h: MAP_BOUNDS.height };
    }
    const PAD = 460; // 마커 반경 + 라벨 여백
    return {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    };
  }, [visibleIds]);

  const fitAll = useCallback(() => {
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;
    const containerRatio = ch / cw;
    const worldRatio = fitBounds.h / fitBounds.w;
    let vbW: number;
    let vbH: number;
    if (containerRatio >= worldRatio) {
      vbW = fitBounds.w;
      vbH = vbW * containerRatio;
    } else {
      vbH = fitBounds.h;
      vbW = vbH / containerRatio;
    }
    vbW = Math.max(MIN_VB_W, vbW);
    vbH = cw > 0 ? vbW * (ch / cw) : vbH;
    setVb({
      x: fitBounds.x + fitBounds.w / 2 - vbW / 2,
      y: fitBounds.y + fitBounds.h / 2 - vbH / 2,
      w: vbW,
      h: vbH,
    });
  }, [containerSize, fitBounds]);

  // 현재 거점을 화면 가운데로 — 적당한 줌(맵 너비의 42%)으로. 지도를 열 때 전체보기 대신
  // "지금 있는 곳"으로 프레이밍한다. 현재 거점이 없으면 전체보기로 폴백.
  const centerOnCurrent = useCallback(() => {
    const cur = currentOutpostId ? OUTPOST_BY_ID.get(currentOutpostId) : null;
    const { w: cw, h: ch } = containerSize;
    if (!cur || cw === 0 || ch === 0) {
      fitAll();
      return;
    }
    const vbW = Math.min(MAX_VB_W, Math.max(MIN_VB_W, MAP_BOUNDS.width * 0.42));
    const vbH = vbW * (ch / cw);
    // clampVb 와 같은 규칙으로 월드 밖 넘침 방지(축소판).
    const x =
      vbW >= MAP_BOUNDS.width
        ? (MAP_BOUNDS.width - vbW) / 2
        : Math.max(0, Math.min(MAP_BOUNDS.width - vbW, cur.position.x - vbW / 2));
    const y =
      vbH >= MAP_BOUNDS.height
        ? (MAP_BOUNDS.height - vbH) / 2
        : Math.max(
            0,
            Math.min(MAP_BOUNDS.height - vbH, cur.position.y - vbH / 2),
          );
    setVb({ x, y, w: vbW, h: vbH });
  }, [currentOutpostId, containerSize, fitAll]);

  // 지도를 열면 한 번 프레이밍 — 국지 모드는 전체(=보이는 집합) 맞춤, 평소엔 현 위치 중심.
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (containerSize.w === 0 || containerSize.h === 0) return;
    if (visibleIds) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 초기 지도 프레이밍 1회.
      fitAll();
    } else {
      centerOnCurrent();
    }
    didFitRef.current = true;
  }, [containerSize, centerOnCurrent, fitAll, visibleIds]);

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

  // 발견 판정 — discoveredIds 미지정이면 전부 공개로 본다(순수 시각 프리뷰).
  const isDiscovered = (id: string): boolean =>
    !discoveredIds || discoveredIds.has(id);

  // 선택 거점이 현재 위치 자신인가.
  const isCurrentSelected = !!selected && selected.id === currentOutpostId;
  // 현재 위치 → 선택 거점 최단 경로(거쳐갈 거점들). 워프는 없고, 이 경로를 따라 한 칸씩
  // 이동한다(인접은 1홉). 발견된 거점만 거쳐가고 목적지도 발견된 곳만(안개 게이트).
  const routePath =
    selected && currentOutpostId && !isCurrentSelected
      ? shortestOutpostPath(currentOutpostId, selected.id, discoveredIds)
      : null;
  const routeHops = routePath ? routePath.length - 1 : 0;
  const isAdjacentSelected =
    !!selected &&
    currentOutpostId != null &&
    areOutpostsAdjacent(currentOutpostId, selected.id);
  const canWarpSelected =
    !!selected &&
    currentOutpostId != null &&
    isDiscovered(selected.id) &&
    !isCurrentSelected &&
    !isAdjacentSelected;

  // 선택 거점의 점령 주체 — 팝업 표시. 길드 점령 > 솔로 점령자 > 분쟁지대(무소속) >
  //   미점령은 소속 왕국을 길드명처럼 "○○ 왕국령"으로(NPC 운영 대신). 중립 거점은 배지로 충분해 생략.
  const selectedOcc = selected ? occByOutpost.get(selected.id) : undefined;
  const selectedKingdomName = selected ? kingdomNameOf(selected) : undefined;
  const selectedOwnerLabel =
    selected && !selected.neutral
      ? selectedOcc?.occupiedByGuildName
        ? `${selectedOcc.occupiedByGuildName} 길드 점령`
        : selectedOcc?.occupiedByUserId
          ? "솔로 점령자"
          : CONFLICT_ZONE_IDS.has(selected.id)
            ? "분쟁지대 · 무소속"
            : selectedKingdomName
              ? `${selectedKingdomName}령`
              : "무소속"
      : null;

  return (
    <div className="mx-auto w-full max-w-[720px] p-4">
      <div
        ref={containerRef}
        className="relative h-[78vh] w-full touch-none select-none overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40"
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
          {/* 보드 배경 — 사진 일러스트 대신 단색 + 옅은 격자. 마커·연결선이 또렷이 읽히게. */}
          <defs>
            <pattern
              id="v2-grid"
              width={400}
              height={400}
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 400 0 L 0 0 0 400"
                fill="none"
                className="stroke-zinc-300/60 dark:stroke-zinc-700/50"
                strokeWidth={2}
              />
            </pattern>
          </defs>
          <rect
            x={0}
            y={0}
            width={MAP_BOUNDS.width}
            height={MAP_BOUNDS.height}
            className="fill-zinc-100 dark:fill-zinc-950"
          />
          <rect
            x={0}
            y={0}
            width={MAP_BOUNDS.width}
            height={MAP_BOUNDS.height}
            fill="url(#v2-grid)"
          />

          {/* 바이옴 권역 — 점선 영역 박스 + 라벨. 격자 위, 연결선/마커 아래. 국지 모드 숨김. */}
          {!visibleIds && REGION_BOXES.map((b) => (
            <g key={b.label}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={140}
                fill="none"
                className="stroke-zinc-400/25 dark:stroke-zinc-600/25"
                strokeWidth={3}
                strokeDasharray="44 32"
              />
              <text
                x={b.x + 48}
                y={b.y + 96}
                className="fill-zinc-500 dark:fill-zinc-500"
                fontSize={52}
                fontWeight={600}
              >
                {b.label}
              </text>
            </g>
          ))}

          {/* 거점 간 연결선 (Gabriel 그래프) — 인접 = 이동 가능 경로. 마커 아래 레이어.
              전체를 옅게 깔고, 현재 위치에 닿는 길만 위에 또렷한 초록으로 덧그린다. */}
          {OUTPOST_EDGES.map(({ a, b }) => {
            const oa = OUTPOST_BY_ID.get(a);
            const ob = OUTPOST_BY_ID.get(b);
            if (!oa || !ob) return null;
            // 안개 — 양 끝이 모두 발견된 길만 그린다(미발견 지역의 길은 숨김).
            if (!isDiscovered(a) || !isDiscovered(b)) return null;
            if (!isVisible(a) || !isVisible(b)) return null;
            return (
              <line
                key={`edge-${a}-${b}`}
                x1={oa.position.x}
                y1={oa.position.y}
                x2={ob.position.x}
                y2={ob.position.y}
                stroke="#9ca3af"
                strokeOpacity={0.18}
                strokeWidth={6}
                strokeLinecap="round"
              />
            );
          })}
          {currentOutpostId &&
            OUTPOST_EDGES.filter(
              ({ a, b }) => a === currentOutpostId || b === currentOutpostId,
            ).map(({ a, b }) => {
              const oa = OUTPOST_BY_ID.get(a);
              const ob = OUTPOST_BY_ID.get(b);
              if (!oa || !ob) return null;
              if (!isDiscovered(a) || !isDiscovered(b)) return null;
              if (!isVisible(a) || !isVisible(b)) return null;
              return (
                <line
                  key={`edge-cur-${a}-${b}`}
                  x1={oa.position.x}
                  y1={oa.position.y}
                  x2={ob.position.x}
                  y2={ob.position.y}
                  stroke="#10b981"
                  strokeOpacity={0.95}
                  strokeWidth={16}
                  strokeLinecap="round"
                />
              );
            })}

          {/* 선택한 거점까지의 이동 경로 — 한 칸씩 따라갈 길을 또렷한 호박색으로 덧그린다.
              인접이면 1홉, 멀면 여러 홉. 마커 바로 아래 레이어. */}
          {routePath &&
            routePath.length > 1 &&
            routePath.slice(1).map((toId, i) => {
              const oa = OUTPOST_BY_ID.get(routePath[i]);
              const ob = OUTPOST_BY_ID.get(toId);
              if (!oa || !ob) return null;
              return (
                <line
                  key={`route-${routePath[i]}-${toId}`}
                  x1={oa.position.x}
                  y1={oa.position.y}
                  x2={ob.position.x}
                  y2={ob.position.y}
                  stroke="#f59e0b"
                  strokeOpacity={0.95}
                  strokeWidth={18}
                  strokeLinecap="round"
                />
              );
            })}

          {[1, 2, 3, 4].flatMap((tier) =>
            OUTPOSTS.filter((o) => o.tier === tier && isVisible(o.id)).map((o) => {
              const r = TIER_RADIUS[o.tier];
              // 미발견(안개) — 흐린 점만 찍고 비활성(클릭/이름/아이콘 없음). 방문/인접으로
              // 공개되면 아래의 정상 마커로 렌더된다.
              if (!isDiscovered(o.id)) {
                return (
                  <circle
                    key={o.id}
                    cx={o.position.x}
                    cy={o.position.y}
                    r={r * 0.5}
                    className="fill-zinc-400/25 dark:fill-zinc-600/25"
                  />
                );
              }
              const isKingdom = o.tier === 4;
              const isNeutral = o.neutral === true;
              const isSelected = selected?.id === o.id;
              const isHover = hover === o.id;
              const isCurrent = o.id === currentOutpostId;
              // 채움색 = 소속 왕국 고유색(거점 종류는 아이콘으로 구분).
              const showLabel = isSelected || isHover || isCurrent;
              const occ = occByOutpost.get(o.id);
              const isMine =
                !!occ &&
                !!viewerUserId &&
                occ.occupiedByUserId === viewerUserId;
              const isHostile =
                !!occ &&
                occ.occupiedByUserId !== null &&
                occ.occupiedByUserId !== viewerUserId;
              // 교전 중 — 성벽이 깎인 점령 거점(공성 진행). 펄스 링으로 전황 노출.
              const isUnderSiege =
                !!occ &&
                occ.occupiedByUserId !== null &&
                occ.fortHp != null &&
                occ.fortMaxHp != null &&
                occ.fortHp < occ.fortMaxHp;
              // 채움 = 분쟁지대(중앙 2홉 이내)면 무소속 색, 아니면 소속 왕국색.
              const markerFill = CONFLICT_ZONE_IDS.has(o.id)
                ? OUTPOST_CONFLICT_COLOR
                : kingdomColorOf(o);
              // 소유(내 길드/적/중립)는 테두리 링으로 표시 — 채움(왕국/분쟁색)과 독립.
              const ownerStroke = isMine
                ? "#10b981" // 내 길드 — 초록 링
                : isHostile
                  ? "#dc2626" // 적 길드 — 빨강 링
                  : isNeutral
                    ? "#f4c842" // 중립(자유도시) — 금색 링
                    : "#ffffff"; // NPC(미점령) — 기본 흰 테두리
              const hasOwnerRing = isMine || isHostile || isNeutral;
              const markerStroke = ownerStroke;
              // 타일 반변 — hover/선택/현재일 때 살짝 키워 강조.
              const half = showLabel ? r * 1.2 : r;
              const Glyph = isKingdom ? Crown : TYPE_ICON[o.type];
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
                  {isCurrent && (
                    <rect
                      x={o.position.x - half - 28}
                      y={o.position.y - half - 28}
                      width={(half + 28) * 2}
                      height={(half + 28) * 2}
                      rx={(half + 28) * 0.42}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={12}
                      strokeDasharray="40 28"
                    />
                  )}
                  {/* 교전 중 — 성벽 깎인 거점에 붉은 펄스 링 (SMIL — JS 타이머 불요). */}
                  {isUnderSiege && (
                    <rect
                      x={o.position.x - half - 16}
                      y={o.position.y - half - 16}
                      width={(half + 16) * 2}
                      height={(half + 16) * 2}
                      rx={(half + 16) * 0.42}
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth={14}
                    >
                      <animate
                        attributeName="opacity"
                        values="1;0.15;1"
                        dur="1.6s"
                        repeatCount="indefinite"
                      />
                    </rect>
                  )}
                  {/* 색 타일 + 흰색 아이콘 (플랫 마커). 채움 = 소속 왕국색, 테두리 = 소유(내것/적/중립). */}
                  <rect
                    x={o.position.x - half}
                    y={o.position.y - half}
                    width={half * 2}
                    height={half * 2}
                    rx={half * 0.42}
                    fill={markerFill}
                    stroke={markerStroke}
                    strokeWidth={showLabel ? 16 : hasOwnerRing ? 13 : 9}
                  />
                  <Glyph
                    x={o.position.x - half * 0.62}
                    y={o.position.y - half * 0.62}
                    width={half * 1.24}
                    height={half * 1.24}
                    color="#ffffff"
                    weight="fill"
                    opacity={showLabel ? 1 : 0.7}
                  />
                  {(TIER_LABEL_VISIBLE[o.tier] || showLabel) && (
                    <text
                      x={o.position.x}
                      y={o.position.y - half - 14}
                      textAnchor="middle"
                      fontSize={isKingdom ? 95 : o.tier === 3 ? 65 : 60}
                      fontWeight={700}
                      fill="#fff"
                      paintOrder="stroke"
                      stroke="#000"
                      strokeWidth={8}
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
          {currentOutpostId && (
            <button
              type="button"
              onClick={centerOnCurrent}
              aria-label="현재 위치로"
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-400 bg-white/95 text-emerald-600 shadow-sm hover:bg-emerald-50 dark:border-emerald-700 dark:bg-zinc-900/90 dark:text-emerald-400 dark:hover:bg-zinc-800"
            >
              <MapPin size={18} weight="fill" />
            </button>
          )}
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

        {/* 범례 — 좌상단. 기본 접힘, 버튼으로 펼침(모바일 공간 절약). */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            className="pointer-events-auto inline-flex items-center rounded-md border border-zinc-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            범례
          </button>
          {legendOpen && (
            <div className="pointer-events-auto space-y-1.5 rounded-md border border-zinc-300 bg-white/95 p-2.5 text-[11px] text-zinc-600 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <Crown size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  왕국
                </span>
                <span className="flex items-center gap-1">
                  <CastleTurret size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  요새
                </span>
                <span className="flex items-center gap-1">
                  <Sparkle size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  마탑
                </span>
                <span className="flex items-center gap-1">
                  <Mountains size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  광산
                </span>
                <span className="flex items-center gap-1">
                  <House size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  마을
                </span>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700" />
              {/* 채움색 = 소속 왕국 */}
              <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                채움색 · 소속 왕국
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {KINGDOM_LEGEND.map((k) => (
                  <span key={k.id} className="flex items-center gap-1">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: k.color }}
                    />
                    {k.name}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: OUTPOST_CONFLICT_COLOR }}
                  />
                  분쟁지대
                </span>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700" />
              {/* 테두리 = 소유 */}
              <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                테두리 · 소유
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#10b981" }}
                  />
                  내 거점
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#dc2626" }}
                  />
                  적 점령
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#f4c842" }}
                  />
                  중립
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-dashed border-emerald-500" />
                  현재 위치
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-zinc-400/30" />
                  미발견
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 거점 floating popup — 선택 시 하단 중앙. 이름 + 이동(다른 거점)/둘러보기(현재) + X.
            이동은 마커만 옮기고 지도에 머문다(연속 이동). 거점 화면은 「둘러보기」로 연다. */}
        {selected && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
            <div className="pointer-events-auto flex max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-300 bg-white/95 px-3 py-2 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selected.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {TYPE_LABEL[selected.type]}
                  </span>
                  {selected.neutral && (
                    <span className="shrink-0 rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] text-yellow-900">
                      중립
                    </span>
                  )}
                </div>
                {selectedOwnerLabel && (
                  <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {selectedOwnerLabel}
                  </div>
                )}
                {(treasuryByOutpost.get(selected.id) ?? 0) > 0 && (
                  <div className="mt-0.5 truncate text-xs font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                    금고 {treasuryByOutpost.get(selected.id)!.toLocaleString()}{" "}
                    G — 점령 시 획득
                  </div>
                )}
              </div>
              {warMode ? (
                // 전쟁 모드 — 공격만. 현재 거점/인접 1칸의 공격 가능 거점에 버튼,
                // 그 외엔 사유 텍스트. 이동은 마을 지도 전용이라 없음.
                (() => {
                  const occ = occByOutpost.get(selected.id);
                  const inRange =
                    isCurrentSelected ||
                    (currentOutpostId != null &&
                      areOutpostsAdjacent(currentOutpostId, selected.id));
                  const blockReason = selected.neutral
                    ? "중립 거점 (점령 불가)"
                    : occ?.occupiedByGuildId != null &&
                        occ.occupiedByGuildId === viewerGuildId
                      ? "아군 거점"
                      : !inRange
                        ? "인접 거점에서만 공격 가능"
                        : null;
                  if (blockReason) {
                    return (
                      <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {blockReason}
                      </span>
                    );
                  }
                  return (
                    onAttack && (
                      <button
                        type="button"
                        onClick={() => onAttack(selected)}
                        disabled={attackBusy}
                        className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {attackBusy
                          ? "교전 중…"
                          : occ?.occupiedByUserId
                            ? "공성"
                            : "점령"}
                      </button>
                    )
                  );
                })()
              ) : isCurrentSelected ? (
                onOutpostEnter && (
                  <button
                    type="button"
                    onClick={() => onOutpostEnter(selected)}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    둘러보기
                  </button>
                )
              ) : canWarpSelected && onWarp ? (
                <button
                  type="button"
                  onClick={() => onWarp(selected)}
                  className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  워프
                </button>
              ) : (
                onTravelTo &&
                (routePath ? (
                  <button
                    type="button"
                    onClick={() => onTravelTo(selected)}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {routeHops <= 1 ? "이동" : `이동 (${routeHops}홉)`}
                  </button>
                ) : (
                  <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    길이 닿지 않는다
                  </span>
                ))
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="닫기"
                className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
