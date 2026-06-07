"use client";

import { useEffect, type CSSProperties } from "react";
import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_EQUIP_SETS,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipOptions,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

// 굴림 품질 % → 색. 높을수록 좋은 굴림(emerald)·중간(zinc)·낮음(amber).
// 인벤 카드 배지와 공유 — V2InventoryView 가 여기서 import(기존 import 방향 유지).
export function rollPctClass(pct: number): string {
  if (pct >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 40) return "text-zinc-500 dark:text-zinc-400";
  return "text-amber-600 dark:text-amber-500";
}

// 세트 보너스(V2EquipOptions) → 표시 문자열. crit/eva = %, mp/hp = flat.
const SET_BONUS_LABEL: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  mp: "MP",
  hp: "HP",
  critMult: "치명피해",
  spd: "속도",
};
function formatSetBonus(bonus: Readonly<V2EquipOptions>): string {
  return (Object.keys(SET_BONUS_LABEL) as (keyof V2EquipOptions)[])
    .filter((k) => bonus[k])
    .map((k) => {
      // critMult 은 백분의 일 정수(30=+0.30×). crit/eva = %, 그 외 flat.
      if (k === "critMult")
        return `${SET_BONUS_LABEL[k]} +${((bonus[k] ?? 0) / 100).toFixed(2)}×`;
      const unit = k === "crit" || k === "eva" ? "%" : "";
      return `${SET_BONUS_LABEL[k]} +${bonus[k]}${unit}`;
    })
    .join(", ");
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

export function V2ItemCard({
  item,
  anchor,
  onClose,
  roll,
  equip,
}: {
  item: V2Equipment;
  anchor: ItemCardAnchor;
  onClose: () => void;
  // 보유템의 개체 굴림(편차). 주면 굴림값 표시, 없으면 카탈로그(상점·제작 미리보기).
  roll?: V2EquipRoll;
  // 인벤토리에서만 주입 — 카드 하단에 장착/해제 버튼. 상점·제작·캐릭터 팝오버는 미주입(읽기전용).
  equip?: ItemCardEquipAction;
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

  const options = v2EquipStatRows(item, roll);
  const pct = rollQualityPct(item, roll);
  const set = item.setId
    ? V2_EQUIP_SETS.find((s) => s.id === item.setId)
    : undefined;

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
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {item.name}
            </h2>
            <ItemTypeChip item={item} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {pct != null && (
          <div className="mt-2 flex items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5 text-xs dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400">굴림 품질</span>
            <span className={`font-semibold tabular-nums ${rollPctClass(pct)}`}>
              {pct}%
            </span>
          </div>
        )}

        <div className="mt-2 space-y-0.5">
          {options.length === 0 ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              옵션 없음
            </span>
          ) : (
            options.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {s.label}
                </span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {s.value}
                </span>
              </div>
            ))
          )}
        </div>

        {set && (
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {set.name} ({set.pieces.length}종)
              </span>
              <span className="tabular-nums text-amber-600 dark:text-amber-400">
                {formatSetBonus(set.bonus)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              세트 조각을 모두 착용하면 적용됩니다.
            </p>
          </div>
        )}

        {item.description && (
          <p className="mt-2 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {item.description}
          </p>
        )}

        {equip && (
          <button
            type="button"
            onClick={equip.isEquipped ? equip.onUnequip : equip.onEquip}
            disabled={equip.busy}
            className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              equip.isEquipped
                ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {equip.busy ? "처리 중…" : equip.isEquipped ? "해제" : "장착하기"}
          </button>
        )}
      </div>
    </>
  );
}
