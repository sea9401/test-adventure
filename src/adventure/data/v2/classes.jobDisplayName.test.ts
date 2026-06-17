import { describe, it, expect, vi } from "vitest";

// jobDisplayName — 직업 시스템 ON 분기 검증(테스트 env 기본은 flag off라 mock 으로 켠다).
// 회귀: 캐릭터 카드/전투 부제/공개 프로필이 옛 클래스명("전사")이 아니라 직업 카탈로그 이름
//   ("견습 병사"·"방패병")을 보여야 한다. 버그는 이 자리들이 class 에서 직접 환산했던 것.
vi.mock("@/adventure/data/v2/v2JobCatalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/v2JobCatalog")>();
  return { ...actual, V2_JOB_SYSTEM_V2: true };
});

import { jobDisplayName } from "@/adventure/data/v2/classes";

describe("jobDisplayName (직업 시스템 ON)", () => {
  it("기본 직업 = 견습 직업명(옛 클래스명 아님)", () => {
    expect(jobDisplayName("warrior", null)).toBe("견습 병사");
    expect(jobDisplayName("mage", null)).toBe("견습 마법사");
    expect(jobDisplayName("martial", null)).toBe("견습 무인");
    expect(jobDisplayName("rogue", null)).toBe("견습 도적");
    expect(jobDisplayName("warrior", null)).not.toBe("전사");
  });

  it("빈 문자열 spec(라이브 세이브)도 기본 직업으로 폴백", () => {
    expect(jobDisplayName("warrior", "")).toBe("견습 병사");
    expect(jobDisplayName("mage", "")).toBe("견습 마법사");
  });

  it("상위 직업도 반영", () => {
    expect(jobDisplayName("warrior", "knight")).toBe("방패병");
    expect(jobDisplayName("warrior", "gwang")).toBe("견습 기사");
    expect(jobDisplayName("rogue", "assassin")).toBe("자객");
  });

  it("무직 = 모험가", () => {
    expect(jobDisplayName("none", null)).toBe("모험가");
  });
});
