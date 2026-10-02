# 화면 정리 3단계: 목록과 그림

화면 스타일 선택(`2026-10-02-ui-style-gilded-design.md`)의 후속이다. 두 스타일 모두에
적용하는 레이아웃 정리이며, 클래식에서도 화면이 바뀐다(오너 확인 범위: "공통 레이아웃
정리는 두 스타일 모두 적용").

## 목표

lunes에서 가져온 원리 중 아직 반영하지 않은 두 가지를 적용한다.

- 목록은 상자를 쌓지 않고 한 카드 안의 행과 구분선으로 보여 준다.
- 그림을 화면의 중심에 둔다. 이미 있는 시설·지역 그림을 메뉴와 사냥터 목록에 쓴다.

## 범위

### 1. 허브 메뉴(캐릭터·마을·전투·광장)

지금은 `EntryCard` 상자를 세로로 쌓는다. 새 `EntryList`(카드 하나)와 `EntryRow`(행)로
바꾼다.

- `EntryList`: `SURFACE_CARD` 하나에 `divide-y`로 행을 나눈다. `overflow-hidden`.
- `EntryRow`: `EntryCard`와 같은 props(`icon`, `title`, `description`, `onClick`)에
  `image?: string`을 더한다. 행 높이 최소 64px, 왼쪽에 48px 둥근 타일.
  - `image`가 있으면 `next/image`로 그 그림을 `object-cover` 썸네일로 보여 준다
    (`sizes="48px"`, 장식이므로 `alt=""`).
  - 없으면 지금 아이콘을 같은 크기의 중립 타일(`bg-zinc-100 dark:bg-zinc-800`) 안에 둔다.
- 썸네일은 그 메뉴가 여는 화면의 배경 그림이다(`GameChrome`의 경로별 배경과 같은 파일).

| 메뉴 | 그림 |
|---|---|
| 마을 · 치료소 | `/images/ui/healingcenter.webp` |
| 마을 · 은행 | `/images/ui/bank.webp` |
| 마을 · 통합 교환소 | `/images/ui/shop.webp` |
| 마을 · 대장간 | `/images/ui/forge.webp` |
| 마을 · 모험가 농장 | `/images/ui/farm.webp` |
| 전투 · 사냥터 | `/images/ui/hunt.webp` |
| 전투 · 아레나 | `/images/ui/arena.webp` |
| 전투 · 대련장 | `/images/monster/scarecrow.webp` |
| 전투 · 숙련의 탑 | `/images/ui/masterytower.webp` |

나머지 메뉴는 아이콘 타일을 쓴다. 메뉴 순서와 항목은 바꾸지 않는다. `EntryCard`는 단독
진입 카드(낚시 교환 등)용으로 남긴다.

### 2. 사냥터 목록

사냥터(테마) 카드가 이름만 있는 글자 상자다. 테마마다 지역 그림이 이미 정해져 있다
(`gameSceneBackgroundForPath`의 6단계당 1장).

- `huntingGroundImageForDepth(depth: number): string`을 `gameSceneBackgroundForPath.ts`에서
  내보내고, 기존 함수도 이것을 쓴다. 매핑 범위 밖이면 `/images/ui/hunt.webp`.
- 테마 카드 위쪽에 그 테마 그림을 넓은 띠(높이 5rem, `object-cover`)로 넣는다.
- 테마를 연 안쪽 화면은 단계 카드 위에 같은 그림을 한 번 넓게(높이 7rem) 보여 준다. 단계
  카드마다 반복하지 않는다.

### 3. 내 정보 "기본 정보"

카드 안에서 소속 길드·전투 횟수·숙달 포인트가 각각 상자(`InfoTile`)다. 상자를 없애고
`dl` 행(왼쪽 라벨, 오른쪽 값, 행 사이 구분선)으로 바꾼다. 스탯 합계 강조 패널과 세팅 안내는
그대로 둔다.

### 4. 남은 정리

- 설정 화면의 카드 제목을 모두 `SectionHeading`으로 바꾼다(금빛에서 장식이 한 카드에만
  보이던 문제).
- 손으로 보라·남색을 칠한 주 행동 버튼 8곳을 의미 토큰(`bg-primary` 등)으로 옮긴다:
  `V2LoadoutPresetsPanel`, `V2CouponView`, `V2CharacterCard`, `V2ProfileImageView`,
  `GuildFoundCard`, `V2ItemCardPopover`, `GuildAlchemyWorkshopPanel`(실행 버튼),
  `CreateCharacterFlow`. 진행 막대, 등급·순위 배지, 선택 칩은 의미가 달라 그대로 둔다.
- `AdventureRankingPreview`의 선택 탭 밑줄과 글자를 선택 토큰으로 옮긴다.

남색(indigo) 버튼 3곳(쿠폰, 길드 창단, 캐릭터 생성)은 클래식에서도 주 버튼 보라로 바뀐다.
디자인 시스템의 주 버튼 색으로 맞추는 정리다.

## 검증

- 단위 테스트: `EntryList`/`EntryRow`, 허브 메뉴(그림이 붙는 항목), 사냥터 그림 매핑과
  카드 렌더, 기본 정보 행, 설정 제목, 버튼 토큰
- `/dev/hub-menus`, `/dev/hunting-grounds` 미리보기를 추가하고, 기존 `/dev/character-basics`와
  함께 클래식·금빛 × 라이트·다크, 390px으로 캡처해 확인
- 전체 테스트, 타입 검사, lint, 빌드

## 4단계 추가 정리 (2026-10-03)

`/dev` 미리보기 12개를 한 장으로 모아 상자가 많은 화면을 골랐다.

- 상세 스탯(`StatsPanel`의 "상세"): 수치마다 인셋 상자였던 것을 라벨·값 행과 구분선으로
  바꾼다. 능력치 칸은 기본·성장·한계 등 여러 줄이라 칸으로 둔다.
- 생활 기록(`LifeActivityCard`): 누적 기록 상자 4개를 상자 없는 `dl` 목록으로 바꾼다.
- 배경 숨김·은신 모드의 페이지 바탕: 고정 회색(`#f4f4f5`, `#09090b`)을 `--color-zinc-100`,
  `--color-zinc-950` 변수로 바꿔 금빛에서 함께 바뀌게 한다. 클래식 값은 같다.
- `/dev/adventure-home`: 로그인 없이 그릴 수 있는 홈 위젯 미리보기. 홈은 이미 초상화·막대·
  장비 칸이 있어 이번에는 고치지 않는다.
- 제외: `GrowthShrineView`는 실제 게임에서 쓰지 않는 옛 화면이라 고치지 않는다. 프로필
  장식·채팅 배지의 고정 색은 꾸미기 아이템 그림이라 스타일과 무관하게 둔다.

