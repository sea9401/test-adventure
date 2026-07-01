export type FishingTaskKind = "contract" | "daily" | "goal";

export type FishingProgressTaskView = {
  id: string;
  title: string;
  goal: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type FishingProgressNotice = {
  kind: FishingTaskKind;
  id: string;
  title: string;
  progress: number;
  goal: number;
  delta: number;
  justCompleted: boolean;
  claimable: boolean;
};

export function fishingProgressNotices(
  kind: FishingTaskKind,
  before: readonly FishingProgressTaskView[],
  after: readonly FishingProgressTaskView[],
): FishingProgressNotice[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  return after.flatMap((next) => {
    const prev = beforeById.get(next.id);
    if (!prev) return [];
    const delta = Math.max(0, next.progress - prev.progress);
    const justCompleted = !prev.complete && next.complete;
    if (delta <= 0 && !justCompleted) return [];
    return [
      {
        kind,
        id: next.id,
        title: next.title,
        progress: next.progress,
        goal: next.goal,
        delta,
        justCompleted,
        claimable: next.claimable,
      },
    ];
  });
}

export function countClaimableFishingTasks(
  groups: readonly (readonly FishingProgressTaskView[])[],
): number {
  return groups.reduce(
    (sum, group) => sum + group.filter((item) => item.claimable).length,
    0,
  );
}
