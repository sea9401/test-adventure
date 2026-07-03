import { describe, it, expect } from "vitest";
import {
  MULTTAE_BY_ID,
  MULTTAE_CONDITIONS,
  MULTTAE_WINDOW_MS,
  multtaeAt,
  multtaeForWindow,
  multtaeForecast,
} from "./multtae";
import { FISH, isFishId } from "./fish";

describe("물때 카탈로그", () => {
  it("id 고유 + BY_ID 전수 매핑 + specialFishId 는 실재 어종(양방향 일치)", () => {
    const ids = new Set<string>();
    for (const c of MULTTAE_CONDITIONS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(MULTTAE_BY_ID.get(c.id)).toBe(c);
      if (c.specialFishId) {
        expect(isFishId(c.specialFishId)).toBe(true);
        // 그 어종은 이 물때로 태그돼 있어야(추첨 게이트와 표시가 어긋나지 않게).
        expect(FISH[c.specialFishId].condition).toBe(c.id);
      }
    }
  });

  it("condition 태그된 어종은 모두 어떤 물때의 specialFishId(고아 태그 없음)", () => {
    const specialOf = new Map(
      MULTTAE_CONDITIONS.filter((c) => c.specialFishId).map((c) => [
        c.specialFishId,
        c.id,
      ]),
    );
    for (const id of Object.keys(FISH) as (keyof typeof FISH)[]) {
      const cond = FISH[id].condition;
      if (cond) expect(specialOf.get(id)).toBe(cond);
    }
  });
});

describe("물때 결정론 스케줄", () => {
  it("같은 창 인덱스 = 같은 물때(결정론)", () => {
    for (const idx of [0, 1, 7, 100, 99999, 123456]) {
      expect(multtaeForWindow(idx)).toBe(multtaeForWindow(idx));
    }
  });

  it("multtaeAt — 창 경계 계산(2시간, epoch 정렬)", () => {
    const t = 1_700_000_000_000;
    const w = multtaeAt(t);
    expect(w.windowIndex).toBe(Math.floor(t / MULTTAE_WINDOW_MS));
    expect(w.startsAt).toBe(w.windowIndex * MULTTAE_WINDOW_MS);
    expect(w.endsAt).toBe(w.startsAt + MULTTAE_WINDOW_MS);
    expect(t).toBeGreaterThanOrEqual(w.startsAt);
    expect(t).toBeLessThan(w.endsAt);
    expect(w.condition).toBe(multtaeForWindow(w.windowIndex));
  });

  it("같은 창 안 어느 시각이든 같은 물때", () => {
    const idx = 90000;
    const start = idx * MULTTAE_WINDOW_MS;
    expect(multtaeAt(start).condition).toBe(
      multtaeAt(start + MULTTAE_WINDOW_MS - 1).condition,
    );
  });

  it("multtaeForecast — 현재 포함 n개 연속 창", () => {
    const t = 1_700_000_000_000;
    const fc = multtaeForecast(t, 3);
    expect(fc).toHaveLength(3);
    expect(fc[0].condition).toBe(multtaeAt(t).condition);
    for (let i = 1; i < fc.length; i += 1) {
      expect(fc[i].windowIndex).toBe(fc[i - 1].windowIndex + 1);
      expect(fc[i].startsAt).toBe(fc[i - 1].endsAt);
    }
  });

  it("모든 물때가 시드 공간에서 등장(균등 매핑)", () => {
    const hits = new Map<string, number>();
    for (let idx = 0; idx < 5000; idx += 1) {
      const id = multtaeForWindow(idx).id;
      hits.set(id, (hits.get(id) ?? 0) + 1);
    }
    for (const c of MULTTAE_CONDITIONS) {
      expect(hits.get(c.id) ?? 0).toBeGreaterThan(0);
    }
  });
});
