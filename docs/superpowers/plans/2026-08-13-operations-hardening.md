# Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 별도 외부 계정이나 AWS 설정을 준비하지 않아도 코드 저장소 안에서 적용할 수 있는 복구·감시·배포·리포트 안전장치를 완성한다.

**Architecture:** EC2 cron과 systemd 자원 감시를 서로 독립된 실행 경로로 유지하면서 성공 heartbeat를 공용 상태 디렉터리에 기록하고 systemd 쪽에서 정체를 감지한다. 데이터베이스 리포트는 제한된 원본 행을 애플리케이션에서 합산하지 않고 PostgreSQL 집계 결과만 읽는다. 운영 기준과 복구 절차는 코드화된 SLO 정의, 실행 가능한 복원 스크립트, CloudFormation 템플릿과 런북으로 한곳에 연결한다.

**Tech Stack:** Bash, Node.js ESM, TypeScript, Vitest, Next.js 16 Route Handlers, React 19, Drizzle ORM, GitHub Actions, AWS CloudFormation

## Global Constraints

- 운영 배포와 AWS/GitHub 외부 설정 반영은 수행하지 않는다.
- 점검 모드를 변경하지 않는다.
- 사용자 변경이 포함된 최신 작업 공간 `/tmp/adventure-full-optimization-20260813`에서 이어간다.
- 동작 변경은 실패하는 테스트를 먼저 실행하고, 설정·문서 변경은 파서와 저장소 검사로 검증한다.
- 운영 알림에는 비밀값·사용자 개인정보·백업 URL을 포함하지 않는다.
- 새 UI 표면은 라이트·다크 모드 모두에서 불투명 카드 표면을 사용한다.

---

### Task 1: Cron and backup heartbeat watchdog

**Files:**
- Create: `scripts/ops-heartbeat.mjs`
- Create: `src/lib/server/opsHeartbeat.test.ts`
- Create: `deploy/ops-heartbeats.json`
- Modify: `deploy/run-cron.sh`
- Modify: `deploy/run-backup.sh`
- Modify: `deploy/check-resources.sh`
- Modify: `deploy/adventure-resource-monitor.service`

**Interfaces:**
- Consumes: `OPS_HEARTBEAT_DIR`, `OPS_HEARTBEAT_RULES_PATH`, `OPS_ALERT_WEBHOOK_URL`.
- Produces: `recordHeartbeat(key, nowMs, stateDirectory)` and `evaluateHeartbeats(rules, records, nowMs, initializedAtMs)` plus CLI commands `record` and `check`.

- [ ] **Step 1: Write failing heartbeat behavior tests**

```ts
expect(evaluateHeartbeats(rules, {}, now, now - 20 * 60_000)).toEqual([
  expect.objectContaining({ key: "cron:marketplace-expire", reason: "missing" }),
]);
expect(evaluateHeartbeats(rules, { "backup:database": now - 31 * 60 * 60_000 }, now, 0)).toEqual([
  expect.objectContaining({ key: "backup:database", reason: "stale" }),
]);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/lib/server/opsHeartbeat.test.ts`
Expected: FAIL because `scripts/ops-heartbeat.mjs` does not exist.

- [ ] **Step 3: Implement heartbeat recording, missing grace, stale evaluation, transition cooldown and webhook notification**

```json
{
  "rules": [
    { "key": "cron:marketplace-expire", "label": "만료 매물 정리", "maxAgeSeconds": 900 },
    { "key": "cron:battle-replay-retention", "label": "전투 기록 보존 정리", "maxAgeSeconds": 600 },
    { "key": "cron:ops-retention", "label": "운영 로그 보존 정리", "maxAgeSeconds": 108000 },
    { "key": "cron:ops-daily-report", "label": "일일 운영 리포트", "maxAgeSeconds": 108000 },
    { "key": "backup:database", "label": "운영 DB 백업", "maxAgeSeconds": 108000 }
  ]
}
```

- [ ] **Step 4: Record only successful cron/backup completions and invoke watchdog from the independent systemd resource monitor**

Run: `npx vitest run src/lib/server/opsHeartbeat.test.ts src/lib/server/backupRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/ops-heartbeat.mjs src/lib/server/opsHeartbeat.test.ts deploy/ops-heartbeats.json deploy/run-cron.sh deploy/run-backup.sh deploy/check-resources.sh deploy/adventure-resource-monitor.service
git commit -m "feat: add operations heartbeat watchdog"
```

### Task 2: Alert when RDS monitoring becomes blind

**Files:**
- Create: `src/lib/server/rdsMemoryMonitor.test.ts`
- Modify: `scripts/check-rds-memory.mjs`

**Interfaces:**
- Consumes: CloudWatch command result, previous monitor state and alert cooldown.
- Produces: state values `ok`, `alert`, `monitor_error` and one transition alert per cooldown window.

- [ ] **Step 1: Write failing transition tests**

```ts
expect(decideRdsMonitorAction({ reading: { ok: false, detail: "AccessDenied" }, previous: { status: "ok", alertedAtMs: 0 }, nowMs: 10_000, cooldownMs: 1_000 })).toMatchObject({ nextStatus: "monitor_error", notify: true });
expect(decideRdsMonitorAction({ reading: { ok: true, bytes: 512 * 1024 * 1024 }, previous: { status: "monitor_error", alertedAtMs: 9_000 }, nowMs: 11_000, cooldownMs: 1_000 })).toMatchObject({ nextStatus: "ok", notifyRecovery: true });
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/lib/server/rdsMemoryMonitor.test.ts`
Expected: FAIL because monitor-error transitions are not exported or represented.

- [ ] **Step 3: Implement monitor-error alerts without treating an unavailable metric as healthy**

- [ ] **Step 4: Run focused monitor and resource tests**

Run: `npx vitest run src/lib/server/rdsMemoryMonitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/check-rds-memory.mjs src/lib/server/rdsMemoryMonitor.test.ts
git commit -m "fix: alert when RDS monitoring is unavailable"
```

### Task 3: Dangerous migration gate

**Files:**
- Modify: `scripts/check-migrations.mjs`
- Modify: `src/db/migrationJournal.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Consumes: migration journal and SQL file contents after baseline tag `0164_ambiguous_barracuda`.
- Produces: `validateDangerousMigrations(journal, sqlByFile)` errors for unapproved `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE`; accepted approval header `-- ops: allow-destructive reason=<non-empty reason>`.

- [ ] **Step 1: Add failing tests for unapproved destructive SQL, approved SQL and historical migrations**

```ts
expect(validateDangerousMigrations(nextJournal, { "0165_remove.sql": 'DROP TABLE "old";' })).toContainEqual(expect.stringContaining("0165_remove"));
expect(validateDangerousMigrations(nextJournal, { "0165_remove.sql": '-- ops: allow-destructive reason=expand-contract cleanup\nDROP TABLE "old";' })).toEqual([]);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/db/migrationJournal.test.ts`
Expected: FAIL because dangerous SQL validation is missing.

- [ ] **Step 3: Implement SQL loading and destructive-operation validation in `npm run check-migrations`**

- [ ] **Step 4: Verify current history and focused tests**

Run: `npx vitest run src/db/migrationJournal.test.ts && npm run check-migrations`
Expected: PASS and current historical destructive migrations remain accepted.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/check-migrations.mjs src/db/migrationJournal.test.ts .github/workflows/ci.yml docs/ops-runbook.md
git commit -m "ci: gate destructive database migrations"
```

### Task 4: Immutable GitHub Action references

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `.github/workflows/uptime.yml`
- Modify: `.github/workflows/android.yml`
- Create: `scripts/check-action-pins.mjs`
- Create: `src/ops/actionPins.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: workflow YAML text.
- Produces: repository check that every external `uses:` reference has a 40-character commit SHA; Docker images and local actions remain out of scope.

- [ ] **Step 1: Write a failing checker test against a movable action tag**

```ts
expect(findUnpinnedActions("steps:\n  - uses: actions/checkout@v7\n", "sample.yml")).toEqual([expect.stringContaining("actions/checkout@v7")]);
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/ops/actionPins.test.ts`
Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Resolve official tag SHAs, replace every external action tag and retain version comments**

- [ ] **Step 4: Add `npm run check-action-pins` to CI static checks and verify all workflows**

Run: `npx vitest run src/ops/actionPins.test.ts && npm run check-action-pins`
Expected: PASS with zero movable action references.

- [ ] **Step 5: Commit Task 4**

```bash
git add .github/workflows package.json scripts/check-action-pins.mjs src/ops/actionPins.test.ts
git commit -m "ci: pin workflow actions to immutable SHAs"
```

### Task 5: Exact daily operations report aggregation

**Files:**
- Create: `src/lib/server/opsDailyReport.ts`
- Create: `src/lib/server/opsDailyReport.test.ts`
- Modify: `src/app/api/v2/cron/ops-daily-report/route.ts`

**Interfaces:**
- Consumes: PostgreSQL aggregate rows for abuse, economy, audit and top-event groups.
- Produces: `collectOpsDailyReport(since)` with exact counts and sums regardless of raw event volume.

- [ ] **Step 1: Write a failing report test with counts greater than the former 2,000-row cap**

```ts
expect(buildOpsDailyReport({ abuseEvents: 4_321, economyEvents: 9_876, adminActions: 1_234, rateLimited: 3_000, goldIn: 9_000_000, goldOut: 4_000_000, rewardFailures: 7, topEconomyEvents: [], topAbuseActions: [] }, since)).toMatchObject({ abuseEvents: 4_321, economyEvents: 9_876, adminActions: 1_234 });
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/lib/server/opsDailyReport.test.ts`
Expected: FAIL because aggregate report construction does not exist.

- [ ] **Step 3: Replace capped row reads with SQL `count`, filtered counts, sums and grouped top-eight queries**

- [ ] **Step 4: Run report tests and typecheck**

Run: `npx vitest run src/lib/server/opsDailyReport.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/lib/server/opsDailyReport.ts src/lib/server/opsDailyReport.test.ts src/app/api/v2/cron/ops-daily-report/route.ts
git commit -m "fix: aggregate daily operations report in SQL"
```

### Task 6: Service objectives in the admin operations UI

**Files:**
- Create: `src/lib/opsServiceObjectives.ts`
- Create: `src/lib/opsServiceObjectives.test.ts`
- Modify: `src/admin/tabs/OpsWorkflowsTab.tsx`
- Create: `docs/service-level-objectives.md`

**Interfaces:**
- Consumes: runtime profiler snapshot and static objective definitions.
- Produces: objectives for public availability 99.9%/30d, API p95 1,000ms/15m, critical error rate below 1%/15m, backup freshness 30h and critical cron freshness 15m; UI clearly marks unavailable signals as `측정 대기` rather than healthy.

- [ ] **Step 1: Write failing objective evaluation tests**

```ts
expect(evaluateRuntimeObjectives(snapshotWithP95(1_500))).toContainEqual(expect.objectContaining({ key: "api-p95", status: "breached" }));
expect(evaluateRuntimeObjectives(null)).toContainEqual(expect.objectContaining({ key: "api-p95", status: "unknown" }));
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/lib/opsServiceObjectives.test.ts`
Expected: FAIL because objective evaluation is missing.

- [ ] **Step 3: Implement objective definitions and a client-side panel backed by `/api/admin/runtime-profiler`**

- [ ] **Step 4: Verify objective logic, UI typecheck and surface rules**

Run: `npx vitest run src/lib/opsServiceObjectives.test.ts && npx tsc --noEmit && npx eslint src/admin/tabs/OpsWorkflowsTab.tsx src/lib/opsServiceObjectives.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/lib/opsServiceObjectives.ts src/lib/opsServiceObjectives.test.ts src/admin/tabs/OpsWorkflowsTab.tsx docs/service-level-objectives.md
git commit -m "feat: expose service objectives to operators"
```

### Task 7: Restore verification, incident process and operations IaC

**Files:**
- Create: `deploy/verify-backup-restore.sh`
- Create: `src/lib/server/backupRestoreVerifier.test.ts`
- Create: `deploy/adventure-backup-restore-test.service`
- Create: `deploy/adventure-backup-restore-test.timer`
- Create: `docs/incident-response.md`
- Create: `docs/templates/incident-report.md`
- Create: `docs/templates/operations-change-checklist.md`
- Create: `infra/operations/template.yaml`
- Modify: `docs/ops-runbook.md`
- Modify: `docs/release-readiness.md`

**Interfaces:**
- Consumes: verified local `.sql` or `.sql.gz` backup, production DB URL, PostgreSQL client tools; CloudFormation parameters for EC2 instance, RDS instance and notification endpoint.
- Produces: disposable database restore, schema/migration/core-table validation, unconditional cleanup, disabled-by-default systemd timer, CloudWatch/SNS alarm template and documented incident workflow.

- [ ] **Step 1: Write failing integration tests with fake PostgreSQL commands for successful cleanup and failed validation cleanup**

```ts
expect(success.status).toBe(0);
expect(readCommands()).toContain("dropdb");
expect(failedValidation.status).not.toBe(0);
expect(readCommands()).toContain("dropdb");
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run src/lib/server/backupRestoreVerifier.test.ts`
Expected: FAIL because restore verifier does not exist.

- [ ] **Step 3: Implement the non-production disposable restore verifier and disabled timer units**

- [ ] **Step 4: Add incident severity, ownership, timeline, communication, recovery validation, postmortem and change checklist documents**

- [ ] **Step 5: Add a parameterized CloudFormation operations template and validate syntax**

Run: `npx vitest run src/lib/server/backupRestoreVerifier.test.ts && bash -n deploy/verify-backup-restore.sh && node -e "require('yaml').parse(require('fs').readFileSync('infra/operations/template.yaml','utf8'))"`
Expected: PASS; if no YAML parser is installed, use `uvx cfn-lint infra/operations/template.yaml` as the authoritative validation.

- [ ] **Step 6: Commit Task 7**

```bash
git add deploy/verify-backup-restore.sh deploy/adventure-backup-restore-test.service deploy/adventure-backup-restore-test.timer src/lib/server/backupRestoreVerifier.test.ts docs/incident-response.md docs/templates docs/ops-runbook.md docs/release-readiness.md infra/operations/template.yaml
git commit -m "feat: codify recovery and incident operations"
```

### Task 8: Repository-wide verification and self-review

**Files:**
- Modify: files above only if verification reveals a defect.

**Interfaces:**
- Consumes: all completed task commits.
- Produces: clean worktree, passing repository checks and a requirement-by-requirement review record in the final handoff.

- [ ] **Step 1: Run focused operational checks**

Run: `npm run check-migrations && npm run check-action-pins && bash -n deploy/run-cron.sh deploy/run-backup.sh deploy/check-resources.sh deploy/verify-backup-restore.sh`
Expected: PASS.

- [ ] **Step 2: Run full unit, static and build verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0.

- [ ] **Step 3: Review diff against every requested locally-completable item and inspect secrets, permissions and destructive behavior**

Run: `git diff 4b05ac0c4..HEAD --check && git status --short`
Expected: no whitespace errors and no uncommitted files.
