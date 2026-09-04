# 미개척지 160노드 목업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정된 미개척지 탐사망 160개 노드의 분포와 연결을 한눈에 검토할 수 있는 인터랙티브 단일 HTML 목업을 만든다.

**Architecture:** 기존 게임 UI 목업과 분리된 독립형 HTML 한 파일이 노드 데이터 생성, 그래프 배치, SVG 렌더링과 상호작용을 모두 소유한다. 브라우저 검증 스크립트는 DOM 카운트, 그래프 도달성, 필터·프리셋 동작과 반응형 레이아웃을 외부에서 확인한다.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, SVG, Playwright 검증

## Global Constraints

- 실제 Next.js 화면, 데이터베이스, API, 전투 및 드랍 로직은 변경하지 않는다.
- 총 노드 수는 정확히 160개이며 종류별 개수는 1/72/21/12/48/6이다.
- 콘텐츠 카드와 상세 패널은 불투명한 배경을 사용한다.
- 한자 대신 직관적인 기호와 한글 이름을 사용한다.
- PC와 390px 모바일 화면에서 페이지 자체의 가로 넘침이 없어야 한다.
- 배포하지 않는다.

---

### Task 1: 160노드 데이터와 동심원 그래프 목업

**Files:**
- Create: `docs/superpowers/unexplored-region-160-node-mockup.html`

**Interfaces:**
- Produces: 브라우저 전역 `mockupApi` 객체의 `getAudit()`, `selectPreset(points)`, `setFilter(filter)` 메서드
- Produces: 각 SVG 노드의 `data-node-id`, `data-node-kind`, `data-depth` 속성

- [x] **Step 1: 정적 목업 골격과 노드 데이터 생성기를 작성한다**

  단일 HTML에 상단 요약, 범례, 필터, SVG 탐사망, 우측 상세 패널을 만든다. JavaScript는 시작 1개, 작은 공용 72개, 중간 공용 21개, 특화 핵심 12개, 강화 48개, 심부 대형 6개를 생성하고 총합을 검사한다.

- [x] **Step 2: 동심원 좌표와 연결 관계를 생성한다**

  시작점에서 공용 고리, 특화 핵심 고리, 강화 군집, 심부 고리 순으로 배치한다. 각 특화 핵심과 심부 노드에는 최소 두 진입선을 만들고, 모든 노드가 시작점과 연결되도록 한다.

- [x] **Step 3: SVG 렌더링과 상세 패널을 연결한다**

  작은 노드는 기호만, 중간·특화·심부 노드는 이름을 표시한다. 클릭 시 이름, 종류, 효과, 최단 거리와 연결 수를 상세 패널에 출력한다.

- [x] **Step 4: 필터와 포인트 예시를 구현한다**

  `전체/공용/특화/위험·보상/심부` 필터와 `10/20/30/40포인트` 예시를 제공한다. 활성 경로, 사용 포인트, 특화 풀 구성과 기본 풀 최소 30% 요약을 함께 갱신한다.

- [x] **Step 5: 반응형 레이아웃과 라이트·다크 테마를 완성한다**

  PC에서는 그래프와 상세 패널을 나란히, 모바일에서는 세로로 배치한다. 그래프 내부는 전체 구조가 보이도록 SVG viewBox로 축소하고 페이지 바깥 가로 스크롤은 만들지 않는다.

### Task 2: 구조·동작·화면 검증

**Files:**
- Create temporarily: `/tmp/check-unexplored-160-node-mockup.js`
- Verify: `docs/superpowers/unexplored-region-160-node-mockup.html`

**Interfaces:**
- Consumes: `window.mockupApi.getAudit()`가 반환하는 `{ total, counts, unreachable, coreEntryFailures, presetPoints }`

- [x] **Step 1: Playwright 검증 스크립트를 작성한다**

  파일 URL로 목업을 열고 콘솔·페이지 오류를 수집한다. `total === 160`, 종류별 개수, `unreachable.length === 0`, 특화·심부 진입 경로 실패 없음과 10/20/30/40 프리셋 상한을 단언한다. 최단 거리 감사값으로 첫 특화 핵심 6~8, 첫 강화 9 이상, 중간 핵심 12 이상, 심부 핵심 18 이상, 우두머리의 흔적 24 이상을 확인한다.

- [x] **Step 2: 상호작용을 검증한다**

  특화 핵심을 클릭해 상세 패널이 바뀌는지 확인하고, 필터와 포인트 예시 버튼의 활성 상태 및 테마 전환을 확인한다.

- [x] **Step 3: PC·모바일 스크린샷과 넘침을 검증한다**

  1440px PC와 390px 모바일에서 스크린샷을 만들고 `document.documentElement.scrollWidth - innerWidth === 0`인지 확인한다.

- [x] **Step 4: 정적 검사를 실행한다**

  `git diff --check`와 `git status --short`로 공백 오류 및 변경 범위를 확인한다.

### Task 3: 바탕화면 동기화와 로컬 커밋

**Files:**
- Copy: `docs/superpowers/unexplored-region-160-node-mockup.html`
- To: `/mnt/c/Users/sea94/OneDrive/바탕 화면/미개척지 160노드 탐사망 목업.html`

**Interfaces:**
- Consumes: Task 2에서 검증을 통과한 HTML 파일

- [x] **Step 1: 검증된 HTML을 바탕화면에 복사한다**

  저장소 원본과 바탕화면 사본의 SHA-256 해시가 같은지 확인한다.

- [x] **Step 2: 변경 파일을 로컬 커밋한다**

  `git add docs/superpowers/plans/2026-08-27-unexplored-160-node-mockup.md docs/superpowers/unexplored-region-160-node-mockup.html` 후 `git commit -m "docs: add 160-node unexplored mockup"`을 실행한다.

- [x] **Step 3: 최종 상태를 확인한다**

  `git status --short`가 비어 있고 최신 커밋이 목업 커밋인지 확인한다. 운영 배포 명령은 실행하지 않는다.
