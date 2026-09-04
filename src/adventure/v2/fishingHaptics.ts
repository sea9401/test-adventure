export const FISHING_BITE_HAPTIC_PATTERN = [45, 35, 70] as const;

type VibrationNavigator = {
  vibrate?: (pattern: number | number[]) => boolean;
};

export function triggerFishingBiteHaptic(
  navigatorLike: VibrationNavigator | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (typeof navigatorLike?.vibrate !== "function") return false;
  try {
    return navigatorLike.vibrate([...FISHING_BITE_HAPTIC_PATTERN]);
  } catch {
    return false;
  }
}
