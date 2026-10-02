"use client";

import { useEffect, useState } from "react";
import {
  GILDED_STYLE_CLASS,
  UI_STYLE_STORAGE_KEY,
  type UiStyle,
} from "@/adventure/v2/uiStyle";

type Theme = "light" | "dark";

// /dev 프리뷰 전용 — 화면 스타일과 라이트·다크를 바로 바꿔 보는 떠 있는 전환 버튼.
//   저장 방식은 설정 화면과 같다(이 브라우저의 localStorage).
export function DevStyleToggle() {
  const [style, setStyle] = useState<UiStyle>("classic");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStyle(root.classList.contains(GILDED_STYLE_CLASS) ? "gilded" : "classic");
    setTheme(root.classList.contains("dark") ? "dark" : "light");
  }, []);

  const changeStyle = (next: UiStyle) => {
    setStyle(next);
    document.documentElement.classList.toggle(GILDED_STYLE_CLASS, next === "gilded");
    try {
      localStorage.setItem(UI_STYLE_STORAGE_KEY, next);
    } catch {}
  };

  const changeTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  const option = (selected: boolean) =>
    `min-h-10 rounded-md px-3 text-xs font-semibold ${
      selected
        ? "bg-primary text-on-primary"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <div
      aria-label="미리보기 화면 전환"
      className="ui-surface-card fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <button type="button" aria-pressed={style === "classic"} className={option(style === "classic")} onClick={() => changeStyle("classic")}>
        클래식
      </button>
      <button type="button" aria-pressed={style === "gilded"} className={option(style === "gilded")} onClick={() => changeStyle("gilded")}>
        금빛
      </button>
      <span aria-hidden className="mx-1 w-px self-stretch bg-zinc-200 dark:bg-zinc-700" />
      <button type="button" aria-pressed={theme === "light"} className={option(theme === "light")} onClick={() => changeTheme("light")}>
        라이트
      </button>
      <button type="button" aria-pressed={theme === "dark"} className={option(theme === "dark")} onClick={() => changeTheme("dark")}>
        다크
      </button>
    </div>
  );
}
