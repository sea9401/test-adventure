# 스킬 상세 설명 공용 창 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스킬 학습, 장착 목록, 직업 로드맵에서 같은 상세 창을 열어 자동 계산 수치와 6차 스킬의 작동 방식·연계·제약·PvP 차이를 확인할 수 있게 한다.

**Architecture:** `V2SkillDefinition`에 선택형 수동 상세 원문을 추가하고, 기존 구조화 데이터와 수동 원문을 순수 `skillDetailModel`에서 화면용 섹션으로 합친다. 한 개의 공용 클라이언트 다이얼로그를 세 화면이 재사용하며, 로드맵 안에서는 부모 모달의 포커스 트랩을 일시 중지해 중첩 모달 접근성을 보장한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Vitest 4, React server rendering tests, Playwright 1.62

## Global Constraints

- 이 작업은 표시 기능만 추가한다. 전투 계산, 스킬 효과, 밸런스 수치와 기존 짧은 `description`은 바꾸지 않는다.
- 배포와 점검 모드 변경은 이 계획 범위가 아니다.
- 새 테스트 의존성을 추가하지 않는다. 순수 모델과 정적 UI는 Vitest, 실제 열기·닫기·포커스·스크롤은 기존 모바일 Playwright로 검증한다.
- 상세 창과 내부 카드는 `src/components/ui/surfaces.ts`의 불투명 표면 상수를 사용한다.
- 상호작용 컴포넌트는 Client Component로 두되, 상세 표시 모델은 클라이언트 지시문 없는 순수 모듈로 유지한다.
- 구현 전에 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`를 다시 확인한다.
- 새 전투 스킬의 상세 원문 누락을 막되, 기존 저차 스킬은 외부 스냅샷에 고정한 레거시 예외만 허용한다.

---

## Task 1: 상세 데이터 계약과 자동 효과 설명 재사용 경계

**Files:**

- Modify: `src/adventure/data/v2/v2Skills.ts:290-520`
- Modify: `src/adventure/data/v2/v2Skills.ts:2004-2320`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**

- Consumes: existing `V2SkillDefinition`, `V2SkillEffect`, `describeV2Effect` and `describeV2Skill` behavior.
- Produces: `V2SkillDetail`, `V2SkillDefinition.detail?: V2SkillDetail`, and `describeV2SkillEffects(skill: V2SkillDefinition, effects: readonly V2SkillEffect[]): string[]`.

- [ ] **Step 1: 기존 자동 설명 출력을 고정하는 실패 테스트 작성**

대표 단일 효과와 여러 효과를 직접 넘겨도 기존 문구와 같은 배열이 만들어지는 공개 함수 테스트를 먼저 추가한다.

```ts
import {
  describeV2Skill,
  describeV2SkillEffects,
  V2_SKILLS,
} from "./v2Skills";

it("formats an explicit effect list through the shared effect formatter", () => {
  const skill = V2_SKILLS.v2c_mage_boltcast;
  expect(describeV2SkillEffects(skill, skill.effects ?? [])).toEqual([
    "피해 마법 공격력×1.05 + 지능×0.4",
  ]);
  expect(describeV2Skill(skill)).toContain(
    "피해 마법 공격력×1.05 + 지능×0.4",
  );
});
```

- [ ] **Step 2: 테스트가 공개 함수 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL — `describeV2SkillEffects`가 export되지 않았다는 오류.

- [ ] **Step 3: 상세 설명 타입과 선택 필드 추가**

`V2SkillDefinition` 바로 앞에 다음 타입을 추가하고 정의에 `detail?: V2SkillDetail`을 넣는다.

```ts
export type V2SkillDetail = {
  mechanics: readonly [string, ...string[]];
  synergies?: readonly string[];
  limitations?: readonly string[];
  pvp?: readonly string[];
};
```

`V2SkillDefinition`의 `description: string` 바로 다음 줄에는 다음 필드만 추가한다.

```ts
detail?: V2SkillDetail;
```

- [ ] **Step 4: 효과 배열 포매터를 공개하고 기존 함수가 이를 사용하도록 리팩터링**

현재 `describeV2Skill` 안에서 `skill.effects`와 변형 효과를 설명하는 반복문을 아래 경계로 옮긴다. 기존 문구와 순서를 바꾸지 않는다.

```ts
export function describeV2SkillEffects(
  skill: V2SkillDefinition,
  effects: readonly V2SkillEffect[],
): string[] {
  const directDamageEffectCount = Math.max(
    1,
    effects.filter(isDirectDamageEffect).length,
  );
  return effects.flatMap((effect) =>
    effect.kind === "missingHpDamage"
      ? describeMissingHpDamage(effect)
      : [
          describeV2Effect(
            effect,
            skill.tier,
            directDamageEffectCount,
            skill.monsterOnly === true,
          ),
        ],
  );
}
```

`describeV2Skill`은 패시브가 아닐 때 이 함수에 기존 `displayEffects`를 넘긴다. 독 중첩 보상 표시 순서와 이후 특수 규칙·타수·발동률·MP·쿨다운·속성 칩 추가 코드는 그대로 둔다.

- [ ] **Step 5: 자동 설명의 이전 출력과 새 함수 테스트 통과 확인**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS.

- [ ] **Step 6: 타입 검사 후 커밋**

Run: `npx tsc --noEmit`

Expected: PASS.

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "feat: add structured skill detail contract"
```

---

## Task 2: 화면 독립적인 스킬 상세 표시 모델

**Files:**

- Create: `src/adventure/v2/skillDetailModel.ts`
- Create: `src/adventure/v2/skillDetailModel.test.ts`
- Read/Reuse: `src/adventure/v2/skillLibraryFilters.ts`
- Read/Reuse: `src/adventure/data/v2/v2Skills.ts`

**Interfaces:**

- Consumes: `V2_SKILLS`, `describeV2Skill`, `describeV2SkillEffects`, `spCostOf`, `V2SkillDefinition.detail`, and `classifySkillForLibrary(skillId)`.
- Produces: `SkillDetailSectionId`, `SkillDetailSection`, `SkillDetailModel`, and `buildSkillDetailModel(skillId: string): SkillDetailModel | null`.

- [ ] **Step 1: 모델 계약과 기본/빈 구역 동작의 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { buildSkillDetailModel } from "./skillDetailModel";

describe("buildSkillDetailModel", () => {
  it("builds automatic facts for a legacy skill without manual detail", () => {
    const model = buildSkillDetailModel("v2_skill_strike");
    expect(model).toMatchObject({
      skillId: "v2_skill_strike",
      name: "강타",
    });
    expect(model?.facts.some((fact) => fact.includes("공격력×1"))).toBe(true);
    expect(model?.facts.some((fact) => fact.startsWith("SP "))).toBe(true);
    expect(model?.sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it("returns null for an unknown skill id", () => {
    expect(buildSkillDetailModel("missing_skill")).toBeNull();
  });
});
```

- [ ] **Step 2: 변형·속성·장착 시너지의 ID 해석 실패 테스트 추가**

실제 카탈로그에서 각 구조를 가진 스킬을 골라 조건 문구에 원시 `v2c_` ID가 남지 않고 사용자용 스킬명이 포함되는지 검사한다.

```ts
it("expands variants and synergies with user-facing skill names", () => {
  const model = buildSkillDetailModel("v2c_primordialmage_return");
  const text = model?.sections.flatMap((section) => section.items).join("\n") ?? "";
  expect(text).not.toMatch(/v2c_[a-z0-9_]+/);
  expect(model?.sections.some((section) => section.id === "variants")).toBe(true);
});
```

- [ ] **Step 3: 테스트가 모듈 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/skillDetailModel.test.ts`

Expected: FAIL — `skillDetailModel` 모듈을 찾지 못함.

- [ ] **Step 4: 순수 표시 모델과 고정된 섹션 순서 구현**

```ts
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";

export type SkillDetailSectionId =
  | "variants"
  | "automaticSynergies"
  | "mechanics"
  | "synergies"
  | "limitations"
  | "pvp";

export type SkillDetailSection = {
  id: SkillDetailSectionId;
  title: string;
  items: readonly string[];
};

export type SkillDetailModel = {
  skillId: V2SkillId;
  name: string;
  summary: string;
  badges: readonly string[];
  facts: readonly string[];
  sections: readonly SkillDetailSection[];
};
```

구현 규칙은 다음과 같이 고정한다.

```ts
const SECTION_TITLES: Record<SkillDetailSectionId, string> = {
  variants: "변형 효과",
  automaticSynergies: "자동 연계 정보",
  mechanics: "작동 방식",
  synergies: "연계",
  limitations: "제약",
  pvp: "PvP 차이",
};
```

다음 헬퍼와 본문을 구현해 자동 구역을 실제 구조화 데이터에서 만든다.

```ts
function skillNames(ids: readonly V2SkillId[] | undefined): string {
  return (ids ?? [])
    .map((id) => {
      const referenced = V2_SKILLS[id];
      if (!referenced && process.env.NODE_ENV !== "production") {
        console.warn(`[skill-detail] Unknown referenced skill: ${id}`);
      }
      return referenced?.name ?? id;
    })
    .join(", ");
}

function effectSummary(
  skill: V2SkillDefinition,
  effects: readonly V2SkillEffect[],
): string {
  return describeV2SkillEffects(skill, effects).join(" · ");
}

function section(
  id: SkillDetailSectionId,
  items: readonly string[] | undefined,
): SkillDetailSection | null {
  const present = (items ?? []).filter((item) => item.trim().length > 0);
  return present.length > 0
    ? { id, title: SECTION_TITLES[id], items: present }
    : null;
}

export function buildSkillDetailModel(skillId: string): SkillDetailModel | null {
  const skill = (V2_SKILLS as Readonly<Record<string, V2SkillDefinition>>)[skillId];
  if (!skill) return null;

  const classification = classifySkillForLibrary(skill.id);
  const variants = [
    ...(skill.elementEffects
      ? Object.entries(skill.elementEffects).map(
          ([element, effects]) =>
            `${V2_ELEMENT_LABEL[element as V2Element]} — ${effectSummary(skill, effects ?? [])}`,
        )
      : []),
    ...(skill.castVariants ?? []).map((variant) => {
      const conditions = [
        variant.requiredLearnedSkillIds?.length
          ? `보유: ${skillNames(variant.requiredLearnedSkillIds)}`
          : "",
        variant.requiredEquippedSkillIds?.length
          ? `장착: ${skillNames(variant.requiredEquippedSkillIds)}`
          : "",
      ].filter(Boolean).join(" · ");
      return `${variant.name}${conditions ? ` (${conditions})` : ""} — ${effectSummary(skill, variant.effects)}`;
    }),
  ];

  const automaticSynergies = [
    ...(skill.equippedSynergies ?? []).map((synergy) => {
      const ids = synergy.requiredSkillIds ??
        (synergy.requiredSkillId ? [synergy.requiredSkillId] : []);
      return `장착: ${skillNames(ids)} — ${effectSummary(skill, synergy.effects)}`;
    }),
    ...(skill.elementEffectSynergies ?? []).flatMap((synergy) =>
      Object.entries(synergy.elementEffects).map(
        ([element, effects]) =>
          `장착: ${skillNames([synergy.requiredSkillId])} · ${V2_ELEMENT_LABEL[element as V2Element]} — ${effectSummary(skill, effects ?? [])}`,
      ),
    ),
  ];

  const badges = [
    classification?.tier === "common"
      ? "공용"
      : classification?.tier
        ? `${classification.tier}차`
        : "",
    CATEGORY_LABELS[skill.category],
    STAT_LABELS[skill.stat],
    skill.element ? V2_ELEMENT_LABEL[skill.element] : "",
  ].filter((badge, index, all) => badge.length > 0 && all.indexOf(badge) === index);

  const sections = [
    section("variants", variants),
    section("automaticSynergies", automaticSynergies),
    section("mechanics", skill.detail?.mechanics),
    section("synergies", skill.detail?.synergies),
    section("limitations", skill.detail?.limitations),
    section("pvp", skill.detail?.pvp),
  ].filter((value): value is SkillDetailSection => value !== null);

  return {
    skillId: skill.id,
    name: skill.name,
    summary: skill.description,
    badges,
    facts: [...describeV2Skill(skill), `SP ${spCostOf(skill)}`],
    sections,
  };
}
```

이 코드에 필요한 `V2Element`, `V2_ELEMENT_LABEL`, `STAT_LABELS`, `V2SkillDefinition`, `V2SkillEffect`, `V2_SKILLS`, `describeV2Skill`, `describeV2SkillEffects`, `spCostOf`, `classifySkillForLibrary`를 각각 현재 원본 모듈에서 import한다. 카테고리 표기는 다음 상수로 고정한다.

```ts
const CATEGORY_LABELS: Record<V2SkillDefinition["category"], string> = {
  attack: "공격",
  heal: "회복",
  buff: "강화",
  debuff: "약화",
  passive: "패시브",
};
```

- `facts`는 `describeV2Skill(skill)`의 결과 뒤에 `SP ${spCostOf(skill)}`를 붙인다.
- `badges`는 `classifySkillForLibrary`의 분류와 스킬의 카테고리·주 능력치·속성 중 실제 값만 넣고 중복을 제거한다.
- `castVariants`, `elementEffects`, `elementEffectSynergies`, `equippedSynergies`는 조건과 효과를 각각 펼쳐 `variants` 또는 `automaticSynergies`에 넣는다.
- 모든 선행/장착 스킬 ID는 `V2_SKILLS[id]?.name`으로 바꾸며 찾지 못한 ID만 원문 ID를 개발 경고와 함께 남긴다.
- 수동 구역은 `mechanics`, `synergies`, `limitations`, `pvp` 순서로 추가한다.
- 빈 구역은 반환 배열에서 제거한다.

- [ ] **Step 5: 모델 테스트와 기존 스킬 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/skillDetailModel.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/adventure/v2/skillDetailModel.ts src/adventure/v2/skillDetailModel.test.ts
git commit -m "feat: build reusable skill detail models"
```

---

## Task 3: 현재 6차 전투 스킬 41종 상세 원문과 누락 방지 정책

**Files:**

- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts:2221-2688`
- Create: `src/adventure/data/v2/v2SkillDetails.test.ts`
- Create: `src/adventure/data/v2/__snapshots__/v2SkillDetails.test.ts.snap`

**Interfaces:**

- Consumes: `V2_JOB_CATALOG`, `V2_SKILLS_BY_JOB`, `V2_SKILLS`, `V2SkillDetail`, and `isLifestyleSkill`.
- Produces: complete `detail` data for the 41 current tier-6 combat skills and an external snapshot that explicitly freezes lower-tier automatic-only exceptions.

- [ ] **Step 1: 6차 필수 원문과 레거시 예외 스냅샷 테스트 작성**

직업 카탈로그와 `V2_SKILLS_BY_JOB`을 함께 조회하고, `monsterOnly`와 `isLifestyleSkill(skill)`을 제외한다. 현재 타입이 6까지이므로 먼저 6차를 정확히 검사하고, 7차 타입 도입 시 같은 비교를 `tier >= 6`으로 넓힌다.

```ts
const catalogedCombatSkills = Object.entries(V2_SKILLS_BY_JOB).flatMap(
  ([jobId, skillIds]) => {
    const jobTier = V2_JOB_CATALOG[jobId]?.tier;
    return skillIds.map((id) => ({
      id,
      jobId,
      jobTier,
      definition: V2_SKILLS[id],
    }));
  },
).filter(
  (entry) =>
    entry.definition != null &&
    !entry.definition.monsterOnly &&
    !isLifestyleSkill(entry.definition),
);

const tierSixCombatSkills = catalogedCombatSkills.filter(
  (entry) => entry.jobTier === 6,
);
```

```ts
it("requires manual detail for every tier-6 combat skill", () => {
  const missing = tierSixCombatSkills
    .filter((entry) => !entry.definition.detail)
    .map((entry) => `${entry.jobId}:${entry.id}`)
    .sort();
  expect(missing).toEqual([]);
});

it("freezes the legacy combat skills that still use automatic-only detail", () => {
  const legacyFallbackIds = [...new Set(catalogedCombatSkills
    .filter((entry) => (entry.jobTier ?? 0) < 6 && !entry.definition.detail)
    .map((entry) => entry.id))]
    .sort();
  expect(legacyFallbackIds).toMatchSnapshot();
});
```

생활 직업 이름이나 `isLifestyleMasteryJobId`로 대신 판정하지 않는다. 생활 효과 패시브를 실제로 보는 `isLifestyleSkill`만 사용한다.

- [ ] **Step 2: 41종이 모두 누락되어 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/v2SkillDetails.test.ts`

Expected: FAIL — 아래 41개 6차 전투 스킬이 `missing`에 출력됨.

- [ ] **Step 3: 다음 원문을 각 정의의 `detail`에 그대로 삽입**

아래 객체는 문구의 단일 구현 원본이다. 런타임 별도 맵으로 만들지 말고 각 `V2SkillDefinition` 리터럴에 해당 값을 `detail:`로 넣는다. 구조화 필드가 이미 표시하는 숫자는 불필요하게 반복하지 않는다.

```ts
const TIER_SIX_DETAIL_COPY = {
  v2c_fortressknight_ram: {
    mechanics: ["적중한 뒤 보유한 충격을 최대 3스택까지 모두 소비해 추가 피해를 준다."],
    synergies: ["충격은 충격 방벽의 반격 효과로 얻으며, 움직이는 성채를 장착하면 스택당 추가 피해가 강화된다."],
    limitations: ["충격이 없으면 충격 소비 추가 피해는 발생하지 않는다."],
  },
  v2c_fortressknight_citadel: {
    mechanics: ["장착 중 성채 기사 계열의 방어 성능과 충격 소비 보상을 강화한다."],
    synergies: ["충격 방벽이 충격을 만들고 성채 충각이 충격을 소비한다."],
    limitations: ["이 스킬 자체는 충격을 생성하지 않는다. 충격 방벽을 함께 장착해야 충격을 얻을 수 있다."],
  },
  v2c_swordsaint_flash: {
    mechanics: ["직접 피해를 먼저 적용한 뒤 대상에게 후속 약화와 행동 지연을 적용한다."],
  },
  v2c_swordsaint_transcendence: {
    mechanics: ["일반 물리 피해 효과 하나에만 검기 초월 보정을 적용한다."],
    limitations: ["다단 공격의 추가 타격, 체력 소모, 처형, 중첩 보상, 마법 피해에는 적용되지 않는다."],
  },
  v2c_swordsaint_armorinsight3: {
    mechanics: ["직접 물리 피해를 계산할 때 대상의 남은 방어력을 비율로 추가 무시한다."],
    limitations: ["마법 피해에는 적용되지 않으며 방어 무시는 합산이 아니라 남은 방어력에 곱연산으로 적용된다."],
  },
  v2c_grandchampion_hour: {
    mechanics: ["발동 뒤 이어지는 기본 공격 5회에 챔피언의 시간 효과를 적용한다."],
    synergies: ["장착한 선언 계열 중 가장 높은 단계의 효과가 하위 선언 효과를 함께 계승한다."],
    limitations: ["스킬 공격에는 적용되지 않고 기본 공격 횟수만 소비한다."],
  },
  v2c_grandchampion_instinct: {
    mechanics: ["기본 공격의 치명타 확률과 치명타 상한을 확장한다."],
    limitations: ["스킬 공격의 치명타에는 적용되지 않는다."],
  },
  v2c_hegemon_annihilation: {
    mechanics: ["전투당 한 번, 공격 처리 전에 현재 체력 상태를 기준으로 멸왕일도 보정을 확정한다."],
    synergies: ["혈기 준비와 사선 극복 상태가 있으면 각각의 추가 보상을 함께 적용한다."],
    limitations: ["전투당 1회 제한을 소모한 뒤에는 다시 발동할 수 없다."],
    pvp: ["결손 체력 비례 추가 피해는 PvP에서 60%만 적용된다."],
  },
  v2c_hegemon_dominion: {
    mechanics: ["장착 중 하위 광기 효과를 계승하고 패황 전용 광기 효과로 대체한다."],
    synergies: ["사선 극복이 발동 가능한 상태라면 그 처리 순서와 함께 생존 보상을 적용한다."],
    limitations: ["동일 계열 광기 효과는 중복 적용되지 않는다."],
  },
  v2c_archmage_collapse: {
    mechanics: ["직접 마법 피해를 적용한 뒤 비전 붕괴의 후속 효과를 처리한다."],
  },
  v2c_archmage_theory: {
    mechanics: ["직접 마법 공격의 능력치 계수와 대마도사 전용 보정을 강화한다."],
    limitations: ["물리 피해와 직접 공격이 아닌 지속 피해에는 적용되지 않는다."],
  },
  v2c_archmage_magicdismantle3: {
    mechanics: ["직접 마법 피해를 계산할 때 대상의 남은 마법 방어력을 비율로 추가 무시한다."],
    limitations: ["물리 피해에는 적용되지 않으며 마법 방어 무시는 남은 수치에 곱연산으로 적용된다."],
  },
  v2c_primordialmage_return: {
    mechanics: ["현재 주문식 조건과 처음 일치하는 변형 하나를 선택해 그 효과로 시전한다."],
    synergies: ["배운 원소 주문과 장착한 태초 계열 스킬에 따라 사용할 수 있는 주문식이 늘어난다."],
    limitations: ["둘 이상의 조건이 맞아도 정의 순서상 첫 변형만 적용되며, 일치하는 주문식이 없으면 기본 효과를 사용한다."],
  },
  v2c_primordialmage_resonance: {
    mechanics: ["태초회귀와 함께 장착하면 주문식에 필요한 원소 재료를 흡수해 유효 SP 비용 2로 취급한다."],
    synergies: ["원소 쇄도는 주문식 촉매로 흡수할 수 있으며, 태초 회로 조건이 원소 공명보다 우선한다."],
    limitations: ["흡수된 원소 재료는 별도 행동으로 시전되는 것이 아니라 태초회귀의 주문식 판정에만 사용된다."],
  },
  v2c_primordialmage_amplification: {
    mechanics: ["장비에서 얻은 치명타 피해 배율을 직접 마법 스킬 피해 보정으로 완만하게 변환하며 최대 추가 배율에 가까워진다."],
    limitations: ["직접 마법 피해에만 적용되고 지속 피해, 회복, 물리 피해에는 적용되지 않는다."],
  },
  v2c_lawweaver_release: {
    mechanics: ["각인 합계가 3 이상일 때만 발동하며, 공격·역류·침식·수호 각인을 모두 소비한다.", "공격은 스택마다 추가 타격, 역류는 스택마다 최대 MP 회복, 침식은 스택마다 마법 취약, 수호는 스택마다 최대 MP 비례 보호막을 부여한다."],
    synergies: ["서로 다른 각인 종류가 2·3·4개면 피해 보상이 단계적으로 커지고, 네 종류를 모두 해방하면 추가 타격과 가속을 얻는다."],
    limitations: ["각 각인은 최대 2스택, 전체는 최대 8스택이며 발동 뒤 보유 각인을 모두 잃는다."],
  },
  v2c_lawweaver_inscription: {
    mechanics: ["직접 피해·회복·약화·보호 효과를 사용할 때 대응하는 공격·역류·침식·수호 각인을 얻는다."],
    synergies: ["모은 각인은 만상각인 해방의 타격, MP 회복, 마법 취약, 보호막과 다양성 보상으로 변환된다."],
    limitations: ["각 종류는 최대 2스택이며 전체 합계는 최대 8스택이다."],
  },
  v2c_savior_judgment: {
    mechanics: ["정신 기반 직접 마법 피해를 먼저 적용한 뒤 대상에게 구원의 심판 약화를 적용한다."],
  },
  v2c_savior_grace: {
    mechanics: ["장착 중 회복량 보정이 적용되는 회복 효과와 구원자 계열의 지원 성능을 강화한다."],
    limitations: ["피해 흡혈처럼 실제 입힌 피해로 계산되는 회복에는 일반 회복량 보정이 적용되지 않는다."],
  },
  v2c_lawguardian_inviolable: {
    mechanics: ["물리·마법·정화 결계를 각각 별도 충전으로 관리하고 조건에 맞는 첫 효과를 막거나 줄인 뒤 해당 충전을 소비한다.", "결계를 소비할 때마다 안정 1스택을 얻으며 안정은 최대 3스택까지 피해 감소를 제공한다."],
    limitations: ["한 행동의 여러 타격 중 같은 종류의 결계는 첫 유효 타격에서 한 번만 소비된다."],
    pvp: ["물리·마법 결계의 피해 감소율은 PvP에서 40%로 적용된다."],
  },
  v2c_lawguardian_domain: {
    mechanics: ["결계 충전을 새로 채우면서 이미 얻은 안정 스택은 유지한다."],
    synergies: ["만법불침을 장착하면 물리·마법·정화 결계를 각각 3회까지 충전한다."],
    limitations: ["만법불침을 장착하지 않은 경우에는 기본 결계 단계까지만 갱신된다."],
  },
  v2c_doomprophet_sentence: {
    mechanics: ["대상의 계시 중첩을 확인해 추가 피해를 계산하지만 중첩은 소비하지 않는다."],
    limitations: ["계시 중첩이 없으면 중첩 보상 피해는 발생하지 않는다."],
  },
  v2c_doomprophet_revelation: {
    mechanics: ["직접 스킬 타격이 적중할 때 대상에게 계시를 쌓는다."],
    synergies: ["쌓인 계시는 종말 선고의 추가 피해를 높인다."],
    limitations: ["기본 공격과 지속 피해는 계시를 쌓지 않으며 최대 10스택까지 유지된다."],
  },
  v2c_heavenlybow_orbit: {
    mechanics: ["세 번 타격하며 마지막 타격을 강화한 뒤 대상에게 후속 약화를 적용한다."],
  },
  v2c_heavenlybow_starpath: {
    mechanics: ["직접 스킬 공격의 치명타 성능과 공격 속도 보정을 강화한다."],
    limitations: ["속도 보정은 무한히 선형 증가하지 않고 점차 효율이 줄어든다."],
  },
  v2c_blackmoon_flurry: {
    mechanics: ["세 번의 직접 타격을 모두 처리한 뒤 흑월난무의 후속 효과를 적용한다."],
  },
  v2c_blackmoon_dominion: {
    mechanics: ["회피가 성공하면 다음 직접 피해 스킬에 사용할 치명타 보장을 준비한다."],
    limitations: ["준비된 효과는 실제로 직접 피해를 준 다음 액티브 스킬에서만 소비된다."],
  },
  v2c_blackmoon_weakpoint3: {
    mechanics: ["직접 물리 피해를 계산할 때 대상의 남은 방어력을 비율로 추가 무시한다."],
    limitations: ["마법 피해에는 적용되지 않으며 방어 무시는 남은 방어력에 곱연산으로 적용된다."],
  },
  v2c_myriadvenom_mutation: {
    mechanics: ["대상의 독 중첩을 확인해 추가 피해를 계산하며, 같은 시전에서 먼저 쌓은 독도 계산에 포함한다."],
    limitations: ["추가 피해를 계산해도 독 중첩은 소비하지 않는다."],
  },
  v2c_myriadvenom_body: {
    mechanics: ["독이 있는 대상과 독 피해에 대한 만독 지배 보정을 제공한다."],
    limitations: ["독이 없는 대상이나 독이 아닌 피해에는 해당 조건부 보정이 적용되지 않는다."],
  },
  v2c_celestialdragon_combo: {
    mechanics: ["다섯 번의 연속 타격을 순서대로 처리한다."],
    synergies: ["천룡의 호흡을 장착하면 기본 공격과 액티브의 각 타격이 공유 타격 수를 올리고 매 4번째 타격을 강화한다."],
  },
  v2c_celestialdragon_breath: {
    mechanics: ["기본 공격과 액티브 스킬의 각 직접 타격을 하나의 공유 카운터로 세어 매 4번째 타격에 추가 피해를 준다."],
    limitations: ["스킬 사용 횟수가 아니라 실제 타격 수를 기준으로 계산한다."],
  },
  v2c_celestialdragon_formationbreak3: {
    mechanics: ["직접 물리 피해를 계산할 때 대상의 남은 방어력을 비율로 추가 무시한다."],
    limitations: ["마법 피해에는 적용되지 않으며 방어 무시는 남은 방어력에 곱연산으로 적용된다."],
  },
  v2c_vajraarhat_seal: {
    mechanics: ["반사 피해와 금강 계열 반격 보상을 강화한다."],
    synergies: ["피해를 받고 생존해 반격 조건이 성립하면 금강 계열 자동 반격과 함께 적용된다."],
  },
  v2c_vajraarhat_body: {
    mechanics: ["HP 피해를 받고 생존했을 때 조건에 맞는 자동 반격을 수행한다."],
    limitations: ["피해를 받지 않았거나 해당 타격으로 전투 불능이 되면 반격하지 않는다."],
  },
  v2c_eternal_cycle: {
    mechanics: ["발동 뒤 자신의 행동이 끝날 때마다 정해진 횟수 동안 재생 효과를 처리한다."],
    limitations: ["지속 횟수는 자신의 행동 종료를 기준으로 줄어든다."],
  },
  v2c_eternal_body: {
    mechanics: ["장착하는 동안 영겁 계열의 생존 능력을 항상 적용한다."],
  },
  v2c_blooddemon_reign: {
    mechanics: ["적중 시 체력을 소모해 두 번째 타격과 처형 판정을 이어서 처리하고, 보호막과 HP에 실제로 준 피해를 기준으로 회복한다."],
    limitations: ["실제 피해 기반 회복에는 일반 회복량 증가 효과가 다시 적용되지 않는다."],
  },
  v2c_blooddemon_immortalblood: {
    mechanics: ["직접 피해로 실제 입힌 피해량을 기준으로 자동 흡혈한다."],
    limitations: ["피해가 발생하지 않으면 흡혈도 발생하지 않으며 일반 회복량 증가 효과가 다시 적용되지 않는다."],
  },
  v2c_absolute_unity: {
    mechanics: ["시전 시점의 여섯 기본 능력치를 함께 참조해 만상귀일 효과를 계산한다."],
  },
  v2c_absolute_harmony: {
    mechanics: ["장착 중 절대자 계열의 비율 보정을 항상 적용한다."],
  },
} satisfies Record<string, V2SkillDetail>;
```

- [ ] **Step 4: 6차 필수 검사 통과 후 레거시 스냅샷 생성**

먼저 일반 실행에서 `missing`이 빈 배열인지 확인한 뒤에만 스냅샷을 갱신한다.

Run: `npm test -- src/adventure/data/v2/v2SkillDetails.test.ts`

Expected: FAIL only because the legacy snapshot does not exist; tier-6 assertion is PASS.

Run: `npm test -- src/adventure/data/v2/v2SkillDetails.test.ts -u`

Expected: PASS and one external snapshot created.

- [ ] **Step 5: 생활·몬스터 제외와 레거시 예외 정책을 확인**

```ts
expect(tierSixCombatSkills.every((entry) => !entry.definition.monsterOnly)).toBe(true);
expect(tierSixCombatSkills.every((entry) => !isLifestyleSkill(entry.definition))).toBe(true);
```

외부 스냅샷 자체를 현재 저차 레거시 예외의 명시 목록으로 취급한다. 상세 원문 없는 신규 스킬이 추가되거나 기존 예외에 상세 원문이 작성되면 스냅샷 비교가 실패해야 한다. 원인 확인 없이 `-u`로 통과시키지 않으며, 신규 누락은 `detail`을 작성하고 기존 예외 해소는 스냅샷에서 해당 ID가 제거되는 변경만 승인한다.

- [ ] **Step 6: 관련 테스트와 타입 검사 후 커밋**

Run: `npm test -- src/adventure/data/v2/v2SkillDetails.test.ts src/adventure/v2/skillDetailModel.test.ts`

Run: `npx tsc --noEmit`

Expected: both PASS.

```bash
git add src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillDetails.test.ts src/adventure/data/v2/__snapshots__/v2SkillDetails.test.ts.snap
git commit -m "content: document tier six combat skills"
```

---

## Task 4: 공용 상세 다이얼로그와 정적 렌더링 테스트

**Files:**

- Create: `src/adventure/v2/SkillDetailDialog.tsx`
- Create: `src/adventure/v2/SkillDetailDialog.test.tsx`
- Read/Reuse: `src/adventure/v2/SparringFullLogDialog.tsx`
- Read/Reuse: `src/components/ui/surfaces.ts`
- Read/Reuse: `src/lib/useEscapeKey.ts`
- Read/Reuse: `src/lib/useModalA11y.ts`

**Interfaces:**

- Consumes: `buildSkillDetailModel(skillId)`, `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`, `useEscapeKey`, and `useModalA11y`.
- Produces: `SkillDetailContent`, `SkillDetailTrigger`, and `SkillDetailDialog` with the exact props declared below.

- [ ] **Step 1: 순수 콘텐츠와 트리거의 실패 테스트 작성**

`renderToStaticMarkup`으로 브라우저 DOM 의존 없이 내용과 접근 가능한 이름을 고정한다.

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SkillDetailContent, SkillDetailTrigger } from "./SkillDetailDialog";

it("renders the detail heading, summary, facts and sections", () => {
  const html = renderToStaticMarkup(<SkillDetailContent skillId="v2_skill_strike" />);
  expect(html).toContain("강타");
  expect(html).toContain("공격력×1");
  expect(html).toContain("SP ");
});

it("gives every trigger a discoverable accessible name", () => {
  const html = renderToStaticMarkup(
    <SkillDetailTrigger
      skillId="v2_skill_strike"
      skillName="강타"
      onOpen={vi.fn()}
    >
      <span>강타</span>
    </SkillDetailTrigger>,
  );
  expect(html).toContain('aria-label="강타 상세 보기"');
});
```

- [ ] **Step 2: 모듈 부재 실패 확인**

Run: `npm test -- src/adventure/v2/SkillDetailDialog.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: 공용 콘텐츠·트리거·포털 다이얼로그 구현**

공개 인터페이스를 다음과 같이 고정한다.

```tsx
export function SkillDetailContent({ skillId }: { skillId: V2SkillId })

export function SkillDetailTrigger({
  skillId,
  skillName,
  onOpen,
  className,
  children,
}: {
  skillId: V2SkillId;
  skillName: string;
  onOpen: (skillId: V2SkillId, trigger: HTMLButtonElement) => void;
  className?: string;
  children: React.ReactNode;
})

export function SkillDetailDialog({
  skillId,
  onClose,
}: {
  skillId: V2SkillId;
  onClose: () => void;
})
```

`SkillDetailTrigger`의 버튼 이벤트는 클릭된 DOM 요소를 함께 전달한다.

```tsx
return (
  <button
    type="button"
    className={className}
    aria-label={`${skillName} 상세 보기`}
    onClick={(event) => onOpen(skillId, event.currentTarget)}
  >
    {children}
  </button>
);
```

다이얼로그 구현 규칙:

```tsx
const SKILL_DETAIL_OVERLAY_CLASS =
  "fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4";

const SKILL_DETAIL_PANEL_CLASS =
  `flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden ${SURFACE_CARD}`;
```

- 완성한 다이얼로그 React 노드를 `createPortal(dialog, document.body)`로 렌더링한다.
- `role="dialog"`, `aria-modal="true"`, 제목 `aria-labelledby`를 연결한다.
- `useEscapeKey(onClose)`와 `useModalA11y(panelRef)`를 사용한다.
- 오버레이 자체를 클릭할 때만 닫고 패널 내부 클릭은 닫지 않는다.
- 본문만 `overflow-y-auto`로 스크롤한다.
- 모델이 `null`이면 렌더링하지 않고 개발 환경에서 `console.warn`한다.
- 본문과 중첩 구역은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`만 사용한다.

- [ ] **Step 4: 정적 렌더링 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/SkillDetailDialog.test.tsx src/adventure/v2/skillDetailModel.test.ts`

Expected: PASS.

- [ ] **Step 5: lint와 타입 검사 후 커밋**

Run: `npx eslint src/adventure/v2/SkillDetailDialog.tsx src/adventure/v2/SkillDetailDialog.test.tsx`

Run: `npx tsc --noEmit`

Expected: both PASS.

```bash
git add src/adventure/v2/SkillDetailDialog.tsx src/adventure/v2/SkillDetailDialog.test.tsx
git commit -m "feat: add shared skill detail dialog"
```

---

## Task 5: 학습 화면과 장착 목록 연동

**Files:**

- Modify: `src/adventure/v2/V2SkillLearnView.tsx:180-641`
- Modify: `src/adventure/v2/V2SkillLearnView.test.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx:205-237`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx:1297-1455`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`
- Modify: `e2e/mobile-ui.spec.ts`

**Interfaces:**

- Consumes: `SkillDetailTrigger`, `SkillDetailDialog`, and existing `V2SkillId` state patterns.
- Produces: learning-card and loadout-library entry points that open one shared detail dialog per parent screen while leaving all action controls unchanged.

- [ ] **Step 1: 세부 트리거와 기존 동작 분리의 정적 실패 테스트 작성**

학습 카드와 라이브러리 행의 HTML에 상세 트리거의 접근 가능한 이름이 있고, 기존 액션 버튼 이름은 유지되는지 검사한다.

```ts
expect(html).toContain('aria-label="강타 상세 보기"');
expect(html).toContain("학습");
expect(html).toContain("장착");
```

강화 카드의 기존 `상세` 버튼은 실제로 의식/강화 흐름을 열므로 이름을 `강화`로 바꾸고 테스트도 그 의미를 고정한다.

```ts
expect(html).toContain(">강화<");
expect(html).not.toContain(">상세<");
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

Expected: FAIL — 상세 트리거가 아직 없음.

- [ ] **Step 3: 학습 화면에 선택 상태와 단일 다이얼로그 연결**

```tsx
const [detailSkillId, setDetailSkillId] = useState<V2SkillId | null>(null);

<SkillDetailTrigger
  skillId={s.skillId}
  skillName={s.name}
  onOpen={setDetailSkillId}
>
  <span className="truncate text-sm font-semibold">{s.name}</span>
  <p className="mt-0.5 line-clamp-2 text-[11px]">{skillDesc(s.skillId)}</p>
  <SkillEffectChips skillId={s.skillId} />
</SkillDetailTrigger>

{detailSkillId ? (
  <SkillDetailDialog
    skillId={detailSkillId}
    onClose={() => setDetailSkillId(null)}
  />
) : null}
```

`학습`, `보유`, `강화` 컨트롤을 트리거 밖 형제로 둔다. 중첩 버튼을 만들거나 카드 전체 `onClick` 전파 차단에 의존하지 않는다.

- [ ] **Step 4: 장착 라이브러리 행에 같은 상태와 다이얼로그 연결**

드래그 핸들, 즐겨찾기, 장착·해제 버튼은 트리거 밖에 유지하고 기존 이름/설명 콘텐츠 영역만 `SkillDetailTrigger`로 감싼다. 이미 장착된 상단 빠른 슬롯의 스킬명 클릭은 해제 동작을 유지해 기존 모바일 조작을 바꾸지 않는다.

- [ ] **Step 5: 모바일 Playwright에 실제 열기·닫기와 액션 분리 테스트 추가**

`/dev/skill-loadout` 기존 미리보기를 사용한다.

```ts
test("skill detail opens without hijacking loadout actions", async ({ page }) => {
  await page.goto("/dev/skill-loadout");
  const detailTrigger = page.getByRole("button", { name: "강타 상세 보기" });
  await detailTrigger.click();
  await expect(page.getByRole("dialog", { name: "강타" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "강타" })).toBeHidden();
  await expect(detailTrigger).toBeFocused();

  await page.getByRole("button", { name: "독침 장착" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
```

현재 미리보기의 액션 이름은 `독침 장착`이므로 이 이름을 그대로 사용한다.

- [ ] **Step 6: 단위 테스트와 모바일 E2E 통과 확인**

Run: `npm test -- src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

Run: `npm run test:e2e:mobile-ui`

Expected: 320px와 390px 두 프로젝트 모두 PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/adventure/v2/V2SkillLearnView.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx e2e/mobile-ui.spec.ts
git commit -m "feat: open skill details from learning and loadout"
```

---

## Task 6: 직업 로드맵 중첩 모달과 포커스 처리

**Files:**

- Modify: `src/lib/useEscapeKey.ts`
- Modify: `src/lib/useFocusTrap.ts`
- Modify: `src/lib/useModalA11y.ts`
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx:70-340`
- Modify: `src/adventure/v2/JobRoadmapDialog.test.tsx`
- Modify: `src/app/dev/job-ladder/page.tsx`
- Modify: `e2e/mobile-ui.spec.ts`

**Interfaces:**

- Consumes: `SkillDetailTrigger`, `SkillDetailDialog`, and the existing modal hooks.
- Produces: optional `enabled = true` parameters on `useEscapeKey`, `useFocusTrap`, and `useModalA11y`, plus a roadmap entry point with child-first Escape handling and trigger focus restoration.

- [ ] **Step 1: 로드맵 트리거와 중첩 모달의 실패 테스트 작성**

`JobRoadmapDialog.test.tsx`에는 인라인 펼침 제거와 상세 트리거를 고정한다.

```ts
expect(html).toContain('aria-label="강타 상세 보기"');
expect(html).not.toContain("<details");
```

`e2e/mobile-ui.spec.ts`에는 자식부터 닫히는 Escape 순서와 포커스 복귀를 먼저 추가한다.

```ts
test("roadmap keeps its parent dialog open while skill detail closes", async ({ page }) => {
  await page.goto("/dev/job-ladder");
  await page.getByRole("button", { name: "전직 로드맵" }).last().click();
  const roadmap = page.getByRole("dialog", { name: /전직 로드맵/ });
  await expect(roadmap).toBeVisible();

  const trigger = page.getByRole("button", { name: "강타 상세 보기" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "강타" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "강타" })).toBeHidden();
  await expect(roadmap).toBeVisible();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(roadmap).toBeHidden();
});
```

- [ ] **Step 2: 테스트가 트리거 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx`

Run: `npm run test:e2e:mobile-ui`

Expected: FAIL — 로드맵에 `강타 상세 보기` 버튼이 없음.

- [ ] **Step 3: 접근성 훅에 선택적 `enabled` 인자 구현**

새 시그니처를 다음과 같이 고정한다.

```ts
export function useEscapeKey(onClose: () => void, enabled = true): void;
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void;
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void;
```

```ts
export function useModalA11y(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useFocusTrap(containerRef, enabled);
  useScrollLock(enabled);
}
```

`useEscapeKey`와 `useFocusTrap`의 effect는 `enabled === false`일 때 리스너와 포커스 이동을 등록하지 않는다. 의존성 배열에는 `enabled`, 콜백과 ref를 정확히 포함해 stale closure를 만들지 않는다.

- [ ] **Step 4: 로드맵에서 부모 모달 일시 중지와 자식 상세 창 연결**

```tsx
const [detailSkillId, setDetailSkillId] = useState<V2SkillId | null>(null);
const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
const detailOpen = detailSkillId !== null;

useEscapeKey(onClose, !detailOpen);
useModalA11y(contentRef, !detailOpen);
```

`JobRoadmapDetails`의 현재 props에 다음 콜백을 추가해 부모가 선택 상태를 소유하게 한다.

```ts
onInspectSkill: (skillId: V2SkillId, trigger: HTMLButtonElement) => void;
```

대표 스킬의 인라인 `<details>/<summary>`를 `SkillDetailTrigger` 버튼 카드로 바꾼다. 다음 콜백으로 열린 버튼을 저장하고 닫을 때 포커스를 되돌린다.

```tsx
const openSkillDetail = (
  skillId: V2SkillId,
  trigger: HTMLButtonElement,
) => {
  detailTriggerRef.current = trigger;
  setDetailSkillId(skillId);
};
```

```tsx
const closeSkillDetail = () => {
  setDetailSkillId(null);
  requestAnimationFrame(() => detailTriggerRef.current?.focus());
};
```

자식이 열려 있는 동안 부모 `role="dialog"` 요소에는 다음 속성을 적용한다.

```tsx
aria-hidden={detailOpen ? true : undefined}
inert={detailOpen ? true : undefined}
```

현재 React 19 타입의 `inert?: boolean`을 그대로 사용한다. 자식 `SkillDetailDialog`는 부모 포털 형제이며 `z-[160]`으로 로드맵의 `z-[140]` 위에 표시한다.

- [ ] **Step 5: 개발 미리보기에 실제 대표 스킬 추가**

`src/app/dev/job-ladder/page.tsx`의 전사 목업에 기존 실재 ID를 넣는다.

```ts
signatureSkills: [
  { id: "v2_skill_strike", name: "강타", kind: "active" },
],
```

`JobLadderEntry.signatureSkills`의 현재 객체 타입을 그대로 사용한다.

- [ ] **Step 6: 자식이 열린 상태의 부모 접근성 차단을 E2E에 보강**

부모에 `aria-hidden`이 적용된 동안 role 쿼리는 부모를 숨기므로 자식이 열린 직후 DOM 속성을 직접 확인하고, 자식이 닫힌 뒤 role 쿼리로 다시 확인한다.

```ts
const roadmapElement = page.locator('[aria-labelledby="job-roadmap-dialog-title"]');
await expect(roadmapElement).toHaveAttribute("aria-hidden", "true");
await expect(roadmapElement).toHaveAttribute("inert", "");
```

- [ ] **Step 7: 단위·모바일 E2E·타입 검사 후 커밋**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx`

Run: `npm run test:e2e:mobile-ui`

Run: `npx tsc --noEmit`

Expected: all PASS.

```bash
git add src/lib/useEscapeKey.ts src/lib/useFocusTrap.ts src/lib/useModalA11y.ts src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/JobRoadmapDialog.test.tsx src/app/dev/job-ladder/page.tsx e2e/mobile-ui.spec.ts
git commit -m "feat: open skill details from job roadmap"
```

---

## Task 7: 전체 회귀 검증과 문서 일치 확인

**Files:**

- Verify: all files changed in Tasks 1-6
- Verify: `docs/superpowers/specs/2026-08-19-skill-detail-dialog-design.md`

**Interfaces:**

- Consumes: all public interfaces and user-visible copy produced in Tasks 1-6.
- Produces: no new runtime interface; only verification evidence and, if a regression is found, a narrowly scoped correction commit.

- [ ] **Step 1: 상세 원문 누락과 레거시 스냅샷 변경 여부 확인**

Run: `npm test -- src/adventure/data/v2/v2SkillDetails.test.ts`

Expected: PASS without `-u`; snapshot has no unexpected change.

- [ ] **Step 2: 전체 Vitest 실행**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: lint와 타입 검사**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Expected: both PASS.

- [ ] **Step 4: 이미지 참조와 프로덕션 빌드 확인**

새 이미지가 없더라도 기존 prebuild 검증과 Next.js 16 경계를 함께 확인한다.

Run: `npm run check-images`

Run: `npm run build`

Expected: both PASS; 참조 누락 이미지, Client/Server 경계 오류 없음.

- [ ] **Step 5: 모바일 320px·390px 실제 상호작용 재검증**

Run: `npm run test:e2e:mobile-ui`

Expected: both projects PASS; 상세 창 내부 가로 스크롤 없음, 배경 스크롤 잠김, Esc 순서와 포커스 복귀 정상.

- [ ] **Step 6: 변경 범위와 문구 자체 검토**

```bash
git diff --check
git status --short
git log --oneline -7
```

확인 항목:

- 전투 계산 파일의 의미 있는 변경이 없다.
- 41개 6차 스킬 모두 `detail.mechanics`가 비어 있지 않다.
- 상세 모델의 숫자는 수동 문구 복사가 아니라 구조화 데이터에서 나온다.
- 새 화면 표면에 직접 만든 반투명 `bg-*/40`, `bg-*/70`, `dark:bg-*/20`가 없다.
- 세 화면의 학습·장착·해제·강화 기존 콜백이 그대로 유지된다.
- 배포나 `deploy/maintenance.sh off`를 실행하지 않았다.

- [ ] **Step 7: 검증 중 필요한 수정만 별도 커밋**

수정이 전혀 없으면 이 단계는 건너뛴다. 수정이 있으면 실패한 검증을 재현하는 테스트를 먼저 추가하고, `git status --short`에 나온 그 테스트 파일과 대응 구현 파일을 개별 경로로만 스테이징한 뒤 `fix: resolve skill detail regressions` 메시지로 커밋한다. `git add .`과 `git add -A`는 사용하지 않는다.

최종 보고에는 구현 결과, 실행한 검증 명령과 결과, 배포하지 않았음을 포함한다.
