import { stableJson } from "../core/hashes";
import {
  STAGING_RELEASE_PHASES,
  type StagingReleasePhase,
  type StagingReleaseState,
} from "../schemas/task";

export type { StagingReleasePhase, StagingReleaseState } from "../schemas/task";

export type ReleasePhaseEvent = {
  phase: StagingReleasePhase;
  data: Readonly<Record<string, unknown>>;
};

export function nextReleasePhase(
  state: StagingReleaseState,
  event: ReleasePhaseEvent,
): StagingReleaseState {
  const currentIndex = STAGING_RELEASE_PHASES.indexOf(state.phase);
  const eventIndex = STAGING_RELEASE_PHASES.indexOf(event.phase);
  if (eventIndex === currentIndex) {
    if (stableJson(state.phases[event.phase]) !== stableJson(event.data)) {
      throw new Error(
        `release event ${event.phase} conflicts with persisted data`,
      );
    }
    return state;
  }
  if (eventIndex !== currentIndex + 1) {
    throw new Error(`release event ${event.phase} is out of order`);
  }
  return {
    ...state,
    phase: event.phase,
    phases: { ...state.phases, [event.phase]: structuredClone(event.data) },
  };
}
