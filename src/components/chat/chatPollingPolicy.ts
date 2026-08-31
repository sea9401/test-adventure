export function chatPollDelayMs(open: boolean): number {
  return open ? 3_000 : 30_000;
}
