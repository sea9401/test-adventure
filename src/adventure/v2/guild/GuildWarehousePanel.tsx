"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CaretDown,
  CheckCircle,
  Lock,
  MagnifyingGlass,
  Package,
  UsersThree,
  Warehouse,
  X,
} from "@phosphor-icons/react";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  craftQualityStars,
  V2_EQUIPMENT,
  v2EquipCatalogTierToDisplayTier,
  v2EquipStatRows,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import {
  CraftQualityBadge,
  EnhanceLevelBadge,
  EquipmentTierBadge,
  MasterworkBadge,
  powerNameClass,
  QualityPctText,
} from "@/adventure/v2/V2ItemCard";
import { InventoryItemIcon } from "@/adventure/v2/inventory/InventoryItemIcon";
import { useEscapeKey } from "@/lib/useEscapeKey";
import {
  isTradeSuspensionMessagePayload,
  tradeSuspensionMessage,
} from "@/lib/tradeSuspension";

type WarehouseAction = "deposit" | "withdraw";
type WarehouseKind = "material" | "equipment";

type WarehouseActivity = {
  id: number;
  action: WarehouseAction;
  actorName: string;
  meta: {
    itemName?: string;
    itemKind?: WarehouseKind;
    materialId?: string;
    equipmentIid?: string;
    quantity?: number;
  } | null;
  createdAt: string;
};

type WarehouseMember = {
  userId: string;
  name: string;
  role: string;
  allowed: boolean;
};

type WarehouseResponse = {
  ok?: boolean;
  error?: string;
  reason?: string;
  expiresAt?: string;
  permanent?: boolean;
  level?: number;
  capacity?: number;
  used?: number;
  canTransfer?: boolean;
  canManagePermissions?: boolean;
  personalEquipment?: V2EquipInstance[];
  equippedIids?: string[];
  warehouse?: Record<string, number>;
  equipment?: V2EquipInstance[];
  members?: WarehouseMember[];
  activity?: WarehouseActivity[];
};

const SLOT_NAME: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  gloves: "장갑",
  boots: "신발",
  ring: "반지",
  necklace: "목걸이",
};

export function formatWarehouseEquipmentOptionLabel(
  equipment: V2EquipInstance,
): string {
  const item = V2_EQUIPMENT[equipment.id];
  const qualityPct = rollQualityPct(item, equipment.roll);
  const statLine = v2EquipStatRows(
    item,
    equipment.roll,
    equipment.enhance,
    equipment.craftQuality,
  )
    .map((row) => `${row.label} ${row.value}`)
    .join(" / ");
  const parts = [item.name, SLOT_NAME[item.slot]];
  const enhanceLevel = Math.max(0, equipment.enhance?.level ?? 0);
  if (enhanceLevel > 0) parts.push(`강화 +${enhanceLevel}`);
  if (equipment.craftedBy?.masterwork) parts.push("명장");
  const qualityStars = craftQualityStars(equipment.craftQuality);
  if (qualityStars) parts.push(`${qualityStars} 품질`);
  if (qualityPct != null) parts.push(`품질 ${qualityPct}%`);
  if (statLine) parts.push(statLine);
  const crafterName = equipment.craftedBy?.name?.trim();
  if (crafterName) parts.push(`제작 ${crafterName}`);
  if (equipment.locked) parts.push("잠금");
  return parts.join(" · ");
}

export function GuildWarehousePanel() {
  const [data, setData] = useState<WarehouseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<WarehouseAction>("deposit");
  const [kind, setKind] = useState<WarehouseKind>("equipment");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedEquipmentIid, setSelectedEquipmentIid] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

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

  const materialSource = data?.warehouse;
  const materialCandidates = useMemo(
    () =>
      Object.entries(materialSource ?? {})
        .filter(([materialId, count]) => V2_MATERIALS[materialId] && count > 0)
        .sort(([a], [b]) =>
          V2_MATERIALS[a].name.localeCompare(V2_MATERIALS[b].name, "ko"),
        ),
    [materialSource],
  );
  const activeMaterialId = materialCandidates.some(
    ([id]) => id === selectedMaterialId,
  )
    ? selectedMaterialId
    : (materialCandidates[0]?.[0] ?? "");
  const maxQuantity = activeMaterialId
    ? (materialSource?.[activeMaterialId] ?? 0)
    : 0;
  const canRecoverMaterials =
    action === "withdraw" && materialCandidates.length > 0;
  const activeKind: WarehouseKind =
    canRecoverMaterials && kind === "material" ? "material" : "equipment";

  const equippedIids = useMemo(
    () => new Set(data?.equippedIids ?? []),
    [data?.equippedIids],
  );
  const equipmentCandidates = useMemo(() => {
    const source =
      action === "deposit" ? data?.personalEquipment : data?.equipment;
    return (source ?? [])
      .filter((equipment) =>
        action === "deposit" ? !equippedIids.has(equipment.iid) : true,
      )
      .sort((a, b) =>
        V2_EQUIPMENT[a.id].name.localeCompare(V2_EQUIPMENT[b.id].name, "ko"),
      );
  }, [action, data?.equipment, data?.personalEquipment, equippedIids]);
  const activeEquipmentIid = equipmentCandidates.some(
    (equipment) => equipment.iid === selectedEquipmentIid,
  )
    ? selectedEquipmentIid
    : (equipmentCandidates[0]?.iid ?? "");

  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const storedMaterialRows = useMemo(
    () =>
      Object.entries(data?.warehouse ?? {})
        .filter(([materialId, count]) => {
          const material = V2_MATERIALS[materialId];
          return (
            material != null &&
            count > 0 &&
            (normalizedQuery.length === 0 ||
              material.name.toLocaleLowerCase("ko").includes(normalizedQuery))
          );
        })
        .sort(([a], [b]) =>
          V2_MATERIALS[a].name.localeCompare(V2_MATERIALS[b].name, "ko"),
        ),
    [data?.warehouse, normalizedQuery],
  );
  const storedEquipmentRows = useMemo(
    () =>
      (data?.equipment ?? [])
        .filter((equipment) => {
          const item = V2_EQUIPMENT[equipment.id];
          return (
            normalizedQuery.length === 0 ||
            item.name.toLocaleLowerCase("ko").includes(normalizedQuery)
          );
        })
        .sort((a, b) =>
          V2_EQUIPMENT[a.id].name.localeCompare(V2_EQUIPMENT[b.id].name, "ko"),
        ),
    [data?.equipment, normalizedQuery],
  );

  async function submit() {
    const parsedQuantity = Number(quantity);
    const invalidMaterial =
      activeKind === "material" &&
      (!activeMaterialId ||
        !Number.isSafeInteger(parsedQuantity) ||
        parsedQuantity <= 0);
    const invalidEquipment =
      activeKind === "equipment" && !activeEquipmentIid;
    if (busy || invalidMaterial || invalidEquipment) {
      setNotice({ kind: "err", text: "처리할 아이템과 수량을 확인해 주세요." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const body =
        activeKind === "material"
          ? {
              action,
              kind: activeKind,
              materialId: activeMaterialId,
              quantity: parsedQuantity,
            }
          : { action, kind: activeKind, iid: activeEquipmentIid };
      const res = await fetch("/api/v2/guild/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as WarehouseResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: warehouseErrorText(json, res.status) });
        return;
      }
      const itemName =
        activeKind === "material"
          ? V2_MATERIALS[activeMaterialId].name
          : V2_EQUIPMENT[
              equipmentCandidates.find(
                (equipment) => equipment.iid === activeEquipmentIid,
              )!.id
            ].name;
      setQuantity("1");
      setNotice({
        kind: "ok",
        text: `${itemName}${activeKind === "material" ? ` ${parsedQuantity.toLocaleString()}개` : ""}를 ${action === "deposit" ? "입고" : "출고"}했습니다.`,
      });
      await load();
    } catch {
      setNotice({ kind: "err", text: "창고 처리에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function changePermission(member: WarehouseMember) {
    if (permissionBusy) return;
    setPermissionBusy(member.userId);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/warehouse/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          allowed: !member.allowed,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        expiresAt?: string;
        permanent?: boolean;
      } | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: warehouseErrorText(json, res.status) });
        return;
      }
      setNotice({
        kind: "ok",
        text: `${member.name} 님의 창고 입출고 권한을 ${member.allowed ? "회수" : "부여"}했습니다.`,
      });
      await load();
    } catch {
      setNotice({ kind: "err", text: "창고 권한 변경에 실패했습니다." });
    } finally {
      setPermissionBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={`${SURFACE_CARD} p-4 text-sm text-zinc-500`}>
        길드 창고를 불러오는 중…
      </div>
    );
  }
  if (loadError || !data?.ok) {
    return (
      <div className={`${SURFACE_CARD} space-y-3 p-4 text-sm`}>
        <p className="text-rose-600 dark:text-rose-300">
          길드 창고를 불러오지 못했습니다.
        </p>
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
  const members = (data.members ?? []).filter(
    (member) => member.role !== "master" && member.role !== "manager",
  );

  return (
    <div className="space-y-3 text-zinc-900 dark:text-zinc-100">
      <section className={`${SURFACE_ACCENT} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Warehouse
              size={30}
              weight="duotone"
              className="text-blue-600 dark:text-blue-300"
            />
            <div>
              <h3 className="font-semibold">길드 창고 Lv {data.level ?? 1}</h3>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                장비 한 개가 1칸을 사용합니다. 기존 보관 재료는 회수할 때까지
                종류마다 1칸을 사용합니다.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {used.toLocaleString()} / {capacity.toLocaleString()}칸
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="길드 창고 사용 슬롯"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={used}
          className="h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
        >
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </section>

      <section className={`${SURFACE_CARD} space-y-3 p-3`}>
        {data.canTransfer ? (
          <>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2" role="tablist" aria-label="창고 처리 방식">
                <ActionTab
                  active={action === "deposit"}
                  onClick={() => {
                    setAction("deposit");
                    setKind("equipment");
                  }}
                >
                  입고
                </ActionTab>
                <ActionTab
                  active={action === "withdraw"}
                  onClick={() => setAction("withdraw")}
                >
                  출고
                </ActionTab>
              </div>
              <div className="flex gap-2" role="tablist" aria-label="창고 아이템 종류">
                <KindTab active={activeKind === "equipment"} onClick={() => setKind("equipment")}>
                  장비
                </KindTab>
                {canRecoverMaterials ? (
                  <KindTab active={activeKind === "material"} onClick={() => setKind("material")}>
                    기존 재료 회수
                  </KindTab>
                ) : null}
              </div>
            </div>

            {activeKind === "material" ? (
              <MaterialTransferForm
                action={action}
                candidates={materialCandidates}
                activeMaterialId={activeMaterialId}
                maxQuantity={maxQuantity}
                quantity={quantity}
                busy={busy}
                onMaterialChange={setSelectedMaterialId}
                onQuantityChange={setQuantity}
                onSubmit={() => void submit()}
              />
            ) : (
              <EquipmentTransferForm
                action={action}
                candidates={equipmentCandidates}
                activeEquipmentIid={activeEquipmentIid}
                busy={busy}
                onEquipmentChange={setSelectedEquipmentIid}
                onSubmit={() => void submit()}
              />
            )}
          </>
        ) : (
          <div
            className={`${SURFACE_INSET} flex items-center gap-2 px-3 py-4 text-xs text-zinc-600 dark:text-zinc-300`}
          >
            <Lock size={18} weight="duotone" className="shrink-0" />
            창고를 조회할 수 있습니다. 입출고는 마스터·관리자 또는 권한을 받은
            길드원만 가능합니다.
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
            <Package size={18} weight="duotone" /> 보관 아이템
          </h3>
          <label className="relative block min-w-0 flex-1 sm:max-w-56">
            <span className="sr-only">보관 아이템 검색</span>
            <MagnifyingGlass
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                materialCandidates.length > 0
                  ? "장비·기존 재료 검색"
                  : "장비 검색"
              }
              className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
        {storedMaterialRows.length === 0 && storedEquipmentRows.length === 0 ? (
          <div
            className={`${SURFACE_INSET} px-3 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400`}
          >
            {query.trim()
              ? "검색 결과가 없습니다."
              : "아직 보관 중인 아이템이 없습니다."}
          </div>
        ) : (
          <div className="space-y-3">
            {storedMaterialRows.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  기존 재료 · 출고 전용
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {storedMaterialRows.map(([materialId, count]) => (
                    <div
                      key={materialId}
                      className={`${SURFACE_INSET} flex items-center gap-2 px-3 py-2`}
                    >
                      <InventoryItemIcon itemId={materialId} size={22} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {V2_MATERIALS[materialId].name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        ×{count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {storedEquipmentRows.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  장비
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {storedEquipmentRows.map((equipment) => (
                    <StoredEquipmentCard key={equipment.iid} equipment={equipment} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {data.canManagePermissions ? (
        <section className={`${SURFACE_CARD} space-y-3 p-3`}>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UsersThree size={18} weight="duotone" /> 길드원 입출고 권한
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              마스터와 관리자는 항상 이용할 수 있습니다. 일반 길드원에게 입고와
              출고 권한을 함께 부여합니다.
            </p>
          </div>
          {members.length === 0 ? (
            <div
              className={`${SURFACE_INSET} px-3 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400`}
            >
              권한을 설정할 일반 길드원이 없습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className={`${SURFACE_INSET} flex items-center justify-between gap-3 px-3 py-2`}
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {member.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void changePermission(member)}
                    disabled={permissionBusy != null}
                    aria-pressed={member.allowed}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      member.allowed
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    {permissionBusy === member.userId
                      ? "변경 중"
                      : member.allowed
                        ? "권한 있음"
                        : "권한 부여"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <h3 className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          최근 입출고
        </h3>
        {(data.activity ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            아직 입출고 기록이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {(data.activity ?? []).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.action === "deposit" ? "bg-blue-500" : "bg-indigo-500"}`}
                />
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                  {entry.actorName} · {entry.meta?.itemName ?? "아이템"}{" "}
                  {entry.meta?.itemKind === "material"
                    ? `${(entry.meta.quantity ?? 0).toLocaleString()}개 `
                    : ""}
                  {entry.action === "deposit" ? "입고" : "출고"}
                </span>
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 text-zinc-400"
                >
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

function MaterialTransferForm({
  action,
  candidates,
  activeMaterialId,
  maxQuantity,
  quantity,
  busy,
  onMaterialChange,
  onQuantityChange,
  onSubmit,
}: {
  action: WarehouseAction;
  candidates: Array<[string, number]>;
  activeMaterialId: string;
  maxQuantity: number;
  quantity: string;
  busy: boolean;
  onMaterialChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (candidates.length === 0) {
    return (
      <div
        className={`${SURFACE_INSET} px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400`}
      >
        {action === "deposit"
          ? "입고할 수 있는 개인 재료가 없습니다."
          : "출고할 재료가 없습니다."}
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        재료
        <select
          value={activeMaterialId}
          onChange={(event) => onMaterialChange(event.target.value)}
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
            onChange={(event) => onQuantityChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 bg-white px-2 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => onQuantityChange(String(maxQuantity))}
            className="h-10 rounded-r-md border border-zinc-300 bg-zinc-100 px-2 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800"
          >
            전부
          </button>
        </div>
      </label>
      <TransferButton action={action} busy={busy} onClick={onSubmit} />
    </div>
  );
}

export function EquipmentTransferForm({
  action,
  candidates,
  activeEquipmentIid,
  busy,
  onEquipmentChange,
  onSubmit,
}: {
  action: WarehouseAction;
  candidates: V2EquipInstance[];
  activeEquipmentIid: string;
  busy: boolean;
  onEquipmentChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (candidates.length === 0) {
    return (
      <div
        className={`${SURFACE_INSET} px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400`}
      >
        {action === "deposit"
          ? "입고할 수 있는 거래 가능 미착용 장비가 없습니다."
          : "출고할 장비가 없습니다."}
      </div>
    );
  }
  const selectedEquipment =
    candidates.find((equipment) => equipment.iid === activeEquipmentIid) ??
    candidates[0];
  const selectedItem = V2_EQUIPMENT[selectedEquipment.id];
  const selectedQuality = rollQualityPct(
    selectedItem,
    selectedEquipment.roll,
  );
  const selectedStats = v2EquipStatRows(
    selectedItem,
    selectedEquipment.roll,
    selectedEquipment.enhance,
    selectedEquipment.craftQuality,
  )
    .map((row) => `${row.label} ${row.value}`)
    .join(" · ");

  return (
    <>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            장비
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            className={`${SURFACE_INSET} flex min-h-16 w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition hover:border-blue-400 dark:hover:border-blue-700`}
          >
            <InventoryItemIcon
              itemId={selectedEquipment.id}
              size={24}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <strong
                  className={`truncate text-sm ${powerNameClass(
                    selectedItem,
                    selectedEquipment.roll,
                    selectedEquipment.enhance,
                    selectedEquipment.craftQuality,
                  )}`}
                >
                  {selectedItem.name}
                </strong>
                <EquipmentTierBadge tier={selectedItem.tier} compact />
                <EnhanceLevelBadge enhance={selectedEquipment.enhance} />
                <CraftQualityBadge
                  craftQuality={selectedEquipment.craftQuality}
                />
                {selectedEquipment.craftedBy?.masterwork ? (
                  <MasterworkBadge />
                ) : null}
              </span>
              <span className="mt-1 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {SLOT_NAME[selectedItem.slot]}
                {selectedQuality != null ? ` · 품질 ${selectedQuality}%` : ""}
                {selectedStats ? ` · ${selectedStats}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
              변경 <CaretDown size={14} weight="bold" />
            </span>
          </button>
        </div>
        <TransferButton action={action} busy={busy} onClick={onSubmit} />
      </div>
      {pickerOpen ? (
        <WarehouseEquipmentPickerDialog
          action={action}
          candidates={candidates}
          selectedIid={activeEquipmentIid}
          onClose={() => setPickerOpen(false)}
          onSelect={(iid) => {
            onEquipmentChange(iid);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type WarehouseEquipmentSlotFilter = "all" | V2EquipSlot;

const WAREHOUSE_EQUIPMENT_SLOT_FILTERS: ReadonlyArray<{
  key: WarehouseEquipmentSlotFilter;
  label: string;
}> = [
  { key: "all", label: "전체" },
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

export function WarehouseEquipmentPickerDialog({
  action,
  candidates,
  selectedIid,
  onClose,
  onSelect,
}: {
  action: WarehouseAction;
  candidates: V2EquipInstance[];
  selectedIid: string;
  onClose: () => void;
  onSelect: (iid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<WarehouseEquipmentSlotFilter>("all");
  useEscapeKey(onClose);

  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const filtered = candidates.filter((equipment) => {
    const item = V2_EQUIPMENT[equipment.id];
    return (
      (slot === "all" || item.slot === slot) &&
      (normalizedQuery.length === 0 ||
        formatWarehouseEquipmentOptionLabel(equipment)
          .toLocaleLowerCase("ko")
          .includes(normalizedQuery))
    );
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-equipment-picker-title"
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2
              id="warehouse-equipment-picker-title"
              className="text-base font-bold"
            >
              {action === "deposit" ? "입고할" : "출고할"} 장비 선택
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              장비별 품질과 옵션을 비교한 뒤 선택해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="장비 선택 닫기"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <label className="relative block">
            <span className="sr-only">장비 검색</span>
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="장비명·옵션·제작자 검색"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="장비 부위 필터">
            {WAREHOUSE_EQUIPMENT_SLOT_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                aria-pressed={slot === filter.key}
                onClick={() => setSlot(filter.key)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  slot === filter.key
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {filtered.length === 0 ? (
            <div className={`${SURFACE_INSET} px-3 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
              검색 조건에 맞는 장비가 없습니다.
            </div>
          ) : (
            <div role="listbox" aria-label="길드 창고 장비" className="grid gap-2 sm:grid-cols-2">
              {filtered.map((equipment) => (
                <WarehouseEquipmentChoiceCard
                  key={equipment.iid}
                  equipment={equipment}
                  selected={equipment.iid === selectedIid}
                  onSelect={() => onSelect(equipment.iid)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {filtered.length.toLocaleString()}개 표시 · 장비를 누르면 선택됩니다.
        </footer>
      </section>
    </div>
  );
}

function WarehouseEquipmentChoiceCard({
  equipment,
  selected,
  onSelect,
}: {
  equipment: V2EquipInstance;
  selected: boolean;
  onSelect: () => void;
}) {
  const item = V2_EQUIPMENT[equipment.id];
  const qualityPct = rollQualityPct(item, equipment.roll);
  const stats = v2EquipStatRows(
    item,
    equipment.roll,
    equipment.enhance,
    equipment.craftQuality,
  );
  const crafterName = equipment.craftedBy?.name?.trim();

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`${SURFACE_INSET} min-w-0 p-3 text-left transition ${
        selected
          ? "border-blue-500 ring-1 ring-blue-500 dark:border-blue-400 dark:ring-blue-400"
          : "hover:border-blue-300 dark:hover:border-blue-700"
      }`}
    >
      <span className="flex items-start gap-2.5">
        <InventoryItemIcon
          itemId={equipment.id}
          size={24}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <strong
              className={`min-w-0 text-sm ${powerNameClass(
                item,
                equipment.roll,
                equipment.enhance,
                equipment.craftQuality,
              )}`}
            >
              {item.name}
            </strong>
            {selected ? (
              <CheckCircle
                size={18}
                weight="fill"
                className="shrink-0 text-blue-600 dark:text-blue-300"
              />
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <EquipmentTierBadge tier={item.tier} compact />
            <EnhanceLevelBadge enhance={equipment.enhance} />
            <CraftQualityBadge craftQuality={equipment.craftQuality} />
            {equipment.craftedBy?.masterwork ? <MasterworkBadge /> : null}
            {qualityPct != null ? (
              <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                품질 <QualityPctText pct={qualityPct} className="font-semibold" />
              </span>
            ) : null}
            {equipment.locked ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                <Lock size={11} weight="fill" /> 잠금
              </span>
            ) : null}
          </span>
        </span>
      </span>
      <span className="mt-2 block border-t border-zinc-200 pt-2 dark:border-zinc-700">
        <span className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          {SLOT_NAME[item.slot]} · {v2EquipCatalogTierToDisplayTier(item.tier)}T
          {crafterName ? ` · 제작 ${crafterName}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {stats.map((stat) => (
            <span
              key={`${stat.label}:${stat.value}`}
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {stat.label} <strong>{stat.value}</strong>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

function TransferButton({
  action,
  busy,
  onClick,
}: {
  action: WarehouseAction;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-10 self-end rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "처리 중" : action === "deposit" ? "입고" : "출고"}
    </button>
  );
}

function StoredEquipmentCard({ equipment }: { equipment: V2EquipInstance }) {
  const item = V2_EQUIPMENT[equipment.id];
  const qualityPct = rollQualityPct(item, equipment.roll);
  const statLine = v2EquipStatRows(
    item,
    equipment.roll,
    equipment.enhance,
    equipment.craftQuality,
  )
    .map((row) => `${row.label} ${row.value}`)
    .join(" · ");
  return (
    <div className={`${SURFACE_INSET} space-y-1.5 px-3 py-2`}>
      <div className="flex items-start justify-between gap-2">
        <span
          className={`min-w-0 truncate text-sm font-semibold ${powerNameClass(
            item,
            equipment.roll,
            equipment.enhance,
            equipment.craftQuality,
          )}`}
        >
          {item.name}
        </span>
        {equipment.locked ? (
          <Lock
            size={14}
            weight="fill"
            className="shrink-0 text-amber-500"
            aria-label="잠금 장비"
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <EquipmentTierBadge tier={item.tier} compact />
        <EnhanceLevelBadge enhance={equipment.enhance} />
        <CraftQualityBadge craftQuality={equipment.craftQuality} />
        {equipment.craftedBy?.masterwork ? <MasterworkBadge /> : null}
        {qualityPct != null ? (
          <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            품질 <QualityPctText pct={qualityPct} className="font-semibold" />
          </span>
        ) : null}
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {SLOT_NAME[item.slot]} · {v2EquipCatalogTierToDisplayTier(item.tier)}T
        </span>
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {statLine}
        {equipment.craftedBy?.name?.trim()
          ? ` · 제작 ${equipment.craftedBy.name.trim()}`
          : ""}
      </div>
    </div>
  );
}

function ActionTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-xs font-semibold ${
        active
          ? "bg-blue-600 text-white"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function KindTab(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <ActionTab {...props} />;
}

type WarehouseErrorPayload = Pick<
  WarehouseResponse,
  "error" | "reason" | "expiresAt" | "permanent"
>;

export function warehouseErrorText(
  payload: WarehouseErrorPayload | null,
  _status: number,
): string {
  if (isTradeSuspensionMessagePayload(payload)) {
    return tradeSuspensionMessage(payload);
  }
  const error = payload?.error;
  switch (error) {
    case "not_authorized":
      return "창고 입출고 권한이 없습니다.";
    case "insufficient_material":
      return "개인 보유 재료가 부족합니다.";
    case "insufficient_stock":
      return "창고에 보관된 수량이 부족합니다.";
    case "capacity_exceeded":
      return "새 아이템을 보관할 빈 슬롯이 없습니다.";
    case "warehouse_required":
      return "먼저 길드 창고를 개방해야 합니다.";
    case "inventory_overflow":
      return "개인 인벤토리에 재료를 더 보관할 수 없습니다.";
    case "equipment_not_owned":
      return "개인 장비 목록에서 해당 장비를 찾을 수 없습니다.";
    case "equipment_equipped":
      return "착용 중인 장비는 입고할 수 없습니다.";
    case "equipment_not_tradable":
      return "귀속되었거나 잠긴 거래 불가 장비는 입고할 수 없습니다.";
    case "material_not_tradable":
      return "거래 불가 재료는 입고할 수 없습니다.";
    case "warehouse_equipment_only":
      return "길드 창고에는 장비만 입고할 수 있습니다.";
    case "equipment_not_stored":
      return "창고에서 해당 장비를 찾을 수 없습니다.";
    case "member_not_found":
      return "해당 길드원을 찾을 수 없습니다.";
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
