"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react";

export function ItemSearchInput({ value, onChange, label }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
      <MagnifyingGlass size={18} aria-hidden className="shrink-0 text-zinc-500 dark:text-zinc-400" />
      <input
        type="search"
        aria-label={label}
        placeholder="현재 분류에서 아이템 이름 검색"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-w-0 flex-1 bg-white text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-violet-500 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {value && (
        <button type="button" aria-label={`${label} 초기화`} onClick={() => onChange("")} className="rounded p-1 text-zinc-500 focus:ring-2 focus:ring-violet-500 dark:text-zinc-400">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
