# v2 직업 시스템 재설계 (Job System Redesign)

> **상태**: 설계 문서 (코드 없음). 이 문서가 구현 청사진.
> **기준 코드**: `src/adventure/data/v2/` (2026-06-16 기준).

---

## §1 목표와 원칙

### 핵심 원칙: 직업 정체성은 스킬 역학이 아니다

기존 설계의 오류: 계파(spec)를 "내가 어떤 스킬을 쓰는가"로 정의해 왔다.
새 설계의 기둥: **직업(job)의 정체성은 세 가지뿐이다.**

| 축 | 의미 | 현재 코드 기반 |
|---|---|---|
| **수행 스탯 프로필** | 어느 스탯 캡을 수행으로 올릴 수 있는가 | `proficiency.ts:V2_CULTIVATE_PROFILE` |
| **직업 보너스** | 전직해 있는 동안 받는 플랫 스탯 보너스 | 신규 — 현재 % 트레이트(`v2JobSpecs.ts`) 대체 |
| **트리 위치** | 어떤 직업을 먼저 쌓아야 해금되는가 | `proficiency.ts:groups[jobId].cumLevel` |

**스킬은 별도 수집 레이어다.** SP 로드아웃(`v2Loadout.ts`)은 그대로 재사용한다. 스킬의 역학 설계는 이 재설계의 범위 밖이다. 직업이 바뀌어도 수집된 스킬 라이브러리는 유지되고, 로드아웃에서 믹스해 쓴다.

### 구체적 목표

1. **계층 제거**: 현재 `직군 → 계파(spec)` 2단 구조를 `직업 해금 그래프` 1단으로 평탄화한다.
2. **stat 게이트 → cumLevel 게이트**: `SPEC_STAT_GATE`의 스탯 임계 조건은 불안정하고 암묵적이다. `proficiency.groups[jobId].cumLevel`(환생 보존)을 해금 화폐로 교체한다.
3. **계파 % 트레이트 → 직업 플랫 보너스**: `v2JobSpecs.ts`의 `atkPctAdd`, `damageTakenReductionPct` 등 % 효과는 `직업 보너스`(플랫 스탯 맵)으로 대체한다. 수치가 투명해지고 누적 계산이 단순해진다.
4. **ATB·SP 로드아웃과 완전 호환**: 전투 엔진 변경 없음. `v2Loadout.ts`의 `validateLoadout`, `sanitizeLoadout`, `clampLoadoutToBudget`, `calcSpBudget`은 그대로 동작한다.
5. **점진 공개 UI**: 잠긴 직업 격자 대신 조건을 충족한 직업만 보여준다.
6. **얕고 넓은 직업 계단**: 직업은 "도달점"이 아니라 거쳐가는 단계다. 기본 직업은 견습 톤으로 시작하고(견습 병사·견습 마법사 등), 각 직군의 상위 분기는 **2종으로 좁힌다**(옛 계파 3종 압축). 환생 순회로 여러 직업을 거치며 스킬을 모으는 구조이므로, 상위·하이브리드·고차 직업이 후속으로 추가되며 직업 수는 계속 늘어난다.

---

## §2 직업 모델 (V2JobDefinition)

### 제안 타입

```typescript
// src/adventure/data/v2/v2JobCatalog.ts (신규)

import type { V2StatKey } from "./v2StatKeys";

/** 추가 해금 조건 타입 (확장 가능) */
export type ExtraJobCondition =
  | { type: "questCompleted"; questId: string }
  | { type: "monsterKilled"; monsterId: string; minCount: number }
  | { type: "statThreshold"; stat: V2StatKey; min: number };

/** 직업 해금 조건 */
export type V2JobUnlock = {
  /** 선행 직업별 최소 cumLevel. 빈 객체 = 모험가처럼 전제 없음. */
  prereqs: Partial<Record<string, number>>;
  /** 선택적 추가 조건 (퀘스트·킬수·스탯). 기본은 미사용. */
  extraConditions?: ExtraJobCondition[];
};

/** 직업 정의 */
export type V2JobDefinition = {
  /** proficiency.groups의 키이기도 한 직업 id */
  id: string;
  name: string;
  /** 0=모험가, 1=기본 직업, 2=상위 직업(옛 계파), 3=하이브리드/특수 */
  tier: 0 | 1 | 2 | 3;
  /**
   * 수행(cultivation) 가능 스탯 목록.
   * V2_CULTIVATE_PROFILE(proficiency.ts)의 키셋과 동일한 개념—해당 스탯에 수행 포인트를 투자하면
   * 그 스탯의 cap이 올라간다.
   */
  cultivateProfile: Partial<Record<V2StatKey, number>>;
  /**
   * 직업 보너스 — 이 직업으로 전직해 있는 동안 항상 적용되는 플랫 스탯 보너스.
   * 전투 시작 시 PlayerCombat에 주입. 옛 계파 % 트레이트를 대체.
   */
  jobBonus: Partial<Record<V2StatKey, number>>;
  unlock: V2JobUnlock;
};
```

### 기존 코드와의 연결

| `V2JobDefinition` 필드 | 재사용 심볼 | 파일 |
|---|---|---|
| `cultivateProfile` | `V2_CULTIVATE_PROFILE[group]` | `proficiency.ts` |
| `unlock.prereqs[jobId]` 충족 여부 | `proficiency.groups[jobId].cumLevel` | `proficiency.ts` |
| SP 예산 계산 | `calcSpBudget(proficiency)` | `coreLoopConfig.ts` |
| 로드아웃 검증 | `validateLoadout`, `sanitizeLoadout` | `v2Loadout.ts` |
| 서명 스킬 잠금 | `isSignatureSkill` (prefix `v2s_`) | `v2Loadout.ts` |

---

## §3 해금 트리

### 트리 설명

```
모험가
 ├─ 견습 병사 (warrior)
 │   ├─ 방패병 (shieldman)   — 방어 탱
 │   └─ 견습 기사 (squire)    — 돌격 딜
 ├─ 견습 무인 (martial)
 │   ├─ 권사 (boxer)          — 흡혈 브루저
 │   └─ 수도승 (monk)         — 회피 지속탱
 ├─ 견습 마법사 (mage)
 │   ├─ 술사 (caster)         — 버스트 원소
 │   └─ 사제 (acolyte)        — 자힐 탱
 └─ 견습 도적 (rogue)
     ├─ 자객 (assassin)       — 크리 폭발
     └─ 궁수 (archer)         — 다단 물량

이번 범위 = 모험가 1 + 기본 4 + 상위 8 = 13직업.
하이브리드(마검사 등)·고차 직업은 후속 PR에서 추가 (§9 보류).
```

### 해금 트리 전체 표

기본 직업 id는 현재 코드(`warrior`/`martial`/`mage`/`rogue`)를 그대로 쓰고 표시 이름만 "견습 X"로 낮춘다. 상위 직업은 옛 계파 3종을 **2종으로 압축**하고 역할 기준으로 id를 재정의했다(옛 계파 → 새 직업 매핑은 §7).

| 직업 id | 이름 | Tier | 해금 조건 | 직업 보너스 (플랫) | 수행 프로필 | 비고 |
|---|---|---|---|---|---|---|
| `none` | 모험가 | 0 | 없음 (시작 직업) | HP +10% (`ADVENTURER_MAXHP_BONUS_PCT`) | 균등 | `parseV2Class("none")` 유지 |
| `warrior` | 견습 병사 | 1 | 모험가로 V2_LEVEL_CAP(Lv50) 도달 | STR+10, VIT+10 | str×2, vit×1, dex×1 | `V2_CULTIVATE_PROFILE.warrior` |
| `martial` | 견습 무인 | 1 | 모험가로 Lv50 도달 | VIT+10, STR+5, SPI+5 | vit×2, str×1, spi×1 | `V2_CULTIVATE_PROFILE.martial` |
| `mage` | 견습 마법사 | 1 | 모험가로 Lv50 도달 | INT+15, SPI+5 | int×2, spi×2 | `V2_CULTIVATE_PROFILE.mage` |
| `rogue` | 견습 도적 | 1 | 모험가로 Lv50 도달 | DEX+15, LUK+5 | dex×2, luk×2 | `V2_CULTIVATE_PROFILE.rogue` |
| `shieldman` | 방패병 | 2 | warrior.cumLevel ≥ 100 | VIT+25, STR+15 | vit×2, str×1, dex×1 | 방어 탱 (← 옛 knight) |
| `squire` | 견습 기사 | 2 | warrior.cumLevel ≥ 100 | STR+25, DEX+10 | str×2, dex×1, vit×1 | 돌격 딜 (← 옛 gwang) |
| `boxer` | 권사 | 2 | martial.cumLevel ≥ 100 | STR+20, VIT+15 | vit×2, str×1, spi×1 | 흡혈 브루저 (← 옛 gigong) |
| `monk` | 수도승 | 2 | martial.cumLevel ≥ 100 | VIT+30, SPI+5 | vit×2, str×1, spi×1 | 회피 지속탱 (← 옛 cheolsan) |
| `caster` | 술사 | 2 | mage.cumLevel ≥ 100 | INT+30, SPI+5 | int×2, spi×2 | 버스트 원소 (← 옛 arcane) |
| `acolyte` | 사제 | 2 | mage.cumLevel ≥ 100 | INT+15, VIT+15, SPI+10 | int×1, spi×2, vit×1 | 자힐 탱 (← 옛 cleric) |
| `assassin` | 자객 | 2 | rogue.cumLevel ≥ 100 | DEX+20, LUK+20 | dex×2, luk×2 | 크리 폭발 (id 유지) |
| `archer` | 궁수 | 2 | rogue.cumLevel ≥ 100 | DEX+25, STR+10 | dex×2, luk×2 | 다단 물량 (← 옛 archery) |

> **하이브리드/고차 직업**: 이번 범위 제외(§9 보류). 마검사 등은 후속 PR에서 추가.
> **직업 보너스 수치**: 오너 1차 승인 완료(2026-06-16). 라이브 실측 후 미세 조정.

### 직업 보너스 설계 원칙

- Tier 1 기본 직업: 총 +20 stat 수준 (균형).
- Tier 2 상위 직업: 총 +35~40 stat 수준, 전문화 방향으로 치우침 (탱/딜/속도 등).
- Tier 3 하이브리드: 총 +30 수준, 두 직군의 교차점.
- `모험가`는 HP 보너스만 (`ADVENTURER_MAXHP_BONUS_PCT = 10`) — 전직 유도 역할.

### cumLevel 기반 해금 검증 함수 (의사 코드)

```typescript
function isJobUnlocked(jobDef: V2JobDefinition, proficiency: V2Proficiency): boolean {
  for (const [prereqJobId, minCumLevel] of Object.entries(jobDef.unlock.prereqs)) {
    const actual = proficiency.groups[prereqJobId]?.cumLevel ?? 0;
    if (actual < minCumLevel) return false;
  }
  if (jobDef.unlock.extraConditions) {
    // 퀘스트/킬수 조건 추가 확인 (미구현 확장 포인트)
  }
  return true;
}
```

---

## §4 전직 흐름 & UI

### 흐름

```
1. 캐릭터 생성 → class = "none" (모험가)
2. Lv1 ~ Lv50 루프: 전투/수행으로 proficiency.groups[activeGroup].cumLevel 누적
3. Lv50 도달 (V2_LEVEL_CAP, coreLoopConfig.ts) → 전직 패널 표시
4. 플레이어가 조건 충족 직업 중 선택 → 재전직(환생)
5. class 교체, level 리셋 → Lv1, cumLevel 보존, 스킬 라이브러리에 직업 스킬 추가
6. 반복
```

### 전직 UI: 점진 공개 (Progressive Disclosure)

- **현재 문제**: 직군 칼럼 격자 + 잠긴 계파 회색 박스 표시.
- **변경 방향**: 조건을 충족한 직업만 목록에 표시. 아직 해금 안 된 직업은 완전히 숨김(단, "해금 조건이 있다"는 힌트를 선택적으로 표시 가능).
- 직업이 해금될수록 목록이 늘어나면서 트리가 자연스럽게 가르쳐짐.

> **PR-3 구현 메모 (LIVE 코드 기준)**
> - 신규 컴포넌트 `src/adventure/v2/V2JobLadder.tsx` — 기본 직업/상위 직업 2섹션. 해금 직업만 actionable, 잠긴 상위는 "한 단계 앞"(부모 cumLevel 힌트 `parentName 누적 Lv have/need`)만 흐리게. 각 직업에 플랫 보너스 칩(`힘 +25` 식) 표시. POST = 단일 `targetJobId`.
> - 서버 `state/route.ts` 가 `jobsV2`(currentJobId·atLevelCap·jobs[]) 페이로드 추가(`V2_JOB_SYSTEM_V2` on 일 때만, off=null). `jobIdFromLegacy(class, spec)` 로 현재 직업 식별.
> - `V2CultivationView` 분기 우선순위: `jobsV2`(V2JobLadder) → `jobUnlock`(V2JobTree) → `V2ClassGrid`. 플래그 off 면 기존 V2JobTree 그대로(무변경).

### 현재 라우트에서 교체할 심볼

파일: `src/app/api/v2/me/advance-class/route.ts`

| 현재 심볼 | 역할 | 교체 방향 |
|---|---|---|
| `unlockedJobGroups(stats)` (`coreLoopConfig.ts`) | 스탯 기반 직군 해금 | `isJobUnlocked(jobDef, proficiency)` (cumLevel 기반) |
| `unlockedSpecs(stats)` (`coreLoopConfig.ts`) | 스탯 기반 계파 해금 | 동일 — 직업 카탈로그 루프로 대체 |
| `SPEC_STAT_GATE` (`coreLoopConfig.ts`) | 계파별 스탯 임계 테이블 | 삭제 |
| `SPEC_TO_GROUP` (`coreLoopConfig.ts`) | 계파→직군 매핑 | 삭제 (V2JobDefinition에 내재화) |
| `reincarnTargetError(…, specChoice, …)` | 전직 타겟 검증 | 재작성 — specChoice 인자 제거, jobId + proficiency로 단순화 |

### advance-class 라우트 재작성 요점

```typescript
// 현재: reincarnTargetError가 targetClass(직군) + targetSpec(계파)를 별도 검증
// 변경: targetJobId 하나만 받아 isJobUnlocked(catalog[targetJobId], proficiency) 확인

// flag gate: V2_JOB_SYSTEM_V2 플래그 on 일 때만 새 로직 적용
if (V2_JOB_SYSTEM_V2) {
  const jobDef = V2_JOB_CATALOG[targetJobId];
  if (!jobDef || jobDef.tier === 0) return /* bad_target 400 */;
  if (!isJobUnlocked(jobDef, proficiency)) return /* job_locked 400 */;
  // jobBonus는 전투 시작 시 주입 (advance-class 라우트 책임 아님)
}
```

> **PR-2 구현 메모 (LIVE 코드 기준)**
> - 플래그 실제 env 키 = `NEXT_PUBLIC_V2_JOB_SYSTEM_V2`(`V2_CORE_LOOP_V2` 와 동일 패턴, 서버·클라 공용). 상수는 `v2JobCatalog.ts:V2_JOB_SYSTEM_V2`.
> - 게이트만 교체 — 세이브/스킬 체인(`elementalSkillsForClass`)은 PR-5 전까지 옛 `class+specChoice` 모델 유지. 그래서 `LEGACY_CLASS_SPEC_BY_JOB`(v2JobCatalog.ts) 브리지로 새 `targetJobId` → 옛 `(class, spec)` 변환 후 기존 write 경로 재사용. 예: `squire` → `{class:"warrior", spec:"gwang"}`. PR-5/PR-6 에서 제거.
> - 이 분기는 기존 `V2_CORE_LOOP_V2` 재전직 블록 **안**에 중첩(플래그 off 면 옛 `reincarnTargetError` 스탯게이트 그대로).

---

## §5 스킬 (경량 설계 — SP 로드아웃 재사용)

### 유지: SP 로드아웃 시스템

아래 심볼은 **변경 없이 그대로 유지**한다.

| 심볼 | 파일 | 역할 |
|---|---|---|
| `validateLoadout` | `v2Loadout.ts` | 로드아웃 유효성 검사 |
| `sanitizeLoadout` | `v2Loadout.ts` | 저장된 로드아웃 정리 |
| `clampLoadoutToBudget` | `v2Loadout.ts` | SP 예산 초과 시 클램프 |
| `calcSpBudget` | `coreLoopConfig.ts` | 환생 이력 기반 SP 예산 |
| `isSignatureSkill` (v2s_ prefix) | `v2Loadout.ts` | 서명 스킬 잠금 판별 |

### 직업과 스킬의 관계

- 각 직업은 전직 시 작은 스킬 세트를 플레이어 스킬 라이브러리에 추가한다.
- 공용 스킬(`V2_COMMON_SKILLS`)은 모든 직업 전직 시 개방.
- 직업별 스킬(`v2s_` prefix 서명)은 해당 직업 전직 시에만 SP 로드아웃에 장착 가능.
- 스킬 역학의 세부 설계(ATB Phase 3 전환, 신규 스킬 추가)는 이 문서의 범위 밖.

---

## §6 삭제·대체 목록

### 삭제/대체 대상 (코드)

| 대상 | 파일 | 처리 방향 |
|---|---|---|
| `V2JobSpec` 타입 + 계파 데이터 전체 | `v2JobSpecs.ts` | 새 `V2JobDefinition` 카탈로그(`v2JobCatalog.ts`)로 대체. 옛 % 트레이트 삭제 |
| `V2SpecPassiveEffect`의 계파 % 효과들 (atkPctAdd, damageTakenReductionPct 등) | `v2Passives.ts`, `v2JobSpecs.ts` | 전투 시작 시 직업 보너스(플랫 스탯)로 주입하는 방식으로 대체. 패시브 훅 심볼 삭제 |
| `SPEC_STAT_GATE` | `coreLoopConfig.ts` | 삭제 |
| `SPEC_TO_GROUP` | `coreLoopConfig.ts` | 삭제 |
| `unlockedJobGroups(stats)` | `coreLoopConfig.ts` | 삭제 또는 deprecated |
| `unlockedSpecs(stats)` | `coreLoopConfig.ts` | 삭제 또는 deprecated |
| `reincarnTargetError` 내 spec 분기 | `coreLoopConfig.ts` | 재작성 |
| `specChoice` 저장 필드 | save 구조 | 직업 id로 흡수 또는 migration 시 무시 |
| `unlockedPassives` 저장 필드 | save 구조 | 계파 패시브 해금 시스템 자체 삭제 |
| `elementalSkillsForClass(c, specId, specTier)` | `classes.ts` | `skillsForJob(jobId)` 형태로 단순화 |
| 계파 칼럼 UI (직군별 계파 3종 격자) | 전직 화면 컴포넌트 | 점진 공개 목록으로 교체 |

### 보존 대상

| 보존 | 파일 | 이유 |
|---|---|---|
| `proficiency.groups[id].cumLevel` | `proficiency.ts` | 해금 화폐 — 이 재설계의 핵심 |
| `V2_CULTIVATE_PROFILE` | `proficiency.ts` | cultivateProfile의 원천 데이터 |
| `SP_BASE`, `SP_MASTERED_CUMLEVEL`, `calcSpBudget` | `coreLoopConfig.ts` | SP 로드아웃 재사용 |
| `validateLoadout`, `sanitizeLoadout`, `clampLoadoutToBudget` | `v2Loadout.ts` | 로드아웃 시스템 전체 |
| `isSignatureSkill` (v2s_ prefix) | `v2Loadout.ts` | 서명 스킬 잠금 |
| `ADVENTURER_MAXHP_BONUS_PCT`, `V2_LEVEL_CAP` | `coreLoopConfig.ts` | 모험가 패시브·전직 트리거 |

### 예상 파급 범위 (~35 파일)

- **데이터 레이어**: `v2JobSpecs.ts`, `v2Passives.ts`, `coreLoopConfig.ts`, `v2JobCatalog.ts`(신규)
- **엔진 레이어**: 전투 시작 시 jobBonus 주입 훅 (`resolveBattle.ts`, `derive.ts` 또는 유사)
- **라우트 레이어**: `advance-class/route.ts`, spec 관련 라우트
- **UI 레이어**: 전직 화면 컴포넌트, proficiency 표시 컴포넌트
- **타입 레이어**: save 구조체 (`specChoice`, `unlockedPassives` 필드 제거)
- **테스트 레이어**: spec/passive 관련 테스트 파일

---

## §7 마이그레이션 (라이브)

### 현황

- 운영 캐릭터 수: 약 12명.
- 오너 확인: 스킬/계파 리셋 허용.
- 보존 필수: level, cumLevel, stats, inventory, gold, equips.

### 계파 → 상위 직업 매핑 (마이그레이션 시 specChoice → 새 직업 id)

옛 계파 12종을 새 상위 직업 8종으로 압축한다. 사라지는 4종(검투사·연환·워메이지·독사)은 같은 직군의 가까운 생존 직업으로 흡수한다(오너: 스킬/계파 리셋 허용).

| 기존 `specChoice` | 새 직업 id | 새 이름 | 비고 |
|---|---|---|---|
| `gwang` (광검) | `squire` | 견습 기사 | 극딜 → 돌격 딜 |
| `gladiator` (검투사) | `squire` | 견습 기사 | 흡수(딜 계열) |
| `knight` (기사) | `shieldman` | 방패병 | 탱 계열 |
| `cheolsan` (금강) | `monk` | 수도승 | 회피탱 |
| `gigong` (혈권) | `boxer` | 권사 | 흡혈 브루저 |
| `yeonhwan` (연환) | `boxer` | 권사 | 흡수(격투 계열) |
| `arcane` (마도사) | `caster` | 술사 | 버스트 |
| `battlemage` (워메이지) | `caster` | 술사 | 흡수(원소 계열) |
| `cleric` (사제) | `acolyte` | 사제 | 자힐 탱 |
| `archery` (궁사) | `archer` | 궁수 | id 철자 변경 |
| `assassin` (자객) | `assassin` | 자객 | id 유지 |
| `venom` (독사) | `assassin` | 자객 | 흡수(크리 계열) |
| `null` / 미선택 | 부모 기본 직업 id 유지 | 견습 X | 예: warrior 직군이면 `warrior` |

> **중요**: save의 `class`(직군 id) + `specChoice`(계파) 두 필드를 위 표의 **새 직업 id 하나**로 합친다. 예: `class:"warrior" + specChoice:"gwang"` → `class:"squire"`. 계파 미선택 캐릭터는 `class`가 기본 직업 id로 유지된다(표시 이름만 "견습 X").

### 파싱 리셋 평가

`parseV2Class`(`classes.ts`)는 알 수 없는 class id를 `"none"`으로 폴백한다. 새 카탈로그의 상위 직업 id 8종을 인식하도록 업데이트하고, PR-5에서 기존 `class`+`specChoice` 조합을 위 매핑표대로 새 id로 1회 변환한다. 기본 직군 id(`warrior` 등)는 Tier 1 직업으로 그대로 인식되므로 변환 불필요. DB는 JSON save 내부 변경이라 스키마 변경 최소.

### 플래그 게이트

```bash
# .env.production 또는 배포 환경변수 (NEXT_PUBLIC_ — 서버·클라 공용, 빌드타임 구움)
NEXT_PUBLIC_V2_JOB_SYSTEM_V2=true
```

- `false`(기본): 현재 직군+계파 시스템 유지. 빌드 그린.
- `true`: 새 직업 카탈로그 + cumLevel 해금 + 직업 보너스 활성.

### Drizzle 마이그레이션

save 구조 JSON 필드 내부 변경이므로 DB 스키마 변경은 최소화된다. 다만 `class` 컬럼이 직업 id를 저장한다면 허용 enum 업데이트가 필요할 수 있다. 필요 시 `drizzle/migrations/0056_job_system_v2.sql`.

---

## §8 PR 단계화

모든 PR은 플래그 게이트(`V2_JOB_SYSTEM_V2`) 하에 `main`에 머지 가능하다. 플래그 off 상태에서는 기존 동작 완전 유지.

| PR | 내용 | 범위 |
|---|---|---|
| **PR-1** | 새 `v2JobCatalog.ts` 파일 신설 — `V2JobDefinition` 타입 + 13개 직업 정의 (모험가 1 + 기본 4 + 상위 8). 기존 코드 배선 없음. | 신규 파일 1개 |
| **PR-2** | cumLevel 해금 게이트 교체 — `advance-class/route.ts`에서 `SPEC_STAT_GATE` 제거, `isJobUnlocked(proficiency)` 교체. 플래그 on 분기 안에서만. | `advance-class/route.ts`, `coreLoopConfig.ts` |
| **PR-3** | 전직 UI 재작성 — 계파 칼럼 격자 → 점진 공개 목록. 직업 보너스 표시 추가. | 전직 화면 컴포넌트 |
| **PR-4** | 직업 보너스 전투 주입 — `resolveBattle` / `derive`에 jobBonus 플랫 스탯 적용 훅 추가. 기존 계파 % 트레이트와 공존(플래그 분기). | 전투 엔진 |
| **PR-5** | 마이그레이션 + 플래그 flip — save 파싱 업데이트, `parseV2Class` 확장, 기존 specChoice→jobId 변환. `NEXT_PUBLIC_V2_JOB_SYSTEM_V2=true` 운영 적용. | classes.ts, save 파싱 |
| **PR-6** (정리) | 구 계파 코드 삭제 — `v2JobSpecs.ts` 트레이트 데이터, `v2Passives.ts` 계파 훅, `SPEC_STAT_GATE`, `SPEC_TO_GROUP`, `unlockedSpecs`, `specChoice`/`unlockedPassives` save 필드. | ~35파일 |

> **PR-4 구현 메모 (LIVE 코드 기준)**
> - 주입 위치 = `derivePlayerCombatV2Pure` 의 `totalStats`(파생 직전). jobBonus 플랫을 가산하면 atk/maxHp/def/명중 등 모든 파생 스탯에 자연 반영(resolveBattle 별도 수정 불필요 — 엔진은 파생된 PlayerCombat 만 소비).
> - **"공존"=더블딥 방지 해석**: flag on 일 때 jobBonus 가 옛 계파 % 트레이트를 **대체**한다. 래퍼(`...FromSaves`)가 flag on 이면 `spec=undefined`·`unlockedPassives=[]` 로 계파 효과를 inert 처리하고 jobBonus 를 주입 → 같은 flag 상태에서 한쪽만 작동(이중 적용 없음). flag off = jobBonus 없음 + 계파 그대로(byte-identical, 전체 1669 테스트 green).
> - 현재 직업 = `jobIdFromLegacy(class, specChoice)` → `V2_JOB_CATALOG[id].jobBonus`. 모험가(none)=`{}`(HP% 는 별도 `coreLoopMaxHpMult`).
> - 범위 밖(후속): 옛 클래스 앵커 %(`V2_TIER_STAT_BONUS_PCT`)는 PR-4 에서 손대지 않음. 계파의 비(非)스탯 시그니처(출혈·중독·관통 등)는 inert 처리되며 새 스킬/직업 설계에서 재공급.

---

## §9 결정 기록 & 보류 항목

### 확정 (2026-06-16, 오너)

1. **직업 보너스 수치** — §3 표 초안 승인. 라이브 실측 후 미세 조정.
2. **기본 직업 해금** — 모험가로 **Lv50(V2_LEVEL_CAP) 도달** 시 4 기본 직업 해금 (안 A).
3. **상위 직업 임계** — 기본 직업 **cumLevel ≥ 100** (Lv50 루프 ≈2회). 후속 추가 직업은 다른 임계를 쓸 수 있음.
4. **상위 직업 압축** — 직군당 옛 계파 3종 → **2종**으로 축소(총 8 상위). 기본 직업은 "견습 X" 톤으로 명명 — 거쳐가는 단계임을 드러내고, 직업 수는 후속(하이브리드·고차)으로 계속 늘리는 전제.

### 보류 (후속 결정)

5. **하이브리드 직업** (마검사 등) — 이번 범위 제외. 4 기본 + 8 상위 안정화 후 별도 설계. id·이름·선행 cumLevel 미정.
6. **추가 조건(extraConditions)** — Tier 2는 전부 순수 cumLevel 게이트로 출발. 퀘스트·킬수 조건은 후속 직업에서 선택적 도입.

---

*이 문서는 코드 구현 전 설계 기준 문서입니다. 구현 시 각 PR 머지 직후 문서의 "현황" 표기를 갱신할 것.*
