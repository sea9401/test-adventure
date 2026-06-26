"use client";

import { useRouter } from "next/navigation";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import { type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";

// 유틸맵 사용 — 종류별 전용 화면으로 이동(지도 iid 동봉, 서버가 소유 재검증).
const UTILITY_MAP_ROUTE: Partial<Record<string, string>> = {
  secret_shop_map: "/hidden/shop",
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
  rareMaps,
}: {
  materials: Partial<Record<V2MaterialId, number>>;
  spFruitUsed: Record<SpFruitTier, number>;
  busy: string | null;
  onUseSpFruit: (tier: SpFruitTier) => void;
  rareMaps: RareMapInstance[] | null;
}) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <SpFruitSection
        materials={materials}
        used={spFruitUsed}
        busy={busy}
        onUse={onUseSpFruit}
      />
      <ConsumableList
        maps={rareMaps}
        suppressEmpty={SP_FRUIT_TIERS.some(
          (t) => (materials[SP_FRUIT[t].materialId] ?? 0) > 0,
        )}
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
          return (
            <li
              key={def.materialId}
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  🍂 {def.name}
                  <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    ×{held}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={atCap || isBusy}
                  onClick={() => onUse(t)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                    atCap || isBusy
                      ? "cursor-not-allowed border border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                      : "border border-amber-700 bg-amber-600 text-white hover:bg-amber-700"
                  }`}
                >
                  {atCap ? "한도 도달" : isBusy ? "사용 중…" : "사용"}
                </button>
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
  if (maps === null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        불러오는 중…
      </div>
    );
  }
  if (maps.length === 0) {
    if (suppressEmpty) return null;
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        보유한 소모품이 없습니다. 레어맵은 사냥 중 아주 낮은 확률로
        발견됩니다.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {maps.map((m) => {
        const def = RARE_MAP_KINDS[m.kind];
        const isUtility = def?.category === "utility";
        return (
          <li
            key={m.iid}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                🗺 {def?.name ?? m.kind}
              </span>
              {isUtility ? (
                <button
                  type="button"
                  onClick={() => onUse?.(m)}
                  className="shrink-0 rounded-md border border-sky-700 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
                >
                  사용
                </button>
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
              <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {def.desc}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
