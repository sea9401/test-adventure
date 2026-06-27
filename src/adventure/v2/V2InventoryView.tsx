"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
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
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { TabBar } from "@/components/ui/TabBar";
import { type RareMapInstance } from "@/adventure/data/v2/rareMaps";
import { type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { SP_FRUIT, type SpFruitTier } from "@/adventure/data/v2/spFruit";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  selectBulkSell,
  type BulkSellOpts,
} from "@/adventure/data/v2/v2EquipVariance";
import {
  V2ItemCard,
  V2ItemCompareCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "./V2ItemCard";
import {
  V2_ITEM_TABS,
  type V2ItemTabKey,
  type SortMode,
} from "./v2ItemListShared";
import { EquipmentTab } from "./inventory/EquipmentTab";
import { MaterialsTab } from "./inventory/MaterialsTab";
import { RareMapsTab } from "./inventory/RareMapsTab";

// 강화/재련 등 다른 화면도 같은 장비 카드 그리드를 쓴다 — 기존 import 경로 유지를 위해
// 분리한 컴포넌트를 여기서 재노출(re-export).
export {
  EquipmentCardGrid,
  type EquipmentCard,
} from "./inventory/EquipmentCardGrid";

// v2 인벤토리 — 위쪽 장착 슬롯 + 무기/갑옷/장갑/신발/반지/목걸이/재료 sub-tab.
// 개체(instance) 모델: 같은 종류라도 굴림이 다르면 별도 카드. 행 우측 버튼으로 장착/해제
// (POST /api/v2/me/equipment/equip, iid 기준).

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

// 한 페이지에 보여줄 아이템 수 — 목록이 길어지면 < 1 2 3 … > 로 나눈다.
const INVENTORY_PAGE_SIZE = 20;

// 일괄 판매 임계값(%) — 한 번 정하면 새로고침 후에도 유지되도록 localStorage 에 저장.
const SELL_PCT_STORAGE_KEY = "v2-inventory-sell-pct";

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<V2ItemTabKey>("weapon");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  // 소모품 탭 — 보유 레어맵. 탭 진입 시 lazy 조회(판수 소모는 서버 권위. 만료 없음).
  const [rareMaps, setRareMaps] = useState<RareMapInstance[] | null>(null);
  useEffect(() => {
    if (tab !== "consumable") return;
    let alive = true;
    fetch("/api/v2/me/rare-maps")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rareMaps?: RareMapInstance[] } | null) => {
        if (!alive) return;
        setRareMaps(j?.ok ? (j.rareMaps ?? []) : []);
      })
      .catch(() => {
        if (alive) setRareMaps([]);
      });
    return () => {
      alive = false;
    };
  }, [tab]);
  // 일괄 판매 품질 임계값(%) — 이 값 이하 품질 장비를 정리. 사용자가 직접 조정(0~100).
  // 기본 40 으로 시작하고, 마운트 후 localStorage 값으로 복원(SSR hydration mismatch 회피).
  const [sellQualityPct, setSellQualityPct] = useState(40);
  const [sellPctHydrated, setSellPctHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELL_PCT_STORAGE_KEY);
      if (raw != null) {
        const n = Math.floor(Number(raw));
        if (Number.isFinite(n)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSellQualityPct(Math.max(0, Math.min(100, n)));
        }
      }
    } catch {}
    setSellPctHydrated(true);
  }, []);
  useEffect(() => {
    if (!sellPctHydrated) return; // 복원 전 초기값(40)으로 덮어쓰는 것 방지.
    try {
      localStorage.setItem(SELL_PCT_STORAGE_KEY, String(sellQualityPct));
    } catch {}
  }, [sellPctHydrated, sellQualityPct]);
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  // SP 열매 등급별 사용 횟수(캐릭터당 캡 표시·캡 도달 시 사용 차단). /me/inventory 동봉.
  const [spFruitUsed, setSpFruitUsed] = useState<Record<SpFruitTier, number>>({
    1: 0,
    2: 0,
    3: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      const [invRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/inventory"),
        fetch("/api/v2/me/equipment"),
      ]);
      if (invRes.ok) {
        const j = (await invRes.json()) as {
          materials?: Partial<Record<V2MaterialId, number>>;
          spFruitUsed?: Partial<Record<SpFruitTier, number>>;
        };
        setMaterials(j.materials ?? {});
        setSpFruitUsed({
          1: j.spFruitUsed?.[1] ?? 0,
          2: j.spFruitUsed?.[2] ?? 0,
          3: j.spFruitUsed?.[3] ?? 0,
        });
      }
      if (equipRes.ok) {
        const j = (await equipRes.json()) as {
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        };
        setOwned(j.owned ?? []);
        setEquipped(j.equipped ?? {});
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 setLoading)
    refresh();
  }, [refresh]);

  // 성공 시 true 반환 — 비교 카드가 실패 시엔 닫히지 않고 에러 메시지를 보여주도록.
  const applyEquip = useCallback(
    async (
      slot: V2EquipSlot,
      iid: string | null,
      busyKey: string,
    ): Promise<boolean> => {
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
          return false;
        }
        setEquipped(j.equipped ?? {});
        setMsg(iid == null ? "✓ 해제 완료" : "✓ 장착 완료");
        return true;
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // SP 열매 사용 — SP 최대치 +1(영구·캐릭터당 캡). 성공 시 인벤 새로고침으로 보유/사용수 갱신.
  const useSpFruit = useCallback(
    async (tier: SpFruitTier) => {
      setBusy(`sp_fruit_${tier}`);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/use-sp-fruit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          spBudget?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "use_cap_reached"
              ? "사용 한도에 도달했습니다 (보유·거래만 가능)"
              : j?.error === "no_fruit"
                ? "보유한 열매가 없습니다"
                : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        await refresh();
        setMsg(
          `✓ ${SP_FRUIT[tier].name} 사용 — SP 최대치 +${SP_FRUIT[tier].spPerUse}` +
            (typeof j.spBudget === "number" ? ` (현재 ${j.spBudget})` : ""),
        );
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  // 즐겨찾기 잠금 토글 — 일괄/실수 판매 보호. 응답의 owned 로 갱신.
  const applyLock = useCallback(
    async (iid: string, locked: boolean) => {
      setBusy(iid);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equipment/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iid, locked }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          owned?: V2EquipInstance[];
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setOwned(j.owned ?? []);
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // 일괄 판매 — 클라에서 selectBulkSell 로 미리보기(개수·골드) 후 확인, 서버가 권위 판매.
  // 장착·잠금 개체만 자동 제외(전 장비 판매 가능 — 유니크 등도 포함). 응답의 owned 로 갱신.
  const applyBulkSell = useCallback(
    async (opts: BulkSellOpts, label: string) => {
      const plan = selectBulkSell(owned, equipped, opts);
      if (plan.count === 0) {
        setMsg(`✗ ${label}: 판매할 장비가 없습니다`);
        return;
      }
      if (
        !window.confirm(
          `${label}\n${plan.count}개 판매 → +${plan.gold.toLocaleString()}골드\n(장착·잠금만 제외) 진행할까요?`,
        )
      ) {
        return;
      }
      setBusy("bulk");
      setMsg(null);
      try {
        const res = await fetch("/api/v2/shop/equipment/sell-bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opts),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          owned?: V2EquipInstance[];
          soldCount?: number;
          soldGold?: number;
        } | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setOwned(j.owned ?? []);
        setMsg(
          `✓ ${j.soldCount ?? 0}개 판매 (+${(j.soldGold ?? 0).toLocaleString()}골드)`,
        );
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [owned, equipped],
  );

  // 착용 중인 장비 id 집합 — 카드 세트 발동/착용 하이라이트용(슬롯→iid → id).
  const equippedItemIds = useMemo(() => {
    const iids = new Set(Object.values(equipped));
    return new Set(owned.filter((i) => iids.has(i.iid)).map((i) => i.id));
  }, [owned, equipped]);

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

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="인벤토리" onBack={onBack} />

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
                <div
                  className={`truncate text-xs font-medium ${
                    item
                      ? powerNameClass(item, inst?.roll)
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
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

      <Card padding="md" className="space-y-3">
        <TabBar
          tabs={V2_ITEM_TABS}
          active={tab}
          onChange={setTab}
          ariaLabel="인벤토리 카테고리"
          size="sm"
          variant="highlight"
          scrollable
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

        {loadError && <LoadErrorBanner onRetry={refresh} />}

        {loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        ) : tab === "consumable" ? (
          <RareMapsTab
            materials={materials}
            spFruitUsed={spFruitUsed}
            busy={busy}
            onUseSpFruit={useSpFruit}
            rareMaps={rareMaps}
          />
        ) : tab === "material" ? (
          <MaterialsTab materials={materials} pageSize={INVENTORY_PAGE_SIZE} />
        ) : (
          <EquipmentTab
            slot={tab}
            instances={ownedBySlot[tab]}
            equippedIid={equipped[tab] ?? null}
            busy={busy}
            sortMode={sortMode}
            setSortMode={setSortMode}
            sellQualityPct={sellQualityPct}
            setSellQualityPct={setSellQualityPct}
            pageSize={INVENTORY_PAGE_SIZE}
            onBulkSell={applyBulkSell}
            onOpenCard={(inst, anchor) => setCard({ inst, anchor })}
          />
        )}
      </Card>
      {card &&
        (() => {
          const candItem = V2_EQUIPMENT[card.inst.id];
          const slot = candItem.slot;
          const equippedIid = equipped[slot] ?? null;
          const isCandidateEquipped = equippedIid === card.inst.iid;
          // 같은 슬롯에 다른 장비가 장착돼 있으면(후보가 미장착) 비교 카드를 띄운다.
          const equippedInst =
            equippedIid && !isCandidateEquipped
              ? owned.find((i) => i.iid === equippedIid)
              : undefined;
          // 토글 후 owned 갱신되므로 라이브 잠금 상태를 owned 에서 조회(card.inst 는 stale 가능).
          const liveLocked =
            owned.find((i) => i.iid === card.inst.iid)?.locked ?? false;
          const lockAction = {
            locked: liveLocked,
            busy: busy === card.inst.iid,
            onToggle: () => applyLock(card.inst.iid, !liveLocked),
          };

          if (equippedInst) {
            const equippedItem = V2_EQUIPMENT[equippedInst.id];
            return (
              <V2ItemCompareCard
                candidate={{
                  item: candItem,
                  roll: card.inst.roll,
                  enhance: card.inst.enhance,
                }}
                equipped={{
                  item: equippedItem,
                  roll: equippedInst.roll,
                  enhance: equippedInst.enhance,
                }}
                onClose={() => setCard(null)}
                equip={{
                  busy: busy === card.inst.iid,
                  onEquip: async () => {
                    // 실패 시 모달 유지(에러 확인) — 성공해야 닫는다.
                    if (await applyEquip(slot, card.inst.iid, card.inst.iid)) {
                      setCard(null);
                    }
                  },
                }}
                unequip={{
                  busy: busy === slot,
                  onUnequip: async () => {
                    if (await applyEquip(slot, null, slot)) setCard(null);
                  },
                }}
                lock={lockAction}
                equippedIds={equippedItemIds}
              />
            );
          }

          // 후보가 이미 장착 중이거나 슬롯이 비었으면 기존 단일 카드.
          return (
            <V2ItemCard
              item={candItem}
              roll={card.inst.roll}
              enhance={card.inst.enhance}
              anchor={card.anchor}
              onClose={() => setCard(null)}
              equippedIds={equippedItemIds}
              equip={{
                isEquipped: isCandidateEquipped,
                busy: busy === card.inst.iid,
                onEquip: () => applyEquip(slot, card.inst.iid, card.inst.iid),
                onUnequip: () => applyEquip(slot, null, card.inst.iid),
              }}
              lock={lockAction}
            />
          );
        })()}
    </main>
  );
}
