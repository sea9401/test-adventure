"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react";

// v2 메뉴얼 — 일단 6스탯 효과. 추후 전투/길드/점령 섹션 확장.

type StatEntry = {
  key: string;
  name: string;
  korean: string;
  primary: string;
  secondary?: string;
};

const STAT_ENTRIES: StatEntry[] = [
  {
    key: "str",
    name: "STR",
    korean: "힘",
    primary: "공격력 +0.20 / 1pt",
  },
  {
    key: "dex",
    name: "DEX",
    korean: "민",
    primary: "회피 +0.10% / 1pt (최대 75%) · 명중 +0.05%p / 1pt",
    secondary: "공격력 +0.06 / 1pt",
  },
  {
    key: "vit",
    name: "VIT",
    korean: "체",
    primary: "최대 HP +1 / 1pt",
    secondary: "방어력 +0.10 / 1pt",
  },
  {
    key: "spd",
    name: "SPD",
    korean: "속",
    primary: "추가 공격 확률 +2%p / 1pt (100% 초과 시 정수부 확정)",
    secondary: "공격력 +0.06 / 1pt · 선공권",
  },
  {
    key: "luk",
    name: "LUK",
    korean: "운",
    primary: "치명타 확률 +0.15%p / 1pt",
    secondary: "공격력 +0.04 / 1pt",
  },
  {
    key: "int",
    name: "INT",
    korean: "지",
    primary: "최대 MP +2 / 1pt",
  },
];

export function V2ManualModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="메뉴얼"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold">메뉴얼</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <section>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              스탯
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              레벨업당 5포인트를 받아 6스탯에 분배할 수 있다. 기본 STR/DEX/VIT/LUK 15, SPD 30, INT 0.
            </p>
            <ul className="mt-3 space-y-3">
              {STAT_ENTRIES.map((s) => (
                <li
                  key={s.key}
                  className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                      {s.name}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {s.korean}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                    {s.primary}
                  </p>
                  {s.secondary && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      보조: {s.secondary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
