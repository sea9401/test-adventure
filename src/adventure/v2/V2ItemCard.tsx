"use client";

import { useEffect, type CSSProperties } from "react";
import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import {
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";

// 장비 아이템 옵션 카드 — 클릭한 슬롯 근처에 뜨는 플로팅 팝오버.
// 전체화면 모달 아님: 스크림/스크롤락/포커스트랩 없이, 바깥 클릭·Esc 로만 닫힘.
// 내용은 이름·티어·옵션(스탯)·설명만. 컨셉 태그(힘/민/지 등)는 노출 안 함.

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

export function V2ItemCard({
  item,
  anchor,
  onClose,
  roll,
}: {
  item: V2Equipment;
  anchor: ItemCardAnchor;
  onClose: () => void;
  // 보유템의 개체 굴림(편차). 주면 굴림값 표시, 없으면 카탈로그(상점·제작 미리보기).
  roll?: V2EquipRoll;
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
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {item.name}
            </h2>
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

        {item.description && (
          <p className="mt-2 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {item.description}
          </p>
        )}
      </div>
    </>
  );
}
