export type ShockActionState = "pending" | "immune" | undefined;

export function canApplyShock(state: ShockActionState): boolean {
  return state === undefined;
}

export function enterShockAction(state: ShockActionState): {
  skip: boolean;
  next: ShockActionState;
} {
  if (state === "pending") return { skip: true, next: "immune" };
  return { skip: false, next: undefined };
}
