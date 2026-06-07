"use client";

import { useCallback, useEffect, useState } from "react";
import { Storefront } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";

// v2 거래소 — 장비 개체 + 재료 거래(고정가). 백엔드 /api/v2/marketplace (list/buy/cancel/browse).
//   판매세는 서버 권위 — 여기 0.05 는 순수령 미리보기용(표시 advisory).
const TAX_RATE_DISPLAY = 0.05;
const netPreview = (price: number) => Math.floor(price * (1 - TAX_RATE_DISPLAY));

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

function rollPctOf(inst: V2EquipInstance): number | null {
  const item = V2_EQUIPMENT[inst.id];
  if (!item) return null;
  return rollQualityPct(item, inst.roll);
}

export function V2MarketplaceView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("browse");
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

  const loadBrowse = useCallback(async (mineOnly: boolean) => {
    const res = await fetch(`/api/v2/marketplace/browse${mineOnly ? "?mine=1" : ""}`);
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      viewerId?: string;
      listings?: Listing[];
    } | null;
    if (!res.ok || !j?.ok) throw new Error(`목록 로드 실패 (${res.status})`);
    if (j.viewerId) setViewerId(j.viewerId);
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

  // 탭 전환 시 해당 데이터 로드.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 전환 시 이전 에러 클리어
    setError(null);
    if (tab === "browse") void loadBrowse(false).catch((e) => setError(String(e.message ?? e)));
    else if (tab === "mine") void loadBrowse(true).catch((e) => setError(String(e.message ?? e)));
    else void loadInventory().catch(() => setError("인벤토리 로드 실패"));
  }, [tab, loadBrowse, loadInventory]);

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

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <BackButton onClick={onBack} />
        <h1 className="mt-1 text-lg font-bold">거래소</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          다른 모험가와 장비·재료를 사고팝니다. 판매 시 대금의 {Math.round(TAX_RATE_DISPLAY * 100)}%가 거래세로 빠집니다.
        </p>
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
        <ListingList
          rows={listings}
          emptyText="등록된 매물이 없어요."
          action={(l) =>
            l.sellerId === viewerId ? (
              <span className="shrink-0 text-[11px] text-zinc-400">내 매물</span>
            ) : (
              <button
                type="button"
                onClick={() => buy(l)}
                disabled={busy}
                className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                구매
              </button>
            )
          }
        />
      )}

      {tab === "mine" && (
        <ListingList
          rows={mine}
          emptyText="등록한 매물이 없어요."
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
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">장비 ({sellableEquip.length})</h2>
            {sellableEquip.length === 0 ? (
              <Card padding="sm">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  팔 수 있는 장비가 없어요. (장착·잠금 장비는 제외)
                </div>
              </Card>
            ) : (
              sellableEquip.map((inst) => {
                const pct = rollPctOf(inst);
                const price = Number(prices[inst.iid]);
                return (
                  <Card key={inst.iid} padding="sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{V2_EQUIPMENT[inst.id]?.name ?? inst.id}</span>
                        {pct !== null && (
                          <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">굴림 {pct}%</span>
                        )}
                      </div>
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
              })
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">재료 ({sellableMats.length})</h2>
            {sellableMats.length === 0 ? (
              <Card padding="sm">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">팔 수 있는 재료가 없어요.</div>
              </Card>
            ) : (
              sellableMats.map((matId) => {
                const have = materials[matId] ?? 0;
                return (
                  <Card key={matId} padding="sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {V2_MATERIALS[matId]?.name ?? matId}
                        <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">보유 {have}</span>
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
              })
            )}
          </section>
        </div>
      )}
    </main>
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

function ListingList({
  rows,
  emptyText,
  action,
}: {
  rows: Listing[] | null;
  emptyText: string;
  action: (l: Listing) => React.ReactNode;
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
      {rows.map((l) => (
        <Card key={l.id} padding="sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{l.itemName}</span>
                {l.kind === "material" && l.quantity > 1 && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{l.quantity}</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {l.sellerName} · {l.price.toLocaleString()}골드
              </div>
            </div>
            {action(l)}
          </div>
        </Card>
      ))}
    </div>
  );
}
