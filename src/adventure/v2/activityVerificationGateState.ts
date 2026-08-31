export type ActivityVerificationGateStatus = "ready" | "checking" | "error";

export type ActivityVerificationGateState = {
  status: ActivityVerificationGateStatus;
  widgetGeneration: number;
};

export type ActivityVerificationGateEvent =
  | { type: "submit" }
  | { type: "failure" }
  | { type: "retry" };

export const initialActivityVerificationGateState: ActivityVerificationGateState = {
  status: "ready",
  widgetGeneration: 0,
};

export function activityVerificationGateReducer(
  state: ActivityVerificationGateState,
  event: ActivityVerificationGateEvent,
): ActivityVerificationGateState {
  if (event.type === "submit") {
    return { ...state, status: "checking" };
  }
  if (event.type === "failure") {
    return state.status === "error" ? state : { ...state, status: "error" };
  }
  return {
    status: "ready",
    widgetGeneration: state.widgetGeneration + 1,
  };
}
