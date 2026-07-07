"use client";

import { Lock, LockOpen, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import {
  V2_EQUIP_SETS,
  signatureLabel,
  v2EquipCompareRows,
  v2EquipStatRows,
  type V2CraftQualityState,
  type V2CraftedBy,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EquipmentTierBadge,
  EnhanceLevelBadge,
  QualityPctText,
  powerNameClass,
  type ItemCardLockAction,
} from "./shared";

// ── 장비 비교 카드 (장착 중 vs 후보) ─────────────────────────────────────────
// 미장착 장비를 탭했을 때, 같은 슬롯의 장착 장비와 한 팝오버에서 좌우로 비교한다.
//   좌=현재 장착(절대값 + 해제) · 우=후보(절대값 + 현재 대비 증감) · 하단=장착하기.
//   모바일에서 카드 두 개를 동시에 띄우면 꽉 차므로 단일 중앙 모달 + 2열로 압축(사용자 결정).

export type V2CompareSide = {
  item: V2Equipment;
  roll?: V2EquipRoll;
  enhance?: V2EnhanceState;
  craftQuality?: V2CraftQualityState;
  craftedBy?: V2CraftedBy;
};

// 증감 색 — 이득(초록)/손해(빨강)/동일(회색). 무게는 낮을수록 이득이라 방향이 아닌 better 로 색 결정.
function compareDeltaClass(better: number): string {
  if (better > 0) return "text-emerald-600 dark:text-emerald-400";
  if (better < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-400 dark:text-zinc-500";
}

// 스탯 한 줄(비교용) — 라벨(좌) + 값(우, 중립색). 증감이 있으면 값 옆에 색·화살표로 표기.
function CompareStatRow({
  label,
  value,
  deltaText,
  better,
}: {
  label: string;
  value: string;
  deltaText?: string;
  better?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="flex items-baseline gap-1 tabular-nums">
        <span className="text-zinc-700 dark:text-zinc-200">{value}</span>
        {deltaText ? (
          <span className={`text-[11px] ${compareDeltaClass(better ?? 0)}`}>
            {deltaText.startsWith("-") ? "▼" : "▲"}
            {deltaText}
          </span>
        ) : null}
      </span>
    </div>
  );
}

// 한쪽(장착/후보) 헤더 — 작은 구분 라벨 + 이름 + 종류/강화/제작 품질 배지.
function CompareHeader({
  tag,
  side,
}: {
  tag: string;
  side: V2CompareSide;
}) {
  const pct = rollQualityPct(side.item, side.roll);
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {tag}
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <h3
          className={`truncate text-sm font-semibold ${powerNameClass(side.item, side.roll, side.enhance, side.craftQuality)}`}
        >
          {side.item.name}
        </h3>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <EquipmentTierBadge tier={side.item.tier} compact />
        <ItemTypeChip item={side.item} />
        <EnhanceLevelBadge enhance={side.enhance} />
        <CraftQualityBadge craftQuality={side.craftQuality} />
        {side.item.craftOnly ? <CraftOnlyBadge /> : null}
      </div>
      {pct != null && (
        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">품질</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <QualityPctText pct={pct} className="font-semibold" />
          </span>
        </div>
      )}
      {side.craftedBy ? (
        <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
          제작자{" "}
          <PlayerNameLink
            name={side.craftedBy.name}
            className="font-medium"
            fallback="모험가"
          />{" "}
          · Lv {side.craftedBy.level.toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

// 비교용 세트 한 줄 — 세트면 "🔗 세트명 (N/M [발동])"(발동=amber), 아니면 "세트 없음"(muted).
//   전체 구성 목록은 단일 카드에서. 여기선 유무·진행도만 간결히(사용자 요청).
function CompareSetLine({
  item,
  equippedIds,
}: {
  item: V2Equipment;
  equippedIds?: ReadonlySet<V2EquipmentId>;
}) {
  const set = item.setId
    ? V2_EQUIP_SETS.find((s) => s.id === item.setId)
    : undefined;
  if (!set) {
    return <p className="text-[11px] text-zinc-400 dark:text-zinc-500">세트 없음</p>;
  }
  const worn = set.pieces.filter((p) => equippedIds?.has(p)).length;
  const active = worn === set.pieces.length;
  return (
    <p
      className={`truncate text-[11px] font-medium ${
        active
          ? "text-amber-600 dark:text-amber-400"
          : "text-zinc-500 dark:text-zinc-400"
      }`}
      title={set.name}
    >
      🔗 {set.name} ({worn}/{set.pieces.length}
      {active ? " 발동" : ""})
    </p>
  );
}

export function V2ItemCompareCard({
  candidate,
  equipped,
  onClose,
  equip,
  unequip,
  lock,
  equippedIds,
}: {
  // 탭한(장착 후보) 장비 — 우측, 증감 표기 + 하단 장착하기.
  candidate: V2CompareSide;
  // 같은 슬롯 장착 장비 — 좌측, 절대값 + 해제.
  equipped: V2CompareSide;
  onClose: () => void;
  equip: { busy: boolean; onEquip: () => void };
  unequip: { busy: boolean; onUnequip: () => void };
  // 후보 즐겨찾기 잠금 토글.
  lock?: ItemCardLockAction;
  // 착용 중 장비 id 집합 — 세트 발동(전 부위 착용) 판정용.
  equippedIds?: ReadonlySet<V2EquipmentId>;
}) {
  useEscapeKey(onClose);

  const equippedRows = v2EquipStatRows(
    equipped.item,
    equipped.roll,
    equipped.enhance,
    equipped.craftQuality,
  );
  const compareRows = v2EquipCompareRows(candidate, equipped);
  // 어느 한쪽이라도 세트 장비면 세트 줄 노출(둘 다 아니면 숨겨 노이즈 방지).
  const showSet = Boolean(equipped.item.setId || candidate.item.setId);

  return (
    <>
      {/* 딤 배경 — 클릭 시 닫힘(비교는 의사결정 화면이라 단일 카드와 달리 살짝 딤). */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${candidate.item.name} 비교`}
        className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            아이템 비교
          </h2>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
            {lock && (
              <button
                type="button"
                onClick={lock.onToggle}
                disabled={lock.busy}
                aria-label={lock.locked ? "잠금 해제" : "잠금"}
                aria-pressed={lock.locked}
                title={lock.locked ? "잠금됨 — 일괄 판매 보호" : "잠그기"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                  lock.locked
                    ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {lock.locked ? (
                  <Lock size={16} weight="fill" />
                ) : (
                  <LockOpen size={16} weight="bold" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {/* 좌 — 현재 장착(절대값 + 해제) */}
          <div className="min-w-0 space-y-2">
            <CompareHeader tag="현재 장착 중" side={equipped} />
            <div className="space-y-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-700">
              {equippedRows.length === 0 ? (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  옵션 없음
                </span>
              ) : (
                equippedRows.map((r) => (
                  <CompareStatRow key={r.label} label={r.label} value={r.value} />
                ))
              )}
            </div>
            {showSet && (
              <CompareSetLine item={equipped.item} equippedIds={equippedIds} />
            )}
            <Button
              onClick={unequip.onUnequip}
              disabled={unequip.busy || equip.busy}
              variant="secondary"
              size="xs"
              fullWidth
            >
              {unequip.busy ? "처리 중…" : "해제"}
            </Button>
          </div>

          {/* 우 — 후보(절대값 + 현재 대비 증감) */}
          <div className="min-w-0 space-y-2 border-l border-zinc-100 pl-3 dark:border-zinc-700">
            <CompareHeader tag="비교 대상" side={candidate} />
            <div className="space-y-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-700">
              {compareRows.length === 0 ? (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  옵션 없음
                </span>
              ) : (
                compareRows.map((r) => (
                  <CompareStatRow
                    key={r.label}
                    label={r.label}
                    value={r.value}
                    deltaText={r.deltaText}
                    better={r.better}
                  />
                ))
              )}
            </div>
            {showSet && (
              <CompareSetLine item={candidate.item} equippedIds={equippedIds} />
            )}
            {candidate.item.signature && (
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                ★ {signatureLabel(candidate.item.signature)}
              </p>
            )}
          </div>
        </div>

        {candidate.item.description && (
          <p className="mt-3 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {candidate.item.description}
          </p>
        )}

        <Button
          onClick={equip.onEquip}
          disabled={equip.busy || unequip.busy}
          variant="success"
          size="md"
          fullWidth
          className="mt-3"
        >
          {equip.busy ? "처리 중…" : "장착하기"}
        </Button>
      </div>
    </>
  );
}
