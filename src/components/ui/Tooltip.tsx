"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// 마우스 오버(데스크톱) + 탭(모바일)으로 짧은 설명을 띄우는 경량 툴팁.
// 트리거 자체가 버튼이라 키보드 포커스도 동작. 바깥 포인터다운·Esc 로 닫힘.
// 위치: 트리거 위(bottom-full). align 으로 좌/중앙/우 정렬해 그리드 가장자리 셀의
// 가로 잘림을 피한다. 부모(Card)는 overflow-hidden 이 아니라 카드 밖으로 떠도 안 잘림.

type Align = "start" | "center" | "end";

export function Tooltip({
  content,
  align = "center",
  placement = "top",
  triggerClassName,
  className,
  children,
}: {
  /** 툴팁 본문. */
  content: ReactNode;
  /** 트리거 기준 가로 정렬 — 그리드 가장자리 셀은 start/end 로 잘림 방지. */
  align?: Align;
  /** 트리거 위/아래 — 상단 요소(위가 막힌 경우)는 bottom 으로 아래에 띄움. */
  placement?: "top" | "bottom";
  /** 트리거 버튼 클래스(셀 모양 그대로 넘겨받음). */
  triggerClassName?: string;
  /** 외곽 래퍼 클래스 — 여백(mt 등) 전달용. */
  className?: string;
  /** 트리거 내부(셀 내용). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    // 바깥을 탭/클릭하면 닫기 (모바일 탭 토글 후 다른 곳 눌렀을 때).
    const onDocPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const placementClass =
    placement === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5";

  return (
    <div
      ref={wrapRef}
      className={`relative ${className ?? ""} ${open ? "z-20" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-describedby={open ? id : undefined}
        className={triggerClassName}
      >
        {children}
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute w-44 max-w-[60vw] whitespace-normal break-keep rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-normal leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 ${placementClass} ${alignClass}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
