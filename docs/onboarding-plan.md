# 온보딩 / 시스템 노출 개편 계획 (감사 3순위)

> 상태: ✅ **구현 완료 (2026-05-22, #496)** — 좀비 MP 제거 + 튜토 재활성 + 점진 노출 출고. '수치 더하기 수렴'은 명시 보류. 이 문서는 설계 기록.

> 배경: `docs/game-fun-audit.md` 3순위 — "시스템 과잉 + 온보딩 가파름". 튜토리얼이 꺼져
> 있고(kill-switch), 깊은 시스템(룬/부여/AP/파라곤/탑/PvP/거래소)이 안내 없이 노출.
>
> **설계 확정(2026-05-22), 미구현.** Claude 분석 → Codex 2라운드 수렴.
>
> ⚠️ **ROI 주의 (Codex):** 유저 ~18명 소규모에선 온보딩 단독 ROI 중간 이하. 리텐션은
> "처음 이해했나"보다 "다음에 할 이유가 있나"에 민감. **작게 끊고**(아래 1차 최소 스코프)
> 남는 시간은 1순위(전투 주도성)·2순위(페이싱)에 쓰는 게 낫다. 단 stale 문구 정리는
> 비용 거의 0 이라 무조건 가치 있음.

## 실측 — 현황 (origin/main, Codex 검증)

- 튜토리얼: `tutorial/useTutorial.ts:15` `TUTORIAL_KILL_SWITCH=true` 전체 OFF. 오버레이는
  단 2곳(`AdventureHome.tsx` 모험 인트로 / `BattleSubView.tsx` 전투 인트로). storyFlags
  prefix "tutorial." 위. `TUTORIAL_ENABLED_FLAG` 는 **신규 캐릭만** starterSaves 시드
  (`starterSaves.ts:19`); 기존 캐릭은 미설정.
- **#256 kill 이유 = "걸리적거린다"는 UX 피드백** (stale 때문 아님 — Codex 정정). 다만
  stale 은 실재.
- 전투 **완전 자동** 확정 — 행동 선택 입력 0, 시작/정지/확인만(`BattleView.tsx:128`,
  `engine.ts:2598`).
- 깊은 시스템 온보딩 없음. 마을 NPC 대화로 발견(점진 발견은 있음).
- **재활성 시맨틱 (핵심):** `TUTORIAL_ENABLED_FLAG` 가 신규만 시드 + `SaveProvider.tsx:107`
  이 기존 row 있으면 seed skip → **kill-switch 를 false 로 바꿔도 기존 ~18명은 안 뜨고
  신규만 본다.** "신규 한정"이 자동 보장됨.

## 더 큰 절반은 "수치 더하기 수렴" — 이번엔 보류

Codex: 감사 3순위의 더 큰 축은 룬/부여/파라곤/AP 가 전부 `derivePlayerCombat` 에서 한
`PlayerCombat` 으로 합산되어 개성이 옅은 것(`derivePlayerCombat.ts:249,294,326,400`). 이는
온보딩으로 안 풀리고 재설계 영역 → **이번 1차 범위에서 명시적 제외(보류).** tractable
완화책은 "점진 노출"뿐이라 그 일부만 아래 4번에 포함.

## 1차 최소 스코프 (확정 체크리스트)

### A. stale 텍스트 정리 (비용 0, 무조건)
자동전투 + AP(not MP) 현실과 충돌하는 유저노출 문구 전수 수정:
- `adventureSubViews/BattleSubView.tsx:41` "매 턴 공격·스킬·방어 중 선택" → 자동전투 설명
- `adventureSubViews/BattleSubView.tsx:48` "스킬은 MP 소모" → AP 설명
- `TownScreen.tsx:108` "HP·MP 회복" → MP 오해 제거
- `app/manual/content/potions.tsx:62` "수동 전투 중…포션 버튼" → 수정
- `app/manual/content/quests.tsx:81` "수동 전투" 표현 제거
- `app/manual/content/town.tsx:15` "HP·MP 완전 회복" → HP 위주
- `app/manual/content/leveling.tsx:8` "MP +2 / HP·MP 회복" 수정
- `app/manual/content/stats.tsx:84,99` "최대 MP" → AP 병기 또는 legacy 제거
- `app/manual/content/tower.tsx:56,60` "수동 모드/fight_floor" 혼선 정리

### B. 튜토리얼 재활성 (신규 한정 자동 보장)
- `tutorial/useTutorial.ts:15` `TUTORIAL_KILL_SWITCH=false`.
- 위 A 가 선행되어야(stale 오버레이 재노출 방지). 전체화면 모달이라 #256 "걸리적거림"
  재발 여부는 **스테이징 QA 필요** (Codex).

### C. JIT 첫-발견 오버레이 (최소 3종)
첫 노출 가치 큰 시스템만, 기존 TutorialStepId/storyFlags 로:
- **첫 AP 스킬 학습**: `CharacterScreen.tsx:342` `learnAPSkill()` 직후 `set("tutorial.first_ap_skill")`
- **첫 룬 드랍**: `TowerSubView.tsx:23` `onApplied` 콜백에서 set
- **첫 강화 성공**: `useEnhanceAction.ts:117` 성공 toast 직후 set
- **기존 유저 skip**: `inventory.runeTotalCount()>0` / `learnedAPSkills` 보유 /
  `equipmentInstances[].enhancementLevel>0` 증거 있으면 JIT 미발동(이미 경험자).

### D. 점진 노출 1건 (저위험)
- 룬 패널이 `CharacterScreen.tsx:150` 상시 노출 → **첫 룬/tower_token 획득까지 숨김**:
  gate `inventory.runeTotalCount()>0 || inventory.materialCount("tower_token")>0`.
- (파라곤은 이미 100레벨 게이트 `CharacterScreen.tsx:156`.)
- 추가 후보(이번 보류, 메모): 광장/거래소 탭(`MainTabs.tsx`), 마을 고급시설(성장의 신전·
  길드·회관 `TownScreen.tsx:161,181,189`) 레벨 게이트.

## 비목표 (명시)

- "수치 더하기 수렴 = 시스템 개성 부재" — 재설계 영역, 보류.
- 전투 엔진/AP 밸런스/룬 수치.
- 기존 유저 데이터 마이그레이션 (불필요 — 신규 한정 + JIT 증거기반 skip).

## 검증

- 신규 캐릭: `storyFlags.v2` 에 `tutorial.enabled` → 오버레이 1회 + stale 문구 없음.
- 기존 save(flag 없음): 오버레이 비노출.
- 룬 0 + tower_token 0 신규: 룬 패널 숨김 → 첫 획득 후 노출.
- 룬/AP/강화 경험 기존 유저: JIT 미발동.
- 스테이징 QA: 신규 플로우에서 오버레이가 거슬리지 않는지(#256 재발 점검).
