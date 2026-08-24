# August 24 Undeployed Work Squash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영에 배포된 `af92ffd2fa5e26544ff907f12a495a79d5b9434b` 이후의 모든 로컬 완료 작업을 누락 없이 단일 커밋으로 재구성한다.

**Architecture:** 현재 브랜치의 커밋과 작업 트리 변경을 먼저 체크포인트로 고정하고 백업 브랜치를 만든다. `/tmp`의 격리된 릴리스 worktree에서 `origin/main`을 기준으로 체크포인트를 squash merge한 뒤, 두 트리의 파일·모드·내용이 완전히 같은지 Git tree 비교로 증명하고 전체 검증을 수행한다.

**Tech Stack:** Git worktree, Git squash merge, Vitest, TypeScript, ESLint, Next.js 16 production build

## Global Constraints

- 배포, 푸시, PR 생성, 점검 모드 변경은 수행하지 않는다.
- 기존 미커밋 변경과 별도 worktree는 삭제하거나 덮어쓰지 않는다.
- 기준 배포 SHA는 GitHub Actions의 최신 성공 운영 배포와 일치하는 `af92ffd2fa5e26544ff907f12a495a79d5b9434b`로 고정한다.
- 최종 스쿼시 커밋의 tree는 체크포인트 tree와 정확히 같아야 한다.
- 원본 커밋은 `backup/pre-squash-undeployed-20260824-*` 브랜치로 복구 가능하게 남긴다.

---

### Task 1: 미배포 범위 감사

**Files:**
- Inspect: Git refs, GitHub Actions deploy history, live worktrees
- Create: `docs/superpowers/plans/2026-08-24-squash-all-undeployed-work.md`

**Interfaces:**
- Consumes: `origin/main`, current branch, working tree, local branch/worktree refs
- Produces: deployed baseline SHA and omission audit

- [ ] **Step 1: 원격 참조와 운영 배포 SHA를 확인한다**

Run:

```bash
git fetch --prune origin
gh run list --workflow deploy.yml --limit 10 --json headSha,status,conclusion,createdAt,url
```

Expected: 최신 성공 배포 SHA와 `origin/main`이 `af92ffd2f...`로 일치한다.

- [ ] **Step 2: 현재 브랜치·작업 트리·최근 독립 브랜치를 대조한다**

Run:

```bash
git rev-list --left-right --count origin/main...HEAD
git status --short
git worktree list --porcelain
git for-each-ref --sort=-committerdate refs/heads
```

Expected: 배포 이후 독립 작업이 현재 브랜치에 포함됐는지, 미커밋 변경이 무엇인지 목록이 확정된다.

### Task 2: 원본 상태 체크포인트와 백업

**Files:**
- Modify: all currently tracked and untracked worktree files

**Interfaces:**
- Consumes: audited current worktree
- Produces: immutable checkpoint commit and backup branch

- [ ] **Step 1: 현재 작업 트리 전체를 체크포인트 커밋으로 고정한다**

Run:

```bash
git add -A
git commit -m "chore: checkpoint August 24 undeployed work"
```

Expected: `git status --short`가 비어 있고 모든 미커밋 파일이 체크포인트에 포함된다.

- [ ] **Step 2: 복구용 백업 브랜치를 생성한다**

Run:

```bash
git branch backup/pre-squash-undeployed-20260824-220555 HEAD
```

Expected: 백업 브랜치가 체크포인트 SHA를 가리킨다.

### Task 3: 운영 기준 위에 단일 스쿼시 커밋 생성

**Files:**
- Modify: `/tmp/adventure-undeployed-squash-20260824-*` isolated worktree

**Interfaces:**
- Consumes: `origin/main`, checkpoint branch
- Produces: `release/all-undeployed-20260824` single commit

- [ ] **Step 1: 격리 worktree를 운영 기준에서 생성한다**

Run:

```bash
git worktree add -b release/all-undeployed-20260824 /tmp/adventure-undeployed-squash-20260824 origin/main
```

Expected: release branch의 부모가 `af92ffd2f...`다.

- [ ] **Step 2: 체크포인트 전체를 squash merge한다**

Run:

```bash
git merge --squash fix/cooking-codex-pagination
git commit -m "feat: consolidate August 24 undeployed updates"
```

Expected: `origin/main..HEAD`가 정확히 한 커밋이다.

### Task 4: 누락 없는 tree 동일성 검증

**Files:**
- Inspect: checkpoint tree, squash tree

**Interfaces:**
- Consumes: checkpoint and squash commit
- Produces: exact equality evidence

- [ ] **Step 1: 파일 내용·모드·삭제 상태를 비교한다**

Run:

```bash
test "$(git rev-parse fix/cooking-codex-pagination^{tree})" = "$(git rev-parse release/all-undeployed-20260824^{tree})"
git diff --exit-code fix/cooking-codex-pagination release/all-undeployed-20260824
git diff --check origin/main..release/all-undeployed-20260824
```

Expected: tree SHA가 같고 diff가 0이며 공백 오류가 없다.

- [ ] **Step 2: 커밋 수와 배포 기준 부모를 확인한다**

Run:

```bash
git rev-list --count origin/main..release/all-undeployed-20260824
git rev-parse release/all-undeployed-20260824^
```

Expected: 커밋 수 `1`, 부모 SHA `af92ffd2f...`.

### Task 5: 최종 릴리스 후보 검증

**Files:**
- Test: all repository tests and build gates

**Interfaces:**
- Consumes: exact squash tree
- Produces: verified local release candidate

- [ ] **Step 1: 전체 테스트를 실행한다**

Run: `npm test`

Expected: all Vitest suites pass.

- [ ] **Step 2: 타입·린트·이미지를 검증한다**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src
npm run check-images
```

Expected: all commands exit 0.

- [ ] **Step 3: 프로덕션 빌드를 실행한다**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: Next.js production build and postbuild manifest repair exit 0.

### Task 6: 현재 브랜치를 스쿼시 결과로 교체

**Files:**
- Modify: local Git branch refs and owned temporary worktree only

**Interfaces:**
- Consumes: verified release branch and backup branch
- Produces: current branch with one undeployed commit

- [ ] **Step 1: 임시 worktree를 제거하고 현재 브랜치를 검증된 release commit으로 이동한다**

Run:

```bash
git worktree remove /tmp/adventure-undeployed-squash-20260824
git switch release/all-undeployed-20260824
git branch -f fix/cooking-codex-pagination release/all-undeployed-20260824
git switch fix/cooking-codex-pagination
git branch -d release/all-undeployed-20260824
```

Expected: 현재 브랜치가 `origin/main`보다 정확히 한 커밋 앞서며 backup 브랜치는 원본 이력을 유지한다.

- [ ] **Step 2: 최종 상태를 보고한다**

Run:

```bash
git status --short --branch
git log --oneline --decorate -3
git diff --stat origin/main..HEAD
```

Expected: clean worktree, single squash commit, no push or deployment.
