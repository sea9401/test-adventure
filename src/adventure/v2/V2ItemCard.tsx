"use client";

import { useEffect, type CSSProperties } from "react";
import { Lock, LockOpen, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  V2_EQUIP_SETS,
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  powerBandOf,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipmentId,
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

// 위력 색 구간(powerBandOf, 0…6) → 아이템 이름 색. 등급/유니크 대신 실효(굴림 반영) 위력으로
// 분류(사용자 결정). 옅은 보라색 계열 — 위력 낮음(회색)에서 높을수록 연보라→보라→진보라.
// 인벤 이름·카드 제목·제작·상점·캐릭터 슬롯 공유.
// 라이트=진하게(흰 배경 대비)/다크=옅게(옅은 보라 느낌) — 두 모드 모두 가독.
// 보라색 위로 자홍→장미→진홍 3단계 미리 준비(향후 더 높은 위력 콘텐츠 대비). 현재 위력대는
// 0~2(회색/옅은보라/보라)까지 도달, 3~6 은 여유분 — 추가 색은 POWER_BAND_COUNT 만 올리면 활성.
const POWER_BAND_CLASS = [
  "text-zinc-500 dark:text-zinc-400", // 0 위력 낮음(기본)
  "text-violet-500 dark:text-violet-300", // 1 옅은 보라
  "text-violet-600 dark:text-violet-400", // 2 보라
  "text-purple-700 dark:text-purple-400", // 3 진보라(향후)
  "text-fuchsia-700 dark:text-fuchsia-400", // 4 자홍(향후)
  "text-rose-600 dark:text-rose-400", // 5 장미(향후)
  "text-red-600 dark:text-red-500", // 6 진홍 — 최상(향후)
] as const;
export function powerNameClass(item: V2Equipment, roll?: V2EquipRoll): string {
  return POWER_BAND_CLASS[powerBandOf(item, roll)] ?? POWER_BAND_CLASS[0];
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
  equip,
  lock,
  equippedIds,
}: {
  item: V2Equipment;
  anchor: ItemCardAnchor;
  onClose: () => void;
  // 보유템의 개체 굴림(편차). 주면 굴림값 표시, 없으면 카탈로그(상점·제작 미리보기).
  roll?: V2EquipRoll;
  // 인벤토리에서만 주입 — 카드 하단에 장착/해제 버튼. 상점·제작·캐릭터 팝오버는 미주입(읽기전용).
  equip?: ItemCardEquipAction;
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

  const options = v2EquipStatRows(item, roll);
  const pct = rollQualityPct(item, roll);
  const set = item.setId
    ? V2_EQUIP_SETS.find((s) => s.id === item.setId)
    : undefined;
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
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              className={`truncate text-sm font-semibold ${powerNameClass(item, roll)}`}
            >
              {item.name}
            </h2>
            <ItemTypeChip item={item} />
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

        {pct != null && (
          <div className="mt-2 flex items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5 text-xs dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400">품질</span>
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
