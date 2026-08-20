"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  Bed,
  Books,
  Desk,
  Eye,
  EyeSlash,
  FishSimple,
  FloppyDisk,
  FlowerLotus,
  HouseLine,
  PersonArmsSpread,
  ShieldChevron,
  Sparkle,
  Sword,
  Trophy,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import {
  HOUSING_FURNITURE,
  HOUSING_GRID_COLUMNS,
  HOUSING_GRID_ROWS,
  HOUSING_MAX_PLACEMENTS,
  defaultHousingState,
  housingDisplayKey,
  housingDisplayKindFor,
  housingMasteryTrophyCategoriesFor,
  housingMasteryTrophyIsEligible,
  housingMasteryTrophyKey,
  housingOptionKey,
  housingOwnedCount,
  housingPlacementSize,
  type HousingDisplayKind,
  type HousingDisplayOption,
  type HousingDisplayRef,
  type HousingFurnitureId,
  type HousingPlacement,
  type HousingState,
} from "@/adventure/data/v2/housing";
import type { CodexMasteryTrophyTier } from "@/adventure/data/v2/codexMasteryTrophies";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { useSystemToast } from "./RewardToastProvider";

type HousingResponse = {
  ok?: boolean;
  error?: string;
  ownerName?: string;
  room?: HousingState;
  displayOptions?: HousingDisplayOption[];
  ownedCounts?: Partial<Record<HousingFurnitureId, number>>;
};

export type HousingPreviewData = {
  ownerName: string;
  room: HousingState;
  displayOptions: HousingDisplayOption[];
};

const FURNITURE_ICONS: Record<HousingFurnitureId, Icon> = {
  traveler_bed: Bed,
  oak_desk: Desk,
  record_shelf: Books,
  herb_planter: FlowerLotus,
  trophy_aquarium: FishSimple,
  equipment_mannequin: PersonArmsSpread,
  boss_trophy: ShieldChevron,
  weapon_rack: Sword,
  pine_work_shelf: Books,
  iron_work_lamp: Sparkle,
  life_work_desk: Desk,
  herb_display_planter: FlowerLotus,
  fishing_trophy_wall: FishSimple,
  cookware_display: Books,
  master_bed: Bed,
  arcane_alloy_display: Sparkle,
};

function furnitureImage(furnitureId: HousingFurnitureId): string | null {
  const definition = HOUSING_FURNITURE[furnitureId] as { image?: unknown };
  return typeof definition.image === "string" ? definition.image : null;
}

const DISPLAY_KIND_LABEL: Record<HousingDisplayKind, string> = {
  equipment: "전시 장비",
  fish: "전시 물고기",
  boss: "토벌 기록",
};

const MASTERY_TROPHY_TIER_STYLE: Record<
  CodexMasteryTrophyTier,
  { label: string; className: string }
> = {
  bronze: {
    label: "동",
    className: "border-orange-700 bg-orange-100 text-orange-800 dark:border-orange-500 dark:bg-orange-950 dark:text-orange-200",
  },
  silver: {
    label: "은",
    className: "border-zinc-500 bg-zinc-100 text-zinc-700 dark:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-100",
  },
  gold: {
    label: "금",
    className: "border-amber-600 bg-amber-100 text-amber-800 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200",
  },
  platinum: {
    label: "백금",
    className: "border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-300 dark:bg-sky-950 dark:text-sky-100",
  },
  diamond: {
    label: "다이아",
    className: "border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-300 dark:bg-teal-950 dark:text-teal-100",
  },
  legendary: {
    label: "전설",
    className: "border-violet-600 bg-violet-100 text-violet-800 dark:border-violet-400 dark:bg-violet-950 dark:text-violet-100",
  },
};

const HOUSING_ROOM_BACKGROUND = "/images/housing/room_background.webp";

const SAVE_ERROR: Record<string, string> = {
  too_many_items: "배치할 수 있는 가구 수를 초과했습니다.",
  invalid_placement: "방 밖으로 나간 가구가 있습니다.",
  duplicate_placement: "중복된 가구 정보가 있습니다.",
  furniture_not_owned: "보유 수량보다 많은 가구가 배치되어 있습니다.",
  items_overlap: "서로 겹친 가구가 있습니다.",
  invalid_display: "가구에 맞지 않는 전시품이 지정되어 있습니다.",
  display_not_owned: "더 이상 보유하지 않은 전시품이 포함되어 있습니다.",
};

function roomSnapshot(room: HousingState): string {
  return JSON.stringify(room);
}

function placementCells(placement: HousingPlacement): string[] {
  const { width, height } = housingPlacementSize(placement);
  const cells: string[] = [];
  for (let y = placement.y; y < placement.y + height; y += 1) {
    for (let x = placement.x; x < placement.x + width; x += 1) {
      cells.push(`${x}:${y}`);
    }
  }
  return cells;
}

function placementFits(
  layout: readonly HousingPlacement[],
  candidate: HousingPlacement,
  ignoreUid?: string,
): boolean {
  const { width, height } = housingPlacementSize(candidate);
  if (
    candidate.x < 0 ||
    candidate.y < 0 ||
    candidate.x + width > HOUSING_GRID_COLUMNS ||
    candidate.y + height > HOUSING_GRID_ROWS
  ) return false;
  const occupied = new Set(
    layout
      .filter((placement) => placement.uid !== ignoreUid)
      .flatMap(placementCells),
  );
  return placementCells(candidate).every((cell) => !occupied.has(cell));
}

function optionDisplayRef(option: HousingDisplayOption): HousingDisplayRef {
  if (option.kind === "equipment") {
    return { kind: "equipment", iid: option.iid };
  }
  if (option.kind === "fish") return { kind: "fish", fishId: option.fishId };
  if (option.kind === "boss") return { kind: "boss", bossId: option.bossId };
  throw new Error("mastery trophy options use the companion display field");
}

function optionForDisplay(
  display: HousingDisplayRef | undefined,
  options: readonly HousingDisplayOption[],
): HousingDisplayOption | undefined {
  if (!display) return undefined;
  const key = housingDisplayKey(display);
  return options.find((option) => housingOptionKey(option) === key);
}

function optionForMasteryTrophy(
  masteryTrophy: HousingPlacement["masteryTrophy"],
  options: readonly HousingDisplayOption[],
): HousingDisplayOption | undefined {
  if (!masteryTrophy) return undefined;
  const key = housingMasteryTrophyKey(masteryTrophy);
  return options.find(
    (option) =>
      option.kind === "masteryTrophy" && housingOptionKey(option) === key,
  );
}

function nextPlacementUid(counter: number): string {
  return `room-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function V2HousingView({
  onBack,
  playerName,
  previewData,
}: {
  onBack: () => void;
  playerName?: string;
  /** /dev 전용 DB 없는 시각 QA 데이터. 실제 게임 경로에서는 전달하지 않는다. */
  previewData?: HousingPreviewData;
}) {
  const editable = !playerName;
  const { notifySystem } = useSystemToast();
  const [ownerName, setOwnerName] = useState(
    previewData?.ownerName ?? playerName ?? "모험가",
  );
  const [room, setRoom] = useState<HousingState>(() =>
    previewData?.room ?? defaultHousingState(),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    previewData ? roomSnapshot(previewData.room) : "",
  );
  const [displayOptions, setDisplayOptions] = useState<HousingDisplayOption[]>(
    previewData?.displayOptions ?? [],
  );
  const [ownedCounts, setOwnedCounts] = useState<Partial<Record<HousingFurnitureId, number>>>({});
  const [loading, setLoading] = useState(!previewData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "furniture" | "display">("all");
  const [selectedFurnitureId, setSelectedFurnitureId] =
    useState<HousingFurnitureId | null>(null);
  const [selectedPlacementUid, setSelectedPlacementUid] = useState<string | null>(null);
  const [roomZoomed, setRoomZoomed] = useState(false);
  const uidCounter = useRef(1);

  const fetchRoom = useCallback(async () => {
    if (previewData) return;
    setLoading(true);
    setLoadError(null);
    try {
      const url = playerName
        ? `/api/v2/player/${encodeURIComponent(playerName)}/housing`
        : "/api/v2/me/housing";
      const response = await fetch(url, { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as HousingResponse | null;
      if (!response.ok || !json?.ok || !json.room) {
        setLoadError(
          json?.error === "private_room"
            ? "이 모험가는 숙소를 비공개로 설정했습니다."
            : json?.error === "not_found"
              ? "모험가의 숙소를 찾을 수 없습니다."
              : "숙소를 불러오지 못했습니다.",
        );
        return;
      }
      setOwnerName(json.ownerName?.trim() || playerName || "모험가");
      setRoom(json.room);
      setSavedSnapshot(roomSnapshot(json.room));
      setDisplayOptions(json.displayOptions ?? []);
      setOwnedCounts(json.ownedCounts ?? {});
    } catch {
      setLoadError("숙소를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [playerName, previewData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/대상 변경 시 서버 숙소를 조회한다.
    void fetchRoom();
  }, [fetchRoom]);

  const dirty = editable && savedSnapshot !== "" && savedSnapshot !== roomSnapshot(room);
  const selectedPlacement = room.layout.find(
    (placement) => placement.uid === selectedPlacementUid,
  );
  const placedCounts = useMemo(() => {
    const counts = new Map<HousingFurnitureId, number>();
    for (const placement of room.layout) {
      counts.set(placement.furnitureId, (counts.get(placement.furnitureId) ?? 0) + 1);
    }
    return counts;
  }, [room.layout]);
  const visibleFurnitureIds = (
    Object.keys(HOUSING_FURNITURE) as HousingFurnitureId[]
  ).filter((id) => {
    if (catalogFilter === "all") return true;
    return HOUSING_FURNITURE[id].category === catalogFilter;
  });
  const optionMap = useMemo(
    () => new Map(displayOptions.map((option) => [housingOptionKey(option), option])),
    [displayOptions],
  );

  function selectFurniture(id: HousingFurnitureId) {
    if (!editable) return;
    const placed = placedCounts.get(id) ?? 0;
    if (placed >= housingOwnedCount(id, ownedCounts)) {
      notifySystem("보유한 가구를 모두 배치했습니다.");
      return;
    }
    setSelectedFurnitureId((current) => (current === id ? null : id));
    setSelectedPlacementUid(null);
  }

  function placeFurniture(x: number, y: number) {
    if (!editable || !selectedFurnitureId) return;
    if (room.layout.length >= HOUSING_MAX_PLACEMENTS) {
      notifySystem("현재 방의 가구 배치 한도에 도달했습니다.");
      return;
    }
    const placed = placedCounts.get(selectedFurnitureId) ?? 0;
    if (placed >= housingOwnedCount(selectedFurnitureId, ownedCounts)) {
      notifySystem("보유한 가구를 모두 배치했습니다.");
      return;
    }
    const placement: HousingPlacement = {
      uid: nextPlacementUid(uidCounter.current++),
      furnitureId: selectedFurnitureId,
      x,
      y,
      rotated: false,
    };
    if (!placementFits(room.layout, placement)) {
      notifySystem("다른 가구와 겹치거나 방 밖으로 나갑니다.");
      return;
    }
    setRoom((current) => ({
      ...current,
      layout: [...current.layout, placement],
    }));
    setSelectedFurnitureId(null);
    setSelectedPlacementUid(placement.uid);
  }

  function rotateSelected() {
    if (!selectedPlacement) return;
    const rotated = { ...selectedPlacement, rotated: !selectedPlacement.rotated };
    if (!placementFits(room.layout, rotated, selectedPlacement.uid)) {
      notifySystem("이 위치에서는 가구를 회전할 공간이 부족합니다.");
      return;
    }
    setRoom((current) => ({
      ...current,
      layout: current.layout.map((placement) =>
        placement.uid === rotated.uid ? rotated : placement,
      ),
    }));
  }

  function removeSelected() {
    if (!selectedPlacement) return;
    setRoom((current) => ({
      ...current,
      layout: current.layout.filter(
        (placement) => placement.uid !== selectedPlacement.uid,
      ),
    }));
    setSelectedPlacementUid(null);
  }

  function setSelectedDisplay(value: string) {
    if (!selectedPlacement) return;
    const option = displayOptions.find(
      (candidate) =>
        candidate.kind !== "masteryTrophy" &&
        housingOptionKey(candidate) === value,
    );
    setRoom((current) => ({
      ...current,
      layout: current.layout.map((placement) => {
        if (placement.uid !== selectedPlacement.uid) return placement;
        if (!option) {
          const { display: _display, ...withoutDisplay } = placement;
          return withoutDisplay;
        }
        return { ...placement, display: optionDisplayRef(option) };
      }),
    }));
  }

  function setSelectedMasteryTrophy(value: string) {
    if (!selectedPlacement) return;
    const option = displayOptions.find(
      (candidate) =>
        candidate.kind === "masteryTrophy" &&
        housingOptionKey(candidate) === value,
    );
    setRoom((current) => ({
      ...current,
      layout: current.layout.map((placement) => {
        if (placement.uid !== selectedPlacement.uid) return placement;
        if (!option || option.kind !== "masteryTrophy") {
          const { masteryTrophy: _masteryTrophy, ...withoutMasteryTrophy } =
            placement;
          return withoutMasteryTrophy;
        }
        return {
          ...placement,
          masteryTrophy: { trophyId: option.trophyId },
        };
      }),
    }));
  }

  async function saveRoom() {
    if (!editable || saving) return;
    if (previewData) {
      setSavedSnapshot(roomSnapshot(room));
      notifySystem("숙소 배치를 저장했습니다. (DEV 미리보기)");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/v2/me/housing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(room),
      });
      const json = (await response.json().catch(() => null)) as HousingResponse | null;
      if (!response.ok || !json?.ok || !json.room) {
        notifySystem(
          SAVE_ERROR[json?.error ?? ""] ?? "숙소를 저장하지 못했습니다.",
        );
        return;
      }
      setRoom(json.room);
      setSavedSnapshot(roomSnapshot(json.room));
      setDisplayOptions(json.displayOptions ?? displayOptions);
      notifySystem("숙소 배치를 저장했습니다.");
    } catch {
      notifySystem("숙소를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <SubViewHeader title="모험가 숙소" onBack={onBack} />
        <Card padding="md">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">숙소를 불러오는 중…</p>
        </Card>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell>
        <SubViewHeader title="모험가 숙소" onBack={onBack} />
        <Card padding="md" className="space-y-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchRoom()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            다시 불러오기
          </button>
        </Card>
      </PageShell>
    );
  }

  const displayCount = room.layout.reduce(
    (count, placement) =>
      count + Number(Boolean(placement.display)) +
      Number(Boolean(placement.masteryTrophy)),
    0,
  );

  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title={editable ? "모험가 숙소" : `${ownerName}의 숙소`}
        onBack={onBack}
        right={
          editable ? (
            <button
              type="button"
              onClick={() => void saveRoom()}
              disabled={!dirty || saving}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-sm font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <FloppyDisk size={16} weight="bold" />
              {saving ? "저장 중" : "저장"}
            </button>
          ) : undefined
        }
      />

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <HouseLine size={20} weight="duotone" className="text-amber-600 dark:text-amber-400" />
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {ownerName}의 작은 객실
              </h2>
              {dirty ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  저장 안 됨
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {editable
                ? selectedFurnitureId
                  ? "방의 빈 칸을 눌러 선택한 가구를 배치하세요."
                  : "가구를 선택하거나 배치된 전시품을 눌러 편집하세요."
                : "모험에서 얻은 장비와 기록을 전시한 공개 숙소입니다."}
            </p>
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => setRoom((current) => ({ ...current, isPublic: !current.isPublic }))}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
                room.isPublic
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {room.isPublic ? <Eye size={15} /> : <EyeSlash size={15} />}
              {room.isPublic ? "공개" : "비공개"}
            </button>
          ) : null}
        </div>

        {editable ? (
          <div className="space-y-2">
            <button
              type="button"
              aria-pressed={roomZoomed}
              onClick={() => setRoomZoomed((current) => !current)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {roomZoomed ? "전체 보기" : "방 확대"}
            </button>
            <div
              data-testid="housing-room-scroll"
              className={`max-w-full max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] ${
                roomZoomed
                  ? "max-h-[70vh] overflow-auto overscroll-contain touch-pan-x touch-pan-y"
                  : "overflow-hidden"
              }`}
            >
              <div
                data-testid="housing-room-canvas"
                className={roomZoomed ? "w-[200%] max-w-none sm:w-full" : "w-full"}
              >
                <RoomCanvas
                  room={room}
                  editable
                  selectedFurnitureId={selectedFurnitureId}
                  selectedPlacementUid={selectedPlacementUid}
                  optionMap={optionMap}
                  onCellClick={placeFurniture}
                  onPlacementClick={(uid) => {
                    setSelectedFurnitureId(null);
                    setSelectedPlacementUid(uid);
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <RoomCanvas
            room={room}
            editable={false}
            selectedFurnitureId={selectedFurnitureId}
            selectedPlacementUid={selectedPlacementUid}
            optionMap={optionMap}
            onCellClick={placeFurniture}
            onPlacementClick={() => {}}
          />
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={`${SURFACE_INSET} px-2 py-2`}>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">배치 가구</div>
            <div className="mt-0.5 text-sm font-bold">{room.layout.length} / {HOUSING_MAX_PLACEMENTS}</div>
          </div>
          <div className={`${SURFACE_INSET} px-2 py-2`}>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">전시 기록</div>
            <div className="mt-0.5 text-sm font-bold">{displayCount}개</div>
          </div>
          <div className={`${SURFACE_INSET} px-2 py-2`}>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">공개 설정</div>
            <div className="mt-0.5 text-sm font-bold">{room.isPublic ? "공개" : "비공개"}</div>
          </div>
        </div>
      </Card>

      {editable ? (
        <>
          <Card padding="md" className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">가구 보관함</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                기본 가구는 무료로 지급됩니다. 제작 가구는 이후 이 보관함에 추가됩니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
              {(["all", "furniture", "display"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCatalogFilter(value)}
                  className={`min-h-8 rounded px-2 text-xs font-semibold ${
                    catalogFilter === value
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {value === "all" ? "전체" : value === "furniture" ? "가구" : "전시"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleFurnitureIds.map((id) => {
                const def = HOUSING_FURNITURE[id];
                const IconComponent = FURNITURE_ICONS[id];
                const image = furnitureImage(id);
                const placed = placedCounts.get(id) ?? 0;
                const owned = housingOwnedCount(id, ownedCounts);
                const exhausted = placed >= owned;
                const selected = selectedFurnitureId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectFurniture(id)}
                    disabled={exhausted && !selected}
                    className={`${SURFACE_INSET} min-h-28 p-3 text-left transition-colors disabled:cursor-not-allowed ${
                      selected
                        ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                        : "hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden">
                        {image ? (
                          <Image
                            src={image}
                            alt=""
                            width={96}
                            height={96}
                            className={`h-12 w-12 object-contain drop-shadow-sm ${exhausted ? "grayscale-[35%]" : ""}`}
                          />
                        ) : (
                          <IconComponent size={25} weight="duotone" className="text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{placed}/{owned}</span>
                    </div>
                    <div className="mt-2 truncate text-xs font-semibold">{def.name}</div>
                    <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {def.width}×{def.height} · {def.category === "display" ? "전시" : "가구"}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <HousingSelectionPanel
            placement={selectedPlacement}
            selectedFurnitureId={selectedFurnitureId}
            displayOptions={displayOptions}
            onDisplayChange={setSelectedDisplay}
            onMasteryTrophyChange={setSelectedMasteryTrophy}
            onRotate={rotateSelected}
            onRemove={removeSelected}
          />
        </>
      ) : (
        <VisitorDisplays room={room} displayOptions={displayOptions} />
      )}
    </PageShell>
  );
}

function RoomCanvas({
  room,
  editable,
  selectedFurnitureId,
  selectedPlacementUid,
  optionMap,
  onCellClick,
  onPlacementClick,
}: {
  room: HousingState;
  editable: boolean;
  selectedFurnitureId: HousingFurnitureId | null;
  selectedPlacementUid: string | null;
  optionMap: ReadonlyMap<string, HousingDisplayOption>;
  onCellClick: (x: number, y: number) => void;
  onPlacementClick: (uid: string) => void;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-300 bg-zinc-950 shadow-inner dark:border-zinc-700">
      <Image
        src={HOUSING_ROOM_BACKGROUND}
        alt="따뜻한 조명이 켜진 모험가 숙소"
        fill
        priority
        sizes="(max-width: 720px) calc(100vw - 64px), 640px"
        className="select-none object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/25" />
      <div className="absolute left-[5.5%] right-[5.5%] top-[32%] bottom-[5%]">
        <div
          className="absolute inset-0 grid min-w-0 overflow-visible"
          style={{
            gridTemplateColumns: `repeat(${HOUSING_GRID_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${HOUSING_GRID_ROWS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: HOUSING_GRID_COLUMNS * HOUSING_GRID_ROWS }, (_, index) => {
            const x = index % HOUSING_GRID_COLUMNS;
            const y = Math.floor(index / HOUSING_GRID_COLUMNS);
            return (
              <button
                key={`${x}:${y}`}
                type="button"
                aria-label={`${y + 1}행 ${x + 1}열`}
                disabled={!editable || !selectedFurnitureId}
                onClick={() => onCellClick(x, y)}
                className={`min-w-0 rounded-sm border p-0 transition-colors ${
                  selectedFurnitureId
                    ? "cursor-crosshair border-amber-200/30 bg-amber-100/5 hover:border-amber-300 hover:bg-amber-200/20"
                    : "cursor-default border-transparent bg-transparent"
                }`}
                style={{ gridColumn: x + 1, gridRow: y + 1 }}
              />
            );
          })}
          {room.layout.map((placement) => {
            const def = HOUSING_FURNITURE[placement.furnitureId];
            const { width, height } = housingPlacementSize(placement);
            const IconComponent = FURNITURE_ICONS[placement.furnitureId];
            const image = furnitureImage(placement.furnitureId);
            const option = placement.display
              ? optionMap.get(housingDisplayKey(placement.display))
              : undefined;
            const masteryOption = placement.masteryTrophy
              ? optionMap.get(housingMasteryTrophyKey(placement.masteryTrophy))
              : undefined;
            const masteryTrophy = masteryOption?.kind === "masteryTrophy"
              ? masteryOption
              : undefined;
            const displayedLabels = [option?.label, masteryTrophy?.label].filter(
              (label): label is string => Boolean(label),
            );
            const selected = editable && selectedPlacementUid === placement.uid;
            const depthScale = 1.02 + ((placement.y + height) / HOUSING_GRID_ROWS) * 0.2;
            return (
              <button
                key={placement.uid}
                type="button"
                disabled={!editable}
                aria-label={`${def.name}${
                  displayedLabels.length > 0
                    ? `: ${displayedLabels.join(" · ")}`
                    : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlacementClick(placement.uid);
                }}
                title={displayedLabels.join(" · ") || def.name}
                className={`group relative m-0.5 flex min-w-0 flex-col items-center justify-end overflow-visible rounded-md border border-transparent px-0.5 transition-colors sm:m-1 ${
                  editable ? "hover:border-white/20 hover:bg-black/5" : "cursor-default"
                } ${selected ? "border-amber-300/80 bg-amber-200/10 ring-2 ring-amber-400" : ""}`}
                style={{
                  gridColumn: `${placement.x + 1} / span ${width}`,
                  gridRow: `${placement.y + 1} / span ${height}`,
                  zIndex: 10 + placement.y + height,
                }}
              >
                {image ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-[4%] left-1/2 z-0 rounded-[50%] bg-black/55 blur-[3px]"
                      style={{
                        width: `${Math.min(82, 48 + width * 14)}%`,
                        height: height === 1 ? "18%" : "12%",
                        transform: "translateX(-50%) skewX(-12deg)",
                      }}
                    />
                    <span
                      className={`pointer-events-none absolute inset-x-[-18%] bottom-0 z-10 origin-bottom ${height === 1 ? "h-[185%]" : "h-[128%]"}`}
                      style={{
                        transform: `scale(${depthScale}) rotate(${placement.rotated ? 90 : 0}deg)`,
                      }}
                    >
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes="(max-width: 720px) 30vw, 190px"
                        draggable={false}
                        className="select-none object-contain"
                        style={{
                          filter: "brightness(0.86) saturate(0.88) drop-shadow(0 5px 3px rgba(0, 0, 0, 0.5))",
                        }}
                      />
                    </span>
                  </>
                ) : (
                  <IconComponent
                    size={width + height > 2 ? 28 : 23}
                    weight="duotone"
                    className="mb-4 shrink-0 text-amber-300 drop-shadow-md"
                  />
                )}
                {masteryTrophy ? (
                  <span
                    className={`pointer-events-none absolute -right-1 -top-1 z-30 inline-flex max-w-[92%] items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold shadow-sm ${
                      MASTERY_TROPHY_TIER_STYLE[masteryTrophy.currentTier].className
                    }`}
                  >
                    <Trophy size={10} weight="fill" aria-hidden="true" />
                    <span className="truncate">{masteryTrophy.label}</span>
                    <span className="shrink-0">
                      {MASTERY_TROPHY_TIER_STYLE[masteryTrophy.currentTier].label}
                    </span>
                  </span>
                ) : null}
                <span
                  className={`pointer-events-none relative z-20 mb-0.5 max-w-full shrink-0 truncate rounded px-1 py-0.5 text-xs font-semibold leading-tight text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:text-[9px] ${
                    def.category === "display" ? "bg-sky-950" : "bg-zinc-950"
                  } ${selected ? "opacity-100" : ""}`}
                >
                  {displayedLabels.join(" · ") || def.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {editable && selectedFurnitureId ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-amber-300/50">
          배치할 바닥 칸을 선택하세요
        </div>
      ) : null}
    </div>
  );
}

function HousingSelectionPanel({
  placement,
  selectedFurnitureId,
  displayOptions,
  onDisplayChange,
  onMasteryTrophyChange,
  onRotate,
  onRemove,
}: {
  placement?: HousingPlacement;
  selectedFurnitureId: HousingFurnitureId | null;
  displayOptions: HousingDisplayOption[];
  onDisplayChange: (value: string) => void;
  onMasteryTrophyChange: (value: string) => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const furnitureId = placement?.furnitureId ?? selectedFurnitureId;
  const def = furnitureId ? HOUSING_FURNITURE[furnitureId] : null;
  const IconComponent = furnitureId ? FURNITURE_ICONS[furnitureId] : HouseLine;
  const image = furnitureId ? furnitureImage(furnitureId) : null;
  const displayKind = placement ? housingDisplayKindFor(placement.furnitureId) : null;
  const eligibleOptions = displayKind
    ? displayOptions.filter((option) => option.kind === displayKind)
    : [];
  const selectedDisplayKey = placement?.display
    ? housingDisplayKey(placement.display)
    : "";
  const masteryTrophyOptions = placement
    ? displayOptions.filter(
        (option) =>
          option.kind === "masteryTrophy" &&
          housingMasteryTrophyIsEligible(
            placement.furnitureId,
            option.category,
          ),
      )
    : [];
  const selectedMasteryTrophyKey = placement?.masteryTrophy
    ? housingMasteryTrophyKey(placement.masteryTrophy)
    : "";
  const supportsMasteryTrophy = placement
    ? housingMasteryTrophyCategoriesFor(placement.furnitureId).length > 0
    : false;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start gap-3">
        <div className={`${SURFACE_INSET} grid h-11 w-11 shrink-0 place-items-center`}>
          {image ? (
            <Image src={image} alt="" width={80} height={80} className="h-10 w-10 object-contain drop-shadow-sm" />
          ) : (
            <IconComponent size={25} weight="duotone" className="text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{def?.name ?? "가구를 선택하세요"}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {def?.description ?? "보관함의 가구를 선택한 뒤 방의 빈 칸을 누르면 배치됩니다."}
          </p>
        </div>
      </div>

      {placement && displayKind ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold">
            {DISPLAY_KIND_LABEL[displayKind]}
          </span>
          <select
            value={selectedDisplayKey}
            onChange={(event) => onDisplayChange(event.target.value)}
            className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">전시하지 않음</option>
            {eligibleOptions.map((option) => (
              <option key={housingOptionKey(option)} value={housingOptionKey(option)}>
                {option.label} · {option.detail}
              </option>
            ))}
          </select>
          {eligibleOptions.length === 0 ? (
            <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
              전시 가능한 기록이 아직 없습니다. 관련 장비·어보·토벌 기록을 획득하면 이곳에 표시됩니다.
            </span>
          ) : null}
        </label>
      ) : null}

      {placement && supportsMasteryTrophy ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold">
            도감 숙련 트로피
          </span>
          <select
            aria-label="도감 숙련 트로피"
            value={selectedMasteryTrophyKey}
            onChange={(event) => onMasteryTrophyChange(event.target.value)}
            className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">전시하지 않음</option>
            {masteryTrophyOptions.map((option) => (
              <option key={housingOptionKey(option)} value={housingOptionKey(option)}>
                {option.label} · {option.detail}
              </option>
            ))}
          </select>
          {masteryTrophyOptions.length === 0 ? (
            <span className="mt-1.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
              이 가구에 어울리는 도감 숙련 트로피를 획득하면 표시됩니다.
            </span>
          ) : null}
        </label>
      ) : null}

      {placement ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRotate}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-800"
          >
            <ArrowClockwise size={16} /> 회전
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
          >
            <Trash size={16} /> 보관함으로
          </button>
        </div>
      ) : selectedFurnitureId ? (
        <div className={`${SURFACE_ACCENT} px-3 py-2 text-xs text-amber-900 dark:text-amber-100`}>
          방의 빈 칸을 누르면 선택한 가구가 배치됩니다.
        </div>
      ) : null}
    </Card>
  );
}

function VisitorDisplays({
  room,
  displayOptions,
}: {
  room: HousingState;
  displayOptions: HousingDisplayOption[];
}) {
  const displays = room.layout.flatMap((placement) => {
    const option = optionForDisplay(placement.display, displayOptions);
    const masteryTrophy = optionForMasteryTrophy(
      placement.masteryTrophy,
      displayOptions,
    );
    return [option, masteryTrophy].filter(
      (item): item is HousingDisplayOption => item !== undefined,
    );
  });
  return (
    <Card padding="md" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">대표 전시 기록</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          숙소 주인이 직접 선택한 장비, 모험 기록과 도감 숙련 트로피입니다.
        </p>
      </div>
      {displays.length === 0 ? (
        <div className={`${SURFACE_INSET} px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
          아직 지정된 전시품이 없습니다.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {displays.map((option, index) => (
            <div key={`${housingOptionKey(option)}:${index}`} className={`${SURFACE_INSET} px-3 py-2.5`}>
              <div className="text-xs font-semibold">{option.label}</div>
              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{option.detail}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
