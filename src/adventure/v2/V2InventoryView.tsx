"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
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
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { TabBar } from "@/components/ui/TabBar";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  effectiveStats,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  rollQualityPct,
  selectBulkSell,
  type BulkSellOpts,
} from "@/adventure/data/v2/v2EquipVariance";
import {
  enhancedPower,
  type V2EnhanceState,
} from "@/adventure/data/v2/v2Enhance";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import {
  V2ItemCard,
  anchorOf,
  powerNameClass,
  rollPctClass,
  type ItemCardAnchor,
} from "./V2ItemCard";
import {
  V2_ITEM_TABS,
  nextSortMode,
  sortModeLabel,
  sortEquipInstances,
  type V2ItemTabKey,
  type SortMode,
} from "./v2ItemListShared";

// 슬롯별 아이콘/색 — 카드 좌상단 표식.
const SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: Circle, color: "text-violet-500" },
  necklace: { Icon: Diamond, color: "text-pink-500" },
};

// 카드 스탯줄 — 개체 굴림 반영 위력 + (무기만)속성 + 슬롯 고유 옵션(치명/회피/MP/HP/속도/
//   치명피해). 티어 숫자 표기는 제거(이름·위력·옵션으로 구분) — 옵션이 슬롯 정체성이라 노출.
function cardStatLine(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
): string {
  const eff = effectiveStats(item, roll);
  const parts = [`위력 ${enhancedPower(eff.power, enhance)}`];
  if (item.slot === "weapon" && item.element && item.element !== "neutral") {
    parts.push(V2_ELEMENT_LABEL[item.element]);
  }
  for (const row of v2EquipStatRows(item, roll)) {
    if (row.label === "위력" || row.label === "무게") continue;
    parts.push(`${row.label} ${row.value}`);
  }
  return parts.join(" · ");
}

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

// 유틸맵 사용 — 종류별 전용 화면으로 이동(지도 iid 동봉, 서버가 소유 재검증).
const UTILITY_MAP_ROUTE: Partial<Record<string, string>> = {
  secret_shop_map: "/hidden/shop",
  rename_map: "/hidden/rename",
  portrait_map: "/hidden/portrait",
};

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<V2ItemTabKey>("weapon");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  // 소모품 탭 — 보유 레어맵. 탭 진입 시 lazy 조회(소모/만료는 서버 권위).
  const [rareMaps, setRareMaps] = useState<RareMapInstance[] | null>(null);
  const [rareMapsNow, setRareMapsNow] = useState(() => Date.now());
  useEffect(() => {
    if (tab !== "consumable") return;
    let alive = true;
    fetch("/api/v2/me/rare-maps")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rareMaps?: RareMapInstance[] } | null) => {
        if (!alive) return;
        setRareMaps(j?.ok ? (j.rareMaps ?? []) : []);
        setRareMapsNow(Date.now());
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
    } catch {
      setLoadError(true);
    }
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

  const tabInstances: V2EquipInstance[] = useMemo(() => {
    if (tab === "material" || tab === "consumable") return [];
    return sortEquipInstances(ownedBySlot[tab], sortMode);
  }, [tab, ownedBySlot, sortMode]);

  // 목록이 길어지면 페이지로 나눈다(한 페이지 20개). 장비 탭은 탭·정렬을 바꾸면 1페이지로 리셋
  //   (resetKey), 재료 탭은 탭 진입 시 리셋.
  const equipPager = usePagination(
    tabInstances,
    INVENTORY_PAGE_SIZE,
    `${tab}:${sortMode}`,
  );
  const materialPager = usePagination(ownedMaterials, INVENTORY_PAGE_SIZE, tab);

  const tabLabel = V2_ITEM_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">인벤토리</h1>
      </HeaderPanel>

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
          <ConsumableList
            maps={rareMaps}
            now={rareMapsNow}
            onUse={(m) => {
              const base = UTILITY_MAP_ROUTE[m.kind];
              if (base) router.push(`${base}?map=${m.iid}`);
            }}
          />
        ) : tab === "material" ? (
          <>
            <MaterialList materials={materialPager.pageItems} />
            <Pagination
              page={materialPager.page}
              pageCount={materialPager.pageCount}
              setPage={materialPager.setPage}
            />
          </>
        ) : (
          <>
            {tabInstances.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* 정리(일괄 판매) — 현재 탭 슬롯, 장착·잠금만 제외(전 장비 판매 가능) */}
                <div className="flex items-center gap-1">
                  <span className="mr-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                    정리
                  </span>
                  {/* 품질 임계값 직접 설정(0~100). 이 값 이하 품질만 일괄 판매. */}
                  <label className="flex items-center gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    품질
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={sellQualityPct}
                      onChange={(e) =>
                        setSellQualityPct(
                          Math.max(
                            0,
                            Math.min(100, Math.floor(Number(e.target.value) || 0)),
                          ),
                        )
                      }
                      aria-label="일괄 판매 품질 임계값(%)"
                      className="w-11 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right tabular-nums text-zinc-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                    %
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      applyBulkSell(
                        { slot: tab as V2EquipSlot, belowPct: sellQualityPct },
                        `${tabLabel} 품질 ${sellQualityPct}% 이하`,
                      )
                    }
                    disabled={busy !== null}
                    className="rounded border border-amber-300 px-2 py-0.5 text-[11px] text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  >
                    이하 판매
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyBulkSell(
                        { slot: tab as V2EquipSlot },
                        `${tabLabel} 미장착 전부`,
                      )
                    }
                    disabled={busy !== null}
                    className="rounded border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    미장착 전부 판매
                  </button>
                </div>
                {/* 정렬 — 단일 버튼, 누를 때마다 순환(기본 → 품질순 → 위력순). */}
                <button
                  type="button"
                  title="누를 때마다 정렬 전환 (기본 → 품질순 → 위력순)"
                  onClick={() => setSortMode((m) => nextSortMode(m))}
                  className="rounded border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  정렬 ⇅ {sortModeLabel(sortMode)}
                </button>
              </div>
            )}
            <EquipmentCardGrid
              cards={equipPager.pageItems.map((inst) => ({
                inst,
                isEquipped: (equipped[tab as V2EquipSlot] ?? null) === inst.iid,
              }))}
              onOpenCard={(inst, anchor) => setCard({ inst, anchor })}
            />
            <Pagination
              page={equipPager.page}
              pageCount={equipPager.pageCount}
              setPage={equipPager.setPage}
            />
          </>
        )}
      </Card>
      {card && (
        <V2ItemCard
          item={V2_EQUIPMENT[card.inst.id]}
          roll={card.inst.roll}
          enhance={card.inst.enhance}
          anchor={card.anchor}
          onClose={() => setCard(null)}
          equippedIds={equippedItemIds}
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
          lock={{
            // 토글 후 owned 갱신되므로 라이브 잠금 상태를 owned 에서 조회(card.inst 는 stale 가능).
            locked:
              owned.find((i) => i.iid === card.inst.iid)?.locked ?? false,
            busy: busy === card.inst.iid,
            onToggle: () =>
              applyLock(
                card.inst.iid,
                !(owned.find((i) => i.iid === card.inst.iid)?.locked ?? false),
              ),
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
        const pct = rollQualityPct(item, inst.roll);
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
            <div className="flex items-start justify-between gap-1">
              <span className="flex items-center gap-1">
                <Icon size={20} weight="duotone" className={color} />
                {inst.locked && (
                  <Lock
                    size={13}
                    weight="fill"
                    className="text-amber-500"
                    aria-label="잠금됨"
                  />
                )}
              </span>
              {isEquipped ? (
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="text-emerald-500"
                />
              ) : pct != null ? (
                <span
                  className={`shrink-0 text-[11px] font-semibold tabular-nums ${rollPctClass(pct)}`}
                  title="품질"
                >
                  {pct}%
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`truncate text-sm font-semibold ${powerNameClass(item, inst.roll)}`}
              >
                {item.name}
                {inst.enhance && inst.enhance.level > 0 ? (
                  <span className="ml-1 text-amber-500">
                    +{inst.enhance.level}
                  </span>
                ) : null}
              </span>
              <ItemTypeChip item={item} />
            </div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {cardStatLine(item, inst.roll, inst.enhance)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// 소모품 탭 — 보유 레어맵 목록. hunt 계열 사용(입장)은 사냥터 목록의 "발견한 지도",
// utility 계열(비밀 상점/개명/화공)은 여기서 "사용". 판매는 거래소 > 팔기 > 소모품.
function ConsumableList({
  maps,
  now,
  onUse,
}: {
  maps: RareMapInstance[] | null;
  now: number;
  onUse?: (m: RareMapInstance) => void;
}) {
  if (maps === null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        불러오는 중…
      </div>
    );
  }
  if (maps.length === 0) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        보유한 소모품이 없습니다. 레어맵은 사냥 중 아주 낮은 확률로
        발견됩니다.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {maps.map((m) => {
        const def = RARE_MAP_KINDS[m.kind];
        const hoursLeft = Math.max(
          0,
          Math.floor((m.expiresAt - now) / 3_600_000),
        );
        const isUtility = def?.category === "utility";
        return (
          <li
            key={m.iid}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                🗺 {def?.name ?? m.kind}
              </span>
              {isUtility ? (
                <button
                  type="button"
                  onClick={() => onUse?.(m)}
                  className="shrink-0 rounded-md border border-sky-700 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
                >
                  사용
                </button>
              ) : (
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  깊이 {m.depth}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {isUtility ? (
                <>
                  {hoursLeft < 1
                    ? "1시간 안에 만료"
                    : `${hoursLeft}시간 후 만료`}
                </>
              ) : (
                <>
                  남은 {m.runsLeft}판 ·{" "}
                  {hoursLeft < 1
                    ? "1시간 안에 만료"
                    : `${hoursLeft}시간 후 만료`}{" "}
                  · 입장은 전투 탭 &gt; 사냥터의 「발견한 지도」
                </>
              )}
            </div>
            {def?.desc && (
              <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {def.desc}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
