import { GUILD_LEAVE_COOLDOWN_DAYS } from "@/adventure/data/guild";
import { formatDateTime } from "@/lib/notifications";

// 탈퇴/추방 쿨다운 기간 안내 — "시작부터 해제까지 · 남은 시간".
// 시작 시각은 따로 저장하지 않는다. 탈퇴·추방 라우트가 항상 GUILD_LEAVE_COOLDOWN_DAYS 를
// 더해 해제 시각을 기록하므로 거꾸로 빼서 복원한다.
export function leaveCooldownWindowText(untilMs: number, nowMs: number): string {
  const startMs = untilMs - GUILD_LEAVE_COOLDOWN_DAYS * 86_400_000;
  const leftMin = Math.max(1, Math.ceil((untilMs - nowMs) / 60_000));
  const h = Math.floor(leftMin / 60);
  const m = leftMin % 60;
  const left = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  return `${formatDateTime(startMs)}부터 ${formatDateTime(untilMs)}까지 · ${left} 남음`;
}
