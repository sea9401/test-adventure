import { describe, it, expect } from "vitest";
import {
  MAX_STAMINA,
  REGEN_SECONDS_PER_POINT,
  HUNT_COST,
  applyRegen,
  tryConsume,
  msUntilNextRegen,
  initialStamina,
  type StaminaState,
} from "./stamina";

const REGEN_MS = REGEN_SECONDS_PER_POINT * 1000;

function at(current: number, lastUpdatedAt: number): StaminaState {
  return { current, lastUpdatedAt };
}

describe("스태미너 — 회복", () => {
  it("만피 상태에서 시간 흘러도 그대로 (lastUpdatedAt 만 nowMs 로 갱신)", () => {
    const s = at(MAX_STAMINA, 0);
    const r = applyRegen(s, REGEN_MS * 100);
    expect(r.current).toBe(MAX_STAMINA);
    expect(r.lastUpdatedAt).toBe(REGEN_MS * 100);
  });

  it("REGEN 시간 정확히 흐르면 1 포인트 회복", () => {
    const s = at(10, 0);
    const r = applyRegen(s, REGEN_MS);
    expect(r.current).toBe(11);
    expect(r.lastUpdatedAt).toBe(REGEN_MS);
  });

  it("REGEN 시간 안 채우면 회복 0, 상태 변화 없음", () => {
    const s = at(10, 0);
    const r = applyRegen(s, REGEN_MS - 1);
    expect(r.current).toBe(10);
    expect(r.lastUpdatedAt).toBe(0); // 잔여 시간 보존을 위해 변경 X
  });

  it("여러 포인트 한 번에 회복", () => {
    const s = at(10, 0);
    const r = applyRegen(s, REGEN_MS * 5);
    expect(r.current).toBe(15);
    expect(r.lastUpdatedAt).toBe(REGEN_MS * 5);
  });

  it("회복하다 MAX 초과 안 됨", () => {
    const s = at(MAX_STAMINA - 2, 0);
    const r = applyRegen(s, REGEN_MS * 10);
    expect(r.current).toBe(MAX_STAMINA);
  });

  it("잔여 ms 누적 — 두 번 회복 시도해도 손실 없음", () => {
    const s = at(10, 0);
    // 1.5 회복 시간 흐름
    const r1 = applyRegen(s, REGEN_MS + REGEN_MS / 2);
    expect(r1.current).toBe(11); // 1 만 회복
    expect(r1.lastUpdatedAt).toBe(REGEN_MS); // 0.5 시간 보존

    // 추가 0.5 회복 시간 흐름 — 누적 1 만큼 더 회복
    const r2 = applyRegen(r1, REGEN_MS + REGEN_MS / 2 + REGEN_MS / 2);
    expect(r2.current).toBe(12);
  });
});

describe("스태미너 — 소모", () => {
  it("충분하면 차감, 상태 반환", () => {
    const s = at(50, 0);
    const r = tryConsume(s, HUNT_COST, 0);
    expect(r).not.toBeNull();
    expect(r!.current).toBe(49);
  });

  it("부족하면 null", () => {
    const s = at(0, 0);
    const r = tryConsume(s, 1, 0);
    expect(r).toBeNull();
  });

  it("회복 적용 후 차감 — 0 이어도 시간 흐르면 사냥 가능", () => {
    const s = at(0, 0);
    const r = tryConsume(s, 1, REGEN_MS * 3);
    expect(r).not.toBeNull();
    expect(r!.current).toBe(2); // 3 회복 → 1 소모
  });

  it("비용이 큰 경우도 처리", () => {
    const s = at(10, 0);
    const r = tryConsume(s, 10, 0);
    expect(r!.current).toBe(0);
  });
});

describe("스태미너 — 다음 회복까지 카운트다운", () => {
  it("만피면 0", () => {
    expect(msUntilNextRegen(at(MAX_STAMINA, 0), 0)).toBe(0);
  });

  it("막 회복 직후엔 REGEN_MS 그대로", () => {
    expect(msUntilNextRegen(at(10, 0), 0)).toBe(REGEN_MS);
  });

  it("절반 흐름 = 절반 남음", () => {
    expect(msUntilNextRegen(at(10, 0), REGEN_MS / 2)).toBe(REGEN_MS / 2);
  });

  it("정확히 회복 시점 = 다시 REGEN_MS", () => {
    // 막 회복한 직후라고 가정 (lastUpdatedAt 갱신된 상태)
    const s = applyRegen(at(10, 0), REGEN_MS);
    expect(msUntilNextRegen(s, REGEN_MS)).toBe(REGEN_MS);
  });
});

describe("스태미너 — 초기화", () => {
  it("새 캐릭은 만피로 시작", () => {
    const s = initialStamina(12345);
    expect(s.current).toBe(MAX_STAMINA);
    expect(s.lastUpdatedAt).toBe(12345);
  });
});
