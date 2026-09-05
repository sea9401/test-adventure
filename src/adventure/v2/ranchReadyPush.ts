import { parseFarmState } from "./farm";
import {
  RANCH_ANIMAL_DEFINITIONS,
  RANCH_SLOT_DEFINITIONS,
  settleRanch,
  type RanchAnimalId,
} from "./ranch";

const RANCH_ANIMAL_IDS = ["chicken", "cow", "pig"] as const;

export type RanchReadyPushCandidate = {
  animalId: RanchAnimalId;
  outputName: string;
  eventKey: string;
};

export type RanchReadyPushPlan = {
  eventKeys: string[];
  body: string;
};

export function ranchReadyPushCandidates(
  userId: string,
  farmRaw: unknown,
  now = Date.now(),
): RanchReadyPushCandidate[] {
  const ranch = settleRanch(parseFarmState(farmRaw, now).ranch, now);
  const readyCycles = Object.fromEntries(
    RANCH_ANIMAL_IDS.map((animalId) => [animalId, 0]),
  ) as Record<RanchAnimalId, number>;

  for (const definition of RANCH_SLOT_DEFINITIONS) {
    const slot = ranch.slots[definition.id];
    if (slot.unlocked && slot.animalId) {
      readyCycles[slot.animalId] += slot.readyCycles;
    }
  }

  const lifetimeCycles: Record<RanchAnimalId, number> = {
    chicken: ranch.stats.chickenCycles,
    cow: ranch.stats.cowCycles,
    pig: ranch.stats.pigCycles,
  };

  return RANCH_ANIMAL_IDS.flatMap((animalId) => {
    const ready = readyCycles[animalId];
    if (ready < 1) return [];
    return [
      {
        animalId,
        outputName: RANCH_ANIMAL_DEFINITIONS[animalId].outputName,
        eventKey: `ranch:${userId}:${animalId}:${lifetimeCycles[animalId]}:${ready}`,
      },
    ];
  });
}

export function pendingRanchReadyPush(
  candidates: readonly RanchReadyPushCandidate[],
  deliveredKeys: ReadonlySet<string>,
): RanchReadyPushPlan | null {
  const pending = candidates.filter(
    (candidate) => !deliveredKeys.has(candidate.eventKey),
  );
  if (pending.length === 0) return null;

  return {
    eventKeys: pending.map((candidate) => candidate.eventKey),
    body: `${pending.map((candidate) => candidate.outputName).join(", ")}를 수확할 수 있습니다.`,
  };
}
