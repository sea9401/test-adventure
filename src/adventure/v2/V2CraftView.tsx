"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Card } from "@/components/ui/Card";
import {
  CONCEPT_LABELS,
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { V2_RECIPES, craftShortfall } from "@/adventure/data/v2/v2Recipes";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

// v2 대장간 — 재료 직접 제작. 재료(+골드) → 완성 장비 (이전 장비 안 먹음).
// 부위별 탭, 각 부위는 티어·컨셉 순 레시피 카드 리스트. 재료/골드 부족은 카드에 표기,
// 충분할 때만 제작 버튼 활성. 제작 시 /api/v2/me/craft 호출.

type SlotTab = "weapon" | "armor" | "gloves" | "boots" | "ring" | "necklace";

const SLOT_TABS: ReadonlyArray<{ key: SlotTab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

type Materials = Partial<Record<V2MaterialId, number>>;

// 부위별 제작 가능 id — 티어·컨셉·id 순. 전 55종이 제작 가능(모두 레시피 보유).
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

function buildCountMap(owned: V2EquipmentId[]): Map<V2EquipmentId, number> {
  const m = new Map<V2EquipmentId, number>();
  for (const id of owned) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function V2CraftView({ onBack }: { onBack: () => void }) {
  const [gold, setGold] = useState<number>(0);
  const [materials, setMaterials] = useState<Materials>({});
  const [counts, setCounts] = useState<Map<V2EquipmentId, number>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
        ? ((await equipRes.json()) as { owned?: V2EquipmentId[] })
        : null;
      const invJ = invRes.ok
        ? ((await invRes.json()) as { materials?: Materials })
        : null;
      setGold(stateJ?.character?.gold ?? 0);
      setCounts(buildCountMap(equipJ?.owned ?? []));
      setMaterials(invJ?.materials ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
            owned?: V2EquipmentId[];
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
      if (j.owned) setCounts(buildCountMap(j.owned));
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }, []);

  const ids = useMemo(() => CRAFT_IDS_BY_SLOT[subTab], [subTab]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">대장간</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            던전에서 모은 재료로 장비를 벼리는 곳. 재료와 골드가 있으면 만든다.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 뒤로
        </button>
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

      <TabBar
        tabs={SLOT_TABS}
        active={subTab}
        onChange={setSubTab}
        ariaLabel="부위"
        size="sm"
        variant="highlight"
      />

      <section>
        <Card padding="none" className="overflow-hidden dark:border-zinc-700">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {ids.map((id) => (
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

// 레시피 카드 한 장 — 이름(팝오버)·티어·위력/무게 / 재료 칩(보유/필요) / 골드 + 제작 버튼.
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
        {/* 좌 — 이름·티어·스탯·재료 */}
        <div className="min-w-0 flex-1">
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
