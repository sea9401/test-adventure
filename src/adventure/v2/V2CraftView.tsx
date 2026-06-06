"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Card } from "@/components/ui/Card";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  CONCEPT_LABELS,
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_RECIPES,
  craftShortfall,
  salvageYield,
} from "@/adventure/data/v2/v2Recipes";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// v2 대장간 — 제작 / 분해.
//   제작: 재료(+골드) → 완성 장비. 부위별 티어·컨셉 순 레시피 카드. 충분할 때만 제작 버튼 활성.
//   분해: 보유한 비유니크 장비를 재료로 환수(레시피의 ~50%, 골드 없음). 유니크는 분해 불가.
// 모드 토글(제작/분해)은 상점의 구매/판매 패턴. /api/v2/me/craft · /api/v2/me/salvage 호출.

type SlotTab = "weapon" | "armor" | "gloves" | "boots" | "ring" | "necklace";
type Mode = "craft" | "salvage";

const SLOT_TABS: ReadonlyArray<{ key: SlotTab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

const MODE_TABS: ReadonlyArray<{ key: Mode; label: string }> = [
  { key: "craft", label: "제작" },
  { key: "salvage", label: "분해" },
];

type Materials = Partial<Record<V2MaterialId, number>>;

// 부위별 제작 가능 id — 티어·컨셉·id 순. 레시피 보유분만(유니크 제외). 분해 후보도 동일 집합을
// 보유(count>0)로 필터해 재사용 — 분해 가능 = 레시피 있음(비유니크).
const CRAFT_IDS_BY_SLOT: Record<SlotTab, V2EquipmentId[]> = (() => {
  const groups: Record<SlotTab, V2EquipmentId[]> = {
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
    if (!(it.id in V2_RECIPES)) continue; // 유니크 등 비제작 장비는 대장간에 안 뜸
    if (it.slot in groups) groups[it.slot as SlotTab].push(it.id);
  }
  return groups;
})();

// 개체 배열 → id별 보유 카운트(분해 후보 표시용).
function buildCountMap(
  owned: V2EquipInstance[],
): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const inst of owned) m.set(inst.id, (m.get(inst.id) ?? 0) + 1);
  return m;
}

export function V2CraftView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [materials, setMaterials] = useState<Materials>({});
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  // 개체 목록 + 장착 iid — 분해 시 id → 미장착 개체(iid) 해석에 사용.
  const [ownedInsts, setOwnedInsts] = useState<V2EquipInstance[]>([]);
  const [equippedIids, setEquippedIids] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("craft");
  const [subTab, setSubTab] = useState<SlotTab>("weapon");
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, equipRes, invRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        fetch("/api/v2/me/equipment"),
        fetch("/api/v2/me/inventory"),
      ]);
      const stateJ = stateRes.ok
        ? ((await stateRes.json()) as { character?: { gold?: number } })
        : null;
      const equipJ = equipRes.ok
        ? ((await equipRes.json()) as {
            owned?: V2EquipInstance[];
            equipped?: Record<string, string>;
          })
        : null;
      const invJ = invRes.ok
        ? ((await invRes.json()) as { materials?: Materials })
        : null;
      setGold(stateJ?.character?.gold ?? 0);
      const insts = equipJ?.owned ?? [];
      setOwnedInsts(insts);
      setCounts(buildCountMap(insts));
      setEquippedIids(new Set(Object.values(equipJ?.equipped ?? {})));
      setMaterials(invJ?.materials ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onModeChange = useCallback((m: Mode) => {
    setMode(m);
    setMsg(null);
    setCard(null);
  }, []);

  const craft = useCallback(async (id: V2EquipmentId) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            gold?: number;
            materials?: Materials;
            owned?: V2EquipInstance[];
          }
        | null;
      if (!j?.ok) {
        setMsg(
          j?.error === "insufficient"
            ? "✗ 재료나 골드가 부족합니다"
            : `✗ ${j?.error ?? `http ${res.status}`}`,
        );
        return;
      }
      const item = V2_EQUIPMENT[id];
      setMsg(`✓ ${item.name} 제작`);
      if (typeof j.gold === "number") setGold(j.gold);
      if (j.materials) setMaterials(j.materials);
      if (j.owned) {
        setOwnedInsts(j.owned);
        setCounts(buildCountMap(j.owned));
      }
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  // 분해는 개체(iid) 단위 — id 로 누른 카드는 그 종류의 미장착 개체 1개(없으면 아무거나)를 푼다.
  const salvage = useCallback(
    async (id: V2EquipmentId) => {
      const inst =
        ownedInsts.find((i) => i.id === id && !equippedIids.has(i.iid)) ??
        ownedInsts.find((i) => i.id === id);
      if (!inst) {
        setMsg("✗ 분해할 개체가 없습니다");
        return;
      }
      setBusyId(id);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/salvage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iid: inst.iid }),
        });
        const j = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              materials?: Materials;
              owned?: V2EquipInstance[];
            }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        const item = V2_EQUIPMENT[id];
        setMsg(`✓ ${item.name} 분해 — 재료 환수`);
        if (j.materials) setMaterials(j.materials);
        if (j.owned) {
          setOwnedInsts(j.owned);
          setCounts(buildCountMap(j.owned));
        }
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [ownedInsts, equippedIids],
  );

  const craftIds = useMemo(() => CRAFT_IDS_BY_SLOT[subTab], [subTab]);
  // 분해 후보 — 그 부위의 레시피-보유 장비 중 실제 보유(count>0). 유니크는 CRAFT_IDS 에서 이미 제외.
  const salvageIds = useMemo(
    () => CRAFT_IDS_BY_SLOT[subTab].filter((id) => (counts.get(id) ?? 0) > 0),
    [subTab, counts],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">대장간</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            던전 재료로 장비를 만들거나, 안 쓰는 장비를 재료로 되돌리는 곳.
          </p>
        </div>
        <BackButton onClick={onBack} />
      </header>
      <div className="flex items-center justify-end gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
        <Coins size={16} weight="fill" className="text-yellow-500" />
        <span className="font-semibold tabular-nums">
          {gold.toLocaleString()}G
        </span>
      </div>
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

      {/* 상위 탭 — 제작 / 분해 */}
      <TabBar
        tabs={MODE_TABS}
        active={mode}
        onChange={onModeChange}
        ariaLabel="제작 / 분해"
        size="sm"
        variant="highlight"
      />

      {/* 하위 탭 — 부위 */}
      <TabBar
        tabs={SLOT_TABS}
        active={subTab}
        onChange={setSubTab}
        ariaLabel="부위"
        size="sm"
        variant="highlight"
      />

      <section>
        {mode === "craft" ? (
          <Card padding="none" className="overflow-hidden dark:border-zinc-700">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {craftIds.map((id) => (
                <RecipeRow
                  key={id}
                  id={id}
                  gold={gold}
                  materials={materials}
                  ownedCount={counts.get(id) ?? 0}
                  busy={busyId === id}
                  onCraft={craft}
                  onOpenCard={(item, anchor) => setCard({ item, anchor })}
                />
              ))}
            </ul>
          </Card>
        ) : salvageIds.length === 0 ? (
          <EmptyHint text="분해할 장비가 없습니다. 던전·제작으로 모아보세요. (유니크는 분해 불가)" />
        ) : (
          <Card padding="none" className="overflow-hidden dark:border-zinc-700">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {salvageIds.map((id) => (
                <SalvageRow
                  key={id}
                  id={id}
                  ownedCount={counts.get(id) ?? 0}
                  busy={busyId === id}
                  onSalvage={salvage}
                  onOpenCard={(item, anchor) => setCard({ item, anchor })}
                />
              ))}
            </ul>
          </Card>
        )}
      </section>
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
      {text}
    </div>
  );
}

// 이름(팝오버)·티어/컨셉·위력/무게 헤더 — 제작·분해 행이 공유.
function ItemHead({
  item,
  ownedCount,
  onOpenCard,
}: {
  item: V2Equipment;
  ownedCount: number;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={(e) => onOpenCard(item, anchorOf(e.currentTarget))}
        className="min-w-0 rounded text-left transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
      >
        <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {item.name}
        </span>
      </button>
      <ItemTypeChip item={item} />
      <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-px text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        T{item.tier} · {CONCEPT_LABELS[item.concept]}
      </span>
      {ownedCount > 0 && (
        <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
          보유 ×{ownedCount}
        </span>
      )}
      <span className="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
        위력 {item.power} / 무게 {item.weight}
      </span>
    </div>
  );
}

// 레시피 카드 한 장 — 헤더 / 재료 칩(보유/필요) / 골드 + 제작 버튼.
function RecipeRow({
  id,
  gold,
  materials,
  ownedCount,
  busy,
  onCraft,
  onOpenCard,
}: {
  id: V2EquipmentId;
  gold: number;
  materials: Materials;
  ownedCount: number;
  busy: boolean;
  onCraft: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const recipe = V2_RECIPES[id];
  // 비제작(유니크) — CRAFT_IDS 에서 이미 제외되지만 타입·방어상 가드.
  if (!recipe) return null;
  const shortfall = craftShortfall(recipe, materials, gold);
  const goldShort = gold < recipe.gold;

  return (
    <li className="px-3 py-3 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        {/* 좌 — 헤더 + 재료 */}
        <div className="min-w-0 flex-1">
          <ItemHead item={item} ownedCount={ownedCount} onOpenCard={onOpenCard} />
          {/* 재료 칩 — 보유/필요. 부족하면 rose. */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recipe.ingredients.map((ing) => {
              const have = materials[ing.id] ?? 0;
              const enough = have >= ing.count;
              return (
                <span
                  key={ing.id}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                    enough
                      ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      : "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300"
                  }`}
                >
                  <span className="truncate">{V2_MATERIALS[ing.id].name}</span>
                  <span className="shrink-0 tabular-nums font-semibold">
                    {have}/{ing.count}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* 우 — 골드 + 제작 버튼 */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-xs tabular-nums ${
              goldShort
                ? "text-rose-600 dark:text-rose-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <Coins size={12} weight="fill" className="text-yellow-500" />
            {recipe.gold.toLocaleString()}G
          </span>
          <button
            type="button"
            onClick={() => onCraft(id)}
            disabled={busy || !shortfall.ok}
            title={`재료와 ${recipe.gold.toLocaleString()} G 로 제작`}
            className="inline-flex h-7 min-w-[3.5rem] items-center justify-center whitespace-nowrap rounded-md border border-amber-600 bg-amber-600 px-2.5 py-1 text-xs font-medium leading-none text-white transition disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 hover:bg-amber-700"
          >
            {busy ? "…" : "제작"}
          </button>
        </div>
      </div>
    </li>
  );
}

// 분해 카드 한 장 — 헤더 / 환수 재료 칩 + 분해 버튼. 보유분만 표시(호출부 필터).
function SalvageRow({
  id,
  ownedCount,
  busy,
  onSalvage,
  onOpenCard,
}: {
  id: V2EquipmentId;
  ownedCount: number;
  busy: boolean;
  onSalvage: (id: V2EquipmentId) => void;
  onOpenCard: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const recipe = V2_RECIPES[id];
  if (!recipe) return null; // 유니크 등 비분해 — 방어(호출부가 이미 제외)
  const gained = Object.entries(salvageYield(recipe)) as Array<
    [V2MaterialId, number]
  >;

  return (
    <li className="px-3 py-3 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ItemHead item={item} ownedCount={ownedCount} onOpenCard={onOpenCard} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              환수
            </span>
            {gained.map(([mid, n]) => (
              <span
                key={mid}
                className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <span className="truncate">{V2_MATERIALS[mid].name}</span>
                <span className="shrink-0 tabular-nums font-semibold">×{n}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSalvage(id)}
            disabled={busy}
            title="분해해 재료로 환수 (장비 1개 소모)"
            className="inline-flex h-7 min-w-[3.5rem] items-center justify-center whitespace-nowrap rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium leading-none text-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {busy ? "…" : "분해"}
          </button>
        </div>
      </div>
    </li>
  );
}
