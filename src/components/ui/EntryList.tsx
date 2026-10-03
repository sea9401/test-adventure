import { CaretRight, LockSimple } from "@phosphor-icons/react";
import Image from "next/image";
import type { ReactNode } from "react";
import { SURFACE_CARD } from "./surfaces";

// 메뉴 목록 — 상자를 세로로 쌓지 않고 카드 하나 안에서 행과 구분선으로 나눈다.
//   허브 메뉴(캐릭터·마을·전투·광장)용. 단독 진입 카드 하나는 EntryCard를 쓴다.
export function EntryList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        SURFACE_CARD,
        "divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-700",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

// 메뉴 행 — 왼쪽 48px 타일에 그 메뉴가 여는 화면의 그림(있으면) 또는 아이콘을 둔다.
export function EntryRow({
  icon,
  image,
  title,
  description,
  locked,
  selected = false,
  onClick,
}: {
  icon: ReactNode;
  // 장식용 썸네일. 보통 목적지 화면의 배경 그림(GameChrome 경로별 배경과 같은 파일).
  image?: string;
  title: string;
  description?: string;
  /** 해금 조건 문구(예: "Lv 100에 열림"). 주면 설명 대신 자물쇠와 조건을 보여 준다. 누를 수는 있다. */
  locked?: string;
  /** PC 2단에서 오른쪽에 열린 항목. */
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-locked={locked ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
        selected ? "bg-zinc-100 dark:bg-zinc-800" : ""
      }`}
    >
      <span
        aria-hidden
        className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          icon
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-base font-medium ${locked ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}>
          {title}
        </span>
        {locked ? (
          <span className="flex items-center gap-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
            <LockSimple size={14} weight="bold" aria-hidden className="shrink-0" />
            {locked}
          </span>
        ) : description ? (
          <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        ) : null}
      </span>
      <CaretRight
        size={16}
        weight="bold"
        aria-hidden
        className="shrink-0 text-zinc-400 dark:text-zinc-500"
      />
    </button>
  );
}
