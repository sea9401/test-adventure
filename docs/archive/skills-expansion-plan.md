# 스킬 확장 + 슬롯 해금 계획

> 상태: ✅ **구현 완료** — 스킬 확장 + 슬롯 해금(Phase 1·3) 출고. 이 문서는 설계 기록.

> ① **스킬 슬롯 해금** — 지금 고정 3칸. 후반(만렙 70 / 운향~화산 라인)으로 갈수록 보유 스킬이 9~15개라 3칸이 빡빡함 → 일정 조건 달성 시 4번째(특기 전용)·5번째(일반) 슬롯을 연다.
> ② **신규 스킬** — 현재 스탯당 3티어(임계 10/20/35) 15종. **4티어**(임계 50) 5종 + **두 스탯을 같이 요구하는 "특기"** 10종을 추가.

---

## 0. 현재 구조 요약

- 스킬은 **별도 저장 없음** — 스탯에서 파생 (`deriveSkills`). 스탯당 3종: 1차 임계 10, 2차 20, 3차 35.
- "보유" ≠ "장착" — 보유 스킬 중 `SKILL_SLOT_COUNT`(=3) 개만 `effectiveSkillNames` 로 effective.
- 발동 헬퍼는 전부 `(stats, equipped)` 를 받아 "스탯 임계 충족 AND 슬롯에 장착" 둘 다 만족할 때만 효과 반환 (`powerAttackBonusFor` 등). 엔진(`engine.ts`)은 `PlayerCombat` 의 옵셔널 필드(`powerAttackBonus?` 등)만 읽음 — 합성은 `composeCharacter`/`derivePlayerCombat` 가 담당.
- `SKILL_SLOT_COUNT` 는 `skills.ts` 의 단순 상수 — `SkillsView` / `CharacterScreen`(추가 차단) / `effectiveSkillNames` 가 참조.
- 장착 선택은 `useCharacterState` 의 `equippedSkills?: string[]` (undefined = 자동 첫 N개). 서버도 `derivePlayerCombatFromSaves` / `autoHunt` 가 같은 경로로 복원.

---

## 1. 슬롯 시스템 (개정 — 특기 전용 슬롯 도입)

### 1-1. 레이아웃

| 슬롯 | 종류 | 해금 조건 | 넣을 수 있는 것 |
|---|---|---|---|
| 1 · 2 · 3 | 일반 | 기본 제공 | 스탯 파생 스킬(3티어 15 + 4티어 5 = 20종) 중 |
| **4** | **특기 전용** | `Lv 40` **또는** `운봉의 거인 처치(peak_giant_defeated)` — 먼저 만족 시 | 특기 10종 중 **딱 1개** (보유 특기 없으면 빈 칸) |
| **5** | 일반 | `Lv 65` **그리고** `화산의 심장 처치(volcano_heart_defeated)` — 둘 다 | 스탯 파생 스킬 |

- 최대 동시 발동 = 일반 4 + 특기 1 = **5종**. 특기는 절대 2개 못 낌 → 특기 스택 폭주 차단.
- 특기는 일반 슬롯에 못 넣고, 일반 스킬은 특기 슬롯에 못 넣음 (칸 종류 고정).
- 슬롯은 후퇴 없음 (level·flag 단조 증가) → 마이그레이션 걱정 없음. 새로 열린 슬롯은 빈 칸으로 시작 (자동 채움은 `equippedSkills===undefined` 일 때만).

### 1-2. 구현

- `SKILL_SLOT_COUNT` 상수 → **`skillLayout(ctx)` 함수**: `ctx = { level, hasFlag(id) }` → `{ normalSlots: number, hasFeatSlot: boolean }`.
  - `normalSlots = 3 + (level≥65 && hasFlag("volcano_heart_defeated") ? 1 : 0)`
  - `hasFeatSlot = level≥40 || hasFlag("peak_giant_defeated")`
- 특기는 `STAT_SKILL`(스탯당 배열)에 안 들어감 → 별도 `FEAT_SKILL: { name, description, req: [StatKey, StatKey] }[]` + `FEAT_STAT_THRESHOLD = 25`. `deriveFeats(stats)` = 두 요구 스탯 다 ≥25 인 특기 목록.
- 장착 저장: 일반은 종전 `equippedSkills?: string[]`, 특기는 `equippedFeat?: string` 별도. 전투 합성 시 `effectiveSkillSet` = (일반 effective ∩ normalSlots) ∪ (`hasFeatSlot` 면 effective feat). 발동 헬퍼는 이 한 set 의 membership 만 보면 됨 — 기존 헬퍼 그대로, 특기 헬퍼만 추가.
- 수정 지점: `effectiveSkillNames(available, stored, slots)` 에 slots 인자 / `effectiveFeatName(featsOwned, stored, hasSlot)` 신설 / `composeCharacter`·`derivePlayerCombat` 입력에 `storyFlags`(또는 계산된 layout) 추가 / **서버 `derivePlayerCombatFromSaves`·`autoHunt` 동일 적용** (위탁 sim 이 옛 3칸으로 돌면 안 됨) / `SkillsView`·`CharacterScreen` 동적 slots + 특기 슬롯 별도 picker / 해금 시 "✨ 슬롯 해금!" 토스트 1회.

---

## 2. 신규 스킬

### 2-1. 4티어 — 스탯당 1종, 발동 임계 50 / 도감 공개 45 (전부 자체 완결, 새 메커니즘)

| 스탯 | 이름 | 효과(안) | 새 메커니즘 |
|---|---|---|---|
| STR | **출혈** | 적중 시 출혈 1스택(중첩). 매 적 턴마다 스택당 floor(STR×0.1) **고정 피해**(DEF 무시) | 도트(DoT) |
| DEX | **그림자 분신** | 전투 시작 시 분신 1체 — 매 플레이어 턴 종료 시 분신이 추가 공격 1회(ATK의 50%) | 추가 액터(고정 추가타) |
| VIT | **철벽** | 전투 시작 시 floor(VIT×0.6) **보호막** — 데미지를 먼저 흡수, 회복 안 됨 | 실드 |
| SPD | **무피해 난무** | 매 플레이어 턴 종료 시, 그 전투에서 **받은 누적 피해가 0이면** 추가 공격 floor(SPD/25)회 | 무피해 조건부 다단히트 |
| LUK | **천명** | 모든 공격에 (LUK×0.3)% 확률로 **적 현재 HP의 5%**를 추가 고정 피해 | 비율 피해 — 고HP 보스 특효 |

### 2-2. 특기 — 두 스탯 동시 ≥25 (새 "특기" 도감 카테고리), 슬롯 4(특기 전용)에 1개만

| 이름 | 요구 | 효과(안) | 구현 난이도 |
|---|---|---|---|
| **광전사** | STR & VIT | 잃은 HP 1%당 ATK +0.5% (HP 절반=+25%) | 중 — 데미지 산식 |
| **암살** | STR & DEX | 전투 첫 공격 적 DEF 무시 + 데미지 ×2 | 중 — "전투 첫 공격" 가드 |
| **질풍검** | STR & SPD | 매 턴 첫 공격이 그 턴 공격 횟수만큼 ATK 보너스 (3회 턴=+3) | 중 |
| **연참** | STR & LUK | 크리티컬 발동 시 그 턴 추가 공격 1회 (ATK 보너스 X) | 중 — 광속 패턴 응용 |
| **곡예** | DEX & VIT | 회피 성공 시 HP +floor(VIT×0.3) 회복 | 쉬움 |
| **유격** | DEX & SPD | 회피 성공한 다음 턴 공격 횟수 +1 | 중 — 턴 넘김 상태 |
| **흡혈** | DEX & LUK | 크리티컬로 준 피해의 30%만큼 HP 회복 | 쉬움 |
| **반사 갑주** | VIT & SPD | 피격 시 받은 피해의 floor((VIT+SPD)/10)% 적에게 반사 | 중 |
| **행운의 방패** | VIT & LUK | 피격당할 때마다 (LUK×0.5)% 확률로 그 피해 0 (행운 회피, evasion 별개) | 쉬움 |
| **천칭** | SPD & LUK | 내 SPD>적 SPD면 그 전투 크리 확률 +floor((내SPD−적SPD)×0.5)% | 쉬움 |

> 효과는 전부 *안* — `engine.ts` 가 표현 가능한지(가변 공격 횟수 노출, 적 SPD 접근, 추가 액터 등)는 구현 단계에서 확정. 안 되는 효과는 그 자리에서 수치만 비슷한 다른 효과로 조정하거나 단계 미룸.

---

## 3. 규모

| 구분 | 종수 | 누적 |
|---|---|---|
| 기존 (3티어 ×5스탯) | 15 | 15 |
| 신규 4티어 | +5 | 20 |
| 특기 | +10 | 30 (단, 특기는 슬롯 1개만 발동) |

→ 동시 발동 최대 5종 (일반 4 + 특기 1).

---

## 4. 작업 단계 (feat/skill-slots)

분량이 커서 단계로 나눠 커밋 — 단계마다 빌드+테스트 통과 유지.

### Phase 1 — 슬롯 시스템 + 특기 인프라 + 쉬움 특기 ✅ (PR #27, main 머지됨)
1. `skills.ts`: `skillLayout(ctx)`, `FEAT_SKILL`/`deriveFeats`, `effectiveSkillNames(slots)`, `effectiveFeatName`.
2. `derivePlayerCombat`/`composeCharacter`/`derivePlayerCombatFromSaves`/`autoHunt` 입력에 `storyFlagIds`+`equippedFeat`, layout 반영.
3. `useCharacterState`: `equippedFeat` 저장 + 세터.
4. `SkillsView`/`CharacterScreen`: 동적 일반 슬롯 + 특기 슬롯.
5. 쉬움 특기 wiring: **흡혈 · 곡예 · 천칭 · 행운의 방패**. `PlayerCombat` 필드 + 엔진 분기.
6. 테스트: `skillLayout`/`deriveFeats` + 엔진 신규 분기.
   - 미완: 슬롯 해금 토스트.

### Phase 2 — 4티어 5종 ✅ (feat/skill-tier4)
- `SKILL_NAMES`/`STAT_SKILL` 4번째 항목 + 상수 + `deriveSkills` tier4(버킷 일반화) + 발동 헬퍼 5개.
- 엔진: **출혈**(BattleState `bleedStacks`, 적 턴 시작 DoT, DEF 무시) / **그림자 분신**(턴 종료 시 ATK 50% 추가타, `finishPlayerTurn`) / **철벽**(BattleState `playerShield`, 피해 우선 흡수) / **무피해 난무**(BattleState `damageTakenThisCombat`, 무피해 시 턴 종료 추가타 ×floor(SPD/25)) / **천명**(공격마다 LUK×0.3% 확률로 적 현재 HP의 5% 추가 고정 피해).
- 테스트: `engine.tier4.test.ts` (각 효과 결정적 검증), `skills.test.ts` tier4 deriveSkills.
- 미완: 도감(EtcTab) 의 4티어 프리뷰(`STAT_TIER4_REVEAL_THRESHOLD = 45`) — deriveSkills 가 stat 50 도달 시 보유 목록에 넣으므로 기능엔 영향 없음, 도감 advance preview 만 빠짐 → 후속.

### Phase 3 — 나머지 특기 6종 ✅ (feat/skill-feats-2)
- 광전사(STR&VIT, 잃은 HP%만큼 ATK 가산) · 암살(STR&DEX, 전투 첫 공격 DEF무시+×2) · 질풍검(STR&SPD, 턴 첫 공격에 그 턴 공격횟수만큼 ATK) · 연참(STR&LUK, 그 턴 크리 시 추가 공격 1회 — BattleState `critThisTurn`/`riposteUsedThisTurn`) · 유격(DEX&SPD, 회피 시 다음 턴 공격 횟수 +1) · 반사 갑주(VIT&SPD, 받은 HP 피해의 floor((VIT+SPD)/10)% 적에게 반사).
- `FEAT_SKILL` 총 10종 완성. 테스트: `engine.feats.test.ts` (6종 결정적), `skills.test.ts` 에 스탯쌍별 `deriveFeats` 검증.

### Phase 4 — 후속(토스트 + 도감 미리보기) ✅ (feat/skill-followups)
- `useLevelUpDetection` 확장: 특기 획득 알림("특기 획득! ○○") + 슬롯 해금 알림("스킬 슬롯 해금! …" / "특기 슬롯 해금! …"). ref 베이스라인 패턴이라 새로고침 재발화 없음.
- `STAT_TIER4_REVEAL_THRESHOLD = 45` + `EtcTab` 에 4차 스킬 블록(45 공개 / 50 발동) + "특기" 섹션(10종 — req 스탯 25 & 25, 보유 시 별 아이콘).

### v2 이후
- 6번째 슬롯 / "스킬 룬" 아이템 경로 / 해금 연출.

---

## 5. 확정/열린 결정

| | 항목 | 상태 |
|---|---|---|
| 1 | 슬롯 해금 조건 (4=Lv40 OR 거인 / 5=Lv65 AND 화산) | ✅ 확정 |
| 2 | 4번째=특기 전용, 5번째=일반 | ✅ 확정 |
| 3 | 슬롯 상한 5 | ✅ 확정 |
| 4 | 4티어 임계 50 / 공개 45 | ✅ 확정 |
| 5 | DEX 4티어 = 그림자 분신 | ✅ 확정 |
| 6 | 특기 임계 25/25, 10종 전부 채택 | ✅ 확정 |
| 7 | 일부 효과의 엔진 표현 가능성 (가변 공격횟수 / 적 SPD / 추가 액터) | 구현 시 확인 → 안 되면 조정 |
