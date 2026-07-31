// 기존 은신 모드 이용자의 저장값을 그대로 이어받기 위해 키와 "on" 값을 유지한다.
export const DISPLAY_MODE_STORAGE_KEY = "discreet-mode.v1";
export const DISCREET_MODE_CLASS = "ui-discreet-mode";
export const BACKGROUND_HIDDEN_MODE_CLASS = "ui-background-hidden";
export const DISCREET_MODE_STORED_VALUE = "on";
export const BACKGROUND_HIDDEN_MODE_STORED_VALUE = "background-hidden";

export type DisplayMode = "default" | "background-hidden" | "discreet";

export function parseStoredDisplayMode(value: string | null): DisplayMode {
  if (value === DISCREET_MODE_STORED_VALUE) return "discreet";
  if (value === BACKGROUND_HIDDEN_MODE_STORED_VALUE) {
    return "background-hidden";
  }
  return "default";
}

export function storedValueForDisplayMode(mode: DisplayMode): string | null {
  if (mode === "discreet") return DISCREET_MODE_STORED_VALUE;
  if (mode === "background-hidden") {
    return BACKGROUND_HIDDEN_MODE_STORED_VALUE;
  }
  return null;
}
