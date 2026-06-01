"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Circle,
  Diamond,
  HandFist,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// v2 인벤토리 — 위쪽 장착 슬롯 + 무기/갑옷/장갑/신발/반지/목걸이/재료 sub-tab.
// 행 우측 버튼으로 장착/해제 (POST /api/v2/me/equipment/equip).

type TabKey = V2EquipSlot | "material";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
  { key: "material", label: "재료" },
];

const EQUIP_SLOTS: {
  slot: V2EquipSlot;
  label: string;
  Icon: Icon;
  color: string;
}[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: Circle, color: "text-violet-500" },
  { slot: "necklace", label: "목걸이", Icon: Diamond, color: "text-pink-500" },
];


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
  const [busy, setBusy] = useState<V2EquipmentId | V2EquipSlot | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 클릭 시 뜨는 옵션 카드 팝오버 — null 이면 닫힘.
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

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

  const applyEquip = useCallback(
    async (slot: V2EquipSlot, equipmentId: V2EquipmentId | null, busyKey: V2EquipmentId | V2EquipSlot) => {
      setBusy(busyKey);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equipment/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, equipmentId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          equipped?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setEquipped(j.equipped ?? {});
        if (equipmentId == null) {
          setMsg(`✓ 해제 완료`);
        } else {
          const item = V2_EQUIPMENT[equipmentId];
          setMsg(`✓ ${item.name} 장착`);
        }
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // 슬롯별 보유 장비 id 목록 — T1→T5, concept 정렬.
  const equipmentBySlot = useMemo(() => {
    const groups: Record<V2EquipSlot, V2EquipmentId[]> = {
      weapon: [],
      armor: [],
      gloves: [],
      boots: [],
      ring: [],
      necklace: [],
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

      {/* 위쪽 — 장착 슬롯 (해제 버튼 인라인) */}
      <Card padding="md">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          장착 중
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {EQUIP_SLOTS.map(({ slot, label, Icon, color }) => {
            const id = equipped[slot] ?? null;
            const item = id ? V2_EQUIPMENT[id] : null;
            const slotInner = (
              <>
                <Icon size={18} weight="duotone" className={color} />
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {label}
                </div>
                <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {item?.name ?? "—"}
                </div>
              </>
            );
            return (
              <div
                key={slot}
                className="flex flex-col items-center gap-1 rounded-md bg-zinc-50 px-2 py-2 text-center dark:bg-zinc-900"
              >
                {item ? (
                  // 장착 아이템 클릭 → 옵션 카드 팝오버.
                  <button
                    type="button"
                    onClick={(e) =>
                      setCard({ item, anchor: anchorOf(e.currentTarget) })
                    }
                    className="flex flex-col items-center gap-1 rounded transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {slotInner}
                  </button>
                ) : (
                  slotInner
                )}
                {id ? (
                  <button
                    type="button"
                    onClick={() => applyEquip(slot, null, slot)}
                    disabled={busy !== null}
                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {busy === slot ? "…" : "해제"}
                  </button>
                ) : (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                    비어있음
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="인벤토리 카테고리"
        size="sm"
        variant="highlight"
      />

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}

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
          busy={busy}
          onEquip={(id) => applyEquip(tab as V2EquipSlot, id, id)}
          onUnequip={() => applyEquip(tab as V2EquipSlot, null, tab as V2EquipSlot)}
          onOpenCard={(item, anchor) => setCard({ item, anchor })}
        />
      )}
      {card && (
        <V2ItemCard
          item={card.item}
          anchor={card.anchor}
          onClose={() => setCard(null)}
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
        message="거점 사냥터에서 사냥하면 모입니다."
      />
    );
  }
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {materials.map(({ id, material, count }) => (
          <li
            key={id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5"
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
    </Card>
  );
}

function EquipmentList({
  ids,
  counts,
  equipped,
  slot,
  busy,
  onEquip,
  onUnequip,
  onOpenCard,
}: {
  ids: V2EquipmentId[];
  counts: Map<V2EquipmentId, number>;
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  slot: V2EquipSlot;
  busy: V2EquipmentId | V2EquipSlot | null;
  onEquip: (id: V2EquipmentId) => void;
  onUnequip: () => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  if (ids.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 장비가 없습니다"
        message="상점에서 구매하거나 사냥터 드랍으로 모입니다."
      />
    );
  }
  const equippedId = equipped[slot] ?? null;
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {ids.map((id) => {
          const isEquipped = equippedId === id;
          return (
            <EquipmentRow
              key={id}
              id={id}
              count={counts.get(id) ?? 0}
              isEquipped={isEquipped}
              busy={busy === id || (isEquipped && busy === slot)}
              onEquip={() => onEquip(id)}
              onUnequip={onUnequip}
              onOpenCard={onOpenCard}
            />
          );
        })}
      </ul>
    </Card>
  );
}

function EquipmentRow({
  id,
  count,
  isEquipped,
  busy,
  onEquip,
  onUnequip,
  onOpenCard,
}: {
  id: V2EquipmentId;
  count: number;
  isEquipped: boolean;
  busy: boolean;
  onEquip: () => void;
  onUnequip: () => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2.5">
      {/* 이름 영역 클릭 → 옵션 카드 팝오버 (옵션은 행에 인라인으로 적지 않음) */}
      <button
        type="button"
        onClick={(e) => onOpenCard(item, anchorOf(e.currentTarget))}
        className="flex min-w-0 items-center gap-2 rounded text-left transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {item.name}
          </span>
          <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            ×{count}
          </span>
        </div>
      </button>

      <div className="shrink-0 justify-self-end">
        {isEquipped ? (
          <button
            type="button"
            onClick={onUnequip}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {busy ? "…" : "해제"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onEquip}
            disabled={busy}
            className="rounded-md border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
          >
            {busy ? "…" : "장착"}
          </button>
        )}
      </div>
    </li>
  );
}
