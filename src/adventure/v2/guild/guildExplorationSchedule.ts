import type { GuildExplorationActiveExpedition } from "@/adventure/data/v2/guildExploration";

const GUILD_EXPLORATION_KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatGuildExplorationDateTimeKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "확인 중";
  const parts = Object.fromEntries(
    GUILD_EXPLORATION_KST_FORMAT.formatToParts(date).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute} KST`;
}

export function formatGuildExplorationDuration(durationMinutes: number): string {
  const minutes = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours <= 0) return `${remainingMinutes}분`;
  return remainingMinutes > 0
    ? `${hours}시간 ${remainingMinutes}분`
    : `${hours}시간`;
}

export function guildExplorationExpeditionScheduleText(
  active: GuildExplorationActiveExpedition,
  durationMinutes: number,
): string {
  return [
    `파견 ${formatGuildExplorationDateTimeKst(active.startedAt)}`,
    `완료 ${formatGuildExplorationDateTimeKst(active.endsAt)}`,
    `소요 ${formatGuildExplorationDuration(durationMinutes)}`,
  ].join(" · ");
}
