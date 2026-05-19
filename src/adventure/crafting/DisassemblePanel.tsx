"use client";

import { useMemo, useRef, useState } from "react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { Sparkle, Hammer, ArrowsLeftRight, X } from "@phosphor-icons/react";
import { ITEMS, type EquipItem, type ItemId, rarityTextClass } from "../data/items";
import { MATERIALS, type MaterialId } from "../data/materials";
import { CRAFT_TIER_NAMES, type CraftTier } from "../data/craftQuality";
import { DROP_QUALITY_NAMES, type DropQuality } from "../data/dropQuality";
import type { InventoryState } from "../inventory/useInventory";
import type { EquippedSlots } from "../character/types";
import {
  entryBlockReason,
  entryYield,
  type BlockReason,
  type DisassembleEntry,
  type DisassembleRequest,
  type DisassemblePlan,
} from "./disassemble";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabBar } from "@/components/ui/TabBar";

// 분해실 — 대장간 옆 패널. 인벤토리의 장비/재료를 갈아 마력가루로 환산.
// 행 단위는 "한 stack" — 같은 itemId + 같은 등급(tier/quality) 묶음 또는 같은 materialId.
// 인스턴스 개별이 아니라서, 같은 항목을 여러 개 갖고 있으면 stepper 로 수량을 정한다.

type Tab = "weapon" | "armor" | "accessory" | "material";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
  { key: "material", label: "재료" },
];

// 한 행을 가리키는 고유 키. selection map 의 키로 쓴다.
function entryKey(entry: DisassembleEntry): string {
  if (entry.kind === "equipment") return `e:${entry.itemId}`;
  if (entry.kind === "craftedEquipment")
    return `c:${entry.itemId}#t${entry.tier}`;
  if (entry.kind === "droppedEquipment")
    return `d:${entry.itemId}#q${entry.quality}`;
  if (entry.kind === "equipmentInstance") return `i:${entry.instanceId}`;
  return `m:${entry.materialId}`;
}

type Row = {
  key: string;
  entry: DisassembleEntry;
  name: string;
  qualifier?: string; // "걸작" / "정교한" 등
  rarityClass: string; // 텍스트 색
  have: number;
  yieldEach: number;
  tab: Tab;
  blockedAlways: BlockReason | null; // 0 개 무관 차단 (장착/시작/마나가루)
};

function buildRows(inv: InventoryState, slots: EquippedSlots): Row[] {
  const rows: Row[] = [];

  // 무등급 장비.
  for (const id of Object.keys(inv.equipment) as ItemId[]) {
    const n = inv.equipment[id] ?? 0;
    if (n <= 0) continue;
    const item = ITEMS[id] as EquipItem | undefined;
    if (!item) continue;
    const entry: DisassembleEntry = { kind: "equipment", itemId: id };
    rows.push({
      key: entryKey(entry),
      entry,
      name: item.name,
      rarityClass: rarityTextClass(item),
      have: n,
      yieldEach: entryYield(entry),
      tab: item.slot,
      // count=1 기준으로 잠금 사유를 미리 산출 (not-enough 는 제외).
      blockedAlways: alwaysBlocked(entry, slots),
    });
  }

  // 제작산 (등급별).
  for (const id of Object.keys(inv.craftedEquipment) as ItemId[]) {
    const map = inv.craftedEquipment[id];
    if (!map) continue;
    const item = ITEMS[id] as EquipItem | undefined;
    if (!item) continue;
    for (const [t, n] of Object.entries(map)) {
      if (!n || n <= 0) continue;
      const tier = Number(t) as CraftTier;
      const entry: DisassembleEntry = { kind: "craftedEquipment", itemId: id, tier };
      rows.push({
        key: entryKey(entry),
        entry,
        name: item.name,
        qualifier: CRAFT_TIER_NAMES[tier],
        rarityClass: rarityTextClass(item),
        have: n,
        yieldEach: entryYield(entry),
        tab: item.slot,
        blockedAlways: alwaysBlocked(entry, slots),
      });
    }
  }

  // 드랍 고품질.
  for (const id of Object.keys(inv.droppedEquipment) as ItemId[]) {
    const map = inv.droppedEquipment[id];
    if (!map) continue;
    const item = ITEMS[id] as EquipItem | undefined;
    if (!item) continue;
    for (const [q, n] of Object.entries(map)) {
      if (!n || n <= 0) continue;
      const quality = Number(q) as DropQuality;
      if (quality !== 1 && quality !== 2) continue;
      const entry: DisassembleEntry = {
        kind: "droppedEquipment",
        itemId: id,
        quality,
      };
      rows.push({
        key: entryKey(entry),
        entry,
        name: item.name,
        qualifier: DROP_QUALITY_NAMES[quality],
        rarityClass: rarityTextClass(item),
        have: n,
        yieldEach: entryYield(entry),
        tab: item.slot,
        blockedAlways: alwaysBlocked(entry, slots),
      });
    }
  }

  // 인스턴스 풀 (별빛 무구) — 자루별 행. 강화 +N / craftTier 라벨을 qualifier 에 합쳐 표시.
  for (const inst of inv.equipmentInstances ?? []) {
    const item = ITEMS[inst.itemId] as EquipItem | undefined;
    if (!item) continue;
    const entry: DisassembleEntry = {
      kind: "equipmentInstance",
      instanceId: inst.instanceId,
      itemId: inst.itemId,
    };
    const tierLabel =
      inst.craftTier != null && inst.craftTier !== 0
        ? CRAFT_TIER_NAMES[inst.craftTier]
        : "";
    const enhLabel = inst.enhancementLevel > 0 ? `+${inst.enhancementLevel}` : "";
    const qualifier = [tierLabel, enhLabel].filter((s) => s.length > 0).join(" ");
    rows.push({
      key: entryKey(entry),
      entry,
      name: item.name,
      qualifier: qualifier.length > 0 ? qualifier : undefined,
      rarityClass: rarityTextClass(item),
      have: 1,
      yieldEach: entryYield(entry),
      tab: item.slot,
      blockedAlways: alwaysBlocked(entry, slots),
    });
  }

  // 재료.
  for (const id of Object.keys(inv.materials) as MaterialId[]) {
    const n = inv.materials[id] ?? 0;
    if (n <= 0) continue;
    const mat = MATERIALS[id];
    const entry: DisassembleEntry = { kind: "material", materialId: id };
    rows.push({
      key: entryKey(entry),
      entry,
      name: mat.name,
      rarityClass: "text-zinc-700 dark:text-zinc-300",
      have: n,
      yieldEach: entryYield(entry),
      tab: "material",
      blockedAlways: alwaysBlocked(entry, slots),
    });
  }

  // 보기 좋은 순서 — 잠금 안 된 것 먼저, 수율 큰 것 먼저, 그 다음 이름.
  rows.sort((a, b) => {
    const aLocked = a.blockedAlways ? 1 : 0;
    const bLocked = b.blockedAlways ? 1 : 0;
    if (aLocked !== bLocked) return aLocked - bLocked;
    if (a.yieldEach !== b.yieldEach) return b.yieldEach - a.yieldEach;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

// count = 1 기준의 항상 잠금 사유. not-enough 는 동적이라 호출 측에서 별도 검사.
function alwaysBlocked(
  entry: DisassembleEntry,
  slots: EquippedSlots,
): BlockReason | null {
  // 보유량은 1 로 가정해서 not-enough 만 잠금 사유에서 제외.
  // 진짜 보유량은 buildRows 가 row.have 로 따로 들고 있음.
  const fakeInv: InventoryState = {
    potions: {},
    equipment:
      entry.kind === "equipment" ? { [entry.itemId]: 1 } : {},
    craftedEquipment:
      entry.kind === "craftedEquipment"
        ? { [entry.itemId]: { [String(entry.tier)]: 1 } }
        : {},
    droppedEquipment:
      entry.kind === "droppedEquipment"
        ? { [entry.itemId]: { [String(entry.quality)]: 1 } }
        : {},
    vault: {},
    materials: entry.kind === "material" ? { [entry.materialId]: 1 } : {},
    consumables: {},
  };
  const r = entryBlockReason(entry, 1, fakeInv, slots);
  return r === "not-enough" ? null : r;
}

const BLOCK_LABEL: Record<BlockReason, string> = {
  equipped: "장착 중",
  "starter-gear": "시작 장비",
  "mana-dust": "분해 불가",
  "not-enough": "수량 부족",
};

// 큰 분해(unique 이상 포함) 시 한 번 더 확인.
function needsConfirm(rows: Row[], selection: Record<string, number>): boolean {
  return rows.some((r) => {
    const sel = selection[r.key] ?? 0;
    if (sel <= 0) return false;
    if (r.entry.kind === "material") return false;
    const item = ITEMS[
      r.entry.kind === "equipment"
        ? r.entry.itemId
        : r.entry.kind === "craftedEquipment"
          ? r.entry.itemId
          : r.entry.itemId
    ] as EquipItem | undefined;
    return item?.rarity === "unique" || item?.rarity === "legendary";
  });
}

export function DisassemblePanel({
  inventory,
  equippedSlots,
  onDisassemble,
}: {
  inventory: InventoryState;
  equippedSlots: EquippedSlots;
  onDisassemble: (request: DisassembleRequest) => DisassemblePlan;
}) {
  const [tab, setTab] = useState<Tab>("weapon");
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [lastResult, setLastResult] = useState<{
    dust: number;
    blocked: number;
  } | null>(null);

  const allRows = useMemo(
    () => buildRows(inventory, equippedSlots),
    [inventory, equippedSlots],
  );
  const dustHave = inventory.materials.mana_dust ?? 0;

  const rowsByTab = useMemo(() => {
    const m: Record<Tab, Row[]> = {
      weapon: [],
      armor: [],
      accessory: [],
      material: [],
    };
    for (const r of allRows) m[r.tab].push(r);
    return m;
  }, [allRows]);

  const visibleRows = rowsByTab[tab];

  const totalDust = useMemo(() => {
    let sum = 0;
    for (const r of allRows) {
      const sel = selection[r.key] ?? 0;
      if (sel <= 0 || r.blockedAlways) continue;
      sum += sel * r.yieldEach;
    }
    return sum;
  }, [allRows, selection]);

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const r of allRows) {
      const sel = selection[r.key] ?? 0;
      if (sel > 0 && !r.blockedAlways) n += sel;
    }
    return n;
  }, [allRows, selection]);

  const setRowCount = (key: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(value, max));
    setSelection((cur) => {
      const next = { ...cur };
      if (clamped <= 0) delete next[key];
      else next[key] = clamped;
      return next;
    });
  };

  const selectAllInTab = () => {
    setSelection((cur) => {
      const next = { ...cur };
      for (const r of visibleRows) {
        if (r.blockedAlways || r.have <= 0) continue;
        next[r.key] = r.have;
      }
      return next;
    });
  };

  const clearAll = () => setSelection({});

  const buildRequest = (): DisassembleRequest => {
    const req: { entry: DisassembleEntry; count: number }[] = [];
    for (const r of allRows) {
      const sel = selection[r.key] ?? 0;
      if (sel <= 0 || r.blockedAlways) continue;
      req.push({ entry: r.entry, count: sel });
    }
    return req;
  };

  const tryDisassemble = () => {
    if (selectedCount === 0) return;
    if (needsConfirm(allRows, selection)) {
      setPendingConfirm(true);
      return;
    }
    doDisassemble();
  };

  const doDisassemble = () => {
    const req = buildRequest();
    const plan = onDisassemble(req);
    setLastResult({ dust: plan.totalDust, blocked: plan.blocked.length });
    setSelection({});
    setPendingConfirm(false);
  };

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon={<Hammer size={40} weight="duotone" />}
        title="분해할 것이 없습니다"
        message="잉여 장비나 재료가 인벤토리에 쌓이면 여기서 마력가루로 갈아낼 수 있습니다."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* 상단 요약 + 액션 — sticky 로 잡지 않고 평범한 카드. */}
      <Card as="section" padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm">
              <Sparkle size={16} weight="duotone" className="text-violet-500" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                보유 마력가루
              </span>
              <span className="font-mono text-violet-700 dark:text-violet-400">
                {dustHave}
              </span>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              선택 {selectedCount} 점 · 분해 시{" "}
              <span className="font-mono text-violet-700 dark:text-violet-400">
                +{totalDust}
              </span>{" "}
              마력가루
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllInTab}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              현재 탭 전체 선택
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selectedCount === 0}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              해제
            </button>
            <button
              type="button"
              onClick={tryDisassemble}
              disabled={selectedCount === 0}
              className="rounded-md border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              분해
            </button>
          </div>
        </div>
        {lastResult && (
          <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            방금 분해 — 마력가루{" "}
            <span className="font-mono text-violet-700 dark:text-violet-400">
              +{lastResult.dust}
            </span>
            {lastResult.blocked > 0
              ? ` · 차단된 항목 ${lastResult.blocked}건`
              : ""}
          </div>
        )}
      </Card>

      <TabBar tabs={TABS} active={tab} onChange={setTab} ariaLabel="분해 카테고리" />

      {visibleRows.length === 0 ? (
        <EmptyState
          icon={<ArrowsLeftRight size={32} weight="duotone" />}
          title="이 칸엔 갈 것이 없습니다"
          message="다른 탭을 확인해 보세요."
        />
      ) : (
        <Card as="section" padding="md">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visibleRows.map((r) => {
              const sel = selection[r.key] ?? 0;
              const locked = r.blockedAlways;
              return (
                <li
                  key={r.key}
                  className={`flex flex-wrap items-center justify-between gap-3 py-2 ${
                    locked ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-sm font-medium ${r.rarityClass}`}>
                        {r.name}
                        {r.qualifier && (
                          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                            ⟨{r.qualifier}⟩
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        보유 {r.have}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {locked ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {BLOCK_LABEL[locked]}
                        </span>
                      ) : (
                        <>
                          1 점 ={" "}
                          <span className="font-mono text-violet-700 dark:text-violet-400">
                            +{r.yieldEach}
                          </span>{" "}
                          마력가루
                        </>
                      )}
                    </div>
                  </div>
                  {!locked && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRowCount(r.key, sel - 1, r.have)}
                        disabled={sel <= 0}
                        className="h-10 w-10 rounded-md border border-zinc-300 bg-white text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={sel}
                        min={0}
                        max={r.have}
                        onChange={(e) =>
                          setRowCount(r.key, Number(e.target.value) || 0, r.have)
                        }
                        className="w-12 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-center text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => setRowCount(r.key, sel + 1, r.have)}
                        disabled={sel >= r.have}
                        className="h-10 w-10 rounded-md border border-zinc-300 bg-white text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setRowCount(r.key, r.have, r.have)}
                        className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        전체
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pendingConfirm && (
        <ConfirmModal
          totalDust={totalDust}
          uniqueCount={countSelectedUnique(allRows, selection)}
          onConfirm={doDisassemble}
          onCancel={() => setPendingConfirm(false)}
        />
      )}
    </div>
  );
}

function countSelectedUnique(
  rows: Row[],
  selection: Record<string, number>,
): number {
  let n = 0;
  for (const r of rows) {
    const sel = selection[r.key] ?? 0;
    if (sel <= 0 || r.blockedAlways) continue;
    if (r.entry.kind === "material") continue;
    const id =
      r.entry.kind === "equipment"
        ? r.entry.itemId
        : r.entry.kind === "craftedEquipment"
          ? r.entry.itemId
          : r.entry.itemId;
    const item = ITEMS[id] as EquipItem | undefined;
    if (item?.rarity === "unique" || item?.rarity === "legendary") n += sel;
  }
  return n;
}

function ConfirmModal({
  totalDust,
  uniqueCount,
  onConfirm,
  onCancel,
}: {
  totalDust: number;
  uniqueCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-disassemble-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4"
      onClick={onCancel}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm"
      >
        <Card as="section" padding="lg">
        <div className="flex items-start justify-between gap-2">
          <h3
            id="confirm-disassemble-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            정말 분해하시겠습니까?
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          유실된 명품·전설 등급 {uniqueCount} 점이 포함되어 있습니다. 한 번 분해하면
          되돌릴 수 없습니다.
        </p>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          분해 시 마력가루{" "}
          <span className="font-mono text-violet-700 dark:text-violet-400">
            +{totalDust}
          </span>{" "}
          획득.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            분해한다
          </button>
        </div>
      </Card>
      </div>
    </div>
  );
}
