// 낚시 물때(物때) — 4시간 글로벌 결정론 윈도우마다 도는 "물때". 일부 물때엔 그 시간대에만
//   입질하는 특별 손님(한정 어종)이 추가로 걸린다.
//
// 핵심 원칙(공정성 청정):
//   · 물때는 "지금 무엇이 더 걸리나"(가용 종)와 표시만 바꾼다 — 사이즈·반응·리더보드엔 영향 0.
//   · 결정론 hash32(공용 hash.ts)를 전용 시드로 쓴다(글로벌 시설이라 권역 무관).
//     DB 0 / cron 0 / 서버·클라 동일.

import { WINDOW_4H_MS, hash32 } from "./hash";
import type { FishId } from "./fish";

// 물때 창 = 4시간(UTC epoch 정렬 → 전 유저 동시 전환). 클라가 직접 계산해 배지를 그린다.
export const MULTTAE_WINDOW_MS = WINDOW_4H_MS;

export type MulttaeConditionId = "dawn" | "starlit" | "mist" | "tempest" | "still";

export type MulttaeEffect = {
  label: string;
  specialWeightBonusPct?: number;
  waitReductionPct?: number;
  sizeBonusPct?: number;
  rareSizeBonusPct?: number;
  bigCatchSizeBonusPct?: number;
  coinBonus?: number;
  fragmentChanceBonus?: number;
};

export type MulttaeCondition = {
  id: MulttaeConditionId;
  label: string;
  emoji: string;
  /** 한 줄 분위기 설명(유저 노출). */
  description: string;
  /** 이 물때에만 입질하는 특별 손님. 없으면 평범한 물때(흔한 손님들의 시간). */
  specialFishId?: FishId;
  /** 작은 시간대 보정. 캐스팅/보상 서버 로직과 배지가 같은 값을 쓴다. */
  effect: MulttaeEffect;
};

export const MULTTAE_CONDITIONS: readonly MulttaeCondition[] = [
  {
    id: "dawn",
    label: "여명 물때",
    emoji: "🌅",
    description: "동이 트며 물낯이 금빛으로 물든다. 이 시간에만 비치는 손님이 있다.",
    specialFishId: "goldeye",
    effect: {
      label: "특별 손님 가중치 +25%",
      specialWeightBonusPct: 25,
    },
  },
  {
    id: "starlit",
    label: "별빛 물때",
    emoji: "🌌",
    description: "별빛이 수면에 잠긴 깊은 밤. 어둠을 좋아하는 것이 올라온다.",
    specialFishId: "moonshadow_eel",
    effect: {
      label: "지도 조각 확률 +1%p",
      fragmentChanceBonus: 0.01,
    },
  },
  {
    id: "mist",
    label: "물안개 물때",
    emoji: "🌫",
    description: "물안개가 자욱이 깔린다. 안개 속에서 비단결이 어른거린다.",
    specialFishId: "mist_koi",
    effect: {
      label: "희귀 이상 크기 +3%",
      rareSizeBonusPct: 3,
    },
  },
  {
    id: "tempest",
    label: "폭풍 물때",
    emoji: "⛈",
    description: "거센 물살이 인다. 파도를 가르며 날아오르는 것이 걸린다.",
    specialFishId: "stormrider",
    effect: {
      label: "대물급 크기 +4% · 코인 +1",
      bigCatchSizeBonusPct: 4,
      coinBonus: 1,
    },
  },
  {
    id: "still",
    label: "잔잔한 물때",
    emoji: "🪷",
    description: "물낯이 거울처럼 고요하다. 오늘은 흔한 손님들의 시간이다.",
    effect: {
      label: "입질 대기 -5%",
      waitReductionPct: 5,
    },
  },
] as const;

export const MULTTAE_BY_ID: ReadonlyMap<MulttaeConditionId, MulttaeCondition> =
  new Map(MULTTAE_CONDITIONS.map((c) => [c.id, c]));

export type MulttaeWindow = {
  condition: MulttaeCondition;
  windowIndex: number;
  startsAt: number; // epoch ms
  endsAt: number; // epoch ms
};

// 특정 창의 물때 — 결정론(같은 입력 = 같은 답, 서버·클라 공통). 날씨와 별개 시드.
export function multtaeForWindow(windowIndex: number): MulttaeCondition {
  const seed = hash32(`multtae:${windowIndex}`);
  return MULTTAE_CONDITIONS[seed % MULTTAE_CONDITIONS.length];
}

export function multtaeAt(nowMs: number): MulttaeWindow {
  const windowIndex = Math.floor(nowMs / MULTTAE_WINDOW_MS);
  return {
    condition: multtaeForWindow(windowIndex),
    windowIndex,
    startsAt: windowIndex * MULTTAE_WINDOW_MS,
    endsAt: (windowIndex + 1) * MULTTAE_WINDOW_MS,
  };
}

// 예보 — 현재 창 포함 n개(현재, +1, …). 배지 "N시간 뒤 ○○" 용.
export function multtaeForecast(nowMs: number, n: number): MulttaeWindow[] {
  const first = Math.floor(nowMs / MULTTAE_WINDOW_MS);
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const w = first + i;
    return {
      condition: multtaeForWindow(w),
      windowIndex: w,
      startsAt: w * MULTTAE_WINDOW_MS,
      endsAt: (w + 1) * MULTTAE_WINDOW_MS,
    };
  });
}
