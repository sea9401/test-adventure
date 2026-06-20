// v2 날씨 — 권역별 결정론 날씨 × 속성 효과 매트릭스. 설계: docs/v2-weather-plan.md
//
// 핵심 성질:
//   · DB 0 / cron 0 — 날씨 = hash(권역, 시간 창)의 순수 함수. 서버·클라 동일 계산.
//   · 효과 매트릭스 — 한 날씨가 4속성에 단계적 영향(◎+15 / ○+7 / △−7 / ▼−15),
//     나머지 3속성·무속성은 중립. 7날씨×4칸 = 28 = 7속성×4단계 **완전 균형** —
//     모든 속성이 ◎○△▼ 각 1 + 중립 3 을 가져, 균등 가중이면 기대 보정 0.
//   · 적용 = PvE 사냥만(공격 속성에 atk/matk 곱연산 — 약점 찌르기와 같은 지점).

import type { V2Element } from "./elements";
import { CONFLICT_ZONE_IDS } from "./outpostGraph";
import { OUTPOST_BY_ID, kingdomIdOf } from "./outposts";

// === 다이얼 ============================================================

// 날씨 창 길이 — 4시간(하루 6창). 창 경계는 UTC epoch 기준 절대 시각(전 권역 동시 전환).
export const WEATHER_WINDOW_MS = 4 * 3_600_000;

// 효과 단계 보정(%) — ◎ 대강세 / ○ 강세 / △ 약세 / ▼ 대약세.
export const WEATHER_TIER_PCT = {
  major: 15,
  minor: 7,
  weak: -7,
  poor: -15,
} as const;
export type WeatherTier = keyof typeof WEATHER_TIER_PCT;

// === 카탈로그 ==========================================================

export type WeatherId =
  | "clear"
  | "rain"
  | "thunder"
  | "gale"
  | "sandstorm"
  | "fog"
  | "heatwave";

export type WeatherDef = {
  id: WeatherId;
  name: string;
  emoji: string;
  /** 단계 → 속성. 7날씨에 걸쳐 각 속성이 단계당 정확히 1회 등장(완전 균형 — 테스트 가드). */
  tiers: Record<WeatherTier, V2Element>;
};

// 가중치 균등(1/7) — 비균등은 속성 기대 보정을 깨므로 밸런스 결정과 함께만.
export const WEATHERS: readonly WeatherDef[] = [
  {
    id: "clear",
    name: "맑음",
    emoji: "☀️",
    tiers: { major: "starlight", minor: "fire", weak: "water", poor: "void" },
  },
  {
    id: "rain",
    name: "비",
    emoji: "🌧",
    tiers: { major: "water", minor: "void", weak: "starlight", poor: "fire" },
  },
  {
    id: "thunder",
    name: "뇌우",
    emoji: "⛈",
    tiers: { major: "lightning", minor: "water", weak: "earth", poor: "starlight" },
  },
  {
    id: "gale",
    name: "강풍",
    emoji: "💨",
    tiers: { major: "wind", minor: "lightning", weak: "fire", poor: "earth" },
  },
  {
    id: "sandstorm",
    name: "황사",
    emoji: "🌪",
    tiers: { major: "earth", minor: "wind", weak: "lightning", poor: "water" },
  },
  {
    id: "fog",
    name: "안개",
    emoji: "🌫",
    tiers: { major: "void", minor: "earth", weak: "wind", poor: "lightning" },
  },
  {
    id: "heatwave",
    name: "폭염",
    emoji: "🔥",
    tiers: { major: "fire", minor: "starlight", weak: "void", poor: "wind" },
  },
] as const;

export const WEATHER_BY_ID: ReadonlyMap<WeatherId, WeatherDef> = new Map(
  WEATHERS.map((w) => [w.id, w]),
);

// === 권역 ==============================================================
// 6권역 = 5왕국(지리적 최근 수도, #624) + 중앙 분쟁지대(중앙 2홉, #625).

export const WEATHER_REGION_CONTESTED = "contested";

export function weatherRegionOfOutpost(outpostId: string): string {
  if (CONFLICT_ZONE_IDS.has(outpostId)) return WEATHER_REGION_CONTESTED;
  const o = OUTPOST_BY_ID.get(outpostId);
  return (o && kingdomIdOf(o)) || WEATHER_REGION_CONTESTED;
}

// 권역 표시명 — 지도/배지용. 수도 거점명에서 파생, 분쟁지대는 고정 라벨.
export function weatherRegionLabel(regionKey: string): string {
  if (regionKey === WEATHER_REGION_CONTESTED) return "중앙 분쟁지대";
  return OUTPOST_BY_ID.get(regionKey)?.name ?? regionKey;
}

// === 결정론 스케줄 ======================================================

// xmur3 문자열 해시 — 32bit. 시드 품질 충분(창당 1회·암호학 불요).
// 낚시 물때(multtae.ts)도 같은 결정론을 쓰려고 export(전용 시드라 권역과 안 섞임).
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

export type WeatherWindow = {
  weather: WeatherDef;
  windowIndex: number;
  startsAt: number; // epoch ms
  endsAt: number; // epoch ms
};

// 권역의 특정 창 날씨 — 결정론(같은 입력 = 같은 답, 서버·클라 공통).
export function weatherForWindow(
  regionKey: string,
  windowIndex: number,
): WeatherDef {
  const seed = hash32(`wx:${regionKey}:${windowIndex}`);
  return WEATHERS[seed % WEATHERS.length];
}

export function weatherAt(regionKey: string, nowMs: number): WeatherWindow {
  const windowIndex = Math.floor(nowMs / WEATHER_WINDOW_MS);
  return {
    weather: weatherForWindow(regionKey, windowIndex),
    windowIndex,
    startsAt: windowIndex * WEATHER_WINDOW_MS,
    endsAt: (windowIndex + 1) * WEATHER_WINDOW_MS,
  };
}

// 예보 — 현재 창 포함 n개(현재, +1, …). UI "N시간 뒤 ○○" 용.
export function weatherForecast(
  regionKey: string,
  nowMs: number,
  n: number,
): WeatherWindow[] {
  const first = Math.floor(nowMs / WEATHER_WINDOW_MS);
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const w = first + i;
    return {
      weather: weatherForWindow(regionKey, w),
      windowIndex: w,
      startsAt: w * WEATHER_WINDOW_MS,
      endsAt: (w + 1) * WEATHER_WINDOW_MS,
    };
  });
}

// === 효과 ==============================================================

// 그 날씨에서 이 속성이 받는 단계(중립이면 null). neutral 속성은 항상 null.
export function weatherTierFor(
  weather: WeatherDef,
  element: V2Element,
): WeatherTier | null {
  if (element === "neutral") return null;
  for (const tier of Object.keys(WEATHER_TIER_PCT) as WeatherTier[]) {
    if (weather.tiers[tier] === element) return tier;
  }
  return null;
}

// 공격 배율 — atk/matk 에 곱연산(약점 찌르기 elemMult 와 같은 지점에서 적용).
export function weatherAtkMult(
  weather: WeatherDef,
  element: V2Element,
): number {
  const tier = weatherTierFor(weather, element);
  return tier ? 1 + WEATHER_TIER_PCT[tier] / 100 : 1;
}

export const WEATHER_TIER_LABEL: Record<WeatherTier, string> = {
  major: "대강세",
  minor: "강세",
  weak: "약세",
  poor: "대약세",
};
