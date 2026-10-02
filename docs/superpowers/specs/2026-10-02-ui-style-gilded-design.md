# 화면 스타일 선택과 금빛 스타일

## 배경

게임 화면이 흰 카드, 회색 테두리, 보라 버튼으로 이뤄진 Tailwind 기본 톤이라
게임보다 관리 도구처럼 보인다는 오너 의견이 있었다. 비교 대상으로 lunes 소스 백업
(`~/lunes-source-backups`, 2026-10-01 번들)의 `src/theme.css`와 스토어용 화면 캡처를
살펴봤다. lunes의 디자인을 가져오지는 않고 다음 원리만 참고한다.

- 팔레트를 세계관의 재료(종이, 잉크, 금박)에서 뽑는다.
- 목록은 상자 대신 라벨과 값의 행, 얇은 구분선으로 보여 준다.
- 적은 수의 장식을 끝까지 반복한다.
- 제목과 본문의 글꼴을 대비시킨다.
- 그림을 화면의 중심에 둔다.

우리 쪽 진단은 다음과 같다.

1. 색이 Tailwind 기본값 그대로다.
2. 카드 안의 정보가 다시 상자로 감싸여 있다.
3. 몬스터, NPC, 지역 그림이 목록 화면에 거의 나오지 않는다.
4. 반복되는 장식 문법이 없다.

## 결정 사항 (2026-10-02 오너 확인)

- 새 스타일의 톤은 로그인 대문(`/sign-in`)의 니어블랙과 금색 포인트를 게임 안으로
  확장한다. 라이트는 미색 바탕에 먹색 글자로 짝을 맞춘다.
- 제목에만 한글 명조(Noto Serif KR)를 쓴다.
- 라이트와 다크는 지금처럼 기기 설정을 따른다.
- 기존 플레이어의 거부감을 줄이기 위해 화면 스타일을 선택할 수 있게 한다. 처음에는
  클래식이 기본이고 새 스타일은 설정에서 켜는 선택지다. 화면을 다듬은 뒤 기본값
  전환을 따로 결정한다.

## 이름

| 내부 id | 플레이어 표기 | 설명 문구 |
|---|---|---|
| `classic` | 클래식 | 회색 바탕, 보라색 버튼 |
| `gilded` | 금빛 | 따뜻한 바탕, 명조 제목, 금색 버튼 |

## 구조

### 저장과 적용

- 새 모듈 `src/adventure/v2/uiStyle.ts`가 저장 키(`ui-style.v1`), 루트 클래스
  (`ui-skin-gilded`), 기본값(`DEFAULT_UI_STYLE = "classic"`), 저장값 해석 함수를 가진다.
- 루트 레이아웃이 기존 `themeInit`, `displayModeInit`처럼 화면을 그리기 전에 인라인
  스크립트로 `<html>`에 클래스를 붙인다. 스크립트 문자열은 같은 모듈에서 만들어
  테스트한다.
- 설정 화면은 플레이어가 고른 값을 `classic` 또는 `gilded`로 항상 저장한다.
  기본값을 나중에 `gilded`로 바꾸면 저장값이 없는 사람만 넘어가고, 클래식을 직접
  고른 사람은 클래식에 남는다.
- 터미널 모드는 화면 전체를 자체 색으로 덮으므로 금빛 규칙은 터미널 모드에서 적용하지
  않는다.

### 색을 바꾸는 두 층

1. **회색 계열 재매핑.** Tailwind v4.2는 `bg-zinc-50`, `bg-white` 같은 유틸리티를
   `var(--color-zinc-50)`, `var(--color-white)`로 컴파일한다(2026-10-02 실측).
   `.ui-skin-gilded` 아래에서 `--color-zinc-50`~`950`과 `--color-white`만 다시 정의하면
   코드 수정 없이 전체 중립색이 바뀐다. 라이트는 밝은 단계, 다크는 어두운 단계를 쓰므로
   한 줄의 단계표로 두 모드가 함께 바뀐다.
2. **의미 토큰.** 단순 재매핑으로 안 되는 색은 CSS 변수로 뺀다. 클래식 값은 지금과
   같은 Tailwind 색을 참조해 픽셀 단위로 동일하게 유지한다.
   - `--ui-primary`, `--ui-primary-hover`, `--ui-primary-border`, `--ui-on-primary`:
     `Button`의 `primary` 변형
   - `--ui-selected`, `--ui-selected-line`, `--ui-selected-hover`: `TabBar`와 메인 탭
     (`MainTabNav`)의 선택 상태
   - `--ui-focus`: `Button`의 포커스 링
   - `--ui-ornament`, `--ui-eyebrow`: 금빛 장식(클래식에서는 쓰지 않음)

   `@theme inline`에 `--color-primary: var(--ui-primary)` 식으로 등록해
   `bg-primary`, `text-selected` 같은 유틸리티로 쓴다.

보라, 초록, 빨강 같은 의미 색과 아이템 등급 색은 두 스타일에서 그대로 둔다. 손으로
`bg-violet-600`을 칠한 버튼 23곳은 이번 범위에서 바꾸지 않고 후속 정리 대상으로 둔다.

### 선택자

다크 판정이 `<html>`의 `.dark`와 하위 래퍼의 `.dark`(대문, 미리보기) 두 경우가 있어서
금빛 다크 규칙은 다음 선택자로 쓴다.

```css
:is(.ui-skin-gilded.dark, .ui-skin-gilded .dark, .dark .ui-skin-gilded)
```

모든 금빛 규칙은 루트에서 `:not(.ui-terminal-mode)`로 터미널 모드를 제외한다.

## 금빛 시각 언어

### 회색 단계표

| 단계 | 클래식 | 금빛 |
|---|---|---|
| `white` | `#ffffff` | `#fdfbf7` |
| `zinc-50` | `#fafafa` | `#f6f3ec` |
| `zinc-100` | `#f4f4f5` | `#eeeae2` |
| `zinc-200` | `#e4e4e7` | `#e3ddd2` |
| `zinc-300` | `#d4d4d8` | `#cec6b8` |
| `zinc-400` | `#9f9fa9` | `#a59d90` |
| `zinc-500` | `#71717b` | `#716b62` |
| `zinc-600` | `#52525c` | `#57514a` |
| `zinc-700` | `#3f3f46` | `#38342e` |
| `zinc-800` | `#27272a` | `#201e1b` |
| `zinc-900` | `#18181b` | `#151412` |
| `zinc-950` | `#09090b` | `#0a0a0b` |

페이지 바탕(`--background`)은 라이트 `#f6f3ec`, 다크 `#0a0a0b`(대문과 같음)이다.
글자색(`--foreground`)은 라이트 `#151412`, 다크 `#ece7de`이다.

### 의미 색

| 토큰 | 클래식 라이트 / 다크 | 금빛 라이트 / 다크 |
|---|---|---|
| 주 버튼 바탕 | violet-600 / violet-500 | amber-300 / amber-300 |
| 주 버튼 hover | violet-700 / violet-400 | amber-200 / amber-200 |
| 주 버튼 테두리 | violet-600 / violet-500 | amber-500 / amber-300 |
| 주 버튼 글자 | white / white | zinc-900 / zinc-900 |
| 선택 글자 | violet-700 / violet-300 | amber-800 / amber-300 |
| 선택 밑줄 | violet-600 / violet-400 | amber-500 / amber-300 |
| 선택 hover | violet-600 / violet-300 | amber-700 / amber-200 |
| 포커스 링 | violet-500 / violet-400 | amber-700 / amber-300 |
| 장식 선 | 없음 | amber-500 / amber-300 |
| 작은 라벨 | 없음 | amber-700 / amber-300 |

주 버튼은 대문 로그인 버튼(`bg-amber-300 text-zinc-900`)과 같은 금색이다. 금색은
금빛 스타일에서 주 행동과 브랜드 포인트를 뜻한다. 보상·재화의 앰버 강조 패널도
같은 계열이라 그대로 둔다.

### 카드 재질

그라데이션이나 반투명 없이 그림자 색과 위쪽 하이라이트만 바꾼다.

- `Card` 컴포넌트의 기존 `.ui-game-card` 그림자를 금빛에서 따뜻한 갈색 그림자로 바꾼다.
- `SURFACE_CARD`, `SURFACE_ACCENT`, `SURFACE_INSET`에 훅 클래스(`ui-surface-card` 등)를
  추가한다. 금빛에서는 Tailwind의 `--tw-inset-shadow` 변수로 위쪽 하이라이트만 더해,
  각 화면이 덧붙인 그림자(대화상자의 `shadow-2xl` 등)의 크기와 진하기는 유지한다.
  클래식에서는 훅 클래스에 스타일이 없다.

### 제목 글꼴

- `next/font/google`의 `Noto_Serif_KR`(600, 700)을 `--font-serif-kr` 변수로 등록하고
  미리 받지 않는다(`preload: false`). 금빛 클래스 아래에서만 쓰므로 클래식 사용자는
  글꼴 파일을 받지 않는다.
- 적용 대상은 화면 제목(`SubViewHeader`), 새 `SectionHeading`, 게임 대화상자 제목,
  카드 안의 `h2`이다.
- 본문, 숫자, 버튼, 탭은 Geist를 유지한다.

### 장식 두 가지

1. **짧은 금색 선**(2.5rem × 1px): 화면 제목과 `SectionHeading` 제목 아래에 붙는다.
   대문 제목 아래의 선과 같다.
2. **작은 금색 라벨**: `SectionHeading`의 `eyebrow`(분류 글자)를 금색과 넓은 자간으로
   보여 준다.

두 장식 모두 CSS 의사 요소와 클래스 훅으로만 그려서 클래식에서는 보이지 않는다.

### SectionHeading

`src/components/ui/SectionHeading.tsx`. 카드 안 섹션 제목의 공용 컴포넌트다.

- props: `title`, `eyebrow?`, `right?`(오른쪽 액션), `as?`(기본 `h2`), `className?`
- 클래식에서는 지금 흔한 섹션 제목(`text-sm font-bold`)과 같게 보인다.
- 이번 범위에서는 설정 화면과 `/dev/ui-system`에만 적용하고, 화면별 정리 때 넓힌다.

## 설정 화면

`V2PreferencesView`의 "화면 테마" 카드 아래에 "화면 스타일" 카드를 추가한다. 테마
선택과 같은 2열 버튼이고 각 선택지에 설명 문구 한 줄을 둔다. 선택 즉시 `<html>`
클래스를 바꾸고 `localStorage`에 저장한다. 매뉴얼 조작 항목(`controls.tsx`)의
라이트·다크 모드 설명 옆에 화면 스타일 한 줄을 추가한다.

## 범위

이번 작업은 1~2단계다.

1. 구조: 저장과 적용, 설정 선택지, 의미 토큰(클래식 값 동일)
2. 금빛 시각 언어: 회색 단계표, 주 버튼과 탭, 카드 재질, 명조 제목, 장식 두 가지,
   `SectionHeading`

후속 작업(별도 진행):

- 화면별 레이아웃 정리: 카드 안 상자를 행과 구분선으로 바꾸기, 장비 슬롯별 아이콘,
  사냥터와 보스 목록의 몬스터 초상. 두 스타일에 공통으로 적용한다.
- 손으로 칠한 보라 버튼 23곳을 `Button` 또는 의미 토큰으로 옮기기
- `globals.css` 안의 하드코딩 색 중 금빛에서 어색한 곳 다듬기
- 기본값을 금빛으로 바꾸는 시점 결정

## 검증

- 단위 테스트: `uiStyle` 저장값 해석과 초기화 스크립트, `Button`과 `TabBar`의 토큰
  클래스, 기존 `surfaces.test.ts`와 `darkSurfaceAudit.test.ts`
- 클래식 회귀: 변경 전후 `/dev/*` 캡처를 픽셀 비교해 같아야 한다. 유니크 아이템
  이름의 반짝임처럼 원래 매번 달라지는 영역은 제외한다.
- 금빛 확인: `/dev/ui-system`, 인벤토리, 기본 정보, 거래소, 대문을 라이트·다크,
  390px·1280px로 캡처해 확인한다. 주요 글자·바탕 조합의 대비가 클래식보다 낮아지지
  않는지 계산한다.
- `tsc --noEmit`(힙 4GB), 변경 파일 lint, `next build`

## 규칙 문서

`.claude/skills/anti-slop-ui/SKILL.md`에 다음을 추가한다.

- 금빛 스타일의 제목은 `ui-heading` 계열 클래스로만 명조를 적용한다. 직접
  `font-family`를 지정하거나 다른 글꼴을 들이지 않는다.
- 금빛 장식은 짧은 금색 선과 작은 금색 라벨 두 가지뿐이다.
- 주 행동 색은 `Button`의 `primary` 또는 `bg-primary` 토큰을 쓰고 보라를 직접 칠하지
  않는다.
