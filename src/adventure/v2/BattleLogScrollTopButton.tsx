"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";

function scrollTarget(scrollTargetId?: string): Window | HTMLElement {
  if (scrollTargetId) {
    const element = document.getElementById(scrollTargetId);
    if (element) return element;
  }
  return window;
}

function scrollOffset(target: Window | HTMLElement): number {
  return target === window ? window.scrollY : (target as HTMLElement).scrollTop;
}

export function BattleLogScrollTopButton({
  scrollTargetId,
}: {
  scrollTargetId?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = scrollTarget(scrollTargetId);
    const updateVisibility = () => setVisible(scrollOffset(target) >= 360);
    updateVisibility();
    target.addEventListener("scroll", updateVisibility, { passive: true });
    return () => target.removeEventListener("scroll", updateVisibility);
  }, [scrollTargetId]);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="페이지 맨 위로"
      onClick={() =>
        scrollTarget(scrollTargetId).scrollTo({ top: 0, behavior: "smooth" })
      }
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:bottom-24 sm:right-6 dark:border-emerald-400 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:ring-offset-zinc-950"
    >
      <ArrowUp size={17} weight="bold" aria-hidden />
      맨 위로
    </button>
  );
}
