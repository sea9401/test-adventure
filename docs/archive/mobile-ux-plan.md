# 모바일 UX 개선 계획

> 상태: ✅ **구현 완료** — 모바일 UX 배치 1·2·3 + 후속 출고. 미검증 2건(다크모드 로그 대비·sm 브레이크포인트)만 잔여.

데스크탑 위주로 만들어진 UI를 모바일(특히 가로 폭 320~390px) 환경에서 점검하면서 발견한 이슈와 개선 방향을 정리한다. 우선순위는 "기능 자체가 동작 안 함 → 터치 조작 불편 → 가독성·심미성" 순.

## P0 — 잘려서 안 보이거나 조작 자체가 막히는 케이스

### ✅ MiniEquipCard 툴팁 잘림 (해결)

- **위치**: `src/adventure/character/CharacterMini.tsx`의 장비 칩 3개(무기/방어구/장신구) 호버·탭 툴팁.
- **문제**: 툴팁이 `absolute left-1/2 -translate-x-1/2 w-56`로 셀 중앙 정렬. 좁은 모바일에서 첫 칸(무기) 툴팁이 화면 좌측, 마지막 칸(장신구)이 우측으로 잘림.
- **조치**: `tooltipAlign` prop(`start | center | end`) 추가, 부모(`CharacterMini`)에서 셀 인덱스에 따라 자동 결정. `max-w-[calc(100vw-2rem)]`도 함께 추가해 viewport 안쪽으로 클램프.

### NotificationBell 드롭다운 폭

- **위치**: `src/components/NotificationBell.tsx`의 알림 패널 — `w-72` 고정폭.
- **문제**: 폭 320px iPhone SE 같은 환경에서 화면의 90%를 차지하면서 우측 끝까지 닿음. 우측 정렬(right-0)이라 화면 밖은 안 나가지만, 좌우 여백이 거의 없어 답답함.
- **권장 조치**: `w-72` → `w-72 max-w-[calc(100vw-1.5rem)]` 추가. 또는 모바일에서는 헤더 아래 full-width 시트로 전환(BottomSheet 패턴).

### TabBar 6탭 가로 스크롤

- **위치**: `src/adventure/AdventureLogView.tsx`의 모험의 서(몬스터/아이템/NPC/마을/장소/기타 6개).
- **문제**: 모바일 좁은 폭에서 마지막 탭이 잘리거나 한 줄에 다 안 들어감. 현재 `flex` + `gap-1`이라 wrap 안 됨.
- **권장 조치**:
  - (a) `TabBar` 컴포넌트에 `overflow-x-auto` 옵션 추가 — 가로 스크롤 허용 (가장 단순).
  - (b) 탭 라벨 축약 + 아이콘 추가로 폭 줄이기.
  - (c) 6개를 하위 그룹으로 묶어 2단계 nav (큰 변경).
  - 권장은 (a). 한 줄 안에 자연스럽게 살림.

## P1 — 터치 조작 불편

### 작은 터치 타겟

iOS HIG 권장 최소 44×44pt, Material 권장 48×48dp. 현재 다음 컨트롤들이 그보다 작음:

- **ShopView 수량 stepper** (`src/adventure/ShopView.tsx`) — `h-7 w-7` (28px). 손가락으로 정확히 누르기 어려움.
- **NotificationToast 닫기 버튼** (`src/components/NotificationToast.tsx`) — `h-6 w-6` (24px). 매우 작음.
- **InventoryView 장착 버튼** — 텍스트 "장착"만 작은 패딩. 누름 면적은 충분하지만 버튼 외 영역도 같이 누르기 쉬움.

**권장 조치**:
- 수량 stepper: `h-9 w-9 sm:h-7 sm:w-7` (모바일은 36px로 키우고 데스크탑은 그대로). +/- 버튼이 `+input+`로 좁게 붙어 있으니 누름 마진을 좀 더.
- 토스트 닫기: `h-9 w-9 sm:h-6 sm:w-6` 동일 패턴.
- 일반 원칙: `min-h-9 min-w-9` 유틸리티 클래스를 만들거나 button 기본 스타일에 모바일 최소 사이즈 보장.

### 자동 전투 정보 흐름

자동 전투 토글이 폐기되고 항상 자동(`790e9c1` 흐름)이 된 후, 모바일 사용자가 "지금 자동 사냥 중인지"를 알기 어려움. 적이 있는 region 진입 → 즉시 자동 시작 → 백그라운드 가도 시뮬. 시각적 indicator 부재.

**권장 조치**: 모험 탭 헤더에 "자동 사냥 중" 작은 칩 + 다음 적 카운트다운(0.5s × n) 표시. 사용자가 게임이 돌아간다는 확신 가짐.

## P2 — 가독성·정보 밀도

### 너무 작은 폰트

`text-[10px]` (10px), `text-[11px]` (11px), `text-xs` (12px) 사용처가 많음 — 카드의 부제목·메타·alt 정보 영역에 집중. 모바일 가독성·접근성 측면에서 최소 12px 권장.

**권장 조치**:
- `text-[10px]`/`text-[11px]` 일괄 점검 → 의미 있는 곳만 유지, 나머지 `text-xs`로 통일.
- 모바일에서 `sm:` 미만 breakpoint에 한해 한 단계 키우는 옵션도 검토(text-xs → text-sm).

### 헤더 정보 밀도

`page.tsx` 헤더에 `[제목][이름·Lv·위치] | [골드][알림종][테마]` 한 줄 배치. 좁은 모바일(<360px)에서:
- 캐릭터 이름이 길거나 region 이름이 길면 truncate으로 잘림.
- 골드/알림/테마 토글 영역이 우측 절반 차지 → 좌측 정보 더 좁아짐.

**권장 조치**:
- 헤더를 2단으로 분리 (첫 줄: 제목 + 우측 컨트롤 / 두 번째 줄: 이름·Lv·위치). 모바일에서만 sm:flex-row, 데스크탑은 한 줄.
- 또는 위치 핀을 모바일에선 별도 영역(예: 상단 탭바 위)으로 이동.

### InventoryView 장비 stat 정렬

장비 카드의 우측 `stats.map(...).join(" · ")` 단일 라인 — 길어지면 줄바꿈이 우측에서 일어나 들쭉날쭉. 모바일에서는 이름 옆 stat이 좁아져 더 어색.

**권장 조치**: stat을 별도 줄(`mt-1`)로 내려서 항상 좌측 정렬.

### EnemyEncounterSection 아바타 wrap

평야처럼 적이 4종이면 96px 아바타 4개가 모바일 한 줄에 안 들어가 wrap. 한 줄에 2개 + 두 줄 → OK이지만 카드 높이 커져 스크롤 부담.

**권장 조치**: 모바일에서는 아바타를 64px로 줄이거나 grid-cols-3로 강제. 정보량이 적은 region 카드라 컴팩트해도 무방.

## P3 — 모바일 전용 패턴 도입

### Safe area inset

iOS notch / 하단 home indicator를 고려한 padding이 없음. 헤더가 노치 영역에 가려지거나, 하단 컨트롤이 home indicator와 겹칠 수 있음.

**권장 조치**: `app/globals.css`에 `body { padding-top: env(safe-area-inset-top); ... }` 또는 헤더/푸터에 `pt-[env(safe-area-inset-top)]` 직접 적용.

### Bottom navigation 검토

현재 메인 탭바(모험/마을/캐릭터)는 상단. 한 손 조작 시 엄지가 닿기 어려움. 모바일에서는 하단 고정 탭바가 표준.

**권장 조치**: 데스크탑은 상단 유지, 모바일(`sm:` 미만)은 화면 하단 fixed 탭바로 분기. `MainTabs` 컴포넌트에 viewport 분기 추가.

### Landscape (가로 모드)

세로 모드만 가정한 레이아웃. 가로 모드에서 region 배경 이미지가 늘어나거나 카드가 비효율적으로 배치됨.

**권장 조치**: 우선 portrait-locked 권장 안내 또는 landscape에서 데스크탑 레이아웃으로 자연 분기 (max-w 컨테이너 활용).

### 햅틱 피드백

전투 승리·레벨업·의뢰 완료 같은 강한 피드백이 시각/소리뿐. 모바일은 `navigator.vibrate(20)` 한 줄로 가능.

**권장 조치**: 알림 종류별 vibrate 패턴 정의 (`battle_win: 30`, `battle_lose: [50, 30, 50]`, `quest_complete: [30, 30, 30]`). 사용자 토글 옵션도 같이.

## 점검 방식

브라우저 devtools의 device toolbar로 **iPhone SE (375×667), Galaxy S8 (360×740), iPhone 12 Pro (390×844)** 세 가지 정도면 80% 케이스 커버. 가장 중요한 건 좁은 폭(360px 이하)에서 잘리거나 조작 불가능한 컨트롤이 없는지.

CI에 `playwright`로 mobile viewport 스모크 테스트를 한 번 묶어두면 회귀 방지가 가능 — 다만 셋업 비용 있어 P3 이후로 미룸.

## 우선순위 요약

| 단계 | 항목 | 비용 | 효과 |
| --- | --- | --- | --- |
| P0 ✅ | MiniEquipCard 툴팁 잘림 | XS | 동작 복원 |
| P0 | NotificationBell 폭 클램프 | XS | 우측 답답함 해소 |
| P0 | TabBar 가로 스크롤 옵션 | S | 6탭 모두 접근 가능 |
| P1 | 터치 타겟 36px+ | S | 오탭 감소 |
| P1 | "자동 사냥 중" indicator | S | 게임 진행 인지 |
| P2 | 폰트 사이즈 정리 | M | 가독성 |
| P2 | 헤더 2단 분리 | M | 잘림 해소 |
| P2 | InventoryView stat 정렬 | XS | 정렬 안정 |
| P3 | safe area inset | XS | 노치 대응 |
| P3 | Bottom navigation | M | 한 손 조작 |
| P3 | Landscape 대응 | M | 가로 모드 |
| P3 | 햅틱 피드백 | XS | 반응성 |
