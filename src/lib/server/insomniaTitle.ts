export const INSOMNIA_TITLE_ID = "insomnia";

const INSOMNIA_TIME_ZONE = "Asia/Seoul";
const INSOMNIA_START_HOUR = 0;
const INSOMNIA_END_HOUR = 4;

export function koreanHourOf(date: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: INSOMNIA_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const parsed = Number(hour);
  if (parsed === 24) return 0;
  return Number.isInteger(parsed) ? parsed : -1;
}

export function isInsomniaTitleWindow(date = new Date()): boolean {
  const hour = koreanHourOf(date);
  return hour >= INSOMNIA_START_HOUR && hour < INSOMNIA_END_HOUR;
}
