"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Diamond } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  V2_EQUIP_PERCENT_KEYS,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipStats,
  type V2EquipTier,
} from "@/adventure/data/v2/v2Equipment";

// v2 인벤토리 — 무기 / 방어구 / 장신구 / 재료 sub-tab. 상점과 동일한 테이블 구조.
// 보유한 아이템만 표시. 장비 row 에 ×count 카운트 + 장착중 뱃지.

type TabKey = V2EquipSlot | "material";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
  { key: "material", label: "재료" },
];

const CONCEPT_LABEL: Record<string, string> = {
  str: "힘",
  dex: "민",
  int: "지",
  heavy: "중갑",
  light: "경갑",
  luck: "운",
  mana: "마법",
};

const TIER_STRIPE: Record<V2EquipTier, string> = {
  1: "bg-zinc-300 dark:bg-zinc-700",
  2: "bg-emerald-400 dark:bg-emerald-600",
  3: "bg-amber-400 dark:bg-amber-500",
  4: "bg-rose-400 dark:bg-rose-500",
  5: "bg-violet-400 dark:bg-violet-500",
};
const TIER_BADGE: Record<V2EquipTier, string> = {
  1: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  2: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  3: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  4: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  5: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
};

function statEntries(stats: V2EquipStats): string[] {
  const out: string[] = [];
  for (const k of V2_EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (!v) continue;
    const sign = v >= 0 ? "+" : "";
    const unit = V2_EQUIP_PERCENT_KEYS.has(k) ? "%" : "";
    out.push(`${V2_EQUIP_BONUS_LABELS[k]} ${sign}${v}${unit}`);
  }
  return out;
}

function buildCountMap(owned: V2EquipmentId[]): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const id of owned) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabKey>("weapon");
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, V2EquipmentId>>
  >({});
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/inventory"),
        fetch("/api/v2/me/equipment"),
      ]);
      if (invRes.ok) {
        const j = (await invRes.json()) as {
          materials?: Partial<Record<V2MaterialId, number>>;
        };
        setMaterials(j.materials ?? {});
      }
      if (equipRes.ok) {
        const j = (await equipRes.json()) as {
          owned?: V2EquipmentId[];
          equipped?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
        };
        setCounts(buildCountMap(j.owned ?? []));
        setEquipped(j.equipped ?? {});
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 슬롯별 보유 장비 id 목록 (count > 0) — T1→T5, concept 정렬.
  const equipmentBySlot = useMemo(() => {
    const groups: Record<V2EquipSlot, V2EquipmentId[]> = {
      weapon: [],
      armor: [],
      accessory: [],
    };
    const items = Object.values(V2_EQUIPMENT).sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.concept !== b.concept) return a.concept.localeCompare(b.concept);
      return a.id.localeCompare(b.id);
    });
    for (const it of items) {
      if ((counts.get(it.id) ?? 0) > 0) {
        groups[it.slot].push(it.id);
      }
    }
    return groups;
  }, [counts]);

  // 보유 중인 재료 — catalog 순서.
  const ownedMaterials = useMemo(
    () =>
      (Object.keys(V2_MATERIALS) as V2MaterialId[])
        .map((id) => ({
          id,
          material: V2_MATERIALS[id],
          count: materials[id] ?? 0,
        }))
        .filter((e) => e.count > 0)
        .sort((a, b) => a.material.name.localeCompare(b.material.name)),
    [materials],
  );

  const equipmentIds: V2EquipmentId[] =
    tab === "material" ? [] : equipmentBySlot[tab];

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <h1 className="text-lg font-bold">인벤토리</h1>
      </header>

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="인벤토리 카테고리"
        size="sm"
      />

      {loading ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : tab === "material" ? (
        <MaterialList materials={ownedMaterials} />
      ) : (
        <EquipmentList
          ids={equipmentIds}
          counts={counts}
          equipped={equipped}
          slot={tab}
        />
      )}
    </main>
  );
}

function MaterialList({
  materials,
}: {
  materials: Array<{
    id: V2MaterialId;
    material: (typeof V2_MATERIALS)[V2MaterialId];
    count: number;
  }>;
}) {
  if (materials.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 재료가 없습니다"
        message="거점에서 던전 사냥을 하면 모입니다."
      />
    );
  }
  return (
    <section>
      <div
        aria-hidden
        className="grid grid-cols-[1fr_auto] gap-x-3 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
      >
        <span>이름</span>
        <span className="text-right">수량</span>
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {materials.map(({ id, material, count }) => (
          <li
            key={id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-2 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {material.name}
              </span>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {material.description}
              </p>
            </div>
            <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              ×{count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EquipmentList({
  ids,
  counts,
  equipped,
  slot,
}: {
  ids: V2EquipmentId[];
  counts: Map<V2EquipmentId, number>;
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  slot: V2EquipSlot;
}) {
  if (ids.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 장비가 없습니다"
        message="상점에서 구매하거나 던전 드랍으로 모입니다."
      />
    );
  }
  const equippedId = equipped[slot] ?? null;
  return (
    <section>
      <div
        aria-hidden
        className="grid grid-cols-[1fr_auto] gap-x-3 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:grid-cols-[1fr_2fr_auto]"
      >
        <span>이름</span>
        <span className="hidden sm:block">옵션</span>
        <span className="text-right">상태</span>
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {ids.map((id) => (
          <EquipmentRow
            key={id}
            id={id}
            count={counts.get(id) ?? 0}
            isEquipped={equippedId === id}
          />
        ))}
      </ul>
    </section>
  );
}

function EquipmentRow({
  id,
  count,
  isEquipped,
}: {
  id: V2EquipmentId;
  count: number;
  isEquipped: boolean;
}) {
  const item = V2_EQUIPMENT[id];
  const stats = statEntries(item.stats);
  const conceptLabel = CONCEPT_LABEL[item.concept] ?? item.concept;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-2 py-2 sm:grid-cols-[1fr_2fr_auto]">
      {/* 좌측 — 티어 stripe + 이름 + 컨셉 + 카운트 */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`h-5 w-1 shrink-0 rounded-sm ${TIER_STRIPE[item.tier]}`}
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {item.name}
            </span>
            <span
              className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold ${TIER_BADGE[item.tier]}`}
            >
              T{item.tier}
            </span>
            <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              ×{count}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {conceptLabel}
          </span>
        </div>
      </div>

      {/* 옵션 — 모바일은 row 아래로 wrap */}
      <div className="col-span-2 flex flex-wrap gap-1 sm:col-span-1 sm:col-start-2">
        {stats.length === 0 ? (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            옵션 없음
          </span>
        ) : (
          stats.map((s) => (
            <span
              key={s}
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {s}
            </span>
          ))
        )}
      </div>

      {/* 우측 — 장착 상태 */}
      <div className="col-start-2 row-start-1 shrink-0 justify-self-end sm:col-start-3">
        {isEquipped ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            장착중
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">—</span>
        )}
      </div>
    </li>
  );
}
