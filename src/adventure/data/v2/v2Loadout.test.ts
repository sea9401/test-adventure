import { describe, it, expect } from "vitest";
import { V2_SKILLS, spCostOf, type V2SkillId } from "./v2Skills";
import {
  isSignatureSkill,
  validateLoadout,
  clampLoadoutToBudget,
  sanitizeLoadout,
} from "./v2Loadout";

const cost = (id: V2SkillId) => spCostOf(V2_SKILLS[id]);

// 실제 카탈로그 스킬(비용은 spCostOf 로 도출 — 하드코딩 회피).
const STRIKE: V2SkillId = "v2_skill_strike"; // 기본기(공격 t1)
const RECOVER: V2SkillId = "v2_skill_recover"; // 기본기(힐 t1)
const WARCRY: V2SkillId = "v2c_warrior_warcry"; // 공용(버프)
const TAUNT: V2SkillId = "v2s_knight_taunt"; // 시그니처(전문화)

describe("isSignatureSkill — 시그니처(v2s_)만 직업 고정 대상", () => {
  it("전문화 스킬(v2s_)만 true", () => {
    expect(isSignatureSkill(TAUNT)).toBe(true);
    expect(isSignatureSkill(WARCRY)).toBe(false); // 공용
    expect(isSignatureSkill(STRIKE)).toBe(false); // 기본기
  });
});

describe("validateLoadout — SP 예산 + 학습 + 시그니처 직업고정", () => {
  const learned: V2SkillId[] = [STRIKE, RECOVER, WARCRY, TAUNT];
  const chain: V2SkillId[] = [TAUNT]; // 시그니처가 든 직업 체인(직업 고정 검증용 입력)

  it("전부 학습·예산 내·시그니처 체인 안 = ok", () => {
    const budget = cost(STRIKE) + cost(RECOVER) + cost(TAUNT) + 5;
    const r = validateLoadout([STRIKE, RECOVER, TAUNT], learned, budget, chain);
    expect(r.ok).toBe(true);
    expect(r.spUsed).toBe(cost(STRIKE) + cost(RECOVER) + cost(TAUNT));
    expect(r.overBudget).toBe(false);
    expect(r.notLearned).toEqual([]);
    expect(r.signatureOffChain).toEqual([]);
  });

  it("배우지 않은 스킬 장착 = notLearned + ok false", () => {
    const r = validateLoadout([STRIKE, TAUNT], [STRIKE], 99, chain);
    expect(r.ok).toBe(false);
    expect(r.notLearned).toContain(TAUNT);
  });

  it("시그니처가 현 체인 밖이면 signatureOffChain + ok false (직업 고정)", () => {
    // 마법사 체인엔 knight 시그니처(taunt) 없음 → 직업 고정 위반.
    const mageChain: V2SkillId[] = []; // taunt 없는 체인(시그니처 off-chain)
    const r = validateLoadout([STRIKE, TAUNT], learned, 99, mageChain);
    expect(r.ok).toBe(false);
    expect(r.signatureOffChain).toContain(TAUNT);
  });

  it("공용/기본기는 체인 밖이어도 OK (시그니처만 직업 고정)", () => {
    // warcry(공용)·strike(기본기)는 마법사 체인에 없어도 배웠으면 장착 가능.
    const mageChain: V2SkillId[] = []; // taunt 없는 체인(시그니처 off-chain)
    const r = validateLoadout([STRIKE, WARCRY], learned, 99, mageChain);
    expect(r.ok).toBe(true);
    expect(r.signatureOffChain).toEqual([]);
  });

  it("예산 초과 = overBudget + ok false", () => {
    const r = validateLoadout([STRIKE, RECOVER, TAUNT], learned, 1, chain);
    expect(r.overBudget).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("카탈로그에 없는 id 는 unknown 버킷 + ok false (조용히 통과 금지)", () => {
    const r = validateLoadout(
      ["__ghost__" as V2SkillId, STRIKE],
      [STRIKE],
      99,
      chain,
    );
    expect(r.unknown).toEqual(["__ghost__"]);
    expect(r.ok).toBe(false);
    // unknown 은 비용에 안 들어간다(STRIKE 만 계산).
    expect(r.spUsed).toBe(cost(STRIKE));
  });
});

describe("clampLoadoutToBudget — 예산까지 순서 보존 greedy", () => {
  it("누적합이 예산 넘기는 시점에서 끊되 뒤의 더 싼 스킬은 채택", () => {
    // strike(3) recover(2): 예산 4 → strike(3) 채택, recover(2)는 3+2=5>4 라 스킵.
    expect(clampLoadoutToBudget([STRIKE, RECOVER], 4)).toEqual([STRIKE]);
    // 예산 5 → 둘 다.
    expect(clampLoadoutToBudget([STRIKE, RECOVER], 5)).toEqual([STRIKE, RECOVER]);
  });

  it("앞이 비싸 막혀도 뒤 싼 스킬은 들어온다(greedy in-order skip)", () => {
    // TAUNT(비쌈) 먼저·예산이 taunt 보다 작고 recover 보단 크면 taunt 스킵·recover 채택.
    const tc = cost(TAUNT);
    const budget = tc - 1 >= cost(RECOVER) ? tc - 1 : cost(RECOVER);
    const out = clampLoadoutToBudget([TAUNT, RECOVER], budget);
    expect(out).toEqual([RECOVER]);
  });

  it("예산 0/음수 = 빈 로드아웃", () => {
    expect(clampLoadoutToBudget([STRIKE, RECOVER], 0)).toEqual([]);
    expect(clampLoadoutToBudget([STRIKE], -5)).toEqual([]);
  });

  it("카탈로그에 없는 id 는 건너뜀", () => {
    expect(
      clampLoadoutToBudget(["__nope__" as V2SkillId, STRIKE], 99),
    ).toEqual([STRIKE]);
  });

  it("순서(우선순위) 보존", () => {
    expect(clampLoadoutToBudget([RECOVER, STRIKE, WARCRY], 99)).toEqual([
      RECOVER,
      STRIKE,
      WARCRY,
    ]);
  });
});

describe("sanitizeLoadout — 수동 로드아웃 보존 + 무효분/예산 정리", () => {
  const learned: V2SkillId[] = [STRIKE, RECOVER, WARCRY, TAUNT];
  const warriorChain: V2SkillId[] = [TAUNT]; // 시그니처가 든 체인
  const mageChain: V2SkillId[] = []; // taunt 없는 체인

  it("유효 로드아웃은 그대로 보존(순서 포함)", () => {
    expect(
      sanitizeLoadout([RECOVER, STRIKE, TAUNT], learned, 99, warriorChain),
    ).toEqual([RECOVER, STRIKE, TAUNT]);
  });

  it("배우지 않은 스킬은 떨군다", () => {
    expect(sanitizeLoadout([STRIKE, TAUNT], [STRIKE], 99, warriorChain)).toEqual([
      STRIKE,
    ]);
  });

  it("🔑 환생 미러 — 옛 직업 시그니처는 빠지고 모은 공용/기본기는 유지(오픈믹스)", () => {
    // 마법사 체인엔 knight 시그니처(taunt) 없음 → taunt 만 빠지고 strike·warcry 유지.
    expect(
      sanitizeLoadout([STRIKE, WARCRY, TAUNT], learned, 99, mageChain),
    ).toEqual([STRIKE, WARCRY]);
  });

  it("예산 초과분은 순서 보존 클램프", () => {
    // strike(3)+recover(2)=5. 예산 4 → strike 만.
    expect(sanitizeLoadout([STRIKE, RECOVER], learned, 4, warriorChain)).toEqual([
      STRIKE,
    ]);
  });

  it("카탈로그 밖 id 는 제거", () => {
    expect(
      sanitizeLoadout(
        ["__ghost__" as V2SkillId, STRIKE],
        learned,
        99,
        warriorChain,
      ),
    ).toEqual([STRIKE]);
  });
});
