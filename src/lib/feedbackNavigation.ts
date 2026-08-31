function positiveInteger(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function feedbackReplyHref(feedbackId: number): string {
  const id = positiveInteger(feedbackId);
  return id ? `/feedback#feedback-${id}` : "/feedback";
}

export function feedbackIdFromHash(hash: string): number | null {
  const match = hash.match(/^#feedback-([1-9][0-9]*)$/);
  if (!match) return null;
  return positiveInteger(Number(match[1]));
}

export function feedbackHistoryApiHref(targetId: number | null): string {
  return targetId ? `/api/feedback?targetId=${targetId}` : "/api/feedback";
}

export function feedbackSelectionFromHash(hash: string): {
  targetId: number | null;
  expandedId: number | null;
} {
  const id = feedbackIdFromHash(hash);
  return { targetId: id, expandedId: id };
}

export function isFeedbackTargetMissing(
  targetId: number | null,
  entries: readonly { id: number }[],
): boolean {
  return targetId !== null && !entries.some((entry) => entry.id === targetId);
}
