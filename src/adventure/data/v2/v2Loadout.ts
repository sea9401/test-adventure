// v2 스킬 로드아웃 검증 — SP(스킬포인트) 예산 모델(코어루프). 설계: docs/v2-skill-loadout-redesign.md.
//
// 레벨 슬롯/직업체인 자동장착 폐지 → "배운 스킬 중 Σ spCost ≤ SP예산"으로 자유 장착(오픈 믹스).
//   - 공용 스킬(v2c_*)·기본기(v2_skill_*): 배웠으면(learned) 직업 무관 장착 가능(수집 라이브러리).
//   - 시그니처(전문화·계파, v2s_*): 직업 고정 — 현 직업 체인(elementalSkillsForClass)에 든 것만.
//   - 합계: Σ spCostOf(equipped) ≤ calcSpBudget(proficiency.groups).
//
// 전부 V2_CORE_LOOP_V2 뒤에서만 강제. flag off 면 기존 자동장착(learned ∩ chain, 상한 없음) 유지.
// 이 모듈은 순수(부수효과·DB 없음) — 라우트가 budget/chain 을 계산해 넘긴다(순환 import 회피).

import { V2_SKILLS, spCostOf, type V2SkillId } from "./v2Skills";

// 시그니처(전문화·계파) 스킬 여부 — id 접두사 v2s_. 직업 고정 대상.
export function isSignatureSkill(id: string): boolean {
  return id.startsWith("v2s_");
}

export type LoadoutCheck = {
  ok: boolean;
  spUsed: number;
  spBudget: number;
  overBudget: boolean;
  notLearned: V2SkillId[]; // 장착했지만 배우지 않은 스킬(라이브러리 밖).
  signatureOffChain: V2SkillId[]; // 시그니처인데 현 직업 체인 밖(직업 고정 위반).
  unknown: V2SkillId[]; // 카탈로그에 없는 id(구버전/손상) — 검증기는 통과시키지 않는다.
};

// 로드아웃 1벌 검증. equipped 가 (1) 전부 카탈로그에 있고 (2) 전부 learned 안 (3) 시그니처는
//   현 체인 안 (4) Σ spCost ≤ spBudget 이면 ok. 위반 항목을 분류해 돌려준다(UI 안내·디버그).
//   🔑 검증기는 알 수 없는 id 를 조용히 버리지 않는다(clampLoadoutToBudget 의 sanitize 와 역할
//   분리) — 알 수 없는 id 가 있으면 ok=false 로 막아 잘못된 로드아웃을 통과시키지 않는다.
//   currentChain = elementalSkillsForClass(cls, spec, tier) — 현재 장착 가능한 시그니처 집합.
export function validateLoadout(
  equipped: readonly V2SkillId[],
  learned: readonly V2SkillId[],
  spBudget: number,
  currentChain: readonly V2SkillId[],
): LoadoutCheck {
  const learnedSet = new Set(learned);
  const chainSet = new Set(currentChain);
  const notLearned: V2SkillId[] = [];
  const signatureOffChain: V2SkillId[] = [];
  const unknown: V2SkillId[] = [];
  let spUsed = 0;
  for (const id of equipped) {
    const def = V2_SKILLS[id];
    if (!def) {
      unknown.push(id); // 카탈로그 밖 — 비용 산정 불가·ok 를 막는다.
      continue;
    }
    spUsed += spCostOf(def);
    if (!learnedSet.has(id)) notLearned.push(id);
    if (isSignatureSkill(id) && !chainSet.has(id)) signatureOffChain.push(id);
  }
  const overBudget = spUsed > spBudget;
  return {
    ok:
      !overBudget &&
      notLearned.length === 0 &&
      signatureOffChain.length === 0 &&
      unknown.length === 0,
    spUsed,
    spBudget,
    overBudget,
    notLearned,
    signatureOffChain,
    unknown,
  };
}

// 저장된 로드아웃을 "유효한 부분집합"으로 정리(sanitize) — 플레이어의 수동 선택을 보존하되
//   더는 유효하지 않은 항목만 떨군다. reconcile/환생/마이그(코어루프)의 단일 규칙.
//   유효 = (1) 카탈로그에 있고 (2) learned 안 (3) 시그니처면 현 체인 안(직업 고정) → 그 뒤 예산 클램프.
//   강제 재산출(learned ∩ chain 전부)이 아니라 보존-정리라, 수동 로드아웃·오픈믹스(타직업 공용)를
//   살린다. 환생 시 옛 직업 시그니처만 빠지고 모아둔 공용/기본기는 유지.
export function sanitizeLoadout(
  equipped: readonly V2SkillId[],
  learned: readonly V2SkillId[],
  spBudget: number,
  currentChain: readonly V2SkillId[],
): V2SkillId[] {
  const learnedSet = new Set(learned);
  const chainSet = new Set(currentChain);
  const valid = equipped.filter(
    (id) =>
      V2_SKILLS[id] !== undefined &&
      learnedSet.has(id) &&
      (!isSignatureSkill(id) || chainSet.has(id)),
  );
  return clampLoadoutToBudget(valid, spBudget);
}

// 후보 로드아웃을 SP 예산에 맞게 잘라낸다 — 순서(우선순위) 보존, 누적합이 예산을 넘기지
//   않는 선까지 앞에서부터 채택(greedy in-order). 비싸서 안 들어가는 스킬은 건너뛰고 다음
//   더 싼 스킬은 들어올 수 있다. 자동장착 기본값(코어루프) + 비파괴 마이그(PR-4)용.
//   카탈로그에 없는 id 는 건너뜀. budget ≤ 0 이면 빈 로드아웃.
export function clampLoadoutToBudget(
  ids: readonly V2SkillId[],
  spBudget: number,
): V2SkillId[] {
  const out: V2SkillId[] = [];
  let sum = 0;
  for (const id of ids) {
    const def = V2_SKILLS[id];
    if (!def) continue;
    const cost = spCostOf(def);
    if (sum + cost <= spBudget) {
      out.push(id);
      sum += cost;
    }
  }
  return out;
}
