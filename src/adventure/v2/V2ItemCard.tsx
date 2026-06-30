"use client";

import { useEffect, type CSSProperties } from "react";
import { Lock, LockOpen, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  scaledEquipWeight,
  signatureLabel,
  v2EquipCompareRows,
  v2EquipPowerLabel,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipOptions,
  type V2EquipRoll,
  type V2EquipStatRow,
  type V2CraftedBy,
} from "@/adventure/data/v2/v2Equipment";
import {
  VARIANCE_FRACTION,
  rollQualityPct,
} from "@/adventure/data/v2/v2EquipVariance";
import {
  enhancedPower,
  type V2EnhanceState,
} from "@/adventure/data/v2/v2Enhance";

const QUALITY_PRISM_GRADIENT =
  "linear-gradient(90deg,#e11d48,#f59e0b,#84cc16,#0ea5e9,#8b5cf6,#ec4899)";

// 굴림 품질 % → 색. 색 기준은 위력이 아니라 같은 장비 안에서의 개체 굴림 품질이다.
// 인벤 카드 배지와 공유 — V2InventoryView 가 여기서 import(기존 import 방향 유지).
export function rollPctClass(pct: number): string {
  if (pct >= 95) return "text-rose-600 dark:text-rose-400";
  if (pct >= 85) return "text-amber-600 dark:text-amber-400";
  if (pct >= 70) return "text-violet-600 dark:text-violet-400";
  if (pct >= 40) return "text-sky-600 dark:text-sky-400";
  return "text-zinc-500 dark:text-zinc-400";
}

// 예전 이름은 호환을 위해 유지한다. 현재 장비명 색은 위력대가 아니라 품질% 기준이다.
export function powerNameClass(item: V2Equipment, roll?: V2EquipRoll): string {
  const pct = rollQualityPct(item, roll);
  return pct == null ? "text-zinc-900 dark:text-zinc-100" : rollPctClass(pct);
}

export function QualityPctText({
  pct,
  className = "",
}: {
  pct: number;
  className?: string;
}) {
  const perfect = pct >= 100;
  return (
    <span
      className={`${className} ${
        perfect ? "bg-clip-text font-bold text-transparent" : rollPctClass(pct)
      }`}
      style={perfect ? { backgroundImage: QUALITY_PRISM_GRADIENT } : undefined}
    >
      {pct}%
    </span>
  );
}

export function PerfectQualityBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold text-white shadow-sm ${className}`}
      style={{
        backgroundImage: QUALITY_PRISM_GRADIENT,
        textShadow: "0 1px 1px rgba(0,0,0,0.55)",
      }}
    >
      완벽
    </span>
  );
}

export function CraftOnlyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ${className}`}
    >
      제작전용
    </span>
  );
}

// 세트 보너스(V2EquipOptions) → 표시 문자열. crit/eva = %, mp/hp = flat.
const SET_BONUS_LABEL: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  mp: "MP",
  hp: "HP",
  critMult: "치명피해",
  spd: "속도",
  def: "방어",
  magicDef: "마법방어",
  healPowerPct: "회복",
  critResist: "치명저항",
};
function formatSetBonus(bonus: Readonly<V2EquipOptions>): string {
  return (Object.keys(SET_BONUS_LABEL) as (keyof V2EquipOptions)[])
    .filter((k) => bonus[k])
    .map((k) => {
      // critMult 은 백분의 일 정수(30=+0.30×). crit/eva/healPowerPct = %, 그 외 flat.
      if (k === "critMult")
        return `${SET_BONUS_LABEL[k]} +${((bonus[k] ?? 0) / 100).toFixed(2)}×`;
      const unit =
        k === "crit" || k === "eva" || k === "healPowerPct" || k === "critResist"
          ? "%"
          : "";
      return `${SET_BONUS_LABEL[k]} +${bonus[k]}${unit}`;
    })
    .join(", ");
}

// 스탯 한 줄 — 라벨(좌) + 값(우). 기본 스탯·옵션이 같은 표기를 공유.
function StatRow({ row }: { row: V2EquipStatRow }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
        {row.label}
      </span>
      <span className="min-w-0 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
        {row.value}
      </span>
    </div>
  );
}

const RANGE_OPTION_LABEL_TO_KEY: Partial<Record<string, keyof V2EquipOptions>> =
  {
    치명: "crit",
    회피: "eva",
    MP: "mp",
    HP: "hp",
    속도: "spd",
    치명피해: "critMult",
    방어: "def",
    마법방어: "magicDef",
    회복: "healPowerPct",
    치명저항: "critResist",
  };

function rollRange(
  value: number,
  floor: number,
): { lo: number; hi: number } | null {
  const spread = Math.round(value * VARIANCE_FRACTION);
  if (spread <= 0) return null;
  return { lo: Math.max(floor, value - spread), hi: value + spread };
}

function formatRangeValue(label: string, value: number): string {
  if (label === "무게") return `${value}`;
  if (label === "치명피해") return `+${(value / 100).toFixed(2)}×`;
  if (
    label === "치명" ||
    label === "회피" ||
    label === "회복" ||
    label === "치명저항"
  ) {
    return `+${value}%`;
  }
  return `+${value}`;
}

function statRowWithRollRange(
  item: V2Equipment,
  row: V2EquipStatRow,
  roll: V2EquipRoll | undefined,
  enhance: V2EnhanceState | undefined,
): V2EquipStatRow {
  if (!roll) return row;

  const powerLabel = v2EquipPowerLabel(item);
  if (row.label === powerLabel) {
    const range = rollRange(item.power, 1);
    if (!range) return row;
    return {
      ...row,
      value: `${row.value} (${formatRangeValue(
        row.label,
        enhancedPower(range.lo, enhance),
      )} - ${formatRangeValue(row.label, enhancedPower(range.hi, enhance))})`,
    };
  }

  if (row.label === "무게") {
    const range = rollRange(item.weight, 0);
    if (!range) return row;
    return {
      ...row,
      value: `${row.value} (${scaledEquipWeight(
        item,
        range.lo,
      )} - ${scaledEquipWeight(item, range.hi)})`,
    };
  }

  const optionKey = RANGE_OPTION_LABEL_TO_KEY[row.label];
  const base = optionKey ? item.options?.[optionKey] : undefined;
  if (base == null) return row;
  const range = rollRange(base, 1);
  if (!range) return row;
  return {
    ...row,
    value: `${row.value} (${formatRangeValue(
      row.label,
      range.lo,
    )} - ${formatRangeValue(row.label, range.hi)})`,
  };
}

// 장비 아이템 옵션 카드 — 클릭한 슬롯 근처에 뜨는 플로팅 팝오버.
// 전체화면 모달 아님: 스크림/스크롤락/포커스트랩 없이, 바깥 클릭·Esc 로만 닫힘.
// 내용은 이름·옵션(스탯 행)·세트·설명만. 티어 숫자·컨셉 태그(힘/민/지 등)는 노출 안 함.

// 클릭한 슬롯의 화면 좌표 — 이 근처에 카드를 띄운다 (DOMRect 의 필요한 값만).
export type ItemCardAnchor = { top: number; bottom: number; left: number };

// 클릭한 엘리먼트의 화면 좌표 → 팝오버 앵커. 슬롯·행 onClick 에서 공유.
export function anchorOf(el: HTMLElement): ItemCardAnchor {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left };
}

const WIDTH = 256; // 카드 폭(px)
const GAP = 6; // 앵커와 카드 사이 간격
const MARGIN = 8; // 뷰포트 가장자리 여백

export type ItemCardEquipAction = {
  isEquipped: boolean;
  busy: boolean;
  onEquip: () => void;
  onUnequip: () => void;
};

export type ItemCardCompareAction = {
  onCompare: () => void;
};

// 인벤토리에서만 주입 — 즐겨찾기 잠금 토글(헤더). 잠금 = 일괄/실수 판매 방지.
export type ItemCardLockAction = {
  locked: boolean;
  busy: boolean;
  onToggle: () => void;
};

export function V2ItemCard({
  item,
  anchor,
  onClose,
  roll,
  enhance,
  craftedBy,
  equip,
  compare,
  lock,
  equippedIds,
}: {
  item: V2Equipment;
  anchor: ItemCardAnchor;
  onClose: () => void;
  // 보유템의 개체 굴림(편차). 주면 굴림값 표시, 없으면 카탈로그(상점·제작 미리보기).
  roll?: V2EquipRoll;
  // 강화 상태 — 주면 제목 +N + 위력 강화 반영(v2EquipStatRows).
  enhance?: V2EnhanceState;
  // 제작자 표식 — 길드 대장간 제작품에만 표시.
  craftedBy?: V2CraftedBy;
  // 인벤토리에서만 주입 — 카드 하단에 장착/해제 버튼. 상점·제작·캐릭터 팝오버는 미주입(읽기전용).
  equip?: ItemCardEquipAction;
  // 인벤토리에서만 주입 — 같은 슬롯 장착 장비가 있을 때 사용자가 원할 때 비교 모달로 전환.
  compare?: ItemCardCompareAction;
  // 인벤토리에서만 주입 — 헤더의 즐겨찾기 잠금 토글.
  lock?: ItemCardLockAction;
  // 현재 착용 중인 장비 id 집합 — 세트 발동(전 부위 착용) 판정 + 부위별 착용 하이라이트.
  //   미지정이면 착용 정보 없음으로 간주(전부 미착용·세트 미발동 표시).
  equippedIds?: ReadonlySet<V2EquipmentId>;
}) {
  useEscapeKey(onClose);

  // 좌표는 클릭 시점 고정값이라, 스크롤·리사이즈로 앵커와 어긋나면 닫는다.
  // (window scroll 은 뷰포트 스크롤에만 발동 — 팝오버 내부 overflow 스크롤은 무관.)
  useEffect(() => {
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // 기본 스탯(공격력/방어력 계열·무게)과 옵션(치명/MP 등)을 나눠 사이에 구분선을 긋는다.
  //   강화 수치는 이름 옆 "+N" 으로만 표기.
  const statRows = v2EquipStatRows(item, roll, enhance).map((row) =>
    statRowWithRollRange(item, row, roll, enhance),
  );
  const powerLabel = v2EquipPowerLabel(item);
  const baseRows = statRows.filter(
    (r) => r.label === powerLabel || r.label === "무게",
  );
  const optionRows = statRows.filter(
    (r) => r.label !== powerLabel && r.label !== "무게",
  );
  const pct = rollQualityPct(item, roll);
  const set = item.setId
    ? V2_EQUIP_SETS.find((s) => s.id === item.setId)
    : undefined;
  const tagSets = (item.setTags ?? [])
    .map((tag) => V2_EQUIP_TAG_SETS.find((s) => s.id === tag))
    .filter((s): s is (typeof V2_EQUIP_TAG_SETS)[number] => Boolean(s));
  const equippedTagCounts = new Map<string, number>();
  if (equippedIds) {
    for (const id of equippedIds) {
      for (const tag of V2_EQUIPMENT[id]?.setTags ?? []) {
        equippedTagCounts.set(tag, (equippedTagCounts.get(tag) ?? 0) + 1);
      }
    }
  }
  // 세트 발동 = 세트의 전 조각을 현재 착용 중(서버 aggregateV2Equipment 와 동일 기준).
  const equippedSetCount = set
    ? set.pieces.filter((p) => equippedIds?.has(p)).length
    : 0;
  const setActive = set != null && equippedSetCount === set.pieces.length;

  // 앵커 기준 위치 계산 — 좌측은 뷰포트 안으로 clamp, 화면 하단에 가까우면 위로 띄움.
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  // 초협소 뷰포트(vw < WIDTH + 여백)에서도 화면 안에 들어오도록 폭을 줄인다.
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
  const placeAbove = anchor.bottom > vh * 0.6;
  const pos: CSSProperties = placeAbove
    ? { bottom: vh - anchor.top + GAP, maxHeight: anchor.top - GAP - MARGIN }
    : { top: anchor.bottom + GAP, maxHeight: vh - anchor.bottom - GAP - MARGIN };

  return (
    <>
      {/* 바깥 클릭 캐처 — 투명(딤 없음). */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${item.name} 정보`}
        style={{ position: "fixed", width, left, ...pos }}
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              className={`truncate text-base font-semibold leading-tight ${powerNameClass(item, roll)}`}
            >
              {item.name}
              {enhance && enhance.level > 0 ? (
                <span className="ml-1 text-amber-500">+{enhance.level}</span>
              ) : null}
            </h2>
            <div className="flex items-center gap-1.5">
              <ItemTypeChip item={item} />
              {item.craftOnly ? <CraftOnlyBadge /> : null}
              {pct != null && (
                <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={pct} className="font-semibold" />
                  {pct >= 100 ? <PerfectQualityBadge /> : null}
                </span>
              )}
            </div>
            {craftedBy ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                제작자{" "}
                <PlayerNameLink
                  name={craftedBy.name}
                  className="font-medium"
                  fallback="모험가"
                />{" "}
                · 대장장이 Lv{" "}
                {craftedBy.level.toLocaleString()}
              </div>
            ) : null}
            {item.craftOnly ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                획득: 길드 영지 → 대장간 → 레시피 제작
              </div>
            ) : null}
          </div>
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

        {statRows.length === 0 ? (
          <div className="mt-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              옵션 없음
            </span>
          </div>
        ) : (
          <>
            {baseRows.length > 0 && (
              <div className={`${SURFACE_INSET} mt-3 space-y-0.5 p-2`}>
                {baseRows.map((s) => (
                  <StatRow key={s.label} row={s} />
                ))}
              </div>
            )}
            {/* 옵션 — 기본 스탯과 구분선으로 분리(품질 아래 선과 동일). */}
            {optionRows.length > 0 && (
              <div
                className={`${SURFACE_INSET} mt-2 space-y-0.5 p-2`}
              >
                {optionRows.map((s) => (
                  <StatRow key={s.label} row={s} />
                ))}
              </div>
            )}
          </>
        )}

        {/* 단품 마퀴 시그니처(세트 아닌 고유 아이템의 발동형 효과) — 장착만 하면 발동. */}
        {item.signature && (
          <div className="mt-2 border-t border-zinc-200 pt-2 text-[11px] font-medium text-amber-600 dark:border-zinc-800 dark:text-amber-400">
            ★ {signatureLabel(item.signature)}
          </div>
        )}

        {set && (
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              {/* 세트명·보너스 — 발동(전 부위 착용) 시 amber, 미발동 시 회색으로 상태 인지. */}
              <span
                className={`font-medium ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {set.name} ({set.pieces.length}종)
              </span>
              <span
                className={`tabular-nums ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {formatSetBonus(set.bonus)}
              </span>
            </div>
            {/* 세트 발동형 시그니처 효과(전 부위 착용 시) — 스탯 보너스와 별개로 명시. */}
            {set.signature && (
              <p
                className={`mt-1 text-[11px] ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                ★ {signatureLabel(set.signature)}
              </p>
            )}
            {/* 세트 구성 — 착용 중인 부위는 밝게(흰색) 하이라이트로 몇 부위 모았는지 한눈에. */}
            <ul className="mt-1 space-y-px">
              {set.pieces.map((pid) => {
                const piece = V2_EQUIPMENT[pid];
                const isWorn = equippedIds?.has(pid) ?? false;
                return (
                  <li
                    key={pid}
                    className={`flex items-baseline gap-1 text-[11px] ${
                      isWorn
                        ? "font-medium text-zinc-800 dark:text-zinc-100"
                        : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    <span
                      className={`shrink-0 ${
                        isWorn
                          ? "text-emerald-500"
                          : "text-zinc-300 dark:text-zinc-600"
                      }`}
                    >
                      {isWorn ? "✓" : "·"}
                    </span>
                    <span className="truncate">{piece?.name ?? pid}</span>
                    {piece && (
                      <span className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">
                        {V2_SLOT_LABEL[piece.slot]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* 발동 상태 + 진행도(N/M 착용) 텍스트 보강. */}
            {setActive ? (
              <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                세트 발동 중 ({set.pieces.length}/{set.pieces.length} 착용)
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {equippedSetCount}/{set.pieces.length} 착용 중 — 모두 착용하면 발동
              </p>
            )}
          </div>
        )}

        {tagSets.map((tagSet) => {
          const count = equippedTagCounts.get(tagSet.id) ?? 0;
          return (
            <div
              key={tagSet.id}
              className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800"
            >
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {tagSet.name} 세트
              </div>
              <div className="mt-1 space-y-px">
                {tagSet.thresholds.map((threshold) => {
                  const active = count >= threshold.count;
                  return (
                    <div
                      key={threshold.count}
                      className={`flex items-baseline justify-between gap-2 text-[11px] ${
                        active
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      <span>{threshold.count}세트</span>
                      <span className="tabular-nums">
                        {formatSetBonus(threshold.bonus)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {item.description && (
          <p className="mt-2 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {item.description}
          </p>
        )}

        {(compare || equip) && (
          <div
            className={`mt-3 grid gap-2 ${
              compare && equip ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {compare && (
              <Button
                onClick={compare.onCompare}
                variant="secondary"
                size="md"
              >
                비교
              </Button>
            )}
            {equip && (
              <Button
                onClick={equip.isEquipped ? equip.onUnequip : equip.onEquip}
                disabled={equip.busy}
                variant={equip.isEquipped ? "secondary" : "success"}
                size="md"
              >
                {equip.busy
                  ? "처리 중…"
                  : equip.isEquipped
                    ? "해제"
                    : "장착하기"}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export type V2SimpleInfoLine = {
  label: string;
  value: string;
};

export function V2SimpleItemInfoCard({
  title,
  subtitle,
  description,
  anchor,
  onClose,
  lines = [],
}: {
  title: string;
  subtitle?: string;
  description?: string;
  anchor: ItemCardAnchor;
  onClose: () => void;
  lines?: V2SimpleInfoLine[];
}) {
  useEscapeKey(onClose);

  useEffect(() => {
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
  const placeAbove = anchor.bottom > vh * 0.6;
  const pos: CSSProperties = placeAbove
    ? { bottom: vh - anchor.top + GAP, maxHeight: anchor.top - GAP - MARGIN }
    : { top: anchor.bottom + GAP, maxHeight: vh - anchor.bottom - GAP - MARGIN };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${title} 정보`}
        style={{ position: "fixed", width, left, ...pos }}
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {lines.length > 0 ? (
          <div className={`${SURFACE_INSET} mt-3 space-y-0.5 p-2`}>
            {lines.map((line) => (
              <div
                key={line.label}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {line.label}
                </span>
                <span className="text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                  {line.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {description ? (
          <p className="mt-3 border-t border-zinc-200 pt-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {description}
          </p>
        ) : null}
      </div>
    </>
  );
}

// ── 장비 비교 카드 (장착 중 vs 후보) ─────────────────────────────────────────
// 미장착 장비를 탭했을 때, 같은 슬롯의 장착 장비와 한 팝오버에서 좌우로 비교한다.
//   좌=현재 장착(절대값 + 해제) · 우=후보(절대값 + 현재 대비 증감) · 하단=장착하기.
//   모바일에서 카드 두 개를 동시에 띄우면 꽉 차므로 단일 중앙 모달 + 2열로 압축(사용자 결정).

export type V2CompareSide = {
  item: V2Equipment;
  roll?: V2EquipRoll;
  enhance?: V2EnhanceState;
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

// 한쪽(장착/후보) 헤더 — 작은 구분 라벨 + 이름(+강화) + 종류칩 + 품질.
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
          className={`truncate text-sm font-semibold ${powerNameClass(side.item, side.roll)}`}
        >
          {side.item.name}
          {side.enhance && side.enhance.level > 0 ? (
            <span className="ml-1 text-amber-500">+{side.enhance.level}</span>
          ) : null}
        </h3>
        <ItemTypeChip item={side.item} />
        {side.item.craftOnly ? <CraftOnlyBadge /> : null}
      </div>
      {pct != null && (
        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">품질</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <QualityPctText pct={pct} className="font-semibold" />
            {pct >= 100 ? <PerfectQualityBadge /> : null}
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
        className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
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
            <div className="space-y-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
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
          <div className="min-w-0 space-y-2 border-l border-zinc-100 pl-3 dark:border-zinc-800">
            <CompareHeader tag="비교 대상" side={candidate} />
            <div className="space-y-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
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
          <p className="mt-3 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
