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
  V2_EQUIP_PERCENT_KEYS,
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  v2EquipmentByConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipStats,
} from "@/adventure/data/v2/v2Equipment";

// v2 장비 화면 — 라이브 자산 (ITEMS/dropQuality 등) 분리. 자체 placeholder 풀.
// PR-2: 35종 그리드 (부위 3 × 컨셉 2~3 × 티어 5) + crit/mp/eva 추가 파생.
// 보유 목록과 dev grant 모두 슬롯·컨셉 그룹 + 티어 순으로 정렬해 35종이 cluttered
// 하지 않게 표시.

function formatStats(stats: V2EquipStats): string {
  const parts: string[] = [];
  for (const k of V2_EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (!v) continue;
    const sign = v >= 0 ? "+" : "";
    const unit = V2_EQUIP_PERCENT_KEYS.has(k) ? "%" : "";
    parts.push(`${V2_EQUIP_BONUS_LABELS[k]} ${sign}${v}${unit}`);
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
                    {item ? `${item.name} · T${item.tier}` : "—"}
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
                                {formatStats(item.stats)}
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
                              title={`${item.name} · ${formatStats(item.stats)}`}
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
            className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
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
