"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Diamond } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import { COOP_EQUIPMENT_BOX } from "@/adventure/data/v2/coopRewards";
import {
  V2SimpleItemInfoCard,
  anchorOf,
  type ItemCardAnchor,
} from "../V2ItemCard";

// 유틸맵 사용 — 종류별 전용 화면으로 이동(지도 iid 동봉, 서버가 소유 재검증).
const UTILITY_MAP_ROUTE: Partial<Record<string, string>> = {
  rename_map: "/hidden/rename",
  portrait_map: "/hidden/portrait",
};

// 소모품 탭 — SP 열매 섹션 + 보유 레어맵 목록. SP 열매 보유/사용수·일괄 새로고침 등
// 데이터는 코디네이터(부모)가 보유하고, 여기서는 표시 + 유틸맵 이동만 담당(거동 불변).
export function RareMapsTab({
  materials,
  spFruitUsed,
  busy,
  onUseSpFruit,
  onUseEquipmentBox,
  rareMaps,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  spFruitUsed: Record<SpFruitTier, number>;
  busy: string | null;
  onUseSpFruit: (tier: SpFruitTier) => void;
  onUseEquipmentBox: (boxId: string) => void;
  rareMaps: RareMapInstance[] | null;
}) {
  const router = useRouter();
  const hasSpFruit = SP_FRUIT_TIERS.some(
    (t) => (materials[SP_FRUIT[t].materialId] ?? 0) > 0,
  );
  const hasEquipmentBox = Object.values(COOP_EQUIPMENT_BOX).some(
    (box) => (materials[box.id] ?? 0) > 0,
  );
  return (
    <div className="space-y-4">
      <SpFruitSection
        materials={materials}
        used={spFruitUsed}
        busy={busy}
        onUse={onUseSpFruit}
      />
      <CoopEquipmentBoxSection
        materials={materials}
        busy={busy}
        onUse={onUseEquipmentBox}
      />
      <ConsumableList
        maps={rareMaps}
        suppressEmpty={hasSpFruit || hasEquipmentBox}
        onUse={(m) => {
          // 경험치의 비약(테스트) — 화면 이동 없이 즉시 EXP 지급 후 새로고침
          //   (레벨·스탯이 전역에 반영되도록).
          if (m.kind === "exp_tome") {
            fetch("/api/v2/me/use-exp-tome", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ map: m.iid }),
            })
              .then((res) => {
                if (res.ok) window.location.reload();
              })
              .catch(() => {});
            return;
          }
          if (m.kind === "secret_shop_map") {
            router.push("/hidden/shop");
            return;
          }
          const base = UTILITY_MAP_ROUTE[m.kind];
          if (base) router.push(`${base}?map=${m.iid}`);
        }}
      />
    </div>
  );
}

// SP 열매 섹션 — 협동 보스 드랍 소모품. 등급별로 보유수 + "사용 N/캡" 표시.
//   사용 버튼: 보유 0 또는 캡 도달 시 비활성(캡 도달분은 거래소 거래만). 1회 = SP 최대치 +1.
function SpFruitSection({
  materials,
  used,
  busy,
  onUse,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  used: Record<SpFruitTier, number>;
  busy: string | null;
  onUse: (tier: SpFruitTier) => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    description: string;
    held: number;
    usedCount: number;
    useCap: number;
    anchor: ItemCardAnchor;
  } | null>(null);

  // 보유분이 하나도 없으면 섹션 자체를 숨긴다(빈 카드 난립 방지). 캡 도달했어도 보유 0이면 숨김.
  const anyHeld = SP_FRUIT_TIERS.some(
    (t) => (materials[SP_FRUIT[t].materialId] ?? 0) > 0,
  );
  if (!anyHeld) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        SP 열매 · 사용 시 SP 최대치 영구 +1
      </div>
      <ul className="space-y-1.5">
        {SP_FRUIT_TIERS.map((t) => {
          const def = SP_FRUIT[t];
          const held = materials[def.materialId] ?? 0;
          if (held <= 0) return null;
          const usedCount = used[t] ?? 0;
          const atCap = usedCount >= def.useCap;
          const isBusy = busy === `sp_fruit_${t}`;
          const material = V2_MATERIALS[def.materialId];
          return (
            <li
              key={def.materialId}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: material?.name ?? def.name,
                      description:
                        material?.description ??
                        `사용하면 SP 최대치가 영구히 +${def.spPerUse} 오릅니다.`,
                      held,
                      usedCount,
                      useCap: def.useCap,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <span className="block truncate text-sm font-medium">
                    🍂 {def.name}
                    <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{held}
                    </span>
                  </span>
                </button>
                <Button
                  disabled={atCap || isBusy}
                  onClick={() => onUse(t)}
                  variant="warning"
                  size="xs"
                  className="shrink-0"
                >
                  {atCap ? "한도 도달" : isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                사용 {usedCount}/{def.useCap}
                {atCap
                  ? " · 한도 도달 (보유·거래만 가능)"
                  : ` · SP 최대치 +${def.spPerUse}/회`}
              </div>
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle="소모품"
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={[
            { label: "보유", value: `×${infoCard.held}` },
            { label: "사용", value: `${infoCard.usedCount}/${infoCard.useCap}` },
          ]}
        />
      ) : null}
    </div>
  );
}

// 협동 보스 장비 상자 — 사용 시 해당 보스 단계의 정규 장비 1개 획득.
function CoopEquipmentBoxSection({
  materials,
  busy,
  onUse,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  busy: string | null;
  onUse: (boxId: string) => void;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    description: string;
    held: number;
    tier: number;
    source: string;
    anchor: ItemCardAnchor;
  } | null>(null);

  const boxes = Object.values(COOP_EQUIPMENT_BOX)
    .map((box) => ({ box, held: materials[box.id] ?? 0 }))
    .filter((entry) => entry.held > 0);
  if (boxes.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
        협동 장비 상자 · 사용 시 장비 1개 획득
      </div>
      <ul className="space-y-1.5">
        {boxes.map(({ box, held }) => {
          const material = V2_MATERIALS[box.id];
          const isBusy = busy === box.id;
          return (
            <li
              key={box.id}
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: material?.name ?? box.name,
                      description: material?.description ?? box.description,
                      held,
                      tier: box.displayTier,
                      source: box.source,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <span className="block truncate text-sm font-medium">
                    상자 · {box.name}
                    <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ×{held}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {box.displayTier}티어 · {box.source}
                  </span>
                </button>
                <Button
                  disabled={isBusy}
                  onClick={() => onUse(box.id)}
                  variant="secondary"
                  size="xs"
                  className="shrink-0"
                >
                  {isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle="소모품"
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={[
            { label: "보유", value: `×${infoCard.held}` },
            { label: "티어", value: `${infoCard.tier}티어` },
            { label: "범위", value: infoCard.source },
          ]}
        />
      ) : null}
    </div>
  );
}

// 소모품 탭 — 보유 레어맵 목록. hunt 계열 사용(입장)은 사냥터 목록의 "발견한 지도",
// utility 계열(비밀 상점/개명/화공)은 여기서 "사용". 판매는 거래소 > 팔기 > 소모품.
function ConsumableList({
  maps,
  onUse,
  // 위에 SP 열매 섹션이 이미 보유분을 그리면(true) 빈 레어맵 안내문을 숨긴다.
  suppressEmpty = false,
}: {
  maps: RareMapInstance[] | null;
  onUse?: (m: RareMapInstance) => void;
  suppressEmpty?: boolean;
}) {
  const [infoCard, setInfoCard] = useState<{
    title: string;
    subtitle: string;
    description: string;
    lines: { label: string; value: string }[];
    anchor: ItemCardAnchor;
  } | null>(null);

  if (maps === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (maps.length === 0) {
    if (suppressEmpty) return null;
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 소모품이 없습니다"
        message="레어맵은 사냥 중 낮은 확률로 발견됩니다."
      />
    );
  }
  return (
    <>
      <ul className="space-y-1.5">
        {maps.map((m) => {
          const def = RARE_MAP_KINDS[m.kind];
          const isUtility = def?.category === "utility";
          const lines = [
            { label: "남은 횟수", value: `${m.runsLeft}` },
            ...(isUtility ? [] : [{ label: "깊이", value: `${m.depth}` }]),
          ];
          return (
            <li
              key={m.iid}
              className={`${SURFACE_CARD} px-3 py-2`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: def?.name ?? m.kind,
                      subtitle: isUtility ? "소모품" : "레어맵",
                      description: def?.desc ?? "",
                      lines,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <span className="block truncate text-sm font-medium">
                    🗺 {def?.name ?? m.kind}
                  </span>
                </button>
                {isUtility ? (
                  <Button
                    onClick={() => onUse?.(m)}
                    variant="info"
                    size="xs"
                    className="shrink-0"
                  >
                    사용
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    깊이 {m.depth}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {isUtility ? (
                  <>남은 {m.runsLeft}회</>
                ) : (
                  <>남은 {m.runsLeft}판 · 입장은 전투 탭 &gt; 사냥터의 「발견한 지도」</>
                )}
              </div>
              {def?.desc && (
                <button
                  type="button"
                  onClick={(e) =>
                    setInfoCard({
                      title: def.name,
                      subtitle: isUtility ? "소모품" : "레어맵",
                      description: def.desc,
                      lines,
                      anchor: anchorOf(e.currentTarget),
                    })
                  }
                  className="mt-1 line-clamp-2 text-left text-[11px] text-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:text-zinc-500"
                >
                  {def.desc}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {infoCard ? (
        <V2SimpleItemInfoCard
          title={infoCard.title}
          subtitle={infoCard.subtitle}
          description={infoCard.description}
          anchor={infoCard.anchor}
          onClose={() => setInfoCard(null)}
          lines={infoCard.lines}
        />
      ) : null}
    </>
  );
}
