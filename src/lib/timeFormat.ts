// 시간 표기 공용 포매터 — 여러 컴포넌트가 각자 재구현하던 동일 문구를 단일화(2026-07).
// ⚠️ 출력 문자열은 기존 UI 와 byte 동일해야 한다 — timeFormat.test.ts 가 고정.
// 포맷이 다른 로컬 구현(LordPanel "N분 후"·coop "N분 남음" 등)은 의도적으로 각자 유지.

/**
 * 경과 시간 — "방금" | "N분 전" | "N시간 전" | "N일 전".
 * 빈 문자열/파싱 불가 입력은 "" (표기 생략). now 주입은 틱 기반 화면(전투 기록 등)용.
 */
export function timeAgoKo(iso: string, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.floor(Math.max(0, now - then) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 남은 시간 — 올림·최소 1분. "N분" | "H시간" | "H시간 M분" (0분은 생략). */
export function formatRemainingMinutes(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${min}분`;
}

/** 남은 시간 — 내림·0분 허용. "N분" | "H시간 M분" (분 항상 표기). */
export function formatRemainingMinutesFloor(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
}

/**
 * 주간 시즌 종료까지 라벨 — "곧 마감" | "N일 N시간 남음" | "N시간 남음".
 * 낚시/보물 리더보드가 같은 구현을 복붙하던 것(불량 입력은 "" 표기 생략).
 */
export function seasonEndsInLabel(
  endsAt: string,
  now: number = Date.now(),
): string {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return "";
  const ms = end - now;
  if (ms <= 0) return "곧 마감";
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  return `${hours}시간 남음`;
}
