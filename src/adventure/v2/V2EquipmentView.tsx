"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LIST_ROW } from "@/components/ui/listRow";
import { Backpack } from "@phosphor-icons/react";
import {
  V2_EQUIPMENT,
  CONCEPT_LABELS,
  MAX_DURABILITY,
  SLOT_CONCEPTS,
  durabilityOf,
  isLowDurability,
  repairCostFor,
  v2EquipmentByConcept,
  v2EquipStatEntries,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// v2 장비 화면 — 라이브 자산 (ITEMS/dropQuality 등) 분리. 자체 placeholder 풀.
// PR-4a: 35종 그리드 (부위 3 × 컨셉 2~3 × 티어 5) — 위력/무게/옵션 모델.
// 보유 목록과 dev grant 모두 슬롯·컨셉 그룹 + 티어 순으로 정렬해 35종이 cluttered
// 하지 않게 표시.

function formatStats(item: V2Equipment): string {
  return v2EquipStatEntries(item).join(" · ");
}

// PR-4b — 내구도 바. 0=파손(효과 없음, rose), 낮음(amber), 정상(emerald).
function DurabilityBar({ dur }: { dur: number }) {
  const pct = Math.max(0, Math.min(100, (dur / MAX_DURABILITY) * 100));
  const broken = dur <= 0;
  const low = isLowDurability(dur);
  const barColor = broken
    ? "bg-rose-500"
    : low
      ? "bg-amber-500"
      : "bg-emerald-500";
  const textColor = broken
    ? "text-rose-600 dark:text-rose-400"
    : low
      ? "text-amber-600 dark:text-amber-400"
      : "text-zinc-400 dark:text-zinc-500";
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 text-[10px] tabular-nums ${textColor}`}>
        {broken ? "파손 (효과 없음)" : `${dur}/${MAX_DURABILITY}`}
      </span>
    </div>
  );
}

const SLOT_LABEL: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "방어구",
  accessory: "장신구",
};
const SLOTS: V2EquipSlot[] = ["weapon", "armor", "accessory"];

type Equipped = Partial<Record<V2EquipSlot, V2EquipmentId>>;
type Durability = Partial<Record<V2EquipmentId, number>>;
type EquipmentResponse = {
  ok?: boolean;
  owned?: V2EquipmentId[];
  equipped?: Equipped;
  durability?: Durability;
};

export function V2EquipmentView({ onBack }: { onBack: () => void }) {
  const [owned, setOwned] = useState<V2EquipmentId[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [durability, setDurability] = useState<Durability>({});
  const [autoRepair, setAutoRepair] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [eqRes, prefRes] = await Promise.all([
        fetch("/api/v2/me/equipment").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/preferences").then((r) => (r.ok ? r.json() : null)),
      ]);
      const j = eqRes as EquipmentResponse | null;
      setOwned(j?.owned ?? []);
      setEquipped(j?.equipped ?? {});
      setDurability(j?.durability ?? {});
      setAutoRepair(
        (prefRes as { autoRepair?: boolean } | null)?.autoRepair ?? false,
      );
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

  // PR-4b — 수리(한 개 또는 전체) + 자동수리 토글.
  const repair = useCallback(
    async (equipmentId?: V2EquipmentId) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equipment/repair", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(equipmentId ? { equipmentId } : { all: true }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; spent?: number }
          | null;
        if (!j?.ok) {
          setMsg(`✗ 수리: ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setMsg(
          j.spent
            ? `✓ 수리 완료 (-${j.spent.toLocaleString()}G)`
            : "✓ 수리할 장비가 없습니다",
        );
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const toggleAutoRepair = useCallback(async (next: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoRepair: next }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; autoRepair?: boolean }
        | null;
      if (j?.ok) setAutoRepair(j.autoRepair ?? next);
    } catch {
      // 무시 — 토글 실패 시 상태 유지.
    } finally {
      setBusy(false);
    }
  }, []);

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

  const resetMe = useCallback(async () => {
    if (
      !window.confirm(
        "정말로 본인 캐릭터 데이터를 전부 초기화할까요?\n" +
          "(레벨·EXP·골드·장비·재료·길드 자원 모두 삭제, 되돌릴 수 없음)",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/dev/reset-me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RESET_MY_DATA" }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; deletedKeys?: number }
        | null;
      if (!j?.ok) {
        setMsg(`✗ reset: ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(`✓ 초기화 완료 (${j.deletedKeys ?? 0}개 키 삭제). 새로고침 권장.`);
      await refresh();
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // 보유 목록을 슬롯·컨셉·티어 순으로 정렬 — 35종이 무작위로 흩어지지 않게.
  const ownedSet = new Set(owned);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
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
          7갈래 컨셉 × T1~T5 = 35종. 효과는 캐릭터 스탯에 자동 반영.
        </p>
      </header>

      <Card padding="md">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            장착
          </div>
          <div className="flex items-center gap-3">
            {/* 자동수리 토글 — 전투 전 손상 장비 자동 수리(골드 차감). 옵트인. */}
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={autoRepair}
                disabled={busy}
                onChange={(e) => toggleAutoRepair(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-500"
              />
              자동수리
            </label>
            <button
              type="button"
              onClick={() => repair()}
              disabled={busy}
              className="rounded border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300"
            >
              전체 수리
            </button>
          </div>
        </div>
        <ul className="mt-2 space-y-1.5">
          {SLOTS.map((slot) => {
            const id = equipped[slot];
            const item = id ? V2_EQUIPMENT[id] : null;
            const dur = id ? durabilityOf(durability, id) : MAX_DURABILITY;
            const low = item != null && isLowDurability(dur);
            const cost = id ? repairCostFor(id, dur) : 0;
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
                  {item && <DurabilityBar dur={dur} />}
                </div>
                {item && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => equip(slot, null)}
                      disabled={busy}
                      className="rounded border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      해제
                    </button>
                    {cost > 0 && (
                      <button
                        type="button"
                        onClick={() => id && repair(id)}
                        disabled={busy}
                        className={`rounded border px-3 py-1 text-xs disabled:opacity-50 ${
                          low
                            ? "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300"
                            : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                        }`}
                      >
                        수리 {cost.toLocaleString()}G
                      </button>
                    )}
                  </div>
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
            message="아래 dev 도구로 테스트 장비를 추가해 보세요."
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
                                {formatStats(item)}
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

      {/* dev 도구 — staging 한정. 35종 → 슬롯·컨셉 그룹화 + 티어 순. */}
      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          dev 도구 — 테스트 장비 추가
        </div>
        <div className="mt-3 space-y-3">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <div className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {SLOT_LABEL[slot]}
              </div>
              <div className="mt-1 space-y-1">
                {SLOT_CONCEPTS[slot].map((concept) => {
                  const items = v2EquipmentByConcept(concept);
                  return (
                    <div key={concept} className="flex items-center gap-1.5">
                      <div className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {CONCEPT_LABELS[concept]}
                      </div>
                      <div className="grid flex-1 grid-cols-5 gap-1">
                        {items.map((item) => {
                          const has = ownedSet.has(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => grantDev(item.id)}
                              disabled={busy || has}
                              title={`${item.name} · ${formatStats(item)}`}
                              className="rounded border border-zinc-300 px-1 py-1 text-[10px] hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              {has ? `✓ T${item.tier}` : `T${item.tier}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* 데이터 wipe — 사냥 직접 검증용 staging dev 도구. */}
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={resetMe}
            disabled={busy}
            className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          >
            내 데이터 초기화 (캐릭·장비·재료·길드 자원 wipe)
          </button>
        </div>
      </Card>

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </main>
  );
}
