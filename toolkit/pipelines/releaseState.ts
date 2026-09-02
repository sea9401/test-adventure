import { stableJson } from "../core/hashes";

export const RELEASE_PHASES = [
  "verified",
  "pushed",
  "pr-open",
  "pr-ci-passed",
  "merged-staging",
  "staging-ci-passed",
  "deploy-passed",
  "public-verified",
] as const;

export type StagingReleasePhase = (typeof RELEASE_PHASES)[number];

export type StagingReleaseState = {
  phase: StagingReleasePhase;
  branch: string;
  verifiedSha: string;
  phases: Partial<Record<StagingReleasePhase, Readonly<Record<string, unknown>>>>;
};

export type ReleasePhaseEvent = {
  phase: StagingReleasePhase;
  data: Readonly<Record<string, unknown>>;
};

export function nextReleasePhase(
  state: StagingReleaseState,
  event: ReleasePhaseEvent,
): StagingReleaseState {
  const currentIndex = RELEASE_PHASES.indexOf(state.phase);
  const eventIndex = RELEASE_PHASES.indexOf(event.phase);
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
