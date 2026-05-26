"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LIST_ROW } from "@/components/ui/listRow";
import { Backpack } from "@phosphor-icons/react";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  v2EquipmentBySlot,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipStats,
} from "@/adventure/data/v2/v2Equipment";

// v2 장비 화면 — 라이브 자산 (ITEMS/dropQuality 등) 분리. 자체 placeholder 풀.
// PR-1: stats 효과 wiring 완료 — derivePlayerCombatV2 가 합산해 atk/def/스탯이 캐릭터
// 패널에 반영된다. 7종은 임시 T1~T2 수치, PR-2 에서 부위×컨셉×티어 그리드로 확장.

function formatStats(stats: V2EquipStats): string {
  const parts: string[] = [];
  for (const k of V2_EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (!v) continue;
    const sign = v >= 0 ? "+" : "";
    parts.push(`${V2_EQUIP_BONUS_LABELS[k]} ${sign}${v}`);
  }
  return parts.join(" · ");
}

const SLOT_LABEL: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "방어구",
  accessory: "장신구",
};
const SLOTS: V2EquipSlot[] = ["weapon", "armor", "accessory"];

type Equipped = Partial<Record<V2EquipSlot, V2EquipmentId>>;
type EquipmentResponse = {
  ok?: boolean;
  owned?: V2EquipmentId[];
  equipped?: Equipped;
};

export function V2EquipmentView({ onBack }: { onBack: () => void }) {
  const [owned, setOwned] = useState<V2EquipmentId[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/equipment");
      const j = (await res.json().catch(() => null)) as EquipmentResponse | null;
      setOwned(j?.owned ?? []);
      setEquipped(j?.equipped ?? {});
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

  const grantDev = useCallback(
    async (equipmentId: V2EquipmentId) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/dev/grant-equipment", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ equipmentId }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ dev grant: ${j?.error ?? `http ${res.status}`}`);
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

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 내 정보로
        </button>
        <h1 className="text-lg font-bold">장비</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          placeholder — 효과 wiring 보류 (장착 UI 검증 수준).
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
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {SLOT_LABEL[slot]}
                  </div>
                  <div className="truncate text-sm font-medium">
                    {item ? item.name : "—"}
                  </div>
                  {item && (
                    <div className="truncate text-xs text-emerald-700 dark:text-emerald-300">
                      {formatStats(item.stats)}
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

      <section className="space-y-2">
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
            message="아래 dev 도구로 테스트 장비를 추가해 보세요."
          />
        ) : (
          <ul className="space-y-1.5">
            {owned.map((id) => {
              const item = V2_EQUIPMENT[id];
              const isEquipped = equipped[item.slot] === id;
              return (
                <li key={id} className={LIST_ROW}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {SLOT_LABEL[item.slot]}
                      </div>
                    </div>
                    {isEquipped ? (
                      <span className="shrink-0 rounded bg-emerald-500 px-2 py-0.5 text-xs text-white">
                        장착 중
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => equip(item.slot, id)}
                        disabled={busy}
                        className="shrink-0 rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                      >
                        장착
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    {formatStats(item.stats)}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.description}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* dev 도구 — staging 한정. owned 가 0 일 때 자주 쓸 거라 카드 separate. */}
      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          dev 도구 — 테스트 장비 추가
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(Object.keys(V2_EQUIPMENT) as V2EquipmentId[]).map((id) => {
            const item = V2_EQUIPMENT[id];
            const has = owned.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => grantDev(id)}
                disabled={busy || has}
                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {has ? `✓ ${item.name}` : item.name}
              </button>
            );
          })}
        </div>
        {/* 슬롯별 풀 한 줄 정리(잘 보이게) */}
        <div className="mt-2 space-y-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
          {SLOTS.map((slot) => (
            <div key={slot}>
              {SLOT_LABEL[slot]}:{" "}
              {v2EquipmentBySlot(slot)
                .map((e) => e.name)
                .join(" · ")}
            </div>
          ))}
        </div>
      </Card>

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </main>
  );
}
