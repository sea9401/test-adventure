import { describe, expect, it } from "vitest";
import {
  WEATHERS,
  WEATHER_TIER_PCT,
  WEATHER_WINDOW_MS,
  weatherAt,
  weatherAtkMult,
  weatherForWindow,
  weatherForecast,
  weatherRegionOfOutpost,
  weatherTierFor,
  WEATHER_REGION_CONTESTED,
  type WeatherTier,
} from "./weather";
import { V2_ELEMENTS, type V2Element } from "./elements";
import { OUTPOSTS, START_OUTPOST_ID, kingdomIdOf } from "./outposts";
import { CONFLICT_ZONE_IDS } from "./outpostGraph";

const TIERS = Object.keys(WEATHER_TIER_PCT) as WeatherTier[];
const NON_NEUTRAL = V2_ELEMENTS.filter((e) => e !== "neutral");

describe("weather 카탈로그 — 완전 균형 매트릭스", () => {
  it("7날씨·단계당 7속성이 정확히 1회씩(◎○△▼ 각 1 + 중립 3)", () => {
    expect(WEATHERS).toHaveLength(7);
    for (const tier of TIERS) {
      const seen = WEATHERS.map((w) => w.tiers[tier]);
      expect([...new Set(seen)].sort()).toEqual([...NON_NEUTRAL].sort());
    }
    // 한 날씨 안에서 같은 속성이 두 단계에 겹치지 않는다.
    for (const w of WEATHERS) {
      const els = TIERS.map((t) => w.tiers[t]);
      expect(new Set(els).size).toBe(TIERS.length);
    }
  });

  it("속성별 기대 보정 0 — 균등 가중에서 단계 합 = +15+7−7−15 = 0", () => {
    for (const el of NON_NEUTRAL) {
      let sum = 0;
      for (const w of WEATHERS) {
        const tier = weatherTierFor(w, el as V2Element);
        if (tier) sum += WEATHER_TIER_PCT[tier];
      }
      expect(sum).toBe(0);
    }
  });
});

describe("결정론 스케줄", () => {
  it("같은 (권역, 창) = 항상 같은 날씨 / 권역·창이 다르면 독립", () => {
    const a1 = weatherForWindow("kingdom_tatiholm", 12345);
    const a2 = weatherForWindow("kingdom_tatiholm", 12345);
    expect(a1.id).toBe(a2.id);
    // 충분히 많은 창에서 7종 전부 등장(분포 sanity).
    const seen = new Set<string>();
    for (let w = 0; w < 500; w++) {
      seen.add(weatherForWindow("contested", w).id);
    }
    expect(seen.size).toBe(7);
  });

  it("창 경계 — endsAt 직전/직후로 창이 바뀐다", () => {
    const now = 1_770_000_000_000;
    const cur = weatherAt("contested", now);
    expect(cur.startsAt).toBeLessThanOrEqual(now);
    expect(cur.endsAt).toBeGreaterThan(now);
    const next = weatherAt("contested", cur.endsAt);
    expect(next.windowIndex).toBe(cur.windowIndex + 1);
    expect(weatherAt("contested", cur.endsAt - 1).windowIndex).toBe(
      cur.windowIndex,
    );
  });

  it("예보 — 현재 포함 n개 연속 창", () => {
    const now = 1_770_000_000_000;
    const f = weatherForecast("kingdom_ragnarod", now, 3);
    expect(f).toHaveLength(3);
    expect(f[0].windowIndex + 1).toBe(f[1].windowIndex);
    expect(f[1].endsAt).toBe(f[1].startsAt + WEATHER_WINDOW_MS);
    expect(f[0].weather.id).toBe(weatherAt("kingdom_ragnarod", now).weather.id);
  });
});

describe("효과", () => {
  it("weatherAtkMult — 단계 보정 / 무관 속성·무속성 = 1.0", () => {
    const rain = WEATHERS.find((w) => w.id === "rain")!;
    expect(weatherAtkMult(rain, "water")).toBeCloseTo(1.15);
    expect(weatherAtkMult(rain, "void")).toBeCloseTo(1.07);
    expect(weatherAtkMult(rain, "starlight")).toBeCloseTo(0.93);
    expect(weatherAtkMult(rain, "fire")).toBeCloseTo(0.85);
    expect(weatherAtkMult(rain, "earth")).toBe(1);
    expect(weatherAtkMult(rain, "neutral")).toBe(1);
  });
});

describe("권역 매핑", () => {
  it("중앙 분쟁지대(중앙 2홉) = contested, 그 외 = 왕국 수도 id", () => {
    expect(weatherRegionOfOutpost(START_OUTPOST_ID)).toBe(
      WEATHER_REGION_CONTESTED,
    );
    let kingdoms = 0;
    for (const o of OUTPOSTS) {
      const r = weatherRegionOfOutpost(o.id);
      if (CONFLICT_ZONE_IDS.has(o.id)) {
        expect(r).toBe(WEATHER_REGION_CONTESTED);
      } else {
        expect(r).toBe(kingdomIdOf(o));
        kingdoms++;
      }
    }
    expect(kingdoms).toBeGreaterThan(0);
    // 알 수 없는 거점 id — contested 폴백(안전).
    expect(weatherRegionOfOutpost("no_such_outpost")).toBe(
      WEATHER_REGION_CONTESTED,
    );
  });
});
