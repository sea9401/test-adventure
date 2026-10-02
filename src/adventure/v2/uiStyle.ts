// 화면 스타일(클래식/금빛) 저장값. 테마와 같이 이 브라우저에만 저장한다.
// 플레이어가 고른 값은 항상 저장하므로, 나중에 기본값을 바꿔도 클래식을 직접 고른
// 사람은 클래식에 남고 저장값이 없는 사람만 새 기본값을 따른다.
export const UI_STYLE_STORAGE_KEY = "ui-style.v1";
export const GILDED_STYLE_CLASS = "ui-skin-gilded";

export type UiStyle = "classic" | "gilded";

export const DEFAULT_UI_STYLE: UiStyle = "classic";

export function parseStoredUiStyle(value: string | null): UiStyle {
  if (value === "classic" || value === "gilded") return value;
  return DEFAULT_UI_STYLE;
}

// 루트 레이아웃 <head>에서 첫 화면을 그리기 전에 실행해 스타일 깜빡임을 막는다.
export function uiStyleInitScript(): string {
  const key = JSON.stringify(UI_STYLE_STORAGE_KEY);
  const className = JSON.stringify(GILDED_STYLE_CLASS);
  const fallback = JSON.stringify(DEFAULT_UI_STYLE);
  return `(function(){try{var s=localStorage.getItem(${key});if(s!=="classic"&&s!=="gilded")s=${fallback};if(s==="gilded")document.documentElement.classList.add(${className});}catch(e){}})();`;
}
