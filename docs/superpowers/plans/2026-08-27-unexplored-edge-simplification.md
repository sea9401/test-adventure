# 미개척지 탐사망 연결선 단순화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 160노드 탐사망의 다중 경로는 유지하면서 대각선 교차를 줄이고, 현재 필요한 경로만 선명하게 보여준다.

**Architecture:** 기존 노드 데이터와 화면 구조는 유지한다. 그래프 생성 단계에서 둘레 사이의 두 부모 연결을 하나의 방사형 부모로 줄이고 같은 둘레의 순환 연결로 우회 경로를 제공하며, 렌더링 단계에서 비활성·활성·선택 경로를 서로 다른 대비로 표현한다.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, SVG, Playwright 검증

## Global Constraints

- 노드 수와 종류별 개수 1/72/21/12/48/6을 변경하지 않는다.
- 10/20/30/40포인트 예시와 몬스터 풀 계산을 유지한다.
- 첫 특화 6~8, 첫 강화 9 이상, 중간 핵심 12 이상, 심부 18 이상, 보스 개방 24 이상의 도달 조건을 유지한다.
- 실제 게임 코드와 배포 환경은 변경하지 않는다.

---

### Task 1: 연결 구조와 표시 우선순위 단순화

**Files:**
- Modify: `docs/superpowers/unexplored-region-160-node-mockup.html`
- Modify temporarily: `/tmp/check-unexplored-160-node-mockup.js`

**Interfaces:**
- Preserves: `window.mockupApi.getAudit()`, `selectPreset(points)`, `setFilter(filter)`
- Adds: `getAudit().edgeCounts`의 `total`, `radial`, `lateral`

- [x] **Step 1: 둘레 사이 연결을 단일 방사형 부모로 바꾼다**

  내부 둘레와 특화 핵심은 가장 가까운 이전 둘레 노드 하나에만 직접 연결한다. 각 내부 둘레와 특화 핵심 둘레의 좌우 순환 연결을 유지해 다른 방향으로 이동할 수 있게 한다.

- [x] **Step 2: 연결선 상태를 네 단계로 렌더링한다**

  비활성 연결은 낮은 대비, 선택 노드의 인접 연결은 중간 대비, 선택 노드까지의 최단 경로는 보라색, 활성 경로는 주황색으로 표시한다. 활성 경로를 가장 높은 우선순위로 둔다.

- [x] **Step 3: 브라우저 검증에 연결선 감사를 추가한다**

  기존 구조·상호작용·모바일 검증을 다시 실행하고, 전체 연결 수가 변경 전보다 감소했는지와 선택 경로 클래스가 생성되는지 확인한다.

- [x] **Step 4: PC·모바일 화면을 직접 확인한다**

  라이트 모드 PC와 390px 모바일 스크린샷에서 비활성 연결선이 배경으로 물러나고 활성·선택 경로가 우선해서 보이는지 확인한다.

### Task 2: 바탕화면 동기화와 완료 검증

**Files:**
- Copy: `docs/superpowers/unexplored-region-160-node-mockup.html`
- To: `/mnt/c/Users/sea94/OneDrive/바탕 화면/미개척지 160노드 탐사망 목업.html`

- [x] **Step 1: 최종 브라우저 검증과 정적 검사를 실행한다**

  Playwright 검증, `git diff --check`, `git status --short`를 실행한다.

- [x] **Step 2: 검증된 HTML을 바탕화면에 덮어쓰고 해시를 확인한다**

  저장소 원본과 바탕화면 사본의 SHA-256 해시가 같아야 한다.

- [x] **Step 3: 변경을 로컬 커밋한다**

  `git add docs/superpowers/plans/2026-08-27-unexplored-edge-simplification.md docs/superpowers/unexplored-region-160-node-mockup.html` 후 `git commit -m "docs: simplify unexplored mockup paths"`를 실행한다. 푸시와 배포는 실행하지 않는다.
