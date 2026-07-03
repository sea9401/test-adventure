// 결정론 해시 + 시간 창 — 시드 기반 결정론 시스템(물때 등) 공용 유틸.
// (옛 weather.ts 에 있던 hash32/WEATHER_WINDOW_MS 를 날씨 제거 후 여기로 이전.)

// 2시간 창 (UTC epoch 정렬). 하루 12창.
export const WINDOW_2H_MS = 2 * 3_600_000;

// 4시간 창 (UTC epoch 정렬). 하루 6창.
export const WINDOW_4H_MS = 4 * 3_600_000;

// xmur3 32-bit 해시 — 결정론 시드용(서버·클라 동일 결과).
export function hash32(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
