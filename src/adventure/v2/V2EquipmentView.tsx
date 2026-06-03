"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LIST_ROW } from "@/components/ui/listRow";
import { Backpack } from "@phosphor-icons/react";
import {
  V2_EQUIPMENT,
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  v2EquipmentByConcept,
  v2EquipStatEntries,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// v2 장비 화면 — 라이브 자산 (ITEMS/dropQuality 등) 분리. 자체 placeholder 풀.
// PR-4a: 35종 (부위 3 × 컨셉 2~3 × 티어 5) — 위력/무게/옵션 모델.
// 보유 목록을 슬롯·컨셉 그룹 + 티어 순으로 정렬해 흩어지지 않게 표시.
// (장비 지급·캐릭터 초기화 등 dev 도구는 /dev/v2-tools 로 일원화.)

function formatStats(item: V2Equipment, roll?: V2EquipRoll): string {
  return v2EquipStatEntries(item, roll).join(" · ");
}

const SLOT_LABEL: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  gloves: "장갑",
  boots: "신발",
  ring: "반지",
  necklace: "목걸이",
};
const SLOTS: V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

type Equipped = Partial<Record<V2EquipSlot, V2EquipmentId>>;
type StatRolls = Partial<Record<V2EquipmentId, V2EquipRoll>>;
type EquipmentResponse = {
  ok?: boolean;
  owned?: V2EquipmentId[];
  equipped?: Equipped;
  statRolls?: StatRolls;
};

export function V2EquipmentView({ onBack }: { onBack: () => void }) {
  const [owned, setOwned] = useState<V2EquipmentId[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [statRolls, setStatRolls] = useState<StatRolls>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const eqRes = await fetch("/api/v2/me/equipment").then((r) =>
        r.ok ? r.json() : null,
      );
      const j = eqRes as EquipmentResponse | null;
      setOwned(j?.owned ?? []);
      setEquipped(j?.equipped ?? {});
      setStatRolls(j?.statRolls ?? {});
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const equip = useCallback(
    async (slot: V2EquipSlot, equipmentId: V2EquipmentId | null) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equipment/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, equipmentId }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // 보유 목록을 슬롯·컨셉·티어 순으로 정렬 — 35종이 무작위로 흩어지지 않게.
  const ownedSet = new Set(owned);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">장비</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          7갈래 컨셉 × T1~T5 = 35종. 효과는 캐릭터 스탯에 자동 반영.
        </p>
      </header>

      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          장착
        </div>
        <ul className="mt-2 space-y-1.5">
          {SLOTS.map((slot) => {
            const id = equipped[slot];
            const item = id ? V2_EQUIPMENT[id] : null;
            return (
              <li
                key={slot}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {SLOT_LABEL[slot]}
                  </div>
                  <div className="truncate text-sm font-medium">
                    {item ? `${item.name} · T${item.tier}` : "—"}
                  </div>
                  {item && (
                    <div className="truncate text-xs text-emerald-700 dark:text-emerald-300">
                      {formatStats(item)}
                    </div>
                  )}
                </div>
                {item && (
                  <button
                    type="button"
                    onClick={() => equip(slot, null)}
                    disabled={busy}
                    className="shrink-0 rounded border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    해제
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <section className="space-y-3">
        <div className="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          보유
        </div>
        {loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        ) : owned.length === 0 ? (
          <EmptyState
            icon={<Backpack size={40} weight="duotone" />}
            title="보유 장비가 없습니다"
            message="사냥과 상점으로 장비를 획득하면 여기에 표시됩니다."
          />
        ) : (
          SLOTS.map((slot) => {
            const conceptsInSlot = SLOT_CONCEPTS[slot];
            const hasAny = conceptsInSlot.some((c) =>
              v2EquipmentByConcept(c).some((it) => ownedSet.has(it.id)),
            );
            if (!hasAny) return null;
            return (
              <div key={slot} className="space-y-1.5">
                <div className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {SLOT_LABEL[slot]}
                </div>
                {conceptsInSlot.map((concept) => {
                  const items = v2EquipmentByConcept(concept).filter((it) =>
                    ownedSet.has(it.id),
                  );
                  if (items.length === 0) return null;
                  return (
                    <div key={concept} className="space-y-1">
                      <div className="px-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {CONCEPT_LABELS[concept]}
                      </div>
                      <ul className="space-y-1">
                        {items.map((item) => {
                          const isEquipped = equipped[item.slot] === item.id;
                          return (
                            <li key={item.id} className={LIST_ROW}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">
                                    {item.name}{" "}
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                      T{item.tier}
                                    </span>
                                  </div>
                                </div>
                                {isEquipped ? (
                                  <span className="shrink-0 rounded bg-emerald-500 px-2 py-0.5 text-xs text-white">
                                    장착 중
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => equip(item.slot, item.id)}
                                    disabled={busy}
                                    className="shrink-0 rounded border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    장착
                                  </button>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                                {formatStats(item, statRolls[item.id])}
                              </div>
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                {item.description}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </section>

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </main>
  );
}
