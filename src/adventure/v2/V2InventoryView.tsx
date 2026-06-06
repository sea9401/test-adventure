"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import {
  CheckCircle,
  Circle,
  Diamond,
  HandFist,
  Lock,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  effectiveStats,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// 슬롯별 아이콘/색 — 카드 좌상단 표식.
const SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: Circle, color: "text-violet-500" },
  necklace: { Icon: Diamond, color: "text-pink-500" },
};

// 이름 색 — 유니크만 강조(금색), 나머지는 기본.
function rarityNameClass(item: V2Equipment): string {
  return item.rarity === "unique"
    ? "text-amber-600 dark:text-amber-400"
    : "text-zinc-800 dark:text-zinc-100";
}

// 카드 스탯줄 — 개체 굴림 반영 위력 + (무기만)속성 + 티어.
function cardStatLine(item: V2Equipment, roll?: V2EquipRoll): string {
  const eff = effectiveStats(item, roll);
  const parts = [`위력 ${eff.power}`];
  if (item.slot === "weapon" && item.element && item.element !== "neutral") {
    parts.push(V2_ELEMENT_LABEL[item.element]);
  }
  parts.push(`T${item.tier}`);
  return parts.join(" · ");
}

// v2 인벤토리 — 위쪽 장착 슬롯 + 무기/갑옷/장갑/신발/반지/목걸이/재료 sub-tab.
// 개체(instance) 모델: 같은 종류라도 굴림이 다르면 별도 카드. 행 우측 버튼으로 장착/해제
// (POST /api/v2/me/equipment/equip, iid 기준).

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

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabKey>("weapon");
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  const [loading, setLoading] = useState(true);
  // busy key = 처리 중인 개체 iid 또는 슬롯(해제). null 이면 유휴.
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 클릭 시 뜨는 옵션 카드 팝오버 — null 이면 닫힘. 개체(iid+roll) 단위.
  const [card, setCard] = useState<{
    inst: V2EquipInstance;
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
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        };
        setOwned(j.owned ?? []);
        setEquipped(j.equipped ?? {});
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 setLoading)
    refresh();
  }, [refresh]);

  const applyEquip = useCallback(
    async (slot: V2EquipSlot, iid: string | null, busyKey: string) => {
      setBusy(busyKey);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equipment/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, iid }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          equipped?: Partial<Record<V2EquipSlot, string>>;
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setEquipped(j.equipped ?? {});
        setMsg(iid == null ? "✓ 해제 완료" : "✓ 장착 완료");
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // 슬롯별 보유 개체 — T1→T5, concept, 이름, iid 정렬(안정).
  const ownedBySlot = useMemo(() => {
    const groups: Record<V2EquipSlot, V2EquipInstance[]> = {
      weapon: [],
      armor: [],
      gloves: [],
      boots: [],
      ring: [],
      necklace: [],
    };
    for (const inst of owned) {
      const item = V2_EQUIPMENT[inst.id];
      if (item) groups[item.slot].push(inst);
    }
    for (const slot of Object.keys(groups) as V2EquipSlot[]) {
      groups[slot].sort((a, b) => {
        const ia = V2_EQUIPMENT[a.id];
        const ib = V2_EQUIPMENT[b.id];
        return (
          ia.tier - ib.tier ||
          ia.concept.localeCompare(ib.concept) ||
          ia.name.localeCompare(ib.name, "ko") ||
          a.iid.localeCompare(b.iid)
        );
      });
    }
    return groups;
  }, [owned]);

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

  const tabInstances: V2EquipInstance[] =
    tab === "material" ? [] : ownedBySlot[tab];

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">인벤토리</h1>
      </header>

      {/* 위쪽 — 장착 슬롯 (해제 버튼 인라인) */}
      <Card padding="md">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          장착 중
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {EQUIP_SLOTS.map(({ slot, label, Icon, color }) => {
            const iid = equipped[slot] ?? null;
            const inst = iid ? owned.find((i) => i.iid === iid) : undefined;
            const item = inst ? V2_EQUIPMENT[inst.id] : null;
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
                {inst && item ? (
                  // 장착 아이템 클릭 → 옵션 카드 팝오버.
                  <button
                    type="button"
                    onClick={(e) =>
                      setCard({ inst, anchor: anchorOf(e.currentTarget) })
                    }
                    className="flex flex-col items-center gap-1 rounded transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {slotInner}
                  </button>
                ) : (
                  slotInner
                )}
                {iid ? (
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
        <EquipmentCardGrid
          cards={tabInstances.map((inst) => ({
            inst,
            isEquipped: (equipped[tab as V2EquipSlot] ?? null) === inst.iid,
          }))}
          onOpenCard={(inst, anchor) => setCard({ inst, anchor })}
        />
      )}
      {card && (
        <V2ItemCard
          item={V2_EQUIPMENT[card.inst.id]}
          roll={card.inst.roll}
          anchor={card.anchor}
          onClose={() => setCard(null)}
          equip={{
            isEquipped:
              (equipped[V2_EQUIPMENT[card.inst.id].slot] ?? null) ===
              card.inst.iid,
            busy: busy === card.inst.iid,
            onEquip: () =>
              applyEquip(
                V2_EQUIPMENT[card.inst.id].slot,
                card.inst.iid,
                card.inst.iid,
              ),
            onUnequip: () =>
              applyEquip(V2_EQUIPMENT[card.inst.id].slot, null, card.inst.iid),
          }}
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

export type EquipmentCard = {
  inst: V2EquipInstance;
  isEquipped: boolean;
};

// 보유 장비 2열 카드 그리드 — 개체(instance) 단위. 슬롯 아이콘 + 장착 배지(✓/잠금) +
// 등급색 이름 + 굴림 반영 스탯줄. 카드 탭 → 옵션/장착 팝오버(V2ItemCard).
export function EquipmentCardGrid({
  cards,
  onOpenCard,
}: {
  cards: EquipmentCard[];
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
}) {
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Diamond size={40} weight="duotone" />}
        title="보유한 장비가 없습니다"
        message="상점에서 구매하거나 사냥터 드랍으로 모입니다."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map(({ inst, isEquipped }) => {
        const item = V2_EQUIPMENT[inst.id];
        const { Icon, color } = SLOT_ICON[item.slot];
        return (
          <button
            key={inst.iid}
            type="button"
            onClick={(e) => onOpenCard(inst, anchorOf(e.currentTarget))}
            aria-label={`${item.name} 정보`}
            className={`relative flex flex-col gap-1 rounded-lg border p-3 text-left transition ${
              isEquipped
                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600/70 dark:bg-emerald-950"
                : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            }`}
          >
            <div className="flex items-start justify-between">
              <Icon size={20} weight="duotone" className={color} />
              {isEquipped ? (
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="text-emerald-500"
                />
              ) : (
                <Lock
                  size={13}
                  weight="bold"
                  className="text-zinc-300 dark:text-zinc-600"
                  aria-hidden
                />
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`truncate text-sm font-semibold ${rarityNameClass(item)}`}
              >
                {item.name}
              </span>
              <ItemTypeChip item={item} />
            </div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {cardStatLine(item, inst.roll)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
