"use client";

// 사냥터/거점 날씨 배지 — 현재 권역 날씨 + 효과 4칸 + 내 속성 강조 + 다음 창 예보.
// 결정론(서버와 동일 계산)이라 클라가 직접 weatherAt 으로 그린다. 1초 틱으로 창 전환 자동 반영.

import { useEffect, useState } from "react";
import {
  WEATHER_TIER_LABEL,
  WEATHER_TIER_PCT,
  weatherForecast,
  weatherRegionOfOutpost,
  weatherTierFor,
  type WeatherTier,
} from "@/adventure/data/v2/weather";
import {
  V2_ELEMENT_LABEL,
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";

const TIER_ORDER: WeatherTier[] = ["major", "minor", "weak", "poor"];
const TIER_SYMBOL: Record<WeatherTier, string> = {
  major: "◎",
  minor: "○",
  weak: "△",
  poor: "▼",
};
const TIER_CLASS: Record<WeatherTier, string> = {
  major: "text-emerald-600 dark:text-emerald-400",
  minor: "text-emerald-500 dark:text-emerald-500",
  weak: "text-rose-500 dark:text-rose-400",
  poor: "text-rose-600 dark:text-rose-500",
};

function fmtRemain(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}분 뒤`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분 뒤`;
}

export function WeatherBadge({
  outpostId,
  myElement,
}: {
  outpostId: string;
  /** 내 캐릭터 속성 — 받는 단계 강조용(무기 속성 우선은 전투 baked, 여긴 캐릭 기준 안내). */
  myElement?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const region = weatherRegionOfOutpost(outpostId);
  const [cur, next] = weatherForecast(region, now, 2);
  const w = cur.weather;
  const mine: V2Element = parseV2Element(myElement);
  const myTier = mine !== "neutral" ? weatherTierFor(w, mine) : null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {w.emoji} {w.name}
          {myTier && (
            <span className={`ml-1.5 font-semibold ${TIER_CLASS[myTier]}`}>
              {V2_ELEMENT_LABEL[mine]} {WEATHER_TIER_LABEL[myTier]} (
              {WEATHER_TIER_PCT[myTier] > 0 ? "+" : ""}
              {WEATHER_TIER_PCT[myTier]}%)
            </span>
          )}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
          {next.weather.emoji} {fmtRemain(cur.endsAt - now)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
        {TIER_ORDER.map((t) => (
          <span key={t} className={TIER_CLASS[t]}>
            {TIER_SYMBOL[t]} {V2_ELEMENT_LABEL[w.tiers[t]]}
          </span>
        ))}
      </div>
    </div>
  );
}
