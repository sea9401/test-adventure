# 미개척지 개방형 탐사망 목업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 사건 중심 목업을 154개 노드, 12개 특화 몬스터풀, 40포인트 빌드 구성을 보여주는 개방형 탐사망 목업으로 교체한다.

**Architecture:** 하나의 독립 HTML 안에서 노드·간선을 데이터로 정의하고 SVG를 생성한다. 노드 선택, 인접 활성화, 연결성을 보존하는 반환, 활성 몬스터풀과 상위 콘텐츠 요약을 브라우저에서 즉시 갱신한다.

**Tech Stack:** HTML, CSS, 브라우저 JavaScript, SVG, Playwright 검증 스크립트

## Global Constraints

- 배포하지 않는다.
- 목업의 모든 노드는 1 탐사 포인트를 사용하며 최대 포인트는 40이다.
- 시작 노드를 제외한 활성 노드는 항상 `탐사 시작`과 연결되어야 한다.
- 기본 몬스터풀은 항상 유지하고, 활성 컨셉 노드는 매 사냥 전용 몬스터팩 한 무리를 확정 추가한다.
- 정적 단일 파일 목업이므로 단위 테스트 선작성은 생략하고 구조 검사와 브라우저 상호작용 검증을 수행한다.

---

### Task 1: 개방형 탐사망과 노드 데이터 구축

**Files:**
- Modify: `docs/superpowers/unexplored-region-node-mockup.html`

**Interfaces:**
- Produces: 전역 `nodes`, `edges`, `adjacency`, `active`, `TOTAL_POINTS` 데이터와 SVG 노드의 `data-node-id` 속성

- [x] **Step 1: 기존 사건 군집을 새 노드 분류로 교체**

  `탐사 시작 1`, `작은 공용 68`, `중간 공용 22`, `몬스터풀 해금 12`, `컨셉 강화 36`, `공통 상위 5`, `상위 보조 10`으로 총 154개를 만든다.

- [x] **Step 2: 개방형 연결망 구성**

  모든 큰 컨셉 노드에 두 개 이상의 진입 경로와 하나 이상의 이탈 경로를 제공하고, 작은 공용 노드가 보상별 단일 노선을 만들지 않도록 효과를 고르게 섞는다.

- [x] **Step 3: 노드 상세 패널과 활성 상태 구현**

  인접 노드 활성화, 40포인트 제한, 연결성을 깨지 않는 개별 반환, 골드 반환 비용, 전체 초기화를 구현한다.

### Task 2: 사냥 구성 요약과 검증

**Files:**
- Modify: `docs/superpowers/unexplored-region-node-mockup.html`
- Update: `/tmp/check-unexplored-mockup.js`
- Copy after verification: `C:\Users\sea94\OneDrive\바탕 화면\미개척지 탐사 노드 목업.html`

**Interfaces:**
- Consumes: Task 1의 `nodes`, `edges`, `active`
- Produces: `activePools()`, `activeAscensions()`, `renderSidebar()`, Playwright JSON 검증 결과

- [x] **Step 1: 활성 사냥 구성 표시**

  기본 5역할 몬스터와 활성 몬스터풀 2~3개, 정예·우두머리·희귀 재료 등 상위 적용 상태를 오른쪽 패널에 표시한다.

- [x] **Step 2: 구조와 상호작용 검증**

  ```bash
  node /tmp/check-unexplored-mockup.js
  ```

  총 노드 154개, 중복 ID와 누락 간선 0개, 미도달 노드 0개, 최대 포인트 40, 컨셉 12개, 브라우저 오류 0개를 확인한다.

- [x] **Step 3: 바탕화면 사본 갱신**

  검증된 HTML을 `미개척지 탐사 노드 목업.html`과 기존 사냥 사건 목업 사본에 복사한다.

- [x] **Step 4: 변경 커밋**

  ```bash
  git add docs/superpowers/unexplored-region-node-mockup.html docs/superpowers/plans/2026-08-26-unexplored-region-open-network-mockup.md
  git commit -m "docs: rebuild unexplored mockup as open monster network"
  ```
