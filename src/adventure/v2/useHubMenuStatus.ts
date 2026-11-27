"use client";

import { useCallback } from "react";
import type { EntryTileStatusResolver } from "@/components/ui/EntryList";
import { useAdventureDashboard } from "./AdventureDashboardProvider";
import { menuItemStatusForHref } from "./MainTabNav";

/**
 * 타일은 좁아서 상태 글 앞머리가 메뉴 이름과 겹치면 뺀다.
 * 예: "모험가 농장" 타일의 "농장 일일 납품 · 0 / 2" → "일일 납품 · 0 / 2".
 */
export function compactHubMenuStatusText(text: string, label: string): string {
  const labelWords = new Set(label.split(/\s+/));
  const [head, ...rest] = text.split(" · ");
  const words = head.split(/\s+/);
  while (words.length > 1 && labelWords.has(words[0])) words.shift();
  return [words.join(" "), ...rest].join(" · ");
}

/** 메뉴 화면 타일의 상태 한 줄. 하단 메뉴 펼침과 같은 자료·같은 규칙으로 만든다. */
export function useHubMenuStatus(): EntryTileStatusResolver {
  const { snapshot } = useAdventureDashboard();
  return useCallback(
    (href, label) => {
      const status = menuItemStatusForHref(snapshot, href, label);
      return status
        ? { ...status, text: compactHubMenuStatusText(status.text, label) }
        : null;
    },
    [snapshot],
  );
}
