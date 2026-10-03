import { MagnifyingGlass, X } from "@phosphor-icons/react";

// 거래소 둘러보기 검색창. 입력은 즉시 반영하고, 포커스를 잃거나 Enter를 누르면 최근 검색어로 기억한다.
export function MarketplaceSearchInput({
  search,
  onSearchChange,
  onRemember,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onRemember: (value: string) => void;
}) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">아이템 또는 제작자 검색</span>
      <MagnifyingGlass
        aria-hidden
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
      />
      <input
        type="search"
        placeholder="아이템 또는 제작자 검색"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        onBlur={(event) => onRemember(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onRemember(event.currentTarget.value);
          }
        }}
        className="w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {search ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onSearchChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={14} />
        </button>
      ) : null}
    </label>
  );
}
