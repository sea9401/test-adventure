# 관리자 페이지 (Admin / Dev Tools) 기획

> 상태: ✅ **구현 완료** — 관리자/개발 도구 출고. 코드가 현재 사양, 이 문서는 설계 기록.

> 개발/디버그/밸런싱용 페이지. 인게임 진행을 우회해 상태를 직접 들여다보고 조작할 수 있게 해, 테스트 사이클을 줄이고 콘텐츠 추가 시 회귀 검증을 수월하게 한다.

## 목표

- localStorage 에 흩어진 게임 상태를 **한 화면에서 점검**.
- 시나리오 재현을 위해 상태를 **직접 편집**(레벨·골드·퀘스트·도감 등) 가능.
- 정적 데이터(몬스터/아이템/퀘스트/레시피)를 **표로 한눈에 확인** — 코드 안 뒤져도 됨.
- **백업/복원**(JSON export/import) 으로 진행 상태 보호.
- 기존 게임 UI에는 영향 없이 **별도 라우트**에서 운영.

## 비목표

- 실제 어드민 권한 체계(이 게임은 완전 클라이언트 사이드, 단일 플레이어). 보안은 obscurity 수준만.
- 멀티 세이브 슬롯(스코프 밖). 단일 localStorage 만 다룸.
- 라이브 서버 동기화. 모든 작업은 브라우저 로컬에서 끝남.

---

## 접근 경로

- **라우트**: `/admin` (Next.js App Router → `src/app/admin/page.tsx`)
- **메인 게임 UI에는 진입 버튼 없음**. URL 직접 입력으로만 접근(우발적 진입 차단).
- 개발 편의를 위해 `NODE_ENV === "development"` 일 때만 푸터 같은 데에 작은 "🔧" 링크를 노출하는 것은 v2 검토.
- 페이지 진입 시 **상단 경고 배너**: "이 페이지는 진행 상태를 직접 변경합니다. 백업을 먼저 받으세요."

---

## UI 구조

좌측 세로 탭 + 우측 패널. 모바일에선 상단 가로 탭으로 폴드.

| 탭 | 내용 | 분류 |
|---|---|---|
| 개요 | 핵심 지표 카드 + 백업/복원 + 전체 리셋 | 시스템 |
| 캐릭터 | 프로필/스탯/장비 편집 | 편집 |
| 인벤토리 | 포션/장비/재료 추가·제거 | 편집 |
| 퀘스트 | 상태 강제 전환·진행도 조작 | 편집 |
| 제작 | 레시피 해금·플래그 토글 | 편집 |
| 모험의 서 | 몬스터 처치 수·도감 마킹 | 편집 |
| 지도 | 방문 지역·현재 위치·엣지 조건 | 편집 |
| 알림 | 알림 주입·전체 삭제 | 편집 |
| 데이터 | 정적 테이블(읽기 전용) | 도감 |

---

## 섹션별 상세

### 1. 개요 탭

**카드 그리드**:
- 캐릭터: 이름·레벨·EXP·골드·명성
- 진행도: 방문 지역 N/총M, 도감 조우 N/총M, 퀘스트 완료 누적 합계
- 인벤토리: 포션 X종(총 N개), 장비 종류 수, 재료 종류 수
- 시스템: 알림 N건, 자동포션 룰 N건, 테마, 마지막 저장 시각(추정)

**전역 액션**:
- `📥 전체 백업 (JSON 다운로드)` — 모든 `*.v1` 키를 `{ key: value, ... }` 한 객체로 묶어 `adventure-rpg-save-YYYYMMDD-HHmm.json` 다운로드.
- `📤 전체 복원 (JSON 업로드)` — 파일 선택 → 파싱 → 키별로 `localStorage.setItem` → `window.location.reload()`.
- `♻️ 전체 초기화` — 모든 `*.v1` 키 + `theme` 삭제 → 새로고침. **2단계 확인** 필수.

### 2. 캐릭터 탭

**대상 키**: `character-profile.v1`, `character.v1`, `training.v1`

- 프로필
  - 이름 (텍스트)
  - 성별 (라디오: 남/여)
- 스탯 동적값
  - HP, MP — 슬라이더 0~max + 숫자 입력
  - 레벨 (1~50), EXP (0~required(level)) — 변경 시 maxHp/maxMp 자동 재계산해 표시만 보여줌
  - 골드 (number), 명성 (number)
- 훈련
  - `endsAt` — "지금 즉시 종료" 버튼 + 날짜·시간 직접 지정
  - `points` (남은 포인트)
  - `allocated.{str,dex,vit,spd,luk}` 각 직접 입력
- 장비 (`character.v1.equipped`)
  - weapon/armor/accessory 슬롯 — 셀렉트(All ITEMS 중 해당 slot만) + "비우기"
  - 변경 시 인벤토리는 건드리지 않음 (직접 부여 / 회수는 인벤토리 탭에서)

**검증**: 음수 차단, 레벨 캡 50, HP/MP 는 max 초과 시 max 로 클램프.

### 3. 인벤토리 탭

**대상 키**: `inventory.v1`

3개 섹션(포션 / 장비 / 재료) 각각 표 형태.

- 행: 정의된 모든 ID + 이름 + 현재 보유 수
- 열 액션: `+1` `+10` `−1` `최대(10)` `0` `삭제`
- 상단: "비어 있는 항목 숨김" 체크, 검색창
- "**인벤토리 전체 비우기**" 버튼 (2단계 확인)
- "**모든 장비 1개씩 지급**" 같은 빠른 액션도 v2 검토

포션은 종류별 10개 캡 룰을 admin 에선 **존중하지 않고 그대로 입력 허용**(테스트 편의 우선) — 단, 캡을 넘긴 값엔 ⚠️ 표시.

### 4. 퀘스트 탭

**대상 키**: `quest-progress.v1`

전체 `QUESTS` 목록 표:

| 퀘스트 | 지역 | 반복 | 상태 | 진행도 | 누적 완료 | 액션 |
|---|---|---|---|---|---|---|
| (id/타이틀) | (regionId) | ✓/× | (드롭다운) | n/target | N | `재설정` `즉시 ready` `즉시 완료` |

- 상태 드롭다운: available / active / ready / completed
- 진행도 직접 입력 (0 ~ target.count)
- "모든 퀘스트 초기화" 버튼

### 5. 제작 탭

**대상 키**: `crafting.v1`

- `known: string[]` — 모든 레시피를 체크박스 그리드로. ON 이면 known 에 포함.
- `crafted: string[]` — 동일하게 체크박스.
- 스토리 플래그
  - `boldQuestComplete` 토글
  - `boldSlimeQuestComplete` 토글
- "**모든 레시피 해금/제작 표시**" 빠른 액션

### 6. 모험의 서 탭

**대상 키**: `adventure-log.v1`

**몬스터** 표:

| 몬스터 | 조우 | 처치 수 | 첫 조우 | 마지막 처치 | 액션 |
|---|---|---|---|---|---|
| (이름) | ☑ | (입력) | (날짜) | (날짜) | `미발견` `+1킬` `10킬` `50킬` |

**마을**: visited 토글 + npcsTalkedTo 멀티 셀렉트.
**NPC**: talkCount 직접 입력.

빠른 액션:
- "**모든 몬스터 조우 처리**" — 엣지 조건 잠금 해제 시연용.
- "**모든 몬스터 50킬 처리**" — 도감 만렙.
- "**모험의 서 초기화**".

### 7. 지도 탭

**대상 키**: `map.v1`

- `currentRegionId` — 셀렉트(7 지역)
- `visitedRegionIds` — 체크박스 그리드. "모두 방문" / "village 만 남기기" 빠른 액션.
- 엣지 조건 표 (읽기 전용 정보 표시)
  - 각 엣지의 from→to 와 `requires.bestiaryOf` 표기
  - 현재 도감 기준 충족 여부 (메트 / 진행도) — 디버그 용
- "지도 진행도 초기화" — `{ currentRegionId: "village", visitedRegionIds: ["village"] }`

### 8. 알림 탭

**대상 키**: `notifications.v1`

- 현재 알림 리스트 표(시간·종류·텍스트), 행별 삭제 버튼
- "전체 삭제" 버튼 (= 게임 내 RecentLogView 의 onClear 와 동일 동작)
- "테스트 알림 주입" — kind 셀렉트(battle_win 등) + 텍스트 → 추가
- `lastReadAt` 직접 수정(읽음/안읽음 배지 테스트용)

### 9. 데이터 탭 (읽기 전용 도감)

코드의 정적 테이블을 그대로 보여줌. 콘텐츠 작업 시 빠른 점검용. 편집 불가.

- **몬스터** (`MONSTERS`): name, tags, hp/atk/def/spd, exp, drops
- **아이템** (`ITEMS`): id, name, slot, stats, bonus
- **포션** (`POTIONS`): id, name, effect, price
- **재료** (`MATERIALS`): id, name, price, inShop
- **레시피** (`RECIPES`): id, ingredients, result
- **퀘스트** (`QUESTS`): id, target, reward, repeatable
- **NPC** (`NPCS`): id, region, role
- **세계** (`WORLD_MAP`): regions, edges, requirements
- **레벨링** — `getLevelTable()` 출력

각 표 상단에 검색 + 정렬 + JSON 복사 버튼.

---

## 안전장치

- **백업 강제 권유**: 첫 진입 시 토스트 "백업 먼저 받으시는 것을 권장합니다 → [지금 받기]".
- **2단계 확인**: 전체 초기화·인벤토리 비우기·모든 퀘스트 초기화 등 파괴적 액션은 모달 + "정말 초기화" 입력.
- **변경 직전/직후 미리보기**: 큰 변경(예: 캐릭터 동적 상태 일괄 수정)은 "적용 전 ↔ 적용 후" diff 표시.
- **읽기 모드 토글**: 좌상단 "🔒 보기 전용" 스위치 — 켜져 있으면 모든 입력/액션 비활성화. 기본 ON 추천.
- **즉시 반영 vs 적용 버튼**: 잘못된 클릭으로 상태가 바뀌지 않게, 각 탭은 "변경 사항 적용" 버튼으로 묶어서 트랜잭션 단위로 저장.

---

## 데이터 흐름 / 통합 방식

기존 hook 들(`useInventory`, `useQuests`, `useCrafting`, `useAdventureLog`)은 **메인 페이지에서만 마운트**. 어드민 페이지는 다음 둘 중 하나:

**옵션 A — 직접 storage 함수 사용 (권장)**
- 각 모듈의 `loadX()` / `saveX()` 를 그대로 import 해서 폼 ↔ JSON 변환.
- 어드민에서 저장 후 게임 라우트로 이동하면 라우트 마운트 시 새로 load 됨.
- 단점: 게임이 같은 탭에 떠 있으면 React 상태와 어긋남 → "변경 후 새로고침" 버튼 제공.

**옵션 B — 동일 hook 재사용**
- 같은 hook 들을 어드민 페이지에서 마운트.
- 장점: 자동 저장·hydrate 로직 공유.
- 단점: hook 별로 setter/action 이 한정적이라(예: gold 직접 set 없음) 어드민에 필요한 임의 변형이 어려움. 결국 storage 함수도 별도로 호출하게 됨.

→ **옵션 A 채택**. 어드민 폼은 raw JSON 모델을 직접 다룬다.

---

## 기술 메모

- 라우트: `src/app/admin/page.tsx`. `"use client"`. 메인 페이지와 동일하게 `useEffect` 안에서만 localStorage 접근.
- 공통 storage 키 상수와 타입은 이미 `*/storage.ts`, `lib/*` 에 있음 — 재사용.
- 백업 객체 스키마:
  ```ts
  type SaveBundle = {
    schemaVersion: 1;
    exportedAt: number; // ms epoch
    data: {
      "character-profile.v1"?: Profile;
      "character.v1"?: CharacterDynamicState;
      "training.v1"?: { endsAt?, points?, allocated? };
      "battle-settings.v1"?: { auto?: boolean };
      "inventory.v1"?: InventoryState;
      "auto-potion-rules.v1"?: AutoPotionConfig;
      "crafting.v1"?: CraftingState;
      "quest-progress.v1"?: QuestProgressMap;
      "adventure-log.v1"?: AdventureLog;
      "notifications.v1"?: NotificationStorage;
      "map.v1"?: MapProgress;
      theme?: "light" | "dark";
    };
  };
  ```
  - 누락 키 허용. 알 수 없는 키는 무시(전방 호환).
  - `schemaVersion` 으로 향후 마이그레이션 지점 마련.
- UI 컴포넌트: 가능한 한 기존 `Card`, 버튼 스타일 재사용. 표는 단순 `<table>` + 유틸 클래스.
- 상태 변경 후 게임 라우트가 stale 한 hook 상태를 들고 있을 수 있어, 어드민 저장 직후 작은 토스트 + "메인 페이지 새로고침" 링크 노출.

---

## 단계 로드맵

### 1단계 (MVP)
- 라우트 생성, 보기 전용 토글 ON 기본.
- **개요 탭** + **백업 / 복원 / 전체 초기화** — 가장 가치 큰 기능.
- **데이터 탭** — 정적 테이블 표로 출력 (편집 없음).
- 캐릭터 탭에서 골드·EXP·레벨·HP/MP 직접 편집까지.

### 2단계
- 인벤토리 탭, 퀘스트 탭, 제작 탭.
- 지도 탭(방문 지역 토글, 현재 위치 변경).
- 모험의 서 탭(몬스터 조우/처치 일괄 처리).

### 3단계
- 알림 주입.
- 자동포션 룰 편집.
- diff 미리보기, 변경 트랜잭션 묶음 처리.
- 정적 데이터 탭에 검색·정렬·JSON 복사.

### 4단계 (선택)
- 시드/시나리오 프리셋: "튜토리얼 방금 끝낸 상태", "5레벨 풀장비", "엔드게임 직전" 같은 저장점 묶음 내장.
- 전투 시뮬레이터 — 임의 적과 즉석 전투 시작 (현재 region.enemies 와 무관).
- localStorage 외 메모리 hook 상태도 들여다보는 라이브 인스펙터 (옵션 B 같이 마운트하는 별도 페이지).

---

## 열린 질문

- 어드민 페이지에 들어가는 동작을 **검색엔진/링크 공유**로부터 가리려면 `robots`/`noindex` 처리도 같이? (현재 사이트는 정적 배포 가능성)
- 백업 파일 포맷을 향후 다른 도구가 읽을 일이 있을지 — 있다면 키 명을 `*.v1` 그대로 두지 말고 normalize 한 형태(`character`, `inventory` …)로 바꾸는 것도 검토.
- 게임 메인 페이지가 떠 있는 상태에서 어드민이 변경을 저장하면 React state 와 localStorage 가 어긋남 → "메인 새로고침 강제" 또는 BroadcastChannel 으로 시그널 보내 메인 hook 들이 재load 하는 메커니즘 추가 검토(2단계 이후).
