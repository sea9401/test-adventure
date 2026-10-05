// 사냥터 목록의 지역 그림 표시 여부. 배경 표시 설정처럼 이 브라우저에만 저장한다.
export const HUNTING_GROUND_IMAGES_STORAGE_KEY = "hunting-ground-images.v1";
export const HUNTING_GROUND_IMAGES_HIDDEN_CLASS = "ui-hunting-images-hidden";
export const HUNTING_GROUND_IMAGES_HIDDEN_VALUE = "hidden";

export function parseStoredHuntingGroundImagesHidden(value: string | null): boolean {
  return value === HUNTING_GROUND_IMAGES_HIDDEN_VALUE;
}

// 루트 레이아웃 <head>에서 첫 화면을 그리기 전에 실행해 그림이 잠깐 보였다 사라지지 않게 한다.
export function huntingGroundImagesInitScript(): string {
  const key = JSON.stringify(HUNTING_GROUND_IMAGES_STORAGE_KEY);
  const value = JSON.stringify(HUNTING_GROUND_IMAGES_HIDDEN_VALUE);
  const className = JSON.stringify(HUNTING_GROUND_IMAGES_HIDDEN_CLASS);
  return `(function(){try{if(localStorage.getItem(${key})===${value})document.documentElement.classList.add(${className});}catch(e){}})();`;
}
