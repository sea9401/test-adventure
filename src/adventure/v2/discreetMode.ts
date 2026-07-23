export const DISCREET_MODE_STORAGE_KEY = "discreet-mode.v1";
export const DISCREET_MODE_CLASS = "ui-discreet-mode";
export const DISCREET_MODE_STORED_VALUE = "on";

export function isDiscreetModeStored(value: string | null): boolean {
  return value === DISCREET_MODE_STORED_VALUE;
}
