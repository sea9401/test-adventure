"use client";

import { useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";

// 메인 내비 — 가로 5탭(모험/전투/마을/캐릭터/길드) 대신 "현재 섹션 이름 ▾" 버튼 하나로 압축하고,
// 누르면 드롭다운으로 섹션을 고른다(사용자 요청). 색·활성 표기는 기존 탭바(highlight)와 동일한
// 인디고 언어를 따른다. 바깥 클릭·Esc·항목 선택 시 닫힘.
export function MainNavDropdown<K extends string>({
  tabs,
  activeKey,
  onSelect,
  ariaLabel = "메인 메뉴",
}: {
  tabs: ReadonlyArray<{ key: K; label: string }>;
  activeKey: K;
  onSelect: (key: K) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  useEscapeKey(() => setOpen(false));

  // 활성 탭 라벨 — 매칭 안 되면(예: 광장처럼 탭 밖 라우트) 중립 "메뉴".
  const activeLabel = tabs.find((t) => t.key === activeKey)?.label ?? "메뉴";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        // 가시 라벨(현재 섹션)을 가리지 않게 동적으로 — "모험 메뉴" 식. panel 은 ariaLabel 유지.
        aria-label={`${activeLabel} 메뉴`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-lg font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
      >
        {activeLabel}
        <CaretDown
          size={16}
          weight="bold"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 — 투명 캐처(딤 없음). */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            aria-label={ariaLabel}
            className="absolute left-0 top-full z-50 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            {tabs.map((t) => {
              const isActive = t.key === activeKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    // 활성 키여도 항상 이동 — 중첩 라우트(예: /map=전투 탭)에서 섹션 루트(/battle)로
                    // 돌아갈 수 있어야 함. 같은 경로면 router.push 가 사실상 no-op.
                    onSelect(t.key);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-base font-medium transition-colors ${
                    isActive
                      ? "text-indigo-700 dark:text-indigo-300"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                  }`}
                >
                  {t.label}
                  {isActive && <Check size={16} weight="bold" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
