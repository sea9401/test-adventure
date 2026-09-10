export function chatPollDelayMs(
  open: boolean,
  consecutiveIdlePolls = 0,
): number {
  if (open) return 3_000;
  if (consecutiveIdlePolls >= 10) return 120_000;
  if (consecutiveIdlePolls >= 3) return 60_000;
  return 30_000;
}

export function nextChatIdlePollCount(
  current: number,
  receivedNewMessages: boolean,
): number {
  return receivedNewMessages ? 0 : current + 1;
}
