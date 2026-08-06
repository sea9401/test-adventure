"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, Package, Warehouse } from "@phosphor-icons/react";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { InventoryItemIcon } from "@/adventure/v2/inventory/InventoryItemIcon";

type WarehouseAction = "deposit" | "withdraw";

type WarehouseActivity = {
  id: number;
  action: WarehouseAction;
  actorName: string;
  meta: { itemName?: string; materialId?: string; quantity?: number } | null;
  createdAt: string;
};

type WarehouseResponse = {
  ok?: boolean;
  error?: string;
  level?: number;
  capacity?: number;
  used?: number;
  canWithdraw?: boolean;
  personalMaterials?: Record<string, number>;
  warehouse?: Record<string, number>;
  activity?: WarehouseActivity[];
};

export function GuildWarehousePanel() {
  const [data, setData] = useState<WarehouseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<WarehouseAction>("deposit");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/v2/guild/warehouse");
      const json = (await res.json().catch(() => null)) as WarehouseResponse | null;
      if (!res.ok || !json?.ok) {
        setLoadError(true);
      } else {
        setData(json);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 권위 창고 상태를 조회한다.
    void load();
  }, [load]);

  const source = action === "deposit" ? data?.personalMaterials : data?.warehouse;
  const candidates = useMemo(
    () =>
      Object.entries(source ?? {})
        .filter(([materialId, count]) => V2_MATERIALS[materialId] && count > 0)
        .sort(([a], [b]) =>
          V2_MATERIALS[a].name.localeCompare(V2_MATERIALS[b].name, "ko"),
        ),
    [source],
  );
  const activeMaterialId = candidates.some(([id]) => id === selectedMaterialId)
    ? selectedMaterialId
    : (candidates[0]?.[0] ?? "");
  const maxQuantity = activeMaterialId ? (source?.[activeMaterialId] ?? 0) : 0;
  const storedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return Object.entries(data?.warehouse ?? {})
      .filter(([materialId, count]) => {
        const material = V2_MATERIALS[materialId];
        if (!material || count <= 0) return false;
        return (
          normalizedQuery.length === 0 ||
          material.name.toLocaleLowerCase("ko").includes(normalizedQuery)
        );
      })
      .sort(([a], [b]) =>
        V2_MATERIALS[a].name.localeCompare(V2_MATERIALS[b].name, "ko"),
      );
  }, [data?.warehouse, query]);

  async function submit() {
    const parsedQuantity = Number(quantity);
    if (
      busy ||
      !activeMaterialId ||
      !Number.isSafeInteger(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      setNotice({ kind: "err", text: "처리할 재료와 수량을 확인해 주세요." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          materialId: activeMaterialId,
          quantity: parsedQuantity,
        }),
      });
      const json = (await res.json().catch(() => null)) as WarehouseResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: warehouseErrorText(json?.error) });
        return;
      }
      setQuantity("1");
      setNotice({
        kind: "ok",
        text: `${V2_MATERIALS[activeMaterialId].name} ${parsedQuantity.toLocaleString()}개를 ${action === "deposit" ? "입고" : "출고"}했습니다.`,
      });
      await load();
    } catch {
      setNotice({ kind: "err", text: "창고 처리에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className={`${SURFACE_CARD} p-4 text-sm text-zinc-500`}>길드 창고를 불러오는 중…</div>;
  }
  if (loadError || !data?.ok) {
    return (
      <div className={`${SURFACE_CARD} space-y-3 p-4 text-sm`}>
        <p className="text-rose-600 dark:text-rose-300">길드 창고를 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const capacity = data.capacity ?? 0;
  const used = data.used ?? 0;
  const usagePct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;

  return (
    <div className="space-y-3 text-zinc-900 dark:text-zinc-100">
      <section className={`${SURFACE_ACCENT} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Warehouse size={30} weight="duotone" className="text-blue-600 dark:text-blue-300" />
            <div>
              <h3 className="font-semibold">길드 창고 Lv {data.level ?? 1}</h3>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                길드원은 재료를 입고하고, 마스터와 관리자는 출고할 수 있습니다.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {used.toLocaleString()} / {capacity.toLocaleString()}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="길드 창고 사용량"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={used}
          className="h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
        >
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${usagePct}%` }} />
        </div>
      </section>

      <section className={`${SURFACE_CARD} space-y-3 p-3`}>
        <div className="flex gap-2" role="tablist" aria-label="창고 처리 방식">
          <ActionTab active={action === "deposit"} onClick={() => setAction("deposit")}>
            재료 입고
          </ActionTab>
          {data.canWithdraw ? (
            <ActionTab active={action === "withdraw"} onClick={() => setAction("withdraw")}>
              재료 출고
            </ActionTab>
          ) : null}
        </div>

        {candidates.length === 0 ? (
          <div className={`${SURFACE_INSET} px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400`}>
            {action === "deposit" ? "입고할 수 있는 개인 재료가 없습니다." : "출고할 재료가 없습니다."}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              재료
              <select
                value={activeMaterialId}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {candidates.map(([materialId, count]) => (
                  <option key={materialId} value={materialId}>
                    {V2_MATERIALS[materialId].name} ({count.toLocaleString()}개)
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              수량
              <div className="flex">
                <input
                  type="number"
                  min={1}
                  max={maxQuantity}
                  step={1}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 bg-white px-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(String(maxQuantity))}
                  className="h-10 rounded-r-md border border-zinc-300 bg-zinc-100 px-2 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800"
                >
                  전부
                </button>
              </div>
            </label>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="h-10 self-end rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "처리 중" : action === "deposit" ? "입고" : "출고"}
            </button>
          </div>
        )}
        {notice ? (
          <p
            role="status"
            className={`text-xs ${notice.kind === "ok" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}
          >
            {notice.text}
          </p>
        ) : null}
      </section>

      <section className={`${SURFACE_CARD} space-y-3 p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Package size={18} weight="duotone" /> 보관 재료
          </h3>
          <label className="relative block min-w-0 flex-1 sm:max-w-56">
            <span className="sr-only">보관 재료 검색</span>
            <MagnifyingGlass
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료 검색"
              className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
        {storedRows.length === 0 ? (
          <div className={`${SURFACE_INSET} px-3 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400`}>
            {query.trim() ? "검색 결과가 없습니다." : "아직 보관 중인 재료가 없습니다."}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {storedRows.map(([materialId, count]) => (
              <div key={materialId} className={`${SURFACE_INSET} flex items-center gap-2 px-3 py-2`}>
                <InventoryItemIcon itemId={materialId} size={22} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {V2_MATERIALS[materialId].name}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">×{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <h3 className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          최근 입출고
        </h3>
        {(data.activity ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">아직 입출고 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {(data.activity ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.action === "deposit" ? "bg-blue-500" : "bg-indigo-500"}`} />
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                  {entry.actorName} · {entry.meta?.itemName ?? "재료"} {(entry.meta?.quantity ?? 0).toLocaleString()}개 {entry.action === "deposit" ? "입고" : "출고"}
                </span>
                <time dateTime={entry.createdAt} className="shrink-0 text-zinc-400">
                  {formatActivityDate(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-xs font-semibold ${active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {children}
    </button>
  );
}

function warehouseErrorText(error?: string): string {
  switch (error) {
    case "not_authorized":
      return "출고는 길드 마스터와 관리자만 할 수 있습니다.";
    case "insufficient_material":
      return "개인 보유 재료가 부족합니다.";
    case "insufficient_stock":
      return "창고에 보관된 수량이 부족합니다.";
    case "capacity_exceeded":
      return "창고 보관 한도를 초과합니다.";
    case "warehouse_required":
      return "먼저 길드 창고를 개방해야 합니다.";
    case "inventory_overflow":
      return "개인 인벤토리에 재료를 더 보관할 수 없습니다.";
    default:
      return "창고 처리에 실패했습니다.";
  }
}

function formatActivityDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
