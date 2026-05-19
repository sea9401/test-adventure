// 회관 서버 라이브러리의 pure 헬퍼만 검증. 트랜잭션 path (donate/upgrade/setSlogan/
// readLodge) 는 DB 인프라가 필요 — `docs/guild-lodge-plan.md` 의 수동 E2E 체크리스트로 검증.
// 같은 결: src/lib/server/marketplace.test.ts ("DB I/O 는 인프라 없어 제외").

import { describe, expect, it } from "vitest";
import {
  LODGE_RANK_MAX,
  LODGE_RANK_THRESHOLD,
  LODGE_SLOGAN_MAX,
  isValidDonationKind,
  nextRankThreshold,
  rankReady,
} from "@/adventure/data/guildLodge";
import {
  __testing,
  sanitizeSlogan,
  validateDonationInput,
} from "./guildLodge";

describe("isValidDonationKind", () => {
  it("stardust / gold 만 허용", () => {
    expect(isValidDonationKind("stardust")).toBe(true);
    expect(isValidDonationKind("gold")).toBe(true);
  });
  it("그 외는 거부", () => {
    expect(isValidDonationKind("")).toBe(false);
    expect(isValidDonationKind("STARDUST")).toBe(false);
    expect(isValidDonationKind("fame")).toBe(false);
    expect(isValidDonationKind(null)).toBe(false);
    expect(isValidDonationKind(undefined)).toBe(false);
    expect(isValidDonationKind(0)).toBe(false);
  });
});

describe("validateDonationInput", () => {
  it("정상 별빛 봉납", () => {
    const r = validateDonationInput("stardust", 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("stardust");
      expect(r.amount).toBe(10);
    }
  });

  it("정상 골드 봉납", () => {
    const r = validateDonationInput("gold", 1000);
    expect(r).toEqual({ ok: true, kind: "gold", amount: 1000 });
  });

  it("잘못된 kind 거부", () => {
    expect(validateDonationInput("fame", 10)).toEqual({
      ok: false,
      error: "invalid_kind",
    });
  });

  it("0 이하 / 비-정수 / overflow 거부", () => {
    expect(validateDonationInput("gold", 0).ok).toBe(false);
    expect(validateDonationInput("gold", -5).ok).toBe(false);
    expect(validateDonationInput("gold", 3.14).ok).toBe(false);
    expect(validateDonationInput("gold", Number.NaN).ok).toBe(false);
    expect(validateDonationInput("gold", "100").ok).toBe(false);
    expect(validateDonationInput("gold", 1_000_000_001).ok).toBe(false);
  });

  it("정수 상한 (1e9) 경계", () => {
    expect(validateDonationInput("stardust", 1_000_000_000).ok).toBe(true);
    expect(validateDonationInput("stardust", 1_000_000_001).ok).toBe(false);
  });
});

describe("sanitizeSlogan", () => {
  it("정상 슬로건 — trim 후 보존", () => {
    expect(sanitizeSlogan("  달밤의 신단  ")).toEqual({
      ok: true,
      slogan: "달밤의 신단",
    });
  });

  it("빈 문자열 / 공백만 → NULL", () => {
    expect(sanitizeSlogan("")).toEqual({ ok: true, slogan: null });
    expect(sanitizeSlogan("   ")).toEqual({ ok: true, slogan: null });
    expect(sanitizeSlogan("\n\t")).toEqual({ ok: true, slogan: null });
  });

  it("정확히 80자는 허용", () => {
    const s80 = "가".repeat(LODGE_SLOGAN_MAX);
    expect(sanitizeSlogan(s80)).toEqual({ ok: true, slogan: s80 });
  });

  it("81자 이상 거부", () => {
    const s81 = "가".repeat(LODGE_SLOGAN_MAX + 1);
    expect(sanitizeSlogan(s81)).toEqual({
      ok: false,
      error: "slogan_too_long",
    });
  });

  it("trim 후 길이로 검증 — 양옆 공백 부풀려도 통과", () => {
    const s = `   ${"가".repeat(LODGE_SLOGAN_MAX)}   `;
    expect(sanitizeSlogan(s).ok).toBe(true);
  });
});

describe("rankReady", () => {
  it("rank=0 → 모든 임계 0 이므로 항상 ready", () => {
    expect(rankReady({ stardustTotal: 0, goldTotal: 0 }, 0)).toBe(true);
  });

  it("rank=1 → 별빛 200 & 골드 5000 양쪽 만족해야 ready", () => {
    expect(rankReady({ stardustTotal: 199, goldTotal: 5000 }, 1)).toBe(false);
    expect(rankReady({ stardustTotal: 200, goldTotal: 4999 }, 1)).toBe(false);
    expect(rankReady({ stardustTotal: 200, goldTotal: 5000 }, 1)).toBe(true);
    expect(rankReady({ stardustTotal: 999, goldTotal: 5001 }, 1)).toBe(true);
  });

  it("rank=5 (max) → 더 못 올라감", () => {
    expect(
      rankReady({ stardustTotal: 1_000_000, goldTotal: 100_000_000 }, 5),
    ).toBe(false);
  });

  it("rank>max 도 false", () => {
    expect(rankReady({ stardustTotal: 0, goldTotal: 0 }, 99)).toBe(false);
  });
});

describe("nextRankThreshold", () => {
  it("0~4 모두 다음 임계 노출", () => {
    for (let r = 0; r < LODGE_RANK_MAX; r++) {
      const next = nextRankThreshold(r);
      expect(next).not.toBeNull();
      if (next) {
        expect(next.rank).toBe(r + 1);
        expect(next.stardust).toBe(LODGE_RANK_THRESHOLD[next.rank].stardust);
        expect(next.gold).toBe(LODGE_RANK_THRESHOLD[next.rank].gold);
      }
    }
  });

  it("5 (max) → null", () => {
    expect(nextRankThreshold(5)).toBeNull();
    expect(nextRankThreshold(6)).toBeNull();
  });
});

describe("LODGE_RANK_THRESHOLD — 단조 증가", () => {
  it("rank 가 오를수록 별빛/골드 임계 모두 단조 비감소", () => {
    let prevS = -1;
    let prevG = -1;
    for (let r = 1; r <= LODGE_RANK_MAX; r++) {
      const t = LODGE_RANK_THRESHOLD[r as 1 | 2 | 3 | 4 | 5];
      expect(t.stardust).toBeGreaterThanOrEqual(prevS);
      expect(t.gold).toBeGreaterThanOrEqual(prevG);
      prevS = t.stardust;
      prevG = t.gold;
    }
  });
});

describe("ERROR_STATUS — 모든 에러 코드 매핑", () => {
  it("9 에러 코드 모두 HTTP 상태 보유", () => {
    const codes = [
      "guild_not_found",
      "not_member",
      "not_master",
      "invalid_kind",
      "invalid_amount",
      "insufficient_stardust",
      "insufficient_gold",
      "max_rank",
      "not_ready",
      "slogan_too_long",
    ] as const;
    for (const c of codes) {
      const s = __testing.ERROR_STATUS[c];
      expect([400, 403, 404, 409]).toContain(s);
    }
  });

  it("권한 거부는 403, 자원 없음은 404", () => {
    expect(__testing.ERROR_STATUS.not_master).toBe(403);
    expect(__testing.ERROR_STATUS.not_member).toBe(403);
    expect(__testing.ERROR_STATUS.guild_not_found).toBe(404);
  });

  it("회관 상태 충돌은 409", () => {
    expect(__testing.ERROR_STATUS.max_rank).toBe(409);
    expect(__testing.ERROR_STATUS.not_ready).toBe(409);
  });
});

describe("kstWeekStartUtc — KST 월요일 00:00 의 UTC 인스턴트", () => {
  // UTC 와 KST 의 차이 = +9h. KST 월요일 00:00 == UTC 일요일 15:00.
  it("KST 월요일 00:30 입력 → 같은 KST 월 00:00 의 UTC", () => {
    // 2026-05-18 (월) KST 00:30 = 2026-05-17 (일) 15:30 UTC
    const mondayKstHalfPast = new Date("2026-05-17T15:30:00.000Z");
    const start = __testing.kstWeekStartUtc(mondayKstHalfPast);
    expect(start.toISOString()).toBe("2026-05-17T15:00:00.000Z");
  });

  it("KST 일요일 23:59 → 그 주의 (직전 월요일) KST 00:00", () => {
    // 2026-05-17 (일) KST 23:59 = 2026-05-17 (일) 14:59 UTC
    // 직전 월요일 KST 00:00 = 2026-05-11 (월) 00:00 KST = 2026-05-10 (일) 15:00 UTC
    const sundayLate = new Date("2026-05-17T14:59:00.000Z");
    const start = __testing.kstWeekStartUtc(sundayLate);
    expect(start.toISOString()).toBe("2026-05-10T15:00:00.000Z");
  });

  it("KST 화/수/목 어느 요일에서도 같은 주 시작점", () => {
    // 2026-05-19 (화) KST 12:00 = 2026-05-19 (화) 03:00 UTC
    const tuesdayKstNoon = new Date("2026-05-19T03:00:00.000Z");
    const start = __testing.kstWeekStartUtc(tuesdayKstNoon);
    expect(start.toISOString()).toBe("2026-05-17T15:00:00.000Z");
  });

  it("주 경계 직전·직후 — 일요일 KST 23:59 vs 월요일 KST 00:00", () => {
    const sundayLate = new Date("2026-05-17T14:59:00.000Z");
    const mondayStart = new Date("2026-05-17T15:00:00.000Z");
    const a = __testing.kstWeekStartUtc(sundayLate).toISOString();
    const b = __testing.kstWeekStartUtc(mondayStart).toISOString();
    // 직전 주 vs 새 주 — 7일 차이.
    expect(new Date(b).getTime() - new Date(a).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });
});
