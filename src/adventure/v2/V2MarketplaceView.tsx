"use client";

import { useCallback, useEffect, useState } from "react";
import { Storefront } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import {
  V2_EQUIPMENT,
  effectiveStats,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  V2_ITEM_TABS,
  nextSortMode,
  sortModeLabel,
  sortEquipInstances,
  type V2ItemTabKey,
  type SortMode,
} from "./v2ItemListShared";

// v2 거래소 — 장비 개체 + 재료 거래(고정가). 백엔드 /api/v2/marketplace (list/buy/cancel/browse).
//   판매세는 서버 권위 — 여기 0.05 는 순수령 미리보기용(표시 advisory).
const TAX_RATE_DISPLAY = 0.05;
const netPreview = (price: number) => Math.floor(price * (1 - TAX_RATE_DISPLAY));

// 시세 집계(/api/v2/marketplace/prices) — itemId 별 최근 판매 통계.
type PriceStat = { n: number; avg: number; min: number; max: number };

// 장비 스탯 한 줄(개체 굴림 반영) — 위력 + 슬롯 옵션. V2InventoryView 의 cardStatLine 과 동형
//   (무기 element 는 폐지 정책으로 항상 neutral → 표기 생략). 구매자가 무엇을 사는지 보이게.
function equipStatLine(item: V2Equipment, roll?: V2EquipRoll): string {
  const eff = effectiveStats(item, roll);
  const parts = [`위력 ${eff.power}`, `무게 ${eff.weight}`];
  for (const row of v2EquipStatRows(item, roll)) {
    if (row.label === "위력" || row.label === "무게") continue;
    parts.push(`${row.label} ${row.value}`);
  }
  return parts.join(" · ");
}

// 장비 매물/개체의 굴림% + 스탯줄 — itemId(카탈로그) + roll(개체 편차).
function equipDetail(itemId: string, roll: V2EquipRoll | undefined) {
  const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
  if (!item) return null;
  return { pct: rollQualityPct(item, roll), line: equipStatLine(item, roll) };
}

type Listing = {
  id: number;
  sellerId: string;
  sellerName: string;
  kind: "equip" | "material";
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  createdAt: string;
};

type Tab = "browse" | "mine" | "sell";

// 판매 탭 한 페이지에 보여줄 아이템 수 — 인벤토리와 동일.
const SELL_PAGE_SIZE = 20;

// 서버 에러 코드 → 사용자 안내.
const ERR_LABEL: Record<string, string> = {
  slot_full: "활성 매물이 가득 찼어요 (최대 10개).",
  not_owned: "보유하지 않은 장비예요.",
  not_tradable: "거래할 수 없는 품목이에요.",
  locked: "잠긴 장비는 등록할 수 없어요.",
  equipped: "장착 중인 장비는 등록할 수 없어요.",
  insufficient_material: "재료 수량이 부족해요.",
  insufficient_gold: "골드가 부족해요.",
  own_listing: "내 매물은 구매할 수 없어요.",
  not_available: "이미 팔리거나 취소된 매물이에요.",
  not_found: "매물을 찾을 수 없어요.",
  not_active: "이미 종료된 매물이에요.",
  not_owner: "내 매물이 아니에요.",
};

export function V2MarketplaceView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("browse");
  // 판매 탭 — 인벤토리와 동일하게 슬롯 서브탭 + 정렬 + 페이지네이션.
  const [sellTab, setSellTab] = useState<V2ItemTabKey>("weapon");
  const [sellSort, setSellSort] = useState<SortMode>("default");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [mine, setMine] = useState<Listing[] | null>(null);
  // 팔기 — 내 인벤(미장착·미잠금 장비 + 재료).
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<V2EquipSlot, string>>>({});
  const [materials, setMaterials] = useState<Partial<Record<V2MaterialId, number>>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  // 둘러보기 — 구매 확인 모달 + 정렬/필터/검색(클라이언트측, 반환된 매물 위).
  const [confirmBuy, setConfirmBuy] = useState<Listing | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "equip" | "material">("all");
  const [slotFilter, setSlotFilter] = useState<"all" | V2EquipSlot>("all");
  const [sort, setSort] = useState<"new" | "price_asc" | "price_desc" | "roll_desc">("new");
  // 시세 — itemId → 최근 거래 집계(건수·평균·최저·최고). 가격 판단 참고용.
  const [priceRef, setPriceRef] = useState<Record<string, PriceStat>>({});
  const [ttlDays, setTtlDays] = useState<number | null>(null); // 매물 만료 일수(서버 다이얼).
  // 아이템 옵션 카드(클릭 시 뜨는 팝오버) — 장비만(재료는 옵션 없음). V2ItemCard 재사용(읽기전용).
  const [card, setCard] = useState<{
    item: V2Equipment;
    roll?: V2EquipRoll;
    anchor: ItemCardAnchor;
  } | null>(null);

  const loadBrowse = useCallback(async (mineOnly: boolean) => {
    const res = await fetch(`/api/v2/marketplace/browse${mineOnly ? "?mine=1" : ""}`);
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      viewerId?: string;
      viewerGold?: number;
      ttlDays?: number;
      listings?: Listing[];
    } | null;
    if (!res.ok || !j?.ok) throw new Error(`목록 로드 실패 (${res.status})`);
    if (j.viewerId) setViewerId(j.viewerId);
    if (typeof j.viewerGold === "number") setGold(j.viewerGold);
    if (typeof j.ttlDays === "number") setTtlDays(j.ttlDays);
    if (mineOnly) setMine(j.listings ?? []);
    else setListings(j.listings ?? []);
  }, []);

  const loadInventory = useCallback(async () => {
    const [eq, inv] = await Promise.all([
      fetch("/api/v2/me/equipment"),
      fetch("/api/v2/me/inventory"),
    ]);
    if (eq.ok) {
      const j = (await eq.json()) as {
        owned?: V2EquipInstance[];
        equipped?: Partial<Record<V2EquipSlot, string>>;
      };
      setOwned(j.owned ?? []);
      setEquipped(j.equipped ?? {});
    }
    if (inv.ok) {
      const j = (await inv.json()) as {
        materials?: Partial<Record<V2MaterialId, number>>;
      };
      setMaterials(j.materials ?? {});
    }
  }, []);

  const loadPrices = useCallback(async () => {
    const res = await fetch("/api/v2/marketplace/prices");
    if (!res.ok) return;
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      prices?: Record<string, PriceStat>;
    } | null;
    if (j?.ok && j.prices) setPriceRef(j.prices);
  }, []);

  // 탭 전환 시 해당 데이터 로드. 둘러보기·팔기는 시세도 함께(가격 판단 참고).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 전환 시 이전 에러 클리어
    setError(null);
    if (tab === "browse") {
      void loadBrowse(false).catch((e) => setError(String(e.message ?? e)));
      void loadPrices();
    } else if (tab === "mine") {
      void loadBrowse(true).catch((e) => setError(String(e.message ?? e)));
    } else {
      void loadInventory().catch(() => setError("인벤토리 로드 실패"));
      void loadPrices();
    }
  }, [tab, loadBrowse, loadInventory, loadPrices]);

  const act = useCallback(
    async (url: string, body: Record<string, unknown>, okMsg: string, after: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !j?.ok) {
          setError(ERR_LABEL[j?.error ?? ""] ?? j?.error ?? `실패 (${res.status})`);
          return;
        }
        setMsg(okMsg);
        await after();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const buy = (l: Listing) =>
    act("/api/v2/marketplace/buy", { listingId: l.id }, `✓ ${l.itemName} 구매 완료`, () => loadBrowse(false));
  const cancel = (l: Listing) =>
    act("/api/v2/marketplace/cancel", { listingId: l.id }, "✓ 매물 취소 — 아이템 반환", () => loadBrowse(true));

  const listEquip = (inst: V2EquipInstance) => {
    const price = Number(prices[inst.iid]);
    if (!Number.isInteger(price) || price < 1) {
      setError("가격은 1 이상 정수로 입력하세요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      { kind: "equip", iid: inst.iid, price },
      `✓ ${V2_EQUIPMENT[inst.id]?.name ?? inst.id} 등록`,
      loadInventory,
    );
  };
  const listMaterial = (matId: V2MaterialId) => {
    const price = Number(prices[matId]);
    const qty = Number(qtys[matId] ?? "1");
    if (!Number.isInteger(price) || price < 1) {
      setError("가격은 1 이상 정수로 입력하세요.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError("수량은 1 이상 정수로 입력하세요.");
      return;
    }
    return act(
      "/api/v2/marketplace/list",
      { kind: "material", itemId: matId, quantity: qty, price },
      `✓ ${V2_MATERIALS[matId]?.name ?? matId} ${qty}개 등록`,
      loadInventory,
    );
  };

  const equippedIids = new Set(Object.values(equipped));
  const sellableEquip = owned.filter((i) => !i.locked && !equippedIids.has(i.iid));
  const sellableMats = (Object.keys(materials) as V2MaterialId[]).filter(
    (id) => (materials[id] ?? 0) > 0,
  );
  // 판매 탭(슬롯)에 해당하는 장비만 + 정렬. 재료 탭이면 빈 목록.
  const sellTabEquip =
    sellTab === "material"
      ? []
      : sortEquipInstances(
          sellableEquip.filter((i) => V2_EQUIPMENT[i.id]?.slot === sellTab),
          sellSort,
        );
  // 한 페이지 20개. 탭/정렬 바뀌면 1페이지로(resetKey).
  const sellEquipPager = usePagination(
    sellTabEquip,
    SELL_PAGE_SIZE,
    `${sellTab}:${sellSort}`,
  );
  const sellMatPager = usePagination(sellableMats, SELL_PAGE_SIZE, sellTab);

  // 둘러보기 표시 매물 — 클라이언트측 필터(종류/슬롯/검색) + 정렬. 반환된 활성 매물 위에서만.
  const slotOf = (l: Listing): V2EquipSlot | null =>
    l.kind === "equip" ? (V2_EQUIPMENT[l.itemId as keyof typeof V2_EQUIPMENT]?.slot ?? null) : null;
  const rollPctOfListing = (l: Listing): number =>
    l.kind === "equip"
      ? (equipDetail(l.itemId, (l.instancePayload as V2EquipRoll | null) ?? undefined)?.pct ?? -1)
      : -1;
  const q = search.trim().toLowerCase();
  const displayedListings = (listings ?? [])
    .filter((l) => kindFilter === "all" || l.kind === kindFilter)
    .filter((l) => slotFilter === "all" || slotOf(l) === slotFilter)
    .filter((l) => !q || l.itemName.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      if (sort === "price_asc") return a.price - b.price;
      if (sort === "price_desc") return b.price - a.price;
      if (sort === "roll_desc") return rollPctOfListing(b) - rollPctOfListing(a);
      return 0; // new — 서버 최신순 유지
    });

  // 구매 확인 모달에서 확정.
  const confirmedBuy = () => {
    const l = confirmBuy;
    if (!l) return;
    setConfirmBuy(null);
    void buy(l);
  };

  // 아이템 클릭 → 옵션 카드(장비만). itemId 카탈로그 조회 후 클릭 위치에 앵커.
  const openCardFor = (
    itemId: string,
    roll: V2EquipRoll | undefined,
    el: HTMLElement,
  ) => {
    const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
    if (item) setCard({ item, roll, anchor: anchorOf(el) });
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <BackButton onClick={onBack} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">거래소</h1>
          {gold !== null && (
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              보유 {gold.toLocaleString()}골드
            </span>
          )}
        </div>
      </header>

      <div className="flex gap-1.5">
        {([
          ["browse", "둘러보기"],
          ["mine", "내 매물"],
          ["sell", "팔기"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === k
                ? "bg-sky-600 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <div className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</div>}
      {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}

      {tab === "browse" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              placeholder="이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
            <SelectControl
              value={kindFilter}
              onChange={(v) => setKindFilter(v as typeof kindFilter)}
              options={[
                ["all", "전체 종류"],
                ["equip", "장비"],
                ["material", "재료"],
              ]}
            />
            <SelectControl
              value={slotFilter}
              onChange={(v) => setSlotFilter(v as typeof slotFilter)}
              options={[
                ["all", "전체 부위"],
                ["weapon", "무기"],
                ["armor", "갑옷"],
                ["gloves", "장갑"],
                ["boots", "신발"],
                ["ring", "반지"],
                ["necklace", "목걸이"],
              ]}
            />
            <SelectControl
              value={sort}
              onChange={(v) => setSort(v as typeof sort)}
              options={[
                ["new", "최신순"],
                ["price_asc", "가격↑"],
                ["price_desc", "가격↓"],
                ["roll_desc", "품질%↓"],
              ]}
            />
          </div>
          <ListingList
            rows={listings === null ? null : displayedListings}
            emptyText={listings && listings.length > 0 ? "조건에 맞는 매물이 없어요." : "등록된 매물이 없어요."}
            action={(l) =>
              l.sellerId === viewerId ? (
                <span className="shrink-0 text-[11px] text-zinc-400">내 매물</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmBuy(l)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  구매
                </button>
              )
            }
            priceRef={priceRef}
            onOpenCard={openCardFor}
          />
        </>
      )}

      {tab === "mine" && (
        <ListingList
          rows={mine}
          emptyText="등록한 매물이 없어요."
          priceRef={priceRef}
          expiryDays={ttlDays ?? undefined}
          onOpenCard={openCardFor}
          action={(l) => (
            <button
              type="button"
              onClick={() => cancel(l)}
              disabled={busy}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              취소
            </button>
          )}
        />
      )}

      {tab === "sell" && (
        <div className="space-y-3">
          {/* 슬롯 서브탭 — 인벤토리와 동일 구성 */}
          <TabBar
            tabs={V2_ITEM_TABS}
            active={sellTab}
            onChange={setSellTab}
            ariaLabel="판매 슬롯"
            size="sm"
            scrollable
          />

          {sellTab === "material" ? (
            sellableMats.length === 0 ? (
              <Card padding="sm">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  팔 수 있는 재료가 없어요.
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {sellMatPager.pageItems.map((matId) => {
                  const have = materials[matId] ?? 0;
                  return (
                    <Card key={matId} padding="sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {V2_MATERIALS[matId]?.name ?? matId}
                          <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">보유 {have}</span>
                          <span className="ml-1.5">
                            <PriceRefLine stat={priceRef[matId]} />
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={have}
                            placeholder="수량"
                            value={qtys[matId] ?? ""}
                            onChange={(e) => setQtys((q) => ({ ...q, [matId]: e.target.value }))}
                            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          />
                          <PriceInput
                            value={prices[matId] ?? ""}
                            onChange={(v) => setPrices((p) => ({ ...p, [matId]: v }))}
                          />
                          <button
                            type="button"
                            onClick={() => listMaterial(matId)}
                            disabled={busy}
                            className="rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            등록
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                <Pagination
                  page={sellMatPager.page}
                  pageCount={sellMatPager.pageCount}
                  setPage={sellMatPager.setPage}
                />
              </div>
            )
          ) : sellTabEquip.length === 0 ? (
            <Card padding="sm">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                팔 수 있는 장비가 없어요. (장착·잠금 장비는 제외)
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  title="누를 때마다 정렬 전환 (기본 → 품질순 → 위력순)"
                  onClick={() => setSellSort((m) => nextSortMode(m))}
                  className="rounded border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  정렬 ⇅ {sortModeLabel(sellSort)}
                </button>
              </div>
              {sellEquipPager.pageItems.map((inst) => {
                const detail = equipDetail(inst.id, inst.roll);
                const price = Number(prices[inst.iid]);
                return (
                  <Card key={inst.iid} padding="sm">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => openCardFor(inst.id, inst.roll, e.currentTarget)}
                        className="group min-w-0 text-left"
                      >
                        <div>
                          <span className="text-sm font-medium group-hover:underline group-focus-visible:underline">{V2_EQUIPMENT[inst.id]?.name ?? inst.id}</span>
                          {detail?.pct != null && (
                            <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">품질 {detail.pct}%</span>
                          )}
                        </div>
                        {detail && (
                          <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
                            {detail.line}
                          </div>
                        )}
                        <div className="mt-0.5">
                          <PriceRefLine stat={priceRef[inst.id]} />
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <PriceInput
                          value={prices[inst.iid] ?? ""}
                          onChange={(v) => setPrices((p) => ({ ...p, [inst.iid]: v }))}
                        />
                        <button
                          type="button"
                          onClick={() => listEquip(inst)}
                          disabled={busy}
                          className="rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          등록
                        </button>
                      </div>
                    </div>
                    {Number.isInteger(price) && price >= 1 && (
                      <div className="mt-1 text-right text-[11px] text-zinc-400">
                        판매 시 수령 {netPreview(price).toLocaleString()}골드
                      </div>
                    )}
                  </Card>
                );
              })}
              <Pagination
                page={sellEquipPager.page}
                pageCount={sellEquipPager.pageCount}
                setPage={sellEquipPager.setPage}
              />
            </div>
          )}
        </div>
      )}

      {confirmBuy && (
        <BuyConfirm
          listing={confirmBuy}
          gold={gold}
          busy={busy}
          onConfirm={confirmedBuy}
          onCancel={() => setConfirmBuy(null)}
        />
      )}

      {card && (
        <V2ItemCard
          item={card.item}
          roll={card.roll}
          anchor={card.anchor}
          onClose={() => setCard(null)}
        />
      )}
    </main>
  );
}

// 구매 확인 모달 — 골드가 HP 회복 통화라 오클릭 방지. 잔액 부족이면 확정 비활성.
function BuyConfirm({
  listing,
  gold,
  busy,
  onConfirm,
  onCancel,
}: {
  listing: Listing;
  gold: number | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const detail =
    listing.kind === "equip"
      ? equipDetail(listing.itemId, (listing.instancePayload as V2EquipRoll | null) ?? undefined)
      : null;
  const enough = gold === null || gold >= listing.price;
  const after = gold === null ? null : gold - listing.price;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">구매 확인</h2>
        <div className="mt-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{listing.itemName}</span>
            {listing.kind === "material" && listing.quantity > 1 && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{listing.quantity}</span>
            )}
            {detail?.pct != null && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">품질 {detail.pct}%</span>
            )}
          </div>
          {detail && (
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">{detail.line}</div>
          )}
        </div>
        <div className="mt-3 space-y-0.5 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">가격</span>
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {listing.price.toLocaleString()}골드
            </span>
          </div>
          {gold !== null && (
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>구매 후 골드</span>
              <span className={enough ? "" : "text-rose-600 dark:text-rose-400"}>
                {gold.toLocaleString()} → {(after ?? 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {!enough && (
          <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">골드가 부족해요.</div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !enough}
            className="flex-1 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            구매
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// 셀렉트 컨트롤 — 둘러보기 필터/정렬.
function SelectControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

// 시세 한 줄 — 최근 거래가 참고. 기록 없으면 표시 안 함.
function PriceRefLine({ stat }: { stat?: PriceStat }) {
  if (!stat || stat.n <= 0) return null;
  const range =
    stat.min === stat.max
      ? ""
      : ` · ${stat.min.toLocaleString()}~${stat.max.toLocaleString()}`;
  return (
    <span className="text-[11px] text-sky-600 dark:text-sky-400">
      시세 평균 {stat.avg.toLocaleString()}골드 ({stat.n}건{range})
    </span>
  );
}

function PriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      min={1}
      placeholder="가격"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}

// 등록 후 경과 → 만료까지 남은 일수(올림). expiryDays(TTL) 없으면 null.
function expiryLabel(createdAt: string, ttlDays?: number): string | null {
  if (!ttlDays) return null;
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const leftDays = ttlDays - elapsedMs / (24 * 60 * 60 * 1000);
  if (leftDays <= 0) return "곧 만료";
  if (leftDays < 1) return "만료까지 1일 미만";
  return `만료까지 ${Math.ceil(leftDays)}일`;
}

function ListingList({
  rows,
  emptyText,
  action,
  priceRef,
  expiryDays,
  onOpenCard,
}: {
  rows: Listing[] | null;
  emptyText: string;
  action: (l: Listing) => React.ReactNode;
  priceRef: Record<string, PriceStat>;
  expiryDays?: number;
  // 장비 클릭 → 옵션 카드. (재료는 옵션 없어 미클릭.)
  onOpenCard?: (itemId: string, roll: V2EquipRoll | undefined, el: HTMLElement) => void;
}) {
  if (rows === null) {
    return (
      <Card padding="md">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</div>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <div className="flex flex-col items-center gap-2 py-6 text-zinc-400 dark:text-zinc-500">
          <Storefront size={32} weight="duotone" />
          <div className="text-sm">{emptyText}</div>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((l) => {
        const roll =
          l.kind === "equip"
            ? ((l.instancePayload as V2EquipRoll | null) ?? undefined)
            : undefined;
        const detail = l.kind === "equip" ? equipDetail(l.itemId, roll) : null;
        const clickable = l.kind === "equip" && !!onOpenCard;
        const info = (
          <>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-medium ${clickable ? "group-hover:underline group-focus-visible:underline" : ""}`}>
                {l.itemName}
              </span>
              {l.kind === "material" && l.quantity > 1 && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{l.quantity}</span>
              )}
              {detail?.pct != null && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">품질 {detail.pct}%</span>
              )}
            </div>
            {detail && (
              <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
                {detail.line}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                {l.price.toLocaleString()}골드
              </span>
              <PriceRefLine stat={priceRef[l.itemId]} />
              {expiryLabel(l.createdAt, expiryDays) && (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {expiryLabel(l.createdAt, expiryDays)}
                </span>
              )}
            </div>
          </>
        );
        return (
          <Card key={l.id} padding="sm">
            <div className="flex items-center justify-between gap-3">
              {clickable ? (
                <button
                  type="button"
                  onClick={(e) => onOpenCard!(l.itemId, roll, e.currentTarget)}
                  className="group min-w-0 text-left"
                >
                  {info}
                </button>
              ) : (
                <div className="min-w-0">{info}</div>
              )}
              {action(l)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
